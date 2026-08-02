<template>
  <div class="speed-selector">
    <span v-if="label" class="speed-label">{{ label }}</span>
    <button v-for="s in resolvedOptions" :key="s" class="speed-btn" :class="{ active: modelValue === s }"
      @click="$emit('update:modelValue', s)">
      {{ s }}x
    </button>
    <slot name="extra" />
  </div>
</template>

<script setup lang="ts">
import { SPEED_OPTIONS } from '@/shared/constants/speed'

withDefaults(defineProps<{
  modelValue: number
  label?: string
  options?: readonly number[]
}>(), {
  label: '速度:',
  options: SPEED_OPTIONS,
})

defineEmits<{
  'update:modelValue': [value: number]
}>()

const resolvedOptions = SPEED_OPTIONS
</script>

<style scoped>
.speed-selector {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.speed-label {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.speed-btn {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-border-tertiary);
  background: var(--color-border-default);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-info);
  transition: color var(--transition-fast), background-color var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.speed-btn:hover {
  background: var(--color-border-tertiary);
  color: var(--color-info);
}

.speed-btn.active {
  background: var(--color-info);
  border-color: var(--color-info);
  color: var(--color-bg-secondary);
}
</style>
