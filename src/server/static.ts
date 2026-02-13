/**
 * Раздача статических файлов Vue SPA из dist/web-ui/.
 * SPA fallback: все не-API запросы отдают index.html.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setHeader } from 'h3';
import type { H3Event } from 'h3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webUiDir = resolve(__dirname, '../web-ui');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function staticHandler(event: H3Event) {
  // Skip API routes
  if (event.path?.startsWith('/api')) return;

  let filePath = join(webUiDir, event.path || '/');

  // Try exact file first
  if (!existsSync(filePath) || filePath === webUiDir || filePath.endsWith('/')) {
    // SPA fallback
    filePath = join(webUiDir, 'index.html');
  }

  if (!existsSync(filePath)) {
    return;
  }

  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  setHeader(event, 'content-type', mime);

  return readFileSync(filePath);
}
