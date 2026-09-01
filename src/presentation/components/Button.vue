<template>
  <button
    class="ui-button"
    :class="[`ui-button--${variant}`, `ui-button--${size}`, { 'is-block': block, 'is-loading': loading, 'is-active': active }]"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="onClick"
  >
    <span v-if="loading" class="ui-button__spinner" aria-hidden="true"></span>
    <span class="ui-button__label"><slot /></span>
  </button>
</template>

<script setup lang="ts">
type ButtonVariant = 'primary' | 'energy' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost'
type ButtonSize = 'tiny' | 'small' | 'medium' | 'large'

withDefaults(defineProps<{
  /** 样式族：primary/energy 为 3D 按压，secondary/ghost 平面，success/warning/danger 语义色填充 */
  variant?: ButtonVariant
  /** 尺寸，对齐既有 btn-tiny/small/medium/large */
  size?: ButtonSize
  /** 撑满父容器宽度 */
  block?: boolean
  /** 加载中：显示 spinner 并禁用点击 */
  loading?: boolean
  /** 选中态（金色高亮） */
  active?: boolean
  disabled?: boolean
  nativeType?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'secondary',
  size: 'medium',
  block: false,
  loading: false,
  active: false,
  disabled: false,
  nativeType: 'button',
})

const emit = defineEmits<{ click: [e: MouseEvent] }>()

function onClick(e: MouseEvent) {
  emit('click', e)
}
</script>

<style scoped>
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-1);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  font-weight: var(--font-weight-medium);
  line-height: 1.4;
  padding: var(--space-2) var(--space-4);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  /* NOTE: 表面色底 + 顶部高光/内描边营造层次；原先用边框色平底显脏 */
  background: var(--color-bg-tertiary);
  box-shadow:
    inset 0 1px 0 rgba(var(--rgb-white), 0.06),
    inset 0 0 0 1px rgba(var(--rgb-white), 0.02);
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);

  &:hover:not(:disabled):not(.is-loading) {
    /* NOTE: 提亮 + 边框变亮 + 文本变能量青 + 内高光增强；不做位移动效（无上浮） */
    background: var(--color-bg-tertiary-hover);
    border-color: var(--color-border-tertiary-hover);
    color: var(--color-energy);
    box-shadow: inset 0 1px 0 rgba(var(--rgb-white), 0.1);
  }

  &:active:not(:disabled):not(.is-loading) {
    transform: translateY(0) scale(0.98);
    box-shadow:
      inset 0 1px 0 rgba(var(--rgb-white), 0.03),
      var(--shadow-sm);
  }

  &:focus-visible {
    outline: 2px solid var(--color-border-focus);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  &.is-active {
    /** background: rgba(var(--rgb-active-color), var(--alpha-wash-strong)); */
    color: rgb(var(--rgb-active-color)); /** --color-selected */
    border-color: rgb(var(--rgb-active-color));
  }
}

/* ---------- 尺寸 ---------- */
.ui-button--tiny {
  padding: 0.15rem 0.35rem;
}

.ui-button--small {
  padding: var(--space-1) var(--space-2);
}

.ui-button--medium {
  padding: var(--space-2) var(--space-4);
}

.ui-button--large {
  padding: var(--space-3) var(--space-5);
  font-size: var(--font-size-md);
}

/* ---------- 3D 按压族（参考 buttons.theme.css .btn.primary） ---------- */
/* 底部硬阴影 + 按下下沉；margin-bottom 补偿阴影占位，避免布局跳动 */
.ui-button--primary,
.ui-button--energy {
  color: var(--color-text-primary);
  border: 1px solid rgba(var(--rgb-white), 0.4);
  margin-bottom: var(--space-1);

  &:hover:not(:disabled):not(.is-loading) {
    border-color: rgba(var(--rgb-white), 0.6);
    /* NOTE: 实色底 hover 保持白字，避免继承基类能量青 */
    color: var(--color-text-primary);
  }

  &:active:not(:disabled):not(.is-loading) {
    transform: translateY(3px);
  }
}

.ui-button--primary {
  background: var(--color-brand-red);
  box-shadow: 0 4px 0 0 var(--color-brand-red-active);

  &:hover:not(:disabled):not(.is-loading) {
    background: var(--color-brand-red-hover);
    box-shadow: 0 3px 0 0 var(--color-brand-red-active);
    transform: translateY(1px);
  }

  &:active:not(:disabled):not(.is-loading) {
    box-shadow: 0 0px 0 0 var(--color-brand-red-active);
    transform: translateY(4px);
  }
}

.ui-button--energy {
  background: var(--color-energy);
  box-shadow: 0 4px 0 0 var(--color-energy-deep);

  &:hover:not(:disabled):not(.is-loading) {
    /* NOTE: 保持亮体（energy），阴影 4→3 + 下沉 1px 做按压预览，
       与 primary 对齐；若把 body 也刷成 energy-deep 会和硬阴影同色、立体感消失 */
    box-shadow: 0 3px 0 0 var(--color-energy-deep);
    transform: translateY(1px);
  }

  &:active:not(:disabled):not(.is-loading) {
    box-shadow: 0 0px 0 0 var(--color-energy-deep);
    transform: translateY(4px);
  }
}

/* ---------- 语义色平面族 ---------- */
.ui-button--success {
  background: var(--color-success);
  color: var(--color-text-primary);
  border-color: var(--color-success);

  &:hover:not(:disabled):not(.is-loading) {
    background: var(--color-jade-light);
    color: var(--color-text-primary);
  }
}

.ui-button--warning {
  background: var(--color-warning);
  color: var(--color-text-inverse);
  border-color: var(--color-warning);

  &:hover:not(:disabled):not(.is-loading) {
    background: var(--color-live);
    color: var(--color-text-inverse);
  }
}

.ui-button--danger {
  background: var(--color-danger);
  color: var(--color-text-primary);
  border-color: var(--color-danger);

  &:hover:not(:disabled):not(.is-loading) {
    background: var(--color-brand-red-active);
    color: var(--color-text-primary);
  }
}

/* ---------- 幽灵描边族（参考 buttons.theme.css .btn.rice-slate-light 内嵌轮廓） ---------- */
.ui-button--ghost {
  background: transparent;
  color: var(--color-text-secondary);
  border-color: var(--color-border-tertiary);

  &:hover:not(:disabled):not(.is-loading) {
    background: var(--color-bg-hover);
    border-color: var(--color-border-tertiary-active);
  }
}

/* ---------- 全宽 ---------- */
.ui-button.is-block {
  display: flex;
  width: 100%;
}

/* ---------- 加载 spinner（CSS 实现，非 emoji） ---------- */
.ui-button__spinner {
  width: 0.9em;
  height: 0.9em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}
</style>
