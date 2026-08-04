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
          <span class="tooltip-title">{{ displayText || title }}</span>
          <span class="tooltip-value">{{ displayValue }}</span>
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
          <!-- ==================== 标准模式（单值属性） ==================== -->
          <div v-if="modifiers.length > 0" class="source-list">
            <!-- 基础数值 -->
            <div v-if="additiveGroup.length > 0" class="source-section">
              <div class="section-title-row">
                <span class="stat-section-title">基础数值</span>
                <span class="layer-total">{{ formatLayerTotal(additiveGroup, ModifierType.ADDITIVE) }}</span>
              </div>
              <div v-for="(modifier, index) in additiveGroup" :key="'a-' + index" class="source-item">
                <div class="source-header">
                  <span class="source-from">{{ getSourceLabel(modifier.sourceType) }}</span>
                  <span class="source-name" v-if="modifier.description">({{ modifier.description }})</span>
                </div>
                <div class="source-value">
                  <span class="source-amount"
                    :class="{ [BuffPolarity.POSITIVE]: modifier.value > 0, [BuffPolarity.NEGATIVE]: modifier.value < 0 }">
                    {{ formatModifierValue(modifier.value, modifier.type) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 属性加成 -->
            <div v-if="percentGroup.length > 0" class="source-section">
              <div class="section-title-row">
                <span class="stat-section-title">属性加成</span>
                <span class="layer-total">{{ formatLayerTotal(percentGroup, ModifierType.PERCENTAGE) }}</span>
              </div>
              <div v-for="(modifier, index) in percentGroup" :key="'p-' + index" class="source-item">
                <div class="source-header">
                  <span class="source-from">{{ getSourceLabel(modifier.sourceType) }}</span>
                  <span class="source-name" v-if="modifier.description">({{ modifier.description }})</span>
                </div>
                <div class="source-value">
                  <span class="source-amount"
                    :class="{ [BuffPolarity.POSITIVE]: modifier.value > 0, [BuffPolarity.NEGATIVE]: modifier.value < 0 }">
                    {{ formatModifierValue(modifier.value, modifier.type) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 独立乘区 -->
            <div v-if="multiGroup.length > 0" class="source-section">
              <div class="section-title-row">
                <span class="stat-section-title">独立乘区</span>
                <span class="layer-total">{{ formatLayerTotal(multiGroup, ModifierType.MULTIPLICATIVE) }}</span>
              </div>
              <div v-for="(modifier, index) in multiGroup" :key="'m-' + index" class="source-item">
                <div class="source-header">
                  <span class="source-from">{{ getSourceLabel(modifier.sourceType) }}</span>
                  <span class="source-name" v-if="modifier.description">({{ modifier.description }})</span>
                </div>
                <div class="source-value">
                  <span class="source-amount"
                    :class="{ [BuffPolarity.POSITIVE]: modifier.value > 0, [BuffPolarity.NEGATIVE]: modifier.value < 0 }">
                    {{ formatModifierValue(modifier.value, modifier.type) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 最终乘区 -->
            <div v-if="finalGroup.length > 0" class="source-section">
              <div class="section-title-row">
                <span class="stat-section-title">最终乘区</span>
                <span class="layer-total">{{ formatLayerTotal(finalGroup, ModifierType.FINAL) }}</span>
              </div>
              <div v-for="(modifier, index) in finalGroup" :key="'f-' + index" class="source-item">
                <div class="source-header">
                  <span class="source-from">{{ getSourceLabel(modifier.sourceType) }}</span>
                  <span class="source-name" v-if="modifier.description">({{ modifier.description }})</span>
                </div>
                <div class="source-value">
                  <span class="source-amount"
                    :class="{ [BuffPolarity.POSITIVE]: modifier.value > 0, [BuffPolarity.NEGATIVE]: modifier.value < 0 }">
                    {{ formatModifierValue(modifier.value, modifier.type) }}
                  </span>
                </div>
              </div>
            </div>

          </div>

          <div v-if="modifiers.length > 0" class="tooltip-divider"></div>

          <div class="calculation-section">
            <div class="calculation-title">计算过程</div>
            <div v-for="(step, i) in calcSteps" :key="i" class="calc-step">
              <span class="calc-step-label">{{ step.label }}</span>
              <span class="calc-step-result">{{ step.result }}</span>
            </div>
            <div class="calculation-result">
              <span class="result-label">=</span>
              <span class="result-value">{{ finalValue }}</span>
            </div>
          </div>
        </div>

        <div class="tooltip-arrow" :class="arrowClass"></div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Modifier, ModifierType, AttributeValueType, ModifierSourceType, ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { ModifierSourceTypeNames } from '@/domain/attribute/types'
import { getAttrMeta } from '@/domain/attribute/types'
import { formatModifierValue } from '@/shared/utils/format'
import { BuffPolarity } from '@/shared/types/buff-classification'
import { round } from '@/shared/utils/math'

interface Props {
  visible: boolean
  title: string
  modifiers: Modifier[]
  finalValue: number
  valueType: AttributeValueType
  triggerRect?: DOMRect | null
  /** 属性编码（可选），传此值可避免从 title 反向查找 attributeMeta */
  attributeCode?: string
  /** 属性展示文本（如"攻击力 123"），有值时标题区优先显示（无值时回退 title） */
  displayText?: string
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  title: '',
  modifiers: () => [],
  finalValue: 0,
  valueType: AttributeValueType.VALUE,
  triggerRect: null,
  displayText: '',
})

const tooltipRef = ref<HTMLElement | null>(null)

// 根据属性名称获取属性元数据
// NOTE: 优先用 attributeCode 直接查 meta，无则跳过（title 反向查找不可靠）
const attributeMeta = computed(() => {
  if (!props.attributeCode) return undefined
  return getAttrMeta(props.attributeCode as ATTRIBUTE_CODE)
})

const getSourceLabel = (source: ModifierSourceType): string => {
  return ModifierSourceTypeNames[source] || source
}

const formatValue = (value: number, valueType: AttributeValueType): string => {
  const rounded = round(value, 2)
  if (valueType === AttributeValueType.PERCENT) {
    return rounded > 0 ? `+${rounded}%` : `${rounded}%`
  }
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

const displayValue = computed(() => {
  return formatValue(props.finalValue, props.valueType)
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

/** 四层分组的层合计：基础/加法层显示数值合计，百分比/乘法/最终层显示百分比合计 */
const formatLayerTotal = (mods: Modifier[], type: ModifierType): string => {
  if (mods.length === 0) return ''
  const total = mods.reduce((s, m) => s + m.value, 0)
  if (type === ModifierType.MULTIPLICATIVE || type === ModifierType.FINAL) {
    return `${total >= 0 ? '+' : ''}${round(total * 100, 2)}%`
  }
  return formatModifierValue(total, type)
}

/** 分步计算过程：基础值 → 加法 → 百分比乘区 → 独立乘区 → 最终乘区，每步带中间结果 */
const calcSteps = computed(() => {
  const mods = props.modifiers
  const fmt = (v: number): string => `${round(v, 2)}`
  const signed = (v: number): string => (v >= 0 ? '+' : '') + fmt(v)

  // 无修饰符：基础值即最终值，避免空内容（只有分隔线的空 tooltip）
  if (mods.length === 0) {
    return [{ label: '基础值', result: fmt(props.finalValue) }]
  }

  const baseMod = mods.find(m => m.sourceKey === 'base')
  const additiveMods = mods.filter(m => m.sourceKey !== 'base' && m.type === ModifierType.ADDITIVE)
  const percentMods = mods.filter(m => m.type === ModifierType.PERCENTAGE)
  const multiMods = mods.filter(m => m.type === ModifierType.MULTIPLICATIVE)
  const finalMods = mods.filter(m => m.type === ModifierType.FINAL)

  const steps: Array<{ label: string; result: string }> = []
  let current = baseMod?.value ?? 0

  steps.push({ label: '基础值', result: fmt(current) })

  if (additiveMods.length > 0) {
    const total = additiveMods.reduce((s, m) => s + m.value, 0)
    const before = current
    current = before + total
    steps.push({
      label: `加法修正 (${additiveMods.map(m => formatModifierValue(m.value, ModifierType.ADDITIVE)).join(' ')})`,
      result: `${fmt(before)} → ${fmt(current)} (${signed(total)})`,
    })
  }

  if (percentMods.length > 0) {
    const total = percentMods.reduce((s, m) => s + m.value, 0)
    const before = current
    const mult = 1 + total / 100
    current = before * mult
    steps.push({
      label: `属性加成 (${percentMods.map(m => formatModifierValue(m.value, m.type)).join(' ')})`,
      result: `${fmt(before)} → ${fmt(current)} (×${round(mult, 3)})`,
    })
  }

  for (const m of multiMods) {
    const before = current
    current = before * (1 + m.value)
    steps.push({
      label: `独立乘区 (${m.description ?? m.sourceKey})`,
      result: `${fmt(before)} → ${fmt(current)} (×${round(1 + m.value, 3)})`,
    })
  }

  for (const m of finalMods) {
    const before = current
    current = before * (1 + m.value)
    steps.push({
      label: `最终乘区 (${m.description ?? m.sourceKey})`,
      result: `${fmt(before)} → ${fmt(current)} (×${round(1 + m.value, 3)})`,
    })
  }

  return steps
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

const handleClickOutside = () => {
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
@use '@/presentation/styles/mixins' as *;

.attribute-tooltip {
  position: fixed;
  z-index: 9999;
  width: 320px;
  max-width: 40vw;
  background: var(--color-overlay-panel);
  border: 1px solid var(--border-common-color-light);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(8px);
  pointer-events: none;

  .tooltip-header {
    @include flex-layout;
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

        .calc-step {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: var(--space-2);
          padding: var(--space-1) 0;
          border-bottom: 1px dashed var(--border-common-color-dark);
          font-family: 'JetBrains Mono', monospace;

          &:last-child {
            border-bottom: none;
          }

          .calc-step-label {
            color: var(--color-text-tertiary);
            flex-shrink: 0;
          }

          .calc-step-result {
            color: var(--color-text-secondary);
            text-align: right;
            white-space: nowrap;
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
}
</style>
