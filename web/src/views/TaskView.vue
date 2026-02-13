<template>
  <div>
    <router-link to="/" style="font-size: 13px; margin-bottom: 16px; display: inline-block">&larr; Back to tasks</router-link>

    <div v-if="loading" class="empty"><span class="spinner"></span> Loading...</div>
    <div v-else-if="error" class="empty" style="color: var(--red)">{{ error }}</div>
    <template v-else-if="task">
      <TaskDetail :task="task" />

      <div class="action-bar">
        <button
          v-if="task.status === 'pending'"
          class="btn btn--primary"
          :disabled="actionLoading"
          @click="handleRun"
        >
          Run Task
        </button>
        <button
          v-if="task.status === 'failed'"
          class="btn btn--danger"
          :disabled="actionLoading"
          @click="handleRetry"
        >
          Retry Task
        </button>
      </div>

      <h3 class="section-title">Agent Logs</h3>
      <div v-if="logs.length === 0" class="empty">No logs yet</div>
      <TaskLogEntry v-for="log in logs" :key="log.id" :log="log" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import TaskDetail from '../components/TaskDetail.vue';
import TaskLogEntry from '../components/TaskLogEntry.vue';
import { useTask } from '../composables/useTask';
import { runTask, retryTask } from '../api/client';

const props = defineProps<{ id: string }>();
const taskId = Number(props.id);

const { task, logs, loading, error } = useTask(taskId);
const actionLoading = ref(false);

async function handleRun() {
  actionLoading.value = true;
  try {
    await runTask(taskId);
  } catch { /* SSE handles updates */ }
  finally { actionLoading.value = false; }
}

async function handleRetry() {
  actionLoading.value = true;
  try {
    await retryTask(taskId);
  } catch { /* SSE handles updates */ }
  finally { actionLoading.value = false; }
}
</script>
