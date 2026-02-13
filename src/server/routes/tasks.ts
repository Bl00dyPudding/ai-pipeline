/**
 * REST API эндпоинты для чтения/создания задач.
 */

import { defineEventHandler, getQuery, getRouterParam, readBody, setResponseStatus } from 'h3';
import type { createRouter } from 'h3';
type Router = ReturnType<typeof createRouter>;
import type { TaskRepository } from '../../db/tasks.js';
import type { TaskStatus } from '../../pipeline/types.js';

export function registerTaskRoutes(router: Router, repo: TaskRepository) {
  /** GET /api/tasks?status= — список задач */
  router.get('/api/tasks', defineEventHandler((event) => {
    const { status } = getQuery(event) as { status?: string };
    const tasks = repo.list(status as TaskStatus | undefined);
    return { tasks };
  }));

  /** GET /api/tasks/:id — детали задачи */
  router.get('/api/tasks/:id', defineEventHandler((event) => {
    const id = Number(getRouterParam(event, 'id'));
    const task = repo.getById(id);
    if (!task) {
      setResponseStatus(event, 404);
      return { error: `Task #${id} not found` };
    }
    return { task };
  }));

  /** GET /api/tasks/:id/logs — логи задачи */
  router.get('/api/tasks/:id/logs', defineEventHandler((event) => {
    const id = Number(getRouterParam(event, 'id'));
    const task = repo.getById(id);
    if (!task) {
      setResponseStatus(event, 404);
      return { error: `Task #${id} not found` };
    }
    const logs = repo.getLogs(id);
    return { logs };
  }));

  /** POST /api/tasks — создать задачу */
  router.post('/api/tasks', defineEventHandler(async (event) => {
    const body = await readBody(event) as { description?: string };
    if (!body?.description?.trim()) {
      setResponseStatus(event, 400);
      return { error: 'description is required' };
    }

    const description = body.description.trim();
    const task = repo.create({
      title: description.slice(0, 100),
      description,
      repoPath: (event.context as any).repoPath,
      maxAttempts: (event.context as any).maxAttempts ?? 3,
    });

    setResponseStatus(event, 201);
    return { task };
  }));
}
