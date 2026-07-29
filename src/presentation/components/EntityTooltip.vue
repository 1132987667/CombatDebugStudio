<!--
 * 文件: EntityTooltip.vue
 * 功能: 日志悬浮信息卡片组件
 * 描述: 用于 LogSegment 中带 hover 字段的实体锚点悬浮显示。
 *       沿用 AttributeTooltip.vue 的成熟范式：Teleport to body + 触发元素 rect 定位 + 视口边缘翻转 + 延迟隐藏。
 *       全局复用，BattleLog.vue、ParticipantCard、BuffTextBar 均可接入。
 *
 * 使用方式（由宿主组件控制 visible 和 data）：
 *   <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="triggerRect" />
-->

<template>
  <Teleport to="body">
    <transition name="tooltip-fade">
      <div v-if="visible && data" ref="tooltipRef" class="entity-tooltip" :style="tooltipStyle"
        @mouseenter="onTooltipEnter" @mouseleave="onTooltipLeave">
        <!-- 标题行：名称 + 类型徽章 + 时长徽章 -->
        <div class="tooltip-header">
          <span class="tooltip-name">{{ data.name }}</span>
          <span class="tooltip-badges">
            <span class="badge badge-type">{{ data.badge }}</span>
            <span v-if="data.durationLabel" class="badge badge-duration">{{ data.durationLabel }}</span>
          </span>
        </div>

        <!-- 描述 -->
        <div v-if="data.description" class="tooltip-description">
          {{ data.description }}
        </div>

        <!-- 明细行 -->
        <div v-if="data.details.length > 0" class="tooltip-details">
          <div v-for="(row, idx) in data.details" :key="idx" class="detail-row">
            <span class="detail-label">{{ row.label }}</span>
            <span class="detail-value">{{ row.value }}</span>
          </div>
        </div>

        <!-- 来源脚注 -->
        <div v-if="data.source" class="tooltip-source">
          {{ data.source }}
        </div>

        <!-- 箭头 -->
        <div class="tooltip-arrow" :class="arrowClass"></div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TooltipData } from '@/application/projection/LogTooltipResolver'

interface Props {
  visible: boolean
  data: TooltipData | null
  triggerRect?: DOMRect | null
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  data: null,
  triggerRect: null,
})

const emit = defineEmits<{
  (e: 'hide'): void
}>()

const tooltipRef = ref<HTMLElement | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | null = null

/** 延迟隐藏：当鼠标移入 tooltip 本身时取消隐藏计时 */
const onTooltipEnter = () => {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

/** 鼠标离开 tooltip 或触发元素时开始延迟隐藏 */
const onTooltipLeave = () => {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    emit('hide')
  }, 200) // 200ms 延迟
}

/** 清除隐藏计时器（供父组件在触发元素 mouseenter 时调用） */
const cancelHide = () => {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

// ===================== 定位 =====================

const TOOLTIP_WIDTH = 300
const TOOLTIP_HEIGHT = 240

const arrowClass = computed(() => {
  const rect = props.triggerRect
  if (!rect) return 'arrow-bottom'

  const vw = window.innerWidth
  const vh = window.innerHeight

  if (vh - rect.bottom > TOOLTIP_HEIGHT + 12) return 'arrow-top'     // 下方空间大，箭头朝上
  if (rect.top > TOOLTIP_HEIGHT + 12) return 'arrow-bottom'          // 上方空间大，箭头朝下
  if (vw - rect.right > TOOLTIP_WIDTH + 12) return 'arrow-left'      // 右侧空间大，箭头朝左
  return 'arrow-right'                                                // 左侧空间大，箭头朝右
})

const tooltipStyle = computed(() => {
  const rect = props.triggerRect
  if (!rect) {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }

  const offset = 10
  let left = rect.left
  let top = rect.top

  // 默认：放在下方（箭头朝上）
  if (arrowClass.value === 'arrow-top') {
    left = Math.max(10, Math.min(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - 10))
    top = rect.bottom + offset
  } else if (arrowClass.value === 'arrow-bottom') {
    left = Math.max(10, Math.min(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - 10))
    top = rect.top - TOOLTIP_HEIGHT - offset
  } else if (arrowClass.value === 'arrow-left') {
    left = rect.right + offset
    top = Math.max(10, Math.min(rect.top + rect.height / 2 - TOOLTIP_HEIGHT / 2, window.innerHeight - TOOLTIP_HEIGHT - 10))
  } else {
    left = rect.left - TOOLTIP_WIDTH - offset
    top = Math.max(10, Math.min(rect.top + rect.height / 2 - TOOLTIP_HEIGHT / 2, window.innerHeight - TOOLTIP_HEIGHT - 10))
  }

  return { left: `${left}px`, top: `${top}px` }
})
</script>

<style scoped lang="scss">
.entity-tooltip {
  position: fixed;
  z-index: 10000;
  width: 300px;
  max-width: 90vw;
  max-height: 50vh;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid var(--border-common-color);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  pointer-events: auto;
  line-height: var(--line-height-md);
}

/* 标题行 */
.tooltip-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border-common-color-dark);
}

.tooltip-name {
  font-weight: var(--font-weight-semibold);
  color: var(--color-energy);
  text-shadow: 0 0 6px var(--border-debug-color);
  word-break: break-all;
}

.tooltip-badges {
  display: flex;
  gap: var(--space-1);
  flex-shrink: 0;
}

.badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.badge-type {
  background: var(--color-info-bg);
  color: var(--color-info);
}

.badge-duration {
  background: rgba(34, 211, 238, 0.1);
  color: var(--color-energy);
}

/* 描述 */
.tooltip-description {
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2);
  padding: var(--space-2);
  background: rgba(34, 211, 238, 0.04);
  border-radius: var(--radius-sm);
  line-height: var(--line-height-md);
}

/* 明细行 */
.tooltip-details {
  margin-bottom: var(--space-2);
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);

  &:last-child {
    border-bottom: none;
  }
}

.detail-label {
  color: var(--color-text-tertiary);
}

.detail-value {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
  text-align: right;
}

/* 来源脚注 */
.tooltip-source {
  color: var(--color-text-tertiary);
  padding-top: var(--space-1);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* 箭头 */
.tooltip-arrow {
  position: absolute;
  width: 10px;
  height: 10px;
  background: rgba(15, 23, 42, 0.96);
  border: 1px solid var(--border-common-color);
  transform: rotate(45deg);

  &.arrow-top {
    top: -6px;
    left: 20px;
    border-bottom: none;
    border-right: none;
  }

  &.arrow-bottom {
    bottom: -6px;
    left: 20px;
    border-top: none;
    border-left: none;
  }

  &.arrow-left {
    left: -6px;
    top: 20px;
    border-top: none;
    border-right: none;
  }

  &.arrow-right {
    right: -6px;
    top: 20px;
    border-bottom: none;
    border-left: none;
  }
}

/* 过渡动画 */
.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.tooltip-fade-enter-to,
.tooltip-fade-leave-from {
  opacity: 1;
  transform: translateY(0);
}
</style>
