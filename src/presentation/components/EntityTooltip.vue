<!--
 * 文件: EntityTooltip.vue
 * 功能: 日志悬浮信息卡片组件
 * 描述: 用于 LogSegment 中带 hover 字段的实体锚点悬浮显示。
 *       沿用 AttributeTooltip.vue 的成熟范式：Teleport to body + 触发元素 rect 定位 + 视口边缘翻转 + 延迟隐藏。
 *       全局复用，BattleLog.vue、ParticipantCard、BuffTextBar 均可接入。
 *       支持按键固定：悬浮时按 Alt 固定（内容与位置快照），移开触发元素不消失，
 *       鼠标可移入面板滚动查看；Alt 再按 / Esc / 点击面板外部解除。
 *
 * 使用方式（由宿主组件控制 visible 和 data）：
 *   <EntityTooltip :visible="tooltipVisible" :data="tooltipData" :trigger-rect="triggerRect" />
-->

<template>
  <Teleport to="body">
    <transition name="tooltip-fade">
      <div v-if="effectiveVisible && effectiveData" ref="tooltipRef" class="entity-tooltip"
        :class="{ 'is-pinned': pinned }" :style="tooltipStyle" @mouseenter="onTooltipEnter"
        @mouseleave="onTooltipLeave">
        <!-- 标题行：名称 + 类型徽章 + 时长徽章 -->
        <div class="tooltip-header">
          <span class="tooltip-name"
            :style="effectiveData.nameColor ? { color: effectiveData.nameColor } : undefined">{{ effectiveData.name }}</span>
          <span class="tooltip-badges">
            <span class="badge badge-type"
              :style="effectiveData.badgeColor ? { color: effectiveData.badgeColor, background: `color-mix(in srgb, ${effectiveData.badgeColor} 14%, transparent)` } : undefined">{{ effectiveData.badge }}</span>
            <span v-if="effectiveData.durationLabel" class="badge badge-duration">{{ effectiveData.durationLabel }}</span>
          </span>
        </div>

        <!-- 描述 -->
        <div v-if="effectiveData.description" class="tooltip-description">
          {{ effectiveData.description }}
        </div>

        <!-- 明细行 -->
        <div v-if="effectiveData.details.length > 0" class="tooltip-details">
          <template v-for="(row, idx) in effectiveData.details" :key="idx">
            <div v-if="row.section" class="detail-section">{{ row.label }}</div>
            <div v-else class="detail-row" :class="{ 'is-accent': row.accent }">
              <span class="detail-label">{{ row.label }}</span>
              <span class="detail-value">{{ row.value }}</span>
            </div>
          </template>
        </div>

        <!-- 来源脚注 -->
        <div v-if="effectiveData.source" class="tooltip-source">
          {{ effectiveData.source }}
        </div>

        <!-- 固定提示行：常驻提示按键，固定时切换为解除说明 -->
        <div class="tooltip-pin-hint" aria-live="polite">
          {{ pinned ? '已固定 · Alt 解除 / Esc 关闭' : '按 Alt 固定面板' }}
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

/* ===================== 固定（pin） ===================== */
// NOTE: 固定状态完全内聚在本组件——宿主只管 mouseenter/leave 置 visible，
//       pinned 时 effectiveVisible/effectiveData/effectiveRect 覆盖 props，宿主零改动获得该能力。
const pinned = ref(false)
/** 固定瞬间的内容/位置快照：固定期间鼠标滑过其他触发元素不跟着切换 */
const pinnedData = ref<TooltipData | null>(null)
const pinnedRect = ref<DOMRect | null>(null)

const effectiveVisible = computed(() => props.visible || pinned.value)
const effectiveData = computed(() => (pinned.value ? pinnedData.value : props.data))
const effectiveRect = computed<DOMRect | null>(() =>
  pinned.value ? pinnedRect.value : (props.triggerRect ?? null))

function unpin(): void {
  pinned.value = false
  pinnedData.value = null
  pinnedRect.value = null
}

function togglePin(): void {
  if (pinned.value) {
    unpin()
    return
  }
  if (!props.visible || !props.data) return
  pinnedData.value = props.data
  pinnedRect.value = props.triggerRect ?? null
  pinned.value = true
}

/** Alt 固定/解除（悬浮期间生效），Esc 解除关闭 */
const onKeydown = (e: KeyboardEvent): void => {
  if (e.key === 'Escape') {
    if (pinned.value) unpin()
    return
  }
  if (e.key !== 'Alt' || e.repeat || e.ctrlKey || e.metaKey) return
  e.preventDefault()
  togglePin()
}

const tooltipRef = ref<HTMLElement | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | null = null

/** 延迟隐藏：当鼠标移入 tooltip 本身时取消隐藏计时 */
const onTooltipEnter = () => {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

/** 鼠标离开 tooltip 或触发元素时开始延迟隐藏（固定状态下不隐藏） */
const onTooltipLeave = () => {
  if (pinned.value) return
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    hideTimer = null
    // NOTE: 鼠标从面板移回触发元素时宿主已重新置 visible，此时不隐藏（否则面板闪没）
    if (!props.visible) emit('hide')
  }, 200) // 200ms 延迟
}

// NOTE: 关闭不能只靠宿主 mouseleave——触发元素被 v-for 销毁时（如点击穿戴移除背包卡）
// 浏览器不会派发 mouseleave，tooltip 会永久残留。点击外部即收起，对所有宿主兜底。
const onDocMouseDown = (e: MouseEvent): void => {
  if (tooltipRef.value?.contains(e.target as Node)) return
  unpin()
  emit('hide')
}

watch(
  () => effectiveVisible.value,
  (visible) => {
    if (visible) {
      window.addEventListener('mousedown', onDocMouseDown, true)
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('mousedown', onDocMouseDown, true)
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onDocMouseDown, true)
  window.removeEventListener('keydown', onKeydown)
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
  () => [effectiveVisible.value, effectiveData.value, effectiveRect.value] as const,
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
  const rect = effectiveRect.value
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
  const rect = effectiveRect.value
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

  /* 固定态：金色描边提示「此面板已锁定，移开鼠标不会消失」 */
  &.is-pinned {
    border-color: var(--color-warning);
    box-shadow: 0 8px 32px rgba(var(--rgb-black), 0.4), 0 0 0 1px var(--color-warning);

    .tooltip-arrow {
      border-color: var(--color-warning);
    }
  }
}

/* 固定提示行 */
.tooltip-pin-hint {
  margin-top: var(--space-1);
  padding-top: var(--space-1);
  border-top: 1px solid var(--color-border-hairline);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
  user-select: none;

  .is-pinned & {
    color: var(--color-warning);
  }
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

  /* 命中筛选条件的词条行（青色点缀，延续工具面板的交互高亮色） */
  &.is-accent {
    .detail-label {
      color: var(--color-info);
    }

    .detail-value {
      color: var(--color-info);
    }
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
