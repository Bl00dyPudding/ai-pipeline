<template>
  <div class="card">
    <div class="card__header">
      <h2 class="card__title">Task #{{ task.id }}: {{ task.title }}</h2>
      <StatusBadge :status="task.status" />
    </div>
    <dl class="detail-grid">
      <dt>Description</dt>
      <dd>{{ task.description }}</dd>
      <dt>Repository</dt>
      <dd style="font-family: var(--font-mono); font-size: 12px">{{ task.repo_path }}</dd>
      <dt>Branch</dt>
      <dd style="font-family: var(--font-mono); font-size: 12px">{{ task.branch_name || '—' }}</dd>
      <dt>Attempt</dt>
      <dd>{{ task.attempt }} / {{ task.max_attempts }}</dd>
      <dt>Created</dt>
      <dd>{{ formatTime(task.created_at) }}</dd>
      <dt>Updated</dt>
      <dd>{{ formatTime(task.updated_at) }}</dd>
    </dl>
    <div v-if="task.error_message" style="margin-top: 12px">
      <h4 style="color: var(--red); margin-bottom: 6px">Error</h4>
      <div class="feedback" style="border-color: var(--red)">{{ task.error_message }}</div>
    </div>
    <div v-if="task.reviewer_feedback" style="margin-top: 12px">
      <h4 style="color: var(--yellow); margin-bottom: 6px">Reviewer Feedback</h4>
      <div class="feedback">{{ task.reviewer_feedback }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import StatusBadge from './StatusBadge.vue';
import type { Task } from '../api/client';

defineProps<{ task: Task }>();

function formatTime(iso: string): string {
  const d = new Date(iso + 'Z');
  return d.toLocaleString();
}
</script>
