/**
 * EventBus для SSE-уведомлений + Proxy-обёртка над TaskRepository.
 * Proxy перехватывает мутирующие методы и эмитит события — PipelineRunner не меняется.
 */

import { EventEmitter } from 'node:events';
import type { TaskRepository } from '../db/tasks.js';
import type { AgentRole } from '../pipeline/types.js';

export interface SSETaskStatusEvent {
  taskId: number;
  status: string;
  timestamp: string;
}

export interface SSETaskLogEvent {
  taskId: number;
  log: {
    agent: string;
    action: string;
    input_summary: string | null;
    output_summary: string | null;
    tokens_used: number;
    duration_ms: number;
    created_at: string;
  };
}

export interface SSETaskErrorEvent {
  taskId: number;
  error: string;
}

export interface SSETaskFeedbackEvent {
  taskId: number;
  feedback: string;
}

export const taskEventBus = new EventEmitter();
taskEventBus.setMaxListeners(100);

/**
 * Оборачивает TaskRepository в Proxy, который перехватывает мутирующие методы
 * и эмитит SSE-события. PipelineRunner получает обёрнутый repo — его код не меняется.
 */
export function wrapRepoWithEvents(repo: TaskRepository): TaskRepository {
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== 'function') return orig;

      if (prop === 'updateStatus') {
        return function (id: number, status: string) {
          const result = orig.call(target, id, status);
          taskEventBus.emit('task:status', {
            taskId: id,
            status,
            timestamp: new Date().toISOString(),
          } satisfies SSETaskStatusEvent);
          return result;
        };
      }

      if (prop === 'addLog') {
        return function (params: {
          taskId: number;
          agent: AgentRole;
          action: string;
          inputSummary?: string;
          outputSummary?: string;
          tokensUsed?: number;
          durationMs?: number;
        }) {
          const result = orig.call(target, params);
          taskEventBus.emit('task:log', {
            taskId: params.taskId,
            log: {
              agent: params.agent,
              action: params.action,
              input_summary: params.inputSummary ?? null,
              output_summary: params.outputSummary ?? null,
              tokens_used: params.tokensUsed ?? 0,
              duration_ms: params.durationMs ?? 0,
              created_at: new Date().toISOString(),
            },
          } satisfies SSETaskLogEvent);
          return result;
        };
      }

      if (prop === 'setError') {
        return function (id: number, error: string) {
          const result = orig.call(target, id, error);
          taskEventBus.emit('task:error', {
            taskId: id,
            error,
          } satisfies SSETaskErrorEvent);
          return result;
        };
      }

      if (prop === 'setReviewerFeedback') {
        return function (id: number, feedback: string) {
          const result = orig.call(target, id, feedback);
          taskEventBus.emit('task:feedback', {
            taskId: id,
            feedback,
          } satisfies SSETaskFeedbackEvent);
          return result;
        };
      }

      return orig.bind(target);
    },
  });
}
