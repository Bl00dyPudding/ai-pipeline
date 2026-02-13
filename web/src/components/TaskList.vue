<template>
  <div v-if="tasks.length === 0" class="empty">No tasks yet</div>
  <ul v-else class="task-list">
    <li
      v-for="task in tasks"
      :key="task.id"
      class="task-item"
      @click="$router.push(`/task/${task.id}`)"
    >
      <span class="task-item__id">#{{ task.id }}</span>
      <span class="task-item__title">{{ task.title }}</span>
      <StatusBadge :status="task.status" />
      <span class="task-item__time">{{ formatTime(task.updated_at) }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import StatusBadge from './StatusBadge.vue';
import type { Task } from '../api/client';

defineProps<{ tasks: Task[] }>();

function formatTime(iso: string): string {
  const d = new Date(iso + 'Z');
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
</script>
