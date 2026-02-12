import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  '.cache',
  '.turbo',
  'coverage',
  '.vercel',
  '.netlify',
  '__pycache__',
  'vendor',
]);

const IGNORE_EXTENSIONS = new Set([
  '.lock',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.rar',
  '.pdf', '.doc', '.docx',
  '.db', '.sqlite',
  '.min.js', '.min.css',
  '.map',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.rar',
  '.pdf', '.db', '.sqlite', '.exe', '.dll', '.so', '.dylib',
]);

export function shouldIgnoreDir(dirName: string): boolean {
  return IGNORE_DIRS.has(dirName) || dirName.startsWith('.');
}

export function shouldIgnoreFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  if (IGNORE_EXTENSIONS.has(ext)) return true;

  // Check for compound extensions like .min.js
  const base = filePath.toLowerCase();
  if (base.endsWith('.min.js') || base.endsWith('.min.css')) return true;

  return false;
}

export function isBinaryFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export async function safeReadFile(filePath: string, maxSizeBytes = 100_000): Promise<string | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    if (content.length > maxSizeBytes) {
      return content.slice(0, maxSizeBytes) + '\n... [file truncated]';
    }
    return content;
  } catch {
    return null;
  }
}

const METADATA_FILES = [
  'package.json',
  'tsconfig.json',
  'tsconfig.app.json',
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'nuxt.config.ts',
  'nuxt.config.js',
  'next.config.js',
  'next.config.mjs',
  'vite.config.ts',
  'vite.config.js',
  'vue.config.js',
  'README.md',
  'CLAUDE.md',
];

const ENTRY_POINT_PATTERNS = [
  'src/main.ts', 'src/main.js',
  'src/index.ts', 'src/index.js',
  'src/App.vue', 'src/App.tsx',
  'app.vue', 'app.ts', 'app.js',
  'pages/index.vue', 'pages/index.tsx',
  'server/api',
];

export { METADATA_FILES, ENTRY_POINT_PATTERNS };
