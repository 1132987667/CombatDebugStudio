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
  gap: 0.5rem;
}

.radio-group-label {
  font-size: 0.8rem;
  color: #4fc3f7;
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.radio-buttons {
  display: inline-flex;
  background: #16213e;
  border: 1px solid #0f3460;
  border-radius: 4px;
  padding: 2px;
  gap: 2px;
}

.radio-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #4fc3f7;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  outline: none;

  &:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 2px;
  }

  &:hover:not(.radio-button--disabled) {
    background: #1a2a4e;
    border-color: #4fc3f7;
  }

  &.radio-button--selected {
    background: #f97316;
    color: #ffffff;
    border-color: #ea580c;

    .radio-button__icon {
      color: #ffffff;
    }
  }

  &.radio-button--disabled {
    opacity: 0.7;
    cursor: not-allowed;

    &:hover {
      background: transparent;
      color: #4fc3f7;
    }
  }

  .radio-button__icon {
    font-size: 0.9rem;
    font-weight: bold;
    transition: color 0.15s;
  }

  .radio-button__label {
    white-space: nowrap;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .radio-button {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    gap: 0.375rem;

    .radio-button__icon {
      font-size: 0.8rem;
    }
  }

  .radio-group-label {
    font-size: 0.75rem;
  }
}

@media (max-width: 480px) {
  .radio-buttons {
    flex-direction: column;
    gap: 1px;
  }

  .radio-button {
    justify-content: center;
    padding: 0.4rem;
  }
}
</style>