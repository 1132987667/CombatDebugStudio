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
          <span class="tooltip-name" :style="data.nameColor ? { color: data.nameColor } : undefined">{{ data.name }}</span>
          <span class="tooltip-badges">
            <span class="badge badge-type"
              :style="data.badgeColor ? { color: data.badgeColor, background: `color-mix(in srgb, ${data.badgeColor} 14%, transparent)` } : undefined">{{ data.badge }}</span>
            <span v-if="data.durationLabel" class="badge badge-duration">{{ data.durationLabel }}</span>
          </span>
        </div>

        <!-- 描述 -->
        <div v-if="data.description" class="tooltip-description">
          {{ data.description }}
        </div>

        <!-- 明细行 -->
        <div v-if="data.details.length > 0" class="tooltip-details">
          <template v-for="(row, idx) in data.details" :key="idx">
            <div v-if="row.section" class="detail-section">{{ row.label }}</div>
            <div v-else class="detail-row">
              <span class="detail-label">{{ row.label }}</span>
              <span class="detail-value">{{ row.value }}</span>
            </div>
          </template>
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
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
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

// NOTE: 关闭不能只靠宿主 mouseleave——触发元素被 v-for 销毁时（如点击穿戴移除背包卡）
// 浏览器不会派发 mouseleave，tooltip 会永久残留。点击外部即收起，对所有宿主兜底。
const onDocMouseDown = (e: MouseEvent): void => {
  if (tooltipRef.value?.contains(e.target as Node)) return
  emit('hide')
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) window.addEventListener('mousedown', onDocMouseDown, true)
    else window.removeEventListener('mousedown', onDocMouseDown, true)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onDocMouseDown, true)
  if (hideTimer) clearTimeout(hideTimer)
})

// ===================== 定位 =====================

const TOOLTIP_WIDTH = 300
/** 估算高度仅作首帧兜底；显示后测量真实高度再校正位置（内容多寡差异大，固定估值会超屏） */
const TOOLTIP_HEIGHT = 240
const measuredH = ref(TOOLTIP_HEIGHT)

// NOTE: 定位依赖真实高度——装备悬浮卡带分组明细可达 400px+，按估算值翻转仍会超出视口。
// 显示/数据变化后测量 offsetHeight，触发 tooltipStyle 重算并夹紧到视口内（超高的走内部滚动）。
watch(
  () => [props.visible, props.data, props.triggerRect] as const,
  ([visible]) => {
    if (!visible) return
    void nextTick(() => {
      const h = tooltipRef.value?.offsetHeight ?? 0
      if (h > 0) measuredH.value = h
    })
  },
  { immediate: true },
)

const arrowClass = computed(() => {
  const rect = props.triggerRect
  if (!rect) return 'arrow-bottom'

  const vw = window.innerWidth
  const vh = window.innerHeight
  const h = measuredH.value

  if (vh - rect.bottom > h + 12) return 'arrow-top'                  // 下方放得下，箭头朝上
  if (rect.top > h + 12) return 'arrow-bottom'                       // 上方放得下，箭头朝下
  if (vh - rect.bottom >= rect.top) return 'arrow-top'               // 上下都紧：取空间大的一侧
  return 'arrow-bottom'
})

const tooltipStyle = computed(() => {
  const rect = props.triggerRect
  if (!rect) {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }
  }

  const offset = 10
  const vh = window.innerHeight
  const vw = window.innerWidth
  const h = measuredH.value
  // 垂直兜底夹紧：条内超高时（max-height 50vh + 内部滚动）也保证不出视口
  const maxTop = Math.max(10, vh - h - 10)
  const clampTop = (top: number): number => Math.min(Math.max(top, 10), maxTop)

  let left: number
  let top: number

  if (arrowClass.value === 'arrow-top') {
    left = Math.max(10, Math.min(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 10))
    top = clampTop(rect.bottom + offset)
  } else if (arrowClass.value === 'arrow-bottom') {
    left = Math.max(10, Math.min(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, vw - TOOLTIP_WIDTH - 10))
    top = clampTop(rect.top - h - offset)
  } else if (arrowClass.value === 'arrow-left') {
    left = rect.right + offset
    top = clampTop(rect.top + rect.height / 2 - h / 2)
  } else {
    left = rect.left - TOOLTIP_WIDTH - offset
    top = clampTop(rect.top + rect.height / 2 - h / 2)
  }

  return { left: `${left}px`, top: `${top}px` }
})
</script>

<style scoped lang="scss">
.entity-tooltip {
  position: fixed;
  z-index: var(--z-tooltip);
  width: 300px;
  max-width: 90vw;
  max-height: 50vh;
  overflow-y: auto;
  background: var(--color-overlay-panel);
  border: 1px solid var(--border-common-color);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  box-shadow: 0 8px 32px rgba(var(--rgb-black), 0.4);
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
  background: rgba(var(--rgb-energy), var(--alpha-wash));
  color: var(--color-energy);
}

/* 描述 */
.tooltip-description {
  color: var(--color-text-secondary);
  margin-bottom: var(--space-2);
  padding: var(--space-2);
  background: rgba(var(--rgb-energy), var(--alpha-tint));
  border-radius: var(--radius-sm);
  line-height: var(--line-height-md);
}

/* 明细行 */
.tooltip-details {
  margin-bottom: var(--space-2);
}

/* 分组标题行（如装备三属性小节） */
.detail-section {
  margin-top: var(--space-2);
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--border-common-color-dark);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 1px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-1) 0;
  border-bottom: 1px solid var(--color-border-hairline);

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
  border-top: 1px solid var(--color-border-hairline);
}

/* 箭头 */
.tooltip-arrow {
  position: absolute;
  width: 10px;
  height: 10px;
  background: var(--color-overlay-panel);
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

</style>
