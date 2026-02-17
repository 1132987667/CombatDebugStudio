<!--
 * 文件: AttributeTooltip.vue
 * 创建日期: 2026-02-16
 * 作者: CombatDebugStudio
 * 功能: 属性悬浮提示组件
 * 描述: 显示属性的详细来源和计算过程
 * 版本: 1.0.0
-->

<template>
  <Teleport to="body">
    <transition name="tooltip-fade">
      <div
        v-if="visible"
        ref="tooltipRef"
        class="attribute-tooltip"
        :style="tooltipStyle"
      >
        <div class="tooltip-header">
          <span class="tooltip-title">{{ title }}</span>
          <span class="tooltip-value">{{ displayValue }}</span>
        </div>
        
        <div class="tooltip-divider"></div>
        
        <div class="tooltip-content">
          <div class="source-list">
            <div 
              v-for="(option, index) in options" 
              :key="index"
              class="source-item"
              :class="{ 'is-bonus': option.from !== '基础' }"
            >
              <div class="source-header">
                <span class="source-from">{{ getSourceLabel(option.from) }}</span>
                <span class="source-name" v-if="option.sourceName">({{ option.sourceName }})</span>
              </div>
              <div class="source-value">
                <span class="source-type">({{ option.valueType }})</span>
                <span class="source-amount" :class="{ 'positive': option.value > 0, 'negative': option.value < 0 }">
                  {{ formatValue(option.value, option.valueType) }}
                </span>
              </div>
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
        </div>
        
        <div class="tooltip-arrow" :class="arrowClass"></div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { AttributeOption, AttributeValueType, AttributeSourceType } from '@/types/UI/UIBattleCharacter'

interface Props {
  visible: boolean
  title: string
  options: AttributeOption[]
  finalValue: number
  valueType: AttributeValueType
  triggerRect?: DOMRect | null
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  title: '',
  options: () => [],
  finalValue: 0,
  valueType: '数值',
  triggerRect: null
})

const tooltipRef = ref<HTMLElement | null>(null)

const getSourceLabel = (source: AttributeSourceType): string => {
  const labels: Record<AttributeSourceType, string> = {
    '基础': '基础属性',
    '装备': '装备加成',
    '天赋': '天赋',
    '被动技能': '被动技能',
    'buff': 'Buff效果',
    '其他': '其他'
  }
  return labels[source] || source
}

const formatValue = (value: number, valueType: AttributeValueType): string => {
  const rounded = Math.round(value * 100) / 100
  if (valueType === '百分比') {
    return rounded > 0 ? `+${rounded}%` : `${rounded}%`
  }
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

const displayValue = computed(() => {
  return formatValue(props.finalValue, props.valueType)
})

const formula = computed(() => {
  if (props.options.length === 0) return '无'
  
  const baseOption = props.options.find(o => o.from === '基础')
  const bonusOptions = props.options.filter(o => o.from !== '基础')
  
  if (!baseOption) return '无基础值'
  
  const parts: string[] = []
  parts.push(formatValue(baseOption.value, baseOption.valueType))
  
  for (const bonus of bonusOptions) {
    if (bonus.valueType === '百分比') {
      parts.push(`${bonus.value > 0 ? '+' : ''}${bonus.value}%`)
    } else {
      parts.push(`${bonus.value > 0 ? '+' : ''}${bonus.value}`)
    }
  }
  
  return parts.join(' ')
})

const arrowClass = computed(() => {
  if (!props.triggerRect) return 'arrow-bottom'
  
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const tooltipWidth = 320
  const tooltipHeight = 300
  
  const rightSpace = viewportWidth - props.triggerRect.right
  const leftSpace = props.triggerRect.left
  const bottomSpace = viewportHeight - props.triggerRect.bottom
  const topSpace = props.triggerRect.top
  
  if (rightSpace > leftSpace && rightSpace > 320) {
    return 'arrow-left'
  } else if (leftSpace > 320) {
    return 'arrow-right'
  } else if (bottomSpace > 300) {
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
  const tooltipHeight = 300
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
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(96, 165, 250, 0.4);
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  pointer-events: none;
  
  .tooltip-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    
    .tooltip-title {
      font-size: 14px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.85);
    }
    
    .tooltip-value {
      font-size: 18px;
      font-weight: 700;
      color: #22d3ee;
      font-family: 'Consolas', monospace;
    }
  }
  
  .tooltip-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(96, 165, 250, 0.4), transparent);
    margin: 12px 0;
  }
  
  .tooltip-content {
    .source-list {
      .source-item {
        padding: 8px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        
        &:last-child {
          border-bottom: none;
        }
        
        &.is-bonus {
          .source-from {
            color: #f97316;
          }
        }
        
        .source-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
          
          .source-from {
            font-size: 13px;
            font-weight: 500;
            color: #60a5fa;
          }
          
          .source-name {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
          }
        }
        
        .source-value {
          display: flex;
          justify-content: space-between;
          align-items: center;
          
          .source-type {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.4);
          }
          
          .source-amount {
            font-size: 14px;
            font-weight: 600;
            font-family: 'Consolas', monospace;
            color: rgba(255, 255, 255, 0.85);
            
            &.positive {
              color: #22d3ee;
            }
            
            &.negative {
              color: #f97316;
            }
          }
        }
      }
    }
    
    .calculation-section {
      background: rgba(34, 211, 238, 0.05);
      border-radius: 8px;
      padding: 12px;
      margin-top: 8px;
      
      .calculation-title {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 8px;
      }
      
      .calculation-formula {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.7);
        font-family: 'Consolas', monospace;
        line-height: 1.6;
        word-break: break-all;
      }
      
      .calculation-result {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed rgba(96, 165, 250, 0.3);
        
        .result-label {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.5);
        }
        
        .result-value {
          font-size: 16px;
          font-weight: 700;
          color: #22d3ee;
          font-family: 'Consolas', monospace;
        }
      }
    }
  }
  
  .tooltip-arrow {
    position: absolute;
    width: 12px;
    height: 12px;
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid rgba(96, 165, 250, 0.4);
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

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
