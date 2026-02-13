/**
 * Экшн-эндпоинты: запуск и ретрай задач (fire-and-forget).
 */

import { defineEventHandler, getQuery, getRouterParam, setResponseStatus } from 'h3';
import type { createRouter } from 'h3';
type Router = ReturnType<typeof createRouter>;
import type { TaskRepository } from '../../db/tasks.js';
import type { AppConfig } from '../../config.js';
import { PipelineRunner } from '../../pipeline/runner.js';
import { logger } from '../../utils/logger.js';

export function registerActionRoutes(router: Router, repo: TaskRepository, config: AppConfig, repoPath: string) {
  /** POST /api/tasks/:id/run — запустить pending задачу */
  router.post('/api/tasks/:id/run', defineEventHandler((event) => {
    const id = Number(getRouterParam(event, 'id'));
    const task = repo.getById(id);

    if (!task) {
      setResponseStatus(event, 404);
      return { error: `Task #${id} not found` };
    }
    if (task.status !== 'pending') {
      setResponseStatus(event, 409);
      return { error: `Task #${id} is ${task.status}, expected pending` };
    }

    // Fire-and-forget
    const runner = new PipelineRunner(config, repo);
    runner.runExisting(id, {
      repoPath,
      model: config.model,
      maxAttempts: config.maxAttempts,
      autoMerge: config.autoMerge,
    }).catch(err => {
      logger.error(`Task #${id} run error: ${err instanceof Error ? err.message : String(err)}`);
    });

    setResponseStatus(event, 202);
    return { taskId: id, message: 'Task started' };
  }));

  /** POST /api/tasks/:id/retry — ретрай failed задачи */
  router.post('/api/tasks/:id/retry', defineEventHandler((event) => {
    const id = Number(getRouterParam(event, 'id'));
    const task = repo.getById(id);

    if (!task) {
      setResponseStatus(event, 404);
      return { error: `Task #${id} not found` };
    }
    if (task.status !== 'failed') {
      setResponseStatus(event, 409);
      return { error: `Task #${id} is ${task.status}, expected failed` };
    }

    // Fire-and-forget
    const runner = new PipelineRunner(config, repo);
    runner.retry(id, {
      repoPath: task.repo_path,
      model: config.model,
      maxAttempts: config.maxAttempts,
      autoMerge: config.autoMerge,
    }).catch(err => {
      logger.error(`Task #${id} retry error: ${err instanceof Error ? err.message : String(err)}`);
    });

    setResponseStatus(event, 202);
    return { taskId: id, message: 'Retry started' };
  }));

  /** POST /api/tasks/process — запустить все pending задачи последовательно */
  router.post('/api/tasks/process', defineEventHandler((event) => {
    const { limit } = getQuery(event) as { limit?: string };
    const maxTasks = limit ? Number(limit) : undefined;

    const tasks = repo.listPending(repoPath, maxTasks);
    if (tasks.length === 0) {
      return { count: 0, message: 'No pending tasks' };
    }

    // Fire-and-forget: запускаем последовательно
    const runner = new PipelineRunner(config, repo);
    const taskIds = tasks.map(t => t.id);

    (async () => {
      for (const id of taskIds) {
        try {
          await runner.runExisting(id, {
            repoPath,
            model: config.model,
            maxAttempts: config.maxAttempts,
            autoMerge: config.autoMerge,
          });
        } catch (err) {
          logger.error(`Task #${id} process error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    })();

    setResponseStatus(event, 202);
    return { count: tasks.length, taskIds, message: `Processing ${tasks.length} task(s)` };
  }));
}
