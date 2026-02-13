export type SSEHandler = (event: string, data: any) => void;

export function connectSSE(taskId?: number): { close: () => void; onMessage: (handler: SSEHandler) => void } {
  const qs = taskId ? `?taskId=${taskId}` : '';
  let handlers: SSEHandler[] = [];
  let es: EventSource | null = null;
  let closed = false;

  function connect() {
    if (closed) return;
    es = new EventSource(`/api/events${qs}`);

    for (const eventType of ['task:status', 'task:log', 'task:error', 'task:feedback']) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          for (const h of handlers) h(eventType, data);
        } catch { /* ignore parse errors */ }
      });
    }

    es.onerror = () => {
      es?.close();
      if (!closed) {
        setTimeout(connect, 3000);
      }
    };
  }

  connect();

  return {
    close() {
      closed = true;
      es?.close();
    },
    onMessage(handler: SSEHandler) {
      handlers.push(handler);
    },
  };
}
