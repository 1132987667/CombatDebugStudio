<template>
  <label class="toggle-switch" :class="{ active: modelValue }" :style="{ '--toggle-accent': accentColor }">
    <input type="checkbox" class="toggle-input" :checked="modelValue" @change="toggle" />
    <span class="toggle-track"><span class="toggle-thumb"></span></span>
    <span v-if="label" class="toggle-label">{{ label }}</span>
  </label>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  label?: string
  accentColor?: string
}>(), {
  accentColor: 'var(--color-energy)',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function toggle() {
  emit('update:modelValue', !props.modelValue)
}
</script>

<style scoped>
.toggle-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-fast);
  color: var(--color-text-tertiary);
}

.toggle-input {
  display: none;
}

.toggle-track {
  position: relative;
  width: 34px;
  height: 18px;
  border-radius: var(--radius-full);
  background: var(--color-border-default);
  transition: background var(--transition-fast);
  flex-shrink: 0;
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-text-tertiary);
  transition: transform var(--transition-fast), background var(--transition-fast);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.toggle-switch.active {
  color: var(--toggle-accent);
}

.toggle-switch.active .toggle-track {
  background: var(--toggle-accent);
}

.toggle-switch.active .toggle-thumb {
  transform: translateX(16px);
  background: var(--color-bg-secondary);
}

.toggle-label {
  white-space: nowrap;
}
</style>
