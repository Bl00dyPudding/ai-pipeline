<template>
  <span :class="['badge', `badge--${status}`]">
    <span v-if="isActive" class="spinner" style="margin-right: 4px"></span>
    {{ status }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ status: string }>();

const isActive = computed(() =>
  ['planning', 'coding', 'reviewing', 'testing'].includes(props.status)
);
</script>
