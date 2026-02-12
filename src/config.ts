/**
 * Загрузка и кеширование конфигурации приложения.
 * Файл .env ищется в корне проекта ai-pipeline (рядом с package.json),
 * а не в текущей рабочей директории — это позволяет вызывать CLI откуда угодно.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Вычисляем корень проекта через import.meta.url, чтобы не зависеть от cwd */
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Загружаем .env из корня проекта ai-pipeline, а не из cwd
dotenv.config({ path: resolve(projectRoot, '.env') });

export interface AppConfig {
  anthropicApiKey: string;
  model: string;
  maxAttempts: number;
  autoMerge: boolean;
  dbPath: string;
}

/** Кеш конфига — повторные вызовы без overrides возвращают тот же объект */
let cachedConfig: AppConfig | null = null;

/**
 * Возвращает конфигурацию приложения.
 * Приоритет: CLI-флаги (overrides) > переменные окружения > значения по умолчанию.
 * Результат кешируется; кеш сбрасывается при передаче overrides.
 */
export function getConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  if (cachedConfig && Object.keys(overrides).length === 0) {
    return cachedConfig;
  }

  // Цепочка ?? реализует приоритет: override > env > default
  const config: AppConfig = {
    anthropicApiKey: overrides.anthropicApiKey
      ?? process.env['ANTHROPIC_API_KEY']
      ?? '',
    model: overrides.model
      ?? process.env['AI_PIPELINE_MODEL']
      ?? 'claude-sonnet-4-20250514',
    maxAttempts: overrides.maxAttempts
      ?? parseInt(process.env['AI_PIPELINE_MAX_ATTEMPTS'] ?? '3', 10),
    autoMerge: overrides.autoMerge
      ?? (process.env['AI_PIPELINE_AUTO_MERGE'] === 'true'),
    dbPath: overrides.dbPath
      ?? resolve(projectRoot, process.env['AI_PIPELINE_DB_PATH'] ?? 'ai-pipeline.db'),
  };

  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required. Set it in .env or environment.');
  }

  cachedConfig = config;
  return config;
}
