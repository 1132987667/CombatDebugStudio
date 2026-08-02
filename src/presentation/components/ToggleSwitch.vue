<template>
  <label class="toggle-switch" :class="{ active: modelValue }" :style="{ '--toggle-accent': accentColor }">
    <input type="checkbox" class="toggle-input" :checked="modelValue" @change="toggle" :aria-label="label || undefined" />
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
  /* 视觉隐藏但保持可聚焦（display:none 会丢失键盘可达性） */
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
  pointer-events: none;
}

.toggle-input:focus-visible + .toggle-track {
  outline: 2px solid var(--color-info);
  outline-offset: 2px;
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
  box-shadow: var(--shadow-sm);
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
