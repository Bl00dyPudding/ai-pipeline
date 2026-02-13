import { ref, onMounted, onUnmounted } from 'vue';
import { fetchTask, fetchTaskLogs, type Task, type TaskLog } from '../api/client';
import { connectSSE } from '../api/sse';

export function useTask(taskId: number) {
  const task = ref<Task | null>(null);
  const logs = ref<TaskLog[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  let sse: ReturnType<typeof connectSSE> | null = null;

  async function load() {
    loading.value = true;
    try {
      const [taskData, logData] = await Promise.all([
        fetchTask(taskId),
        fetchTaskLogs(taskId),
      ]);
      task.value = taskData.task;
      logs.value = logData.logs;
      error.value = null;
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    load();
    sse = connectSSE(taskId);
    sse.onMessage((event, data) => {
      if (data.taskId !== taskId) return;

      if (event === 'task:status' && task.value) {
        task.value = { ...task.value, status: data.status, updated_at: data.timestamp };
      } else if (event === 'task:log') {
        logs.value = [...logs.value, data.log];
      } else if (event === 'task:error' && task.value) {
        task.value = { ...task.value, status: 'failed', error_message: data.error };
      } else if (event === 'task:feedback' && task.value) {
        task.value = { ...task.value, reviewer_feedback: data.feedback };
      }
    });
  });

  onUnmounted(() => {
    sse?.close();
  });

  return { task, logs, loading, error, reload: load };
}
