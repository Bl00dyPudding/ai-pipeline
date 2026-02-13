/**
 * HTTP-сервер на H3.
 * Раздаёт REST API, SSE-стрим и SPA-статику.
 */

import { createServer } from 'node:http';
import { createApp, createRouter, defineEventHandler } from 'h3';
import { toNodeListener } from 'h3/node';
import type { AppConfig } from '../config.js';
import { TaskRepository } from '../db/tasks.js';
import { wrapRepoWithEvents } from './event-bus.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerActionRoutes } from './routes/actions.js';
import { registerEventRoutes } from './routes/events.js';
import { staticHandler } from './static.js';
import { logger } from '../utils/logger.js';
import type Database from 'better-sqlite3';

export interface ServerOptions {
  config: AppConfig;
  db: Database.Database;
  repoPath: string;
  port: number;
  host: string;
}

export async function startServer(options: ServerOptions) {
  const { config, db, repoPath, port, host } = options;

  const repo = new TaskRepository(db);
  const wrappedRepo = wrapRepoWithEvents(repo);

  const app = createApp({
    onRequest(event) {
      // Inject repoPath into event context for POST /api/tasks
      (event.context as any).repoPath = repoPath;
      (event.context as any).maxAttempts = config.maxAttempts;
    },
  });

  // Single router for all API routes
  const router = createRouter();
  registerTaskRoutes(router, repo);
  registerActionRoutes(router, wrappedRepo, config, repoPath);
  registerEventRoutes(router);

  app.use(router.handler as any);

  // Static SPA fallback — catch-all for non-API requests
  app.use(defineEventHandler((event) => staticHandler(event)));

  const server = createServer(toNodeListener(app));

  return new Promise<void>((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const displayHost = host === '0.0.0.0' ? 'localhost' : host;
      logger.success(`Server running at http://${displayHost}:${port}`);
      logger.info(`Serving repository: ${repoPath}`);
      resolve();
    });
  });
}
