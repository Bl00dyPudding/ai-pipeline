/**
 * Сбор контекста целевого репозитория для промпта агента-кодера.
 * Контекст собирается в 4 этапа: метаданные → дерево файлов → ключевые файлы → доп. файлы.
 * Каждый этап ограничен бюджетом токенов, чтобы не превысить лимит промпта.
 */

import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  shouldIgnoreDir,
  shouldIgnoreFile,
  isBinaryFile,
  safeReadFile,
  METADATA_FILES,
  ENTRY_POINT_PATTERNS,
} from './filters.js';
import { estimateTokens, fitWithinBudget, truncateToTokenBudget, TOKEN_BUDGETS } from '../utils/tokens.js';
import type { RepoContext } from '../pipeline/types.js';
import { logger } from '../utils/logger.js';

/** Максимальное кол-во записей в дереве файлов — защита от огромных репозиториев */
const MAX_TREE_ENTRIES = 500;

/**
 * Собирает контекст репозитория для передачи кодеру.
 * 4 этапа: метаданные (package.json и др.) → дерево файлов → ключевые файлы → доп. файлы по импортам.
 */
export async function gatherContext(repoPath: string, taskDescription: string): Promise<RepoContext> {
  logger.debug('Gathering repository context...');

  // 1. Метаданные — конфигурационные файлы проекта
  const metadata = await gatherMetadata(repoPath);

  // 2. Дерево файлов — структура репозитория
  const allFiles = await buildFileTree(repoPath);
  const fileTree = formatFileTree(allFiles, repoPath);

  // 3. Ключевые файлы — точки входа, типы, файлы по ключевым словам задачи
  const keyFiles = await gatherKeyFiles(repoPath, allFiles, taskDescription);

  // 4. Дополнительные файлы — найденные по import/from в ключевых файлах
  const extraFiles = await gatherExtraFiles(repoPath, allFiles, keyFiles);

  const totalTokens =
    estimateTokens(metadata) +
    estimateTokens(fileTree) +
    sumMapTokens(keyFiles) +
    sumMapTokens(extraFiles);

  logger.debug(`Context gathered: ~${totalTokens} tokens`);

  return { metadata, fileTree, keyFiles, extraFiles, totalTokens };
}

/** Читает конфигурационные файлы проекта (package.json, tsconfig и т.д.) */
async function gatherMetadata(repoPath: string): Promise<string> {
  const parts: string[] = [];

  for (const file of METADATA_FILES) {
    const content = await safeReadFile(join(repoPath, file));
    if (content) {
      parts.push(`=== ${file} ===\n${truncateToTokenBudget(content, TOKEN_BUDGETS.metadata / METADATA_FILES.length)}`);
    }
  }

  return truncateToTokenBudget(parts.join('\n\n'), TOKEN_BUDGETS.metadata);
}

/**
 * Рекурсивно обходит директории, собирая список текстовых файлов.
 * Ограничения: глубина вложенности maxDepth, максимум MAX_TREE_ENTRIES файлов.
 */
async function buildFileTree(repoPath: string, maxDepth = 6): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth || files.length >= MAX_TREE_ENTRIES) return;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_TREE_ENTRIES) break;

      if (entry.isDirectory()) {
        if (!shouldIgnoreDir(entry.name)) {
          await walk(join(dir, entry.name), depth + 1);
        }
      } else if (!shouldIgnoreFile(entry.name) && !isBinaryFile(entry.name)) {
        files.push(relative(repoPath, join(dir, entry.name)));
      }
    }
  }

  await walk(repoPath, 0);
  return files.sort();
}

/** Форматирует список файлов в текстовое дерево для промпта */
function formatFileTree(files: string[], repoPath: string): string {
  const tree = files.map(f => `  ${f}`).join('\n');
  return truncateToTokenBudget(`File tree (${files.length} files):\n${tree}`, TOKEN_BUDGETS.fileTree);
}

