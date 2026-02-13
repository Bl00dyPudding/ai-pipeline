<template>
  <div :class="['log-entry', `log-entry--${log.agent}`]">
    <div class="log-entry__header">
      <span class="log-entry__agent">{{ log.agent }}</span>
      <span class="log-entry__action">{{ log.action }}</span>
      <span class="log-entry__time">{{ formatTime(log.created_at) }}</span>
    </div>
    <div v-if="log.output_summary" class="log-entry__body">{{ log.output_summary }}</div>
    <div v-if="log.tokens_used || log.duration_ms" class="log-entry__stats">
      <span v-if="log.tokens_used">{{ log.tokens_used.toLocaleString() }} tokens</span>
      <span v-if="log.tokens_used && log.duration_ms"> · </span>
      <span v-if="log.duration_ms">{{ (log.duration_ms / 1000).toFixed(1) }}s</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TaskLog } from '../api/client';

defineProps<{ log: TaskLog }>();

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}
</script>
