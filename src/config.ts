import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Load .env from the ai-pipeline project root, not from cwd
dotenv.config({ path: resolve(projectRoot, '.env') });

export interface AppConfig {
  anthropicApiKey: string;
  model: string;
  maxAttempts: number;
  autoMerge: boolean;
  dbPath: string;
}

let cachedConfig: AppConfig | null = null;

export function getConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  if (cachedConfig && Object.keys(overrides).length === 0) {
    return cachedConfig;
  }

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
      ?? resolve(process.env['AI_PIPELINE_DB_PATH'] ?? './ai-pipeline.db'),
  };

  if (!config.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is required. Set it in .env or environment.');
  }

  cachedConfig = config;
  return config;
}
