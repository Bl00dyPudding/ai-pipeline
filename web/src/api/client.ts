export interface Task {
  id: number;
  title: string;
  description: string;
  status: string;
  repo_path: string;
  branch_name: string | null;
  attempt: number;
  max_attempts: number;
  reviewer_feedback: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskLog {
  id: number;
  task_id: number;
  agent: string;
  action: string;
  input_summary: string | null;
  output_summary: string | null;
  tokens_used: number;
  duration_ms: number;
  created_at: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchTasks(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return api<{ tasks: Task[] }>(`/tasks${qs}`);
}

export function fetchTask(id: number) {
  return api<{ task: Task }>(`/tasks/${id}`);
}

export function fetchTaskLogs(id: number) {
  return api<{ logs: TaskLog[] }>(`/tasks/${id}/logs`);
}

export function createTask(description: string) {
  return api<{ task: Task }>('/tasks', {
    method: 'POST',
    body: JSON.stringify({ description }),
  });
}

export function runTask(id: number) {
  return api<{ taskId: number; message: string }>(`/tasks/${id}/run`, {
    method: 'POST',
  });
}

export function retryTask(id: number) {
  return api<{ taskId: number; message: string }>(`/tasks/${id}/retry`, {
    method: 'POST',
  });
}

export function processTasks(limit?: number) {
  const qs = limit ? `?limit=${limit}` : '';
  return api<{ count: number; taskIds: number[]; message: string }>(`/tasks/process${qs}`, {
    method: 'POST',
  });
}
