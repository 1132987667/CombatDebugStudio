<script setup lang="ts">
/**
 * CalcBreakdown.vue — 「数值 + 悬浮分步推导」一体控件（封神榜反推页共用）
 *
 * 值与推导必须在同一处出现，故把 hover 宿主、数值文本、气泡三者封在一个组件里，
 * 宿主自己就能触发 :hover，不需要父级跨作用域改样式。
 */
import { ref } from 'vue'
import type { CalcStep } from '@/domain/fengshen/equipment-overview'

const props = defineProps<{
  /** 单元格显示的结论，如 `81 ~ 198` */
  value: string
  /** 分步推导；空数组时不出气泡 */
  steps: CalcStep[]
  /** 结论行追加的单位（% 等），由调用方按属性判定 */
  unit?: string
}>()

const host = ref<HTMLElement | null>(null)
const pop = ref<HTMLElement | null>(null)
/** 推导有 10 步，贴到滚动视口上沿的行必须翻到下方，否则气泡被裁 */
const below = ref(false)

function stepText(s: CalcStep): string {
  return s.result ? `${s.expr}${props.unit ?? ''}` : s.expr
}

/** visibility:hidden 仍有布局尺寸，故可在显示前量到真实高度 */
function place(): void {
  if (!host.value || !pop.value) return
  below.value = host.value.getBoundingClientRect().top - pop.value.offsetHeight - 16 < 0
}
</script>

<template>
  <span ref="host" class="fs-calc" :class="{ 'is-hoverable': steps.length > 0 }"
    :tabindex="steps.length ? 0 : undefined" @mouseenter="place" @focusin="place">
    <span class="fs-calc-value">{{ value }}</span>
    <span v-if="steps.length" ref="pop" class="fs-calc-pop" :class="{ 'is-below': below }" role="tooltip">
      <span class="fs-calc-title">推导过程</span>
      <span v-for="(s, i) in steps" :key="i" class="fs-calc-row" :class="{ 'is-result': s.result }">
        <span class="fs-calc-label">{{ s.label }}</span>
        <span class="fs-calc-body">
          <span class="fs-calc-expr">{{ stepText(s) }}</span>
          <span v-if="s.note" class="fs-calc-note">{{ s.note }}</span>
        </span>
      </span>
    </span>
  </span>
</template>

<style scoped>
.fs-calc {
  position: relative;
  display: inline-block;
}

.fs-calc.is-hoverable {
  cursor: help;
}

.fs-calc.is-hoverable:focus-visible {
  outline: 2px solid var(--color-info);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* 气泡：靠右锚点避免贴边卡片溢出视口，宽度不超过可视区 */
.fs-calc-pop {
  position: absolute;
  right: 0;
  bottom: calc(100% + var(--space-1));
  z-index: var(--z-tooltip);
  display: grid;
  gap: var(--space-1);
  width: max-content;
  max-width: min(460px, calc(100vw - var(--space-8)));
  padding: var(--space-3);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  background: var(--color-overlay-panel);
  box-shadow: var(--shadow-md);
  line-height: 1.5;
  text-align: left;
  white-space: normal;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--transition-fast);
  pointer-events: none;
}

.fs-calc-pop.is-below {
  bottom: auto;
  top: calc(100% + var(--space-1));
}

.fs-calc:hover .fs-calc-pop,
.fs-calc:focus-visible .fs-calc-pop,
.fs-calc:focus-within .fs-calc-pop {
  opacity: 1;
  visibility: visible;
}

.fs-calc-title {
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--color-border-default);
  color: var(--color-text-secondary);
  font-weight: 600;
  letter-spacing: 0.04em;
}

/* 一行一步：左列步骤名对齐成层级，右列算式与说明同行、放不下才折行 */
.fs-calc-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: var(--space-3);
  align-items: baseline;
}

.fs-calc-label {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.fs-calc-body {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: var(--space-2);
}

.fs-calc-expr {
  font-family: var(--font-family-mono);
  color: var(--color-text-primary);
}

.fs-calc-note {
  color: var(--color-text-tertiary);
}

.fs-calc-note::before {
  content: '— ';
}

/* 结论行与过程行之间加分隔，读得出「上面是过程，下面是答案」 */
.fs-calc-row.is-result {
  margin-top: var(--space-1);
  padding-top: var(--space-1);
  border-top: 1px solid var(--color-border-default);
}

.fs-calc-row.is-result .fs-calc-label,
.fs-calc-row.is-result .fs-calc-expr {
  color: var(--color-text-primary);
  font-weight: 600;
}
</style>
