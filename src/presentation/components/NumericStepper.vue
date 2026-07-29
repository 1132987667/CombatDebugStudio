<!--
 * 文件: NumericStepper.vue
 * 功能: 数值微调组件
 * 描述: -100 -10 -1 [输入框] +1 +10 +100
 *       步进值、min/max 均由传入参数控制，按钮超出范围自动禁用
-->
<template>
  <div class="numeric-stepper" :class="{ 'ns-disabled': disabled }">
    <button v-for="s in leftSteps" :key="'l-' + s" class="ns-btn ns-btn-dec"
      :disabled="disabled || innerValue - s < min" @click="adjust(-s)" :title="`减少 ${s}`">
      −{{ s }}
    </button>
    <input ref="inputRef" type="number" class="ns-input" :value="innerValue"
      :min="min" :max="max" :disabled="disabled" @input="onInput" @blur="onBlur"
      @keydown.enter="onBlur" />
    <button v-for="s in rightSteps" :key="'r-' + s" class="ns-btn ns-btn-inc"
      :disabled="disabled || innerValue + s > max" @click="adjust(s)" :title="`增加 ${s}`">
      +{{ s }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface Props {
  modelValue: number
  min?: number
  max?: number
  /** 步进值数组，如 [1, 10, 100] — 组件自动排列为 -100 -10 -1 [输入] +1 +10 +100 */
  steps?: number[]
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 99999,
  steps: () => [1, 10, 100],
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const inputRef = ref<HTMLInputElement>()

/** 内部值：允许输入阶段暂存超出范围的值，blur 时 clamp */
const innerValue = ref(props.modelValue)

watch(() => props.modelValue, (v) => {
  innerValue.value = v
})

/** 排序后的步进值（升序） */
const sortedSteps = computed(() => [...props.steps].sort((a, b) => a - b))

/** 左侧按钮：大 → 小 */
const leftSteps = computed(() => [...sortedSteps.value].reverse())

/** 右侧按钮：小 → 大 */
const rightSteps = computed(() => sortedSteps.value)

function adjust(delta: number) {
  const next = clamp(innerValue.value + delta, props.min, props.max)
  innerValue.value = next
  emit('update:modelValue', next)
}

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  if (raw === '') {
    innerValue.value = props.min
    emit('update:modelValue', props.min)
    return
  }
  const parsed = Number(raw)
  if (!Number.isNaN(parsed)) {
    innerValue.value = parsed
    emit('update:modelValue', parsed)
  }
}

function onBlur() {
  const clamped = clamp(innerValue.value, props.min, props.max)
  if (clamped !== innerValue.value) {
    innerValue.value = clamped
    emit('update:modelValue', clamped)
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
</script>

<style scoped>
.numeric-stepper {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.ns-disabled {
  opacity: 0.5;
  pointer-events: none;
}

.ns-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 26px;
  padding: 0 6px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
  line-height: 1;
}

.ns-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  border-color: var(--color-info);
}

.ns-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.ns-btn:disabled {
  color: var(--color-text-disabled);
  cursor: not-allowed;
}

.ns-btn-dec:hover:not(:disabled) {
  border-color: var(--color-danger);
  color: var(--color-danger);
}

.ns-btn-inc:hover:not(:disabled) {
  border-color: var(--color-success);
  color: var(--color-success);
}

.ns-input {
  width: 72px;
  height: 26px;
  padding: 0 6px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  text-align: center;
  font-size: var(--font-size-sm, 13px);
  -moz-appearance: textfield;
  flex-shrink: 0;
}

.ns-input::-webkit-inner-spin-button,
.ns-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.ns-input:focus {
  outline: none;
  border-color: var(--color-info);
}

.ns-input:disabled {
  color: var(--color-text-disabled);
}
</style>
