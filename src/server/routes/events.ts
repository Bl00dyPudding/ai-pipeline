/**
 * SSE endpoint — стримит события TaskEventBus клиентам.
 */

import { defineEventHandler, getQuery, createEventStream } from 'h3';
import type { createRouter } from 'h3';
type Router = ReturnType<typeof createRouter>;
import { taskEventBus } from '../event-bus.js';

export function registerEventRoutes(router: Router) {
  /** GET /api/events?taskId= — SSE поток */
  router.get('/api/events', defineEventHandler(async (event) => {
    const { taskId } = getQuery(event) as { taskId?: string };
    const filterTaskId = taskId ? Number(taskId) : undefined;

    const stream = createEventStream(event);

    const handlers: Array<{ event: string; fn: (...args: any[]) => void }> = [];

    for (const eventType of ['task:status', 'task:log', 'task:error', 'task:feedback'] as const) {
      const fn = (data: { taskId: number }) => {
        if (filterTaskId && data.taskId !== filterTaskId) return;
        stream.push({ event: eventType, data: JSON.stringify(data) });
      };
      handlers.push({ event: eventType, fn });
      taskEventBus.on(eventType, fn);
    }

    stream.onClosed(async () => {
      for (const h of handlers) {
        taskEventBus.off(h.event, h.fn);
      }
      await stream.close();
    });

    return stream.send();
  }));
}