/**
 * Собирает ключевые файлы по 3 стратегиям:
 * 1. Точки входа (src/index.ts, src/App.vue и т.д.)
 * 2. Файлы, название которых совпадает с ключевыми словами задачи
 * 3. Файлы типов (.d.ts, types.ts)
 */
async function gatherKeyFiles(
  repoPath: string,
  allFiles: string[],
  taskDescription: string,
): Promise<Map<string, string>> {
  const keyFiles = new Map<string, string>();
  const taskWords = taskDescription.toLowerCase().split(/\s+/);

  // Стратегия 1: точки входа приложения
  for (const pattern of ENTRY_POINT_PATTERNS) {
    const matches = allFiles.filter(f => f.includes(pattern));
    for (const match of matches) {
      const content = await safeReadFile(join(repoPath, match));
      if (content) keyFiles.set(match, content);
    }
  }

  // Стратегия 2: файлы, связанные с задачей по ключевым словам (слова длиннее 3 символов)
  for (const file of allFiles) {
    const fileLower = file.toLowerCase();
    const isRelevant = taskWords.some(word =>
      word.length > 3 && fileLower.includes(word)
    );
    if (isRelevant) {
      const content = await safeReadFile(join(repoPath, file));
      if (content) keyFiles.set(file, content);
    }
  }

  // Стратегия 3: файлы определений типов — важны для понимания структуры проекта
  for (const file of allFiles) {
    if (file.endsWith('.d.ts') || file.includes('types.ts') || file.includes('types/')) {
      const content = await safeReadFile(join(repoPath, file));
      if (content) keyFiles.set(file, content);
    }
  }

  return fitWithinBudget(keyFiles, TOKEN_BUDGETS.keyFiles);
}

/**
 * Расширяет контекст файлами, которые импортируются из ключевых.
 * Находит относительные import/from, резолвит пути к реальным файлам.
 */
async function gatherExtraFiles(
  repoPath: string,
  allFiles: string[],
  keyFiles: Map<string, string>,
): Promise<Map<string, string>> {
  const extraFiles = new Map<string, string>();
  const importPattern = /(?:import|from)\s+['"]([^'"]+)['"]/g;

  // Извлекаем пути из import/from в ключевых файлах
  const importedPaths = new Set<string>();
  for (const [, content] of keyFiles) {
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];
      // Только относительные импорты — пакеты из node_modules не нужны
      if (importPath.startsWith('.')) {
        importedPaths.add(importPath);
      }
    }
  }

  // Сопоставляем пути импортов с реальными файлами в репозитории
  for (const importPath of importedPaths) {
    const candidates = allFiles.filter(f => {
      const normalized = importPath.replace(/^\.\//, '');
      return f.includes(normalized) || f.startsWith(normalized);
    });
    for (const candidate of candidates) {
      if (!keyFiles.has(candidate)) {
        const content = await safeReadFile(join(repoPath, candidate));
        if (content) extraFiles.set(candidate, content);
      }
    }
  }

  return fitWithinBudget(extraFiles, TOKEN_BUDGETS.extraFiles);
}

/** Подсчитывает суммарное количество токенов в Map (ключи + значения) */
function sumMapTokens(map: Map<string, string>): number {
  let total = 0;
  for (const [key, value] of map) {
    total += estimateTokens(key) + estimateTokens(value);
  }
  return total;
}

/** Форматирует собранный контекст в текст для вставки в промпт кодера */
export function formatContextForPrompt(context: RepoContext): string {
  const parts: string[] = [];

  parts.push('## Project Metadata\n' + context.metadata);
  parts.push('\n## ' + context.fileTree);

  if (context.keyFiles.size > 0) {
    parts.push('\n## Key Files');
    for (const [path, content] of context.keyFiles) {
      parts.push(`\n### ${path}\n\`\`\`\n${content}\n\`\`\``);
    }
  }

  if (context.extraFiles.size > 0) {
    parts.push('\n## Additional Files (imports)');
    for (const [path, content] of context.extraFiles) {
      parts.push(`\n### ${path}\n\`\`\`\n${content}\n\`\`\``);
    }
  }

  return parts.join('\n');
}
