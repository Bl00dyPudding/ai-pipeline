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

const MAX_TREE_ENTRIES = 500;

export async function gatherContext(repoPath: string, taskDescription: string): Promise<RepoContext> {
  logger.debug('Gathering repository context...');

  // 1. Metadata
  const metadata = await gatherMetadata(repoPath);

  // 2. File tree
  const allFiles = await buildFileTree(repoPath);
  const fileTree = formatFileTree(allFiles, repoPath);

  // 3. Key files — entry points + files mentioned in task
  const keyFiles = await gatherKeyFiles(repoPath, allFiles, taskDescription);

  // 4. Extra files — expand by imports if budget allows
  const extraFiles = await gatherExtraFiles(repoPath, allFiles, keyFiles);

  const totalTokens =
    estimateTokens(metadata) +
    estimateTokens(fileTree) +
    sumMapTokens(keyFiles) +
    sumMapTokens(extraFiles);

  logger.debug(`Context gathered: ~${totalTokens} tokens`);

  return { metadata, fileTree, keyFiles, extraFiles, totalTokens };
}

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

function formatFileTree(files: string[], repoPath: string): string {
  const tree = files.map(f => `  ${f}`).join('\n');
  return truncateToTokenBudget(`File tree (${files.length} files):\n${tree}`, TOKEN_BUDGETS.fileTree);
}

async function gatherKeyFiles(
  repoPath: string,
  allFiles: string[],
  taskDescription: string,
): Promise<Map<string, string>> {
  const keyFiles = new Map<string, string>();
  const taskWords = taskDescription.toLowerCase().split(/\s+/);

  // Add entry points
  for (const pattern of ENTRY_POINT_PATTERNS) {
    const matches = allFiles.filter(f => f.includes(pattern));
    for (const match of matches) {
      const content = await safeReadFile(join(repoPath, match));
      if (content) keyFiles.set(match, content);
    }
  }

  // Add files matching task keywords
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

  // Add type definition files
  for (const file of allFiles) {
    if (file.endsWith('.d.ts') || file.includes('types.ts') || file.includes('types/')) {
      const content = await safeReadFile(join(repoPath, file));
      if (content) keyFiles.set(file, content);
    }
  }

  return fitWithinBudget(keyFiles, TOKEN_BUDGETS.keyFiles);
}

async function gatherExtraFiles(
  repoPath: string,
  allFiles: string[],
  keyFiles: Map<string, string>,
): Promise<Map<string, string>> {
  const extraFiles = new Map<string, string>();
  const importPattern = /(?:import|from)\s+['"]([^'"]+)['"]/g;

  // Extract imports from key files
  const importedPaths = new Set<string>();
  for (const [, content] of keyFiles) {
    let match;
    while ((match = importPattern.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        importedPaths.add(importPath);
      }
    }
  }

  // Resolve imports to actual files
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

function sumMapTokens(map: Map<string, string>): number {
  let total = 0;
  for (const [key, value] of map) {
    total += estimateTokens(key) + estimateTokens(value);
  }
  return total;
}

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
