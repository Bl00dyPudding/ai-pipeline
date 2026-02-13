<template>
  <form class="card" @submit.prevent="submit">
    <h3 style="margin-bottom: 12px">New Task</h3>
    <div class="form-group">
      <label for="desc">Description</label>
      <textarea
        id="desc"
        v-model="description"
        class="form-textarea"
        placeholder="Describe what needs to be done..."
        rows="3"
        required
      ></textarea>
    </div>
    <div style="display: flex; gap: 8px; align-items: center">
      <button type="submit" class="btn btn--primary" :disabled="!description.trim() || loading">
        {{ loading ? 'Creating...' : 'Add Task' }}
      </button>
      <label style="display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-secondary)">
        <input type="checkbox" v-model="autoRun" />
        Run immediately
      </label>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{
  created: [task: { id: number }, autoRun: boolean];
}>();

const description = ref('');
const autoRun = ref(false);
const loading = ref(false);

async function submit() {
  if (!description.value.trim()) return;
  loading.value = true;
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.value.trim() }),
    });
    const data = await res.json();
    emit('created', data.task, autoRun.value);
    description.value = '';
  } finally {
    loading.value = false;
  }
}
</script>
