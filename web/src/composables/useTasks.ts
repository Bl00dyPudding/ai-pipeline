import { ref, onMounted, onUnmounted } from 'vue';
import { fetchTasks, type Task } from '../api/client';
import { connectSSE } from '../api/sse';

export function useTasks() {
  const tasks = ref<Task[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  let sse: ReturnType<typeof connectSSE> | null = null;

  async function load() {
    loading.value = true;
    try {
      const data = await fetchTasks();
      tasks.value = data.tasks;
      error.value = null;
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  function updateTaskInList(taskId: number, patch: Partial<Task>) {
    const idx = tasks.value.findIndex(t => t.id === taskId);
    if (idx !== -1) {
      tasks.value[idx] = { ...tasks.value[idx], ...patch };
    }
  }

  onMounted(() => {
    load();
    sse = connectSSE();
    sse.onMessage((event, data) => {
      if (event === 'task:status') {
        updateTaskInList(data.taskId, {
          status: data.status,
          updated_at: data.timestamp,
        });
      } else if (event === 'task:error') {
        updateTaskInList(data.taskId, {
          status: 'failed',
          error_message: data.error,
        });
      }
    });
  });

  onUnmounted(() => {
    sse?.close();
  });

  return { tasks, loading, error, reload: load };
}
