<template>
  <div>
    <TaskForm @created="onCreated" />
    <div class="section-header">
      <h2 class="section-title">Tasks</h2>
      <button
        v-if="pendingCount > 0"
        class="btn btn-process"
        :disabled="processing"
        @click="onProcess"
      >
        {{ processing ? 'Starting...' : `Process ${pendingCount} pending` }}
      </button>
    </div>
    <div v-if="loading" class="empty"><span class="spinner"></span> Loading...</div>
    <div v-else-if="error" class="empty" style="color: var(--red)">{{ error }}</div>
    <TaskList v-else :tasks="tasks" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TaskForm from '../components/TaskForm.vue';
import TaskList from '../components/TaskList.vue';
import { useTasks } from '../composables/useTasks';
import { runTask, processTasks } from '../api/client';

const { tasks, loading, error, reload } = useTasks();
const processing = ref(false);

const pendingCount = computed(() =>
  tasks.value.filter(t => t.status === 'pending').length
);

async function onCreated(task: { id: number }, autoRun: boolean) {
  await reload();
  if (autoRun) {
    try {
      await runTask(task.id);
    } catch { /* SSE will show updates */ }
  }
}

async function onProcess() {
  processing.value = true;
  try {
    await processTasks();
  } catch { /* SSE will show updates */ }
  processing.value = false;
}
</script>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.btn-process {
  background: var(--yellow);
  color: var(--bg);
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
}

.btn-process:hover:not(:disabled) {
  opacity: 0.85;
}

.btn-process:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
