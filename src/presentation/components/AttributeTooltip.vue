<!--
 * 文件: AttributeTooltip.vue
 * 创建日期: 2026-02-16
 * 作者: CombatDebugStudio
 * 功能: 属性悬浮提示组件
 * 描述: 显示属性的详细来源和计算过程，支持单值属性和攻击力区间属性
 * 版本: 2.0.0
-->

<template>
  <Teleport to="body">
    <transition name="tooltip-fade">
      <div v-if="visible" ref="tooltipRef" class="attribute-tooltip" :style="tooltipStyle">
        <div class="tooltip-header">
          <span class="tooltip-title">{{ title }}</span>
          <span class="tooltip-value">{{ displayText || displayValue }}</span>
        </div>

        <!-- 属性描述部分 -->
        <div v-if="attributeMeta" class="tooltip-description">
          <div class="description-item">
            <span class="description-label">描述:</span>
            <span class="description-text">{{ attributeMeta.description }}</span>
          </div>
          <div class="description-item">
            <span class="description-label">影响:</span>
            <span class="description-text">{{ attributeMeta.impact }}</span>
          </div>
          <div class="description-item">
            <span class="description-label">范围:</span>
            <span class="description-text">{{ attributeMeta.range }}</span>
          </div>
        </div>

        <div class="tooltip-divider"></div>

        <div class="tooltip-content">
          <!-- ==================== 区间模式（攻击力） ==================== -->
          <template v-if="rangeLayers && rangeLayers.length > 0">
            <div class="source-list">
              <div v-for="layer in rangeLayers" :key="layer.title" class="source-section">
                <div class="section-title-row">
                  <span class="stat-section-title">{{ layer.title }}</span>
                  <span class="layer-total">{{ formatRangeTotal(layer.minTotal, layer.title) }}-{{
                    formatRangeTotal(layer.maxTotal, layer.title) }}</span>
                </div>
                <div v-for="(row, idx) in layer.rows" :key="layer.title + '-' + idx" class="source-item range-row">
                  <span class="source-name-label">{{ row.label }}</span>
                  <span class="source-range-value">{{ formatRangeRow(row) }}</span>
                </div>
              </div>
            </div>

            <div class="tooltip-divider"></div>

            <div class="calculation-section">
              <div class="calculation-title">计算过程</div>
              <div class="calculation-formula">
                <div class="calc-line">[最小] {{ rangeFormulaMin }}</div>
                <div class="calc-line">[最大] {{ rangeFormulaMax }}</div>
              </div>
              <div class="calculation-result">
                <span class="result-label">→</span>
                <span class="result-value">{{ rangeResultMin }}-{{ rangeResultMax }}</span>
              </div>
            </div>
          </template>

          <!-- ==================== 标准模式（单值属性） ==================== -->
          <template v-else>
            <div class="source-list">
              <!-- 基础数值 -->
              <div v-if="additiveGroup.length > 0" class="source-section">
                <div class="stat-section-title">基础数值</div>
                <div v-for="(modifier, index) in additiveGroup" :key="'a-' + index" class="source-item">
                  <div class="source-header">
                    <span class="source-from">{{ getSourceLabel(modifier.sourceType) }}</span>
                    <span class="source-name" v-if="modifier.description">({{ modifier.description }})</span>
                  </div>
                  <div class="source-value">
                    <span class="source-amount"
                      :class="{ 'positive': modifier.value > 0, 'negative': modifier.value < 0 }">
                      {{ formatModifierValue(modifier.value, modifier.type) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 属性加成 -->
              <div v-if="percentGroup.length > 0" class="source-section">
                <div class="stat-section-title">属性加成</div>
                <div v-for="(modifier, index) in percentGroup" :key="'p-' + index" class="source-item">
                  <div class="source-header">
                    <span class="source-from">{{ getSourceLabel(modifier.sourceType) }}</span>
                    <span class="source-name" v-if="modifier.description">({{ modifier.description }})</span>
                  </div>
                  <div class="source-value">
                    <span class="source-amount"
                      :class="{ 'positive': modifier.value > 0, 'negative': modifier.value < 0 }">
                      {{ formatModifierValue(modifier.value, modifier.type) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 独立乘区 -->
              <div v-if="multiGroup.length > 0" class="source-section">
                <div class="stat-section-title">独立乘区</div>
                <div v-for="(modifier, index) in multiGroup" :key="'m-' + index" class="source-item">
                  <div class="source-header">
                    <span class="source-from">{{ getSourceLabel(modifier.sourceType) }}</span>
                    <span class="source-name" v-if="modifier.description">({{ modifier.description }})</span>
                  </div>
                  <div class="source-value">
                    <span class="source-amount"
                      :class="{ 'positive': modifier.value > 0, 'negative': modifier.value < 0 }">
                      {{ formatModifierValue(modifier.value, modifier.type) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- 最终乘区 -->
              <div v-if="finalGroup.length > 0" class="source-section">
                <div class="stat-section-title">最终乘区</div>
                <div v-for="(modifier, index) in finalGroup" :key="'f-' + index" class="source-item">
                  <div class="source-header">
                    <span class="source-from">{{ getSourceLabel(modifier.sourceType) }}</span>
                    <span class="source-name" v-if="modifier.description">({{ modifier.description }})</span>
                  </div>
                  <div class="source-value">
                    <span class="source-amount"
                      :class="{ 'positive': modifier.value > 0, 'negative': modifier.value < 0 }">
                      {{ formatModifierValue(modifier.value, modifier.type) }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-if="modifiers.length === 0" class="no-sources">
                无详细来源信息
              </div>
            </div>

            <div class="tooltip-divider"></div>

            <div class="calculation-section">
              <div class="calculation-title">计算过程</div>
              <div class="calculation-formula">{{ formula }}</div>
              <div class="calculation-result">
                <span class="result-label">=</span>
                <span class="result-value">{{ finalValue }}</span>
              </div>
            </div>
          </template>
        </div>

        <div class="tooltip-arrow" :class="arrowClass"></div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Modifier, ModifierType, AttributeValueType, ModifierSourceType } from '@/domain/attribute/types'
import { ModifierSourceTypeNames } from '@/domain/attribute/types'
import { getAttrMeta } from '@/domain/attribute/types'
import { formatModifierValue } from '@/shared/utils/format'

// ===================== 区间模式类型导出 =====================
export interface RangeModifierRow {
  label: string
  minValue: number | null
  maxValue: number | null
  /** ponytail: 是否按百分比格式化；由 buildRangeLayer 根据 modType 注入 */
  isPercent: boolean
}

export interface RangeLayerData {
  title: string
  minTotal: number
  maxTotal: number
  rows: RangeModifierRow[]
}

interface Props {
  visible: boolean
  title: string
  modifiers: Modifier[]
  finalValue: number
  valueType: AttributeValueType
  triggerRect?: DOMRect | null
  /** 覆盖值的显示文本（如范围 "25-40"），为空时自动格式化 finalValue */
  displayText?: string
  /** 区间模式数据（攻击力使用），存在时切换为区间渲染 */
  rangeLayers?: RangeLayerData[]
  /** 属性编码（可选），传此值可避免从 title 反向查找 attributeMeta */
  attributeCode?: string
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  title: '',
  modifiers: () => [],
  finalValue: 0,
  valueType: AttributeValueType.VALUE,
  triggerRect: null,
  displayText: '',
  rangeLayers: () => [],
})

const tooltipRef = ref<HTMLElement | null>(null)

// 根据属性名称获取属性元数据
// NOTE: 优先用 attributeCode 直接查 meta，无则跳过（title 反向查找不可靠）
const attributeMeta = computed(() => {
  if (!props.attributeCode) return undefined
  return getAttrMeta(props.attributeCode as any)
})

const getSourceLabel = (source: ModifierSourceType): string => {
  return ModifierSourceTypeNames[source] || source
}

const formatValue = (value: number, valueType: AttributeValueType): string => {
  const rounded = Math.round(value * 100) / 100
  if (valueType === AttributeValueType.PERCENT) {
    return rounded > 0 ? `+${rounded}%` : `${rounded}%`
  }
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

const displayValue = computed(() => {
  return formatValue(props.finalValue, props.valueType)
})

// ===================== 区间模式计算 =====================

/** 格式化区间层的合计值 */
const formatRangeTotal = (total: number, layerTitle: string): string => {
  // 基础数值层直接显示数值；其他三层的 total 已经是百分比点（如 20=20%）
  if (layerTitle === '基础数值') {
    return Math.round(total * 100) / 100 + ''
  }
  return Math.round(total * 100) / 100 + '%'
}

/** 格式化区间行 */
const formatRangeRow = (row: RangeModifierRow): string => {
  const fmt = (v: number) => row.isPercent ? formatModifierValue(v, ModifierType.PERCENTAGE) : formatModifierValue(v, ModifierType.ADDITIVE)

  if (row.minValue !== null && row.maxValue !== null) {
    if (row.minValue === row.maxValue) {
      return fmt(row.minValue)
    }
    return `${fmt(row.minValue)} / ${fmt(row.maxValue)}`
  }
  if (row.minValue !== null) return fmt(row.minValue)
  if (row.maxValue !== null) return fmt(row.maxValue)
  return ''
}

/** 基础数值层合计（用于计算式起点） */
const rangeBaseMin = computed(() => props.rangeLayers[0]?.minTotal ?? 0)
const rangeBaseMax = computed(() => props.rangeLayers[0]?.maxTotal ?? 0)

/** 属性加成/独立/最终三层的合计（百分比点 → 小数，供公式使用） */
const rangeLayerMultipliers = computed(() => {
  const layers = props.rangeLayers || []
  // 跳过第0层（基础数值），后面三层是百分比点（如 20 = 20%），转为小数 1.20
  const pct = layers[1]  // 属性加成
  const multi = layers[2] // 独立乘区
  const final = layers[3] // 最终乘区
  return {
    pctMin: pct ? 1 + pct.minTotal / 100 : 1,
    pctMax: pct ? 1 + pct.maxTotal / 100 : 1,
    multiMin: multi ? 1 + multi.minTotal / 100 : 1,
    multiMax: multi ? 1 + multi.maxTotal / 100 : 1,
    finalMin: final ? 1 + final.minTotal / 100 : 1,
    finalMax: final ? 1 + final.maxTotal / 100 : 1,
  }
})

const rangeFormulaMin = computed(() => {
  const m = rangeLayerMultipliers.value
  const base = rangeBaseMin.value
  const parts = [`${base}`]
  if (m.pctMin !== 1) parts.push(`${m.pctMin.toFixed(2)}`)
  if (m.multiMin !== 1) parts.push(`${m.multiMin.toFixed(2)}`)
  if (m.finalMin !== 1) parts.push(`${m.finalMin.toFixed(2)}`)
  return parts.join(' × ')
})

const rangeFormulaMax = computed(() => {
  const m = rangeLayerMultipliers.value
  const base = rangeBaseMax.value
  const parts = [`${base}`]
  if (m.pctMax !== 1) parts.push(`${m.pctMax.toFixed(2)}`)
  if (m.multiMax !== 1) parts.push(`${m.multiMax.toFixed(2)}`)
  if (m.finalMax !== 1) parts.push(`${m.finalMax.toFixed(2)}`)
  return parts.join(' × ')
})

const rangeResultMin = computed(() => {
  const m = rangeLayerMultipliers.value
  return +(rangeBaseMin.value * m.pctMin * m.multiMin * m.finalMin).toFixed(2)
})

const rangeResultMax = computed(() => {
  const m = rangeLayerMultipliers.value
  return +(rangeBaseMax.value * m.pctMax * m.multiMax * m.finalMax).toFixed(2)
})

// ===================== 标准模式计算 =====================

// 按乘区分组修饰符
const additiveGroup = computed(() => {
  return props.modifiers.filter(m => m.type === ModifierType.ADDITIVE)
})
const percentGroup = computed(() => {
  return props.modifiers.filter(m => m.type === ModifierType.PERCENTAGE)
})
const multiGroup = computed(() => {
  return props.modifiers.filter(m => m.type === ModifierType.MULTIPLICATIVE)
})
const finalGroup = computed(() => {
  return props.modifiers.filter(m => m.type === ModifierType.FINAL)
})

const formula = computed(() => {
  if (props.modifiers.length === 0) return '无'

  let baseValue = 0
  const additiveMods: Modifier[] = []
  const percentMods: Modifier[] = []
  const multiMods: Modifier[] = []
  const finalMods: Modifier[] = []
  for (const m of props.modifiers) {
    if (m.sourceKey === 'base') {
      baseValue = m.value
    } else if (m.type === ModifierType.ADDITIVE) additiveMods.push(m)
    else if (m.type === ModifierType.PERCENTAGE) percentMods.push(m)
    else if (m.type === ModifierType.MULTIPLICATIVE) multiMods.push(m)
    else if (m.type === ModifierType.FINAL) finalMods.push(m)
  }

  const brackets: string[] = []

  if (additiveMods.length === 0) {
    brackets.push(`${baseValue}`)
  } else {
    const parts = [`${baseValue}`]
    for (const m of additiveMods) {
      parts.push(`${m.value > 0 ? '+' : ''}${m.value}`)
    }
    brackets.push(`(${parts.join(' ')})`)
  }

  if (percentMods.length > 0) {
    const parts: string[] = ['1']
    for (const m of percentMods) {
      parts.push(`${m.value > 0 ? '+' : ''}${m.value}%`)
    }
    brackets.push(`(${parts.join(' ')})`)
  }

  for (const m of multiMods) {
    brackets.push(`(${1 + m.value})`)
  }

  for (const m of finalMods) {
    brackets.push(`(${1 + m.value}最终)`)
  }

  return brackets.length > 0 ? `${brackets.join(' × ')} = ${props.finalValue}` : '无'
})

// ===================== 定位 =====================

const arrowClass = computed(() => {
  if (!props.triggerRect) return 'arrow-bottom'

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const tooltipWidth = 320
  const tooltipHeight = 400

  const rightSpace = viewportWidth - props.triggerRect.right
  const leftSpace = props.triggerRect.left
  const bottomSpace = viewportHeight - props.triggerRect.bottom
  const topSpace = props.triggerRect.top

  if (rightSpace > leftSpace && rightSpace > tooltipWidth) {
    return 'arrow-left'
  } else if (leftSpace > tooltipWidth) {
    return 'arrow-right'
  } else if (bottomSpace > tooltipHeight) {
    return 'arrow-top'
  } else {
    return 'arrow-bottom'
  }
})

const tooltipStyle = computed(() => {
  if (!props.triggerRect) {
    return {
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)'
    }
  }

  const tooltipWidth = 320
  const tooltipHeight = 400
  const offset = 12

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const rightSpace = viewportWidth - props.triggerRect.right
  const leftSpace = props.triggerRect.left
  const bottomSpace = viewportHeight - props.triggerRect.bottom
  const topSpace = props.triggerRect.top

  let left = props.triggerRect.left
  let top = props.triggerRect.top

  if (rightSpace > leftSpace && rightSpace > tooltipWidth + offset) {
    left = props.triggerRect.right + offset
  } else if (leftSpace > tooltipWidth + offset) {
    left = props.triggerRect.left - tooltipWidth - offset
  } else {
    left = Math.max(10, Math.min(props.triggerRect.left, viewportWidth - tooltipWidth - 10))
  }

  if (bottomSpace > tooltipHeight + offset) {
    top = props.triggerRect.top
  } else if (topSpace > tooltipHeight + offset) {
    top = props.triggerRect.top - tooltipHeight + props.triggerRect.height
  } else {
    top = Math.max(10, Math.min(props.triggerRect.top, viewportHeight - tooltipHeight - 10))
  }

  return {
    left: `${left}px`,
    top: `${top}px`
  }
})

const handleClickOutside = (e: MouseEvent) => {
  // 可以添加点击外部关闭的逻辑
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped lang="scss">
.attribute-tooltip {
  position: fixed;
  z-index: 9999;
  width: 320px;
  max-width: 90vw;
  background: var(--color-overlay-panel);
  border: 1px solid var(--border-common-color-light);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(8px);
  pointer-events: none;

  .tooltip-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--border-common-color-dark);

    .tooltip-title {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-semibold);
      color: var(--color-energy);
      text-shadow: 0 0 8px rgba(var(--rgb-energy), var(--alpha-glow));
    }

    .tooltip-value {
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-energy);
      font-family: 'JetBrains Mono', monospace;
    }
  }

  .tooltip-description {
    background: rgba(var(--rgb-energy), var(--alpha-tint));
    border-radius: var(--radius-md);
    padding: var(--space-2);
    margin-bottom: var(--space-3);

    .description-item {
      display: flex;
      margin-bottom: var(--space-1);

      &:last-child {
        margin-bottom: 0;
      }

      .description-label {
        color: var(--color-text-tertiary);
        width: 40px;
        flex-shrink: 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .description-text {
        color: var(--color-text-secondary);
        flex: 1;
        line-height: var(--line-height-sm);
      }
    }
  }

  .tooltip-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border-common-color-light), transparent);
    margin: var(--space-3) 0;
  }

  .tooltip-content {
    .source-list {
      .source-section {
        margin-bottom: var(--space-3);

        &:last-child {
          margin-bottom: 0;
        }

        .section-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-1);
          padding-bottom: var(--space-1);
          border-bottom: 1px solid var(--border-common-color-dark);
        }

        .stat-section-title {
          font-weight: var(--font-weight-semibold);
          color: var(--color-info);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .layer-total {
          font-weight: var(--font-weight-bold);
          color: var(--color-energy);
          font-family: 'JetBrains Mono', monospace;
        }
      }

      .source-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-1) 0;
        border-bottom: 1px solid var(--color-border-hairline);

        &:last-child {
          border-bottom: none;
        }

        .source-header {
          display: flex;
          align-items: center;
          gap: var(--space-1);
          min-width: 0;

          .source-from {
            font-weight: var(--font-weight-medium);
            color: var(--color-text-secondary);
            white-space: nowrap;
          }

          .source-name {
            color: var(--color-text-disabled);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        }

        .source-value {
          flex-shrink: 0;

          .source-amount {
            font-size: var(--font-size-md);
            font-weight: var(--font-weight-semibold);
            font-family: 'JetBrains Mono', monospace;
            color: var(--color-text-primary);

            &.positive {
              color: var(--color-energy);
            }

            &.negative {
              color: var(--color-warning);
            }
          }
        }

        &.range-row {
          .source-name-label {
            font-weight: var(--font-weight-medium);
            color: var(--color-text-secondary);
          }

          .source-range-value {
            font-weight: var(--font-weight-semibold);
            font-family: 'JetBrains Mono', monospace;
            color: var(--color-energy);
          }
        }
      }

      .no-sources {
        text-align: center;
        padding: var(--space-3);
        color: var(--color-text-tertiary);
        font-style: italic;
      }
    }

    .calculation-section {
      background: rgba(var(--rgb-energy), var(--alpha-tint));
      border-radius: var(--radius-md);
      padding: var(--space-3);
      margin-top: var(--space-2);

      .calculation-title {
        color: var(--color-text-tertiary);
        margin-bottom: var(--space-2);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .calculation-formula {
        color: var(--color-text-secondary);
        font-family: 'JetBrains Mono', monospace;
        line-height: var(--line-height-lg);
        white-space: pre-wrap;
        word-break: break-all;

        .calc-line {
          margin-bottom: var(--space-1);
        }
      }

      .calculation-result {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-top: var(--space-2);
        padding-top: var(--space-2);
        border-top: 1px dashed var(--border-common-color-dark);

        .result-label {
          font-size: var(--font-size-md);
          color: var(--color-text-tertiary);
        }

        .result-value {
          font-size: var(--font-size-lg);
          font-weight: var(--font-weight-bold);
          color: var(--color-energy);
          font-family: 'JetBrains Mono', monospace;
        }
      }
    }
  }

  .tooltip-arrow {
    position: absolute;
    width: 12px;
    height: 12px;
    background: var(--color-overlay-panel);
    border: 1px solid var(--border-common-color);
    transform: rotate(45deg);

    &.arrow-top {
      top: -7px;
      left: 20px;
      border-bottom: none;
      border-right: none;
    }

    &.arrow-bottom {
      bottom: -7px;
      left: 20px;
      border-top: none;
      border-left: none;
    }

    &.arrow-left {
      left: -7px;
      top: 20px;
      border-top: none;
      border-right: none;
    }

    &.arrow-right {
      right: -7px;
      top: 20px;
      border-bottom: none;
      border-left: none;
    }
  }
}

/* 悬浮提示过渡动画 */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity var(--transition-fast) ease, transform var(--transition-fast) ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.tooltip-fade-enter-to,
.tooltip-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
