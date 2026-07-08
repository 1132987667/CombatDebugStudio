<!--
 * 文件: RadioButtonGroup.vue
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 单选按钮组组件
 * 描述: 提供单选按钮组功能，支持图标、标签显示和键盘导航
 * 版本: 1.0.0
-->

<template>
  <div class="radio-button-group" role="radiogroup" :aria-labelledby="labelId">
    <label v-if="label" :id="labelId" class="radio-group-label">{{ label }}</label>
    <div class="radio-buttons">
      <button v-for="option in options" :key="option.value" class="radio-button" :class="{
        'radio-button--selected': modelValue === option.value,
        'radio-button--disabled': disabled
      }" :disabled="disabled" role="radio" :aria-checked="modelValue === option.value" :aria-label="option.label"
        @click="selectOption(option.value)" @keydown="handleKeydown">
        <span class="radio-button__icon">{{ option.icon }}</span>
        <span class="radio-button__label">{{ option.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface RadioOption {
  value: string | number
  label: string
  icon: string
}

interface Props {
  modelValue: string | number
  options: RadioOption[]
  label?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const labelId = computed(() => `radio-group-label-${Math.random().toString(36).substr(2, 9)}`)

const selectOption = (value: string | number) => {
  if (!props.disabled) {
    emit('update:modelValue', value)
  }
}

const handleKeydown = (event: KeyboardEvent) => {
  const { key } = event
  const currentIndex = props.options.findIndex(option => option.value === props.modelValue)

  if (key === 'ArrowRight' || key === 'ArrowDown') {
    event.preventDefault()
    const nextIndex = (currentIndex + 1) % props.options.length
    selectOption(props.options[nextIndex].value)
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    event.preventDefault()
    const prevIndex = (currentIndex - 1 + props.options.length) % props.options.length
    selectOption(props.options[prevIndex].value)
  } else if (key === 'Home') {
    event.preventDefault()
    selectOption(props.options[0].value)
  } else if (key === 'End') {
    event.preventDefault()
    selectOption(props.options[props.options.length - 1].value)
  }
}
</script>

<style scoped lang="scss">
.radio-button-group {
  display: inline-flex;
  flex-direction: column;
  gap: var(--space-2);
}

.radio-group-label {
  font-size: var(--font-size-sm);
  color: var(--color-info);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--space-1);
}

.radio-buttons {
  display: inline-flex;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-1);
  gap: var(--space-1);
}

.radio-button {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-info);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: var(--transition-fast);
  outline: none;

  &:focus-visible {
    outline: 2px solid var(--color-info);
    outline-offset: 2px;
  }

  &:hover:not(.radio-button--disabled) {
    background: var(--color-bg-hover);
    border-color: var(--color-info);
  }

  &.radio-button--selected {
    background: var(--color-warning);
    color: var(--color-text-primary);
    /* ponytail: border needs a darker shade; --color-brand-red-active provides contrast */
    border-color: var(--color-brand-red-active);

    .radio-button__icon {
      color: var(--color-text-primary);
    }
  }

  &.radio-button--disabled {
    opacity: 0.7;
    cursor: not-allowed;

    &:hover {
      background: transparent;
      color: var(--color-info);
    }
  }

  .radio-button__icon {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    transition: color var(--transition-fast);
  }

  .radio-button__label {
    white-space: nowrap;
  }
}

</style>