<!--
* 文件: TacticalInput.vue
* 功能: 战术输入框 — 公共表单控件（与 TacticalSelect 配套）
* 描述: 支持 label 显示、前置图标插槽（SVG）；type="number" 时：
*       - 输入过滤非法字符（数字/负号/小数点，integer 模式禁小数点）
*       - 越界实时错误提示（min/max）
*       - blur/change 时 clamp 到 [min, max]，空值回退 null
* 依赖: tokens.scss 设计令牌；无额外 JS 依赖
-->
<template>
  <div class="t-input" :class="[`t-input--${size}`, { 'is-disabled': disabled, 'is-error': !!errorText }]">
    <label v-if="label" class="t-input__label">
      {{ label }}<span v-if="required" class="t-input__required">*</span>
    </label>

    <div class="t-input__box">
      <i class="t-input__tick t-input__tick--tl" aria-hidden="true"></i>
      <i class="t-input__tick t-input__tick--br" aria-hidden="true"></i>

      <span v-if="$slots.icon" class="t-input__icon" aria-hidden="true">
        <slot name="icon" />
      </span>

      <input
        ref="inputRef"
        class="t-input__field"
        type="text"
        :inputmode="inputMode"
        :value="innerText"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-label="ariaLabel ?? label ?? placeholder"
        :aria-invalid="!!errorText || undefined"
        :aria-required="required || undefined"
        @input="onInput"
        @blur="onBlur"
        @focus="onFocus"
        @change="onChange"
      />
    </div>

    <div v-if="errorText" class="t-input__error" role="alert">{{ errorText }}</div>
    <div v-else-if="hint" class="t-input__hint">{{ hint }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type TInputSize = 'sm' | 'md'

interface Props {
  modelValue: string | number | null
  /** text | number（number 触发过滤 + 范围校验 + clamp） */
  type?: 'text' | 'number'
  /** 字段标题（显示在输入框上方） */
  label?: string
  /** 仅整数（number 模式）：禁止小数点 */
  integer?: boolean
  /** 最小值（number 模式；blur 时 clamp） */
  min?: number
  /** 最大值（number 模式；blur 时 clamp） */
  max?: number
  /** 必填标记（label 旁 *，不参与校验） */
  required?: boolean
  /** 帮助文本（无错误时显示在下方） */
  hint?: string
  placeholder?: string
  disabled?: boolean
  size?: TInputSize
  /** 覆盖 aria-label（默认取 label 或 placeholder） */
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  integer: false,
  required: false,
  disabled: false,
  size: 'md',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: string | number | null): void
  (e: 'change', v: string | number | null): void
  (e: 'blur'): void
  (e: 'focus'): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)

/** 内部文本：允许输入阶段暂存超范围/空值，blur 时 clamp */
const innerText = ref(props.modelValue === null ? '' : String(props.modelValue))
const errorText = ref('')

watch(
  () => props.modelValue,
  (v) => {
    innerText.value = v === null ? '' : String(v)
    validate(parseNumber(innerText.value))
  },
)

/** 数字模式用 text + inputmode，字符过滤完全由 JS 掌控（原生 number 行为各浏览器不一） */
const inputMode = computed(() => {
  if (props.type !== 'number') return undefined
  return props.integer ? 'numeric' : 'decimal'
})

/** 逐字符过滤：保留数字 / 开头负号 / 首个小数点（integer 模式无小数点），其余剔除 */
function filterNumber(raw: string): string {
  let out = ''
  let seenDot = false
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      out += ch
    } else if (ch === '-' && out.length === 0) {
      out += ch
    } else if (ch === '.' && !props.integer && !seenDot) {
      out += ch
      seenDot = true
    }
  }
  return out
}

function parseNumber(raw: string): number | null {
  if (raw === '' || raw === '-' || raw === '-.') return null
  const n = Number(raw)
  return Number.isNaN(n) ? null : n
}

function clamp(n: number, lo: number | undefined, hi: number | undefined): number {
  if (lo !== undefined && n < lo) return lo
  if (hi !== undefined && n > hi) return hi
  return n
}

function rangeText(): string {
  const lo = props.min
  const hi = props.max
  if (lo !== undefined && hi !== undefined) return `${lo} ~ ${hi}`
  if (lo !== undefined) return `≥ ${lo}`
  if (hi !== undefined) return `≤ ${hi}`
  return ''
}

/** 越界实时提示（输入阶段即可见，blur 时再 clamp 修正） */
function validate(n: number | null): void {
  if (props.type !== 'number' || n === null) {
    errorText.value = ''
    return
  }
  if ((props.min !== undefined && n < props.min) || (props.max !== undefined && n > props.max)) {
    errorText.value = `需在 ${rangeText()} 之间`
  } else {
    errorText.value = ''
  }
}

function onInput(e: Event): void {
  const input = e.target as HTMLInputElement
  let raw = input.value

  if (props.type === 'number') {
    const filtered = filterNumber(raw)
    if (filtered !== raw) {
      // 非法字符被剔除：同步 DOM 值（光标回末尾）
      input.value = filtered
    }
    innerText.value = filtered
    const n = parseNumber(filtered)
    validate(n)
    emit('update:modelValue', n)
    return
  }

  innerText.value = raw
  emit('update:modelValue', raw)
}

function onBlur(): void {
  if (props.type === 'number') {
    let n = parseNumber(innerText.value)
    if (n !== null) n = clamp(n, props.min, props.max)
    const formatted = n === null ? '' : String(n)
    if (formatted !== innerText.value) {
      innerText.value = formatted
      emit('update:modelValue', n)
    }
    validate(n)
  }
  emit('blur')
}

function onChange(): void {
  const v: string | number | null = props.type === 'number'
    ? parseNumber(innerText.value)
    : innerText.value
  emit('change', v)
}

function onFocus(): void {
  emit('focus')
}

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<style scoped lang="scss">
/* ════════════════════════════════════════════
   TacticalInput — 暗色战术风格（与 TacticalSelect 配套）
   颜色 100% 来自 tokens.scss，零硬编码色值
   ════════════════════════════════════════════ */
.t-input {
  position: relative;
  display: block;
  width: 100%;
  font-family: var(--font-family-base);
  --accent: var(--color-energy);
  --accent-rgb: var(--rgb-energy);
}

/* ── label ── */
.t-input__label {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  letter-spacing: 1px;
}

.t-input__required {
  color: var(--color-danger);
  margin-left: 2px;
}

/* ── 输入框 ── */
.t-input__box {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: 0 var(--space-3);
  background:
    linear-gradient(180deg, rgba(var(--rgb-white), var(--alpha-tint)) 0%, transparent 45%),
    var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.t-input--md .t-input__box { min-height: 34px; }
.t-input--sm .t-input__box { min-height: 26px; padding: 0 var(--space-2); }

.t-input:not(.is-disabled) .t-input__box:hover {
  border-color: var(--color-border-tertiary-hover);
}
.t-input__field:focus-visible {
  outline: none;
}
.t-input__box:focus-within {
  border-color: var(--color-border-focus);
  box-shadow: 0 0 0 2px rgba(var(--rgb-info), var(--alpha-wash-strong));
}
.t-input__box:focus-within .t-input__tick {
  width: 8px;
  height: 8px;
  border-color: var(--accent);
}

/* 角标 — 与 TacticalSelect 同语言 */
.t-input__tick {
  position: absolute;
  width: 5px;
  height: 5px;
  border: 0 solid rgba(var(--accent-rgb), var(--alpha-border));
  pointer-events: none;
  transition: width var(--transition-fast), height var(--transition-fast), border-color var(--transition-fast);
}
.t-input__tick--tl { top: 3px; left: 3px; border-top-width: 1px; border-left-width: 1px; }
.t-input__tick--br { bottom: 3px; right: 3px; border-bottom-width: 1px; border-right-width: 1px; }

/* 图标（前置插槽） */
.t-input__icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}
.t-input__icon :deep(svg) {
  width: 14px;
  height: 14px;
}

/* 输入域 */
.t-input__field {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--font-size-md);
  line-height: 1.4;
}
.t-input--sm .t-input__field { font-size: var(--font-size-sm); }
.t-input__field::placeholder { color: var(--color-text-disabled); }
.t-input.is-disabled .t-input__field { color: var(--color-text-disabled); cursor: not-allowed; }
.t-input.is-disabled .t-input__box { opacity: 0.55; }

/* ── 校验错误 ── */
.t-input.is-error .t-input__box {
  border-color: var(--color-danger);
  box-shadow: 0 0 0 2px rgba(var(--rgb-danger), var(--alpha-wash-strong));
}
.t-input__error {
  margin-top: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-danger);
}

/* ── 帮助文本 ── */
.t-input__hint {
  margin-top: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

@media (prefers-reduced-motion: reduce) {
  .t-input__tick { transition: none; }
}
</style>
