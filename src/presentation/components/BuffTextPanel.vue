<template>
  <Teleport to="body">
    <transition name="panel-fade">
      <div v-if="visible" class="buff-text-panel" ref="panelRef">
        <!-- 头部 -->
        <div class="panel-header">
          <span class="panel-title">{{ participantName }} · 全部状态</span>
          <button class="panel-close" @click="$emit('close')">×</button>
        </div>

        <div class="panel-body">
          <!-- Buff 分组列表 + 次要分组 -->
          <div v-if="sortedGroups.length > 0" class="panel-groups-wrapper">
            <div class="panel-groups">
              <BuffTextGroup
                v-for="group in sortedGroups"
                :key="group.instanceId"
                :buff="group"
                :debug-mode="debugMode"
              />
            </div>
            <div v-if="secondaryGroups && secondaryGroups.length > 0" class="panel-secondary">
              <div class="secondary-toggle" @click="showSecondary = !showSecondary">
                {{ showSecondary ? '▼' : '▶' }} 其他效果（{{ secondaryGroups.length }}）
              </div>
              <div v-if="showSecondary" class="secondary-groups">
                <BuffTextGroup
                  v-for="group in secondaryGroups"
                  :key="group.instanceId"
                  :buff="group"
                  :debug-mode="debugMode"
                />
              </div>
            </div>
          </div>
          <div v-else class="panel-empty">无活跃状态效果</div>

          <!-- 属性汇总 -->
          <div v-if="summaryLines.length > 0" class="panel-divider"></div>
          <div v-if="summaryLines.length > 0" class="panel-summary">
            <div v-for="line in summaryLines" :key="line.attribute" class="summary-line">
              <span class="summary-label">{{ line.attribute }}：</span>
              <span class="summary-base">{{ line.baseStr }}</span>
              <span class="summary-arrow">→</span>
              <span class="summary-total">{{ line.totalStr }}</span>
              <span
                class="summary-delta"
                :class="line.totalPercent > 0 ? 'delta-positive' : line.totalPercent < 0 ? 'delta-negative' : 'delta-zero'"
              >
                {{ line.totalPercent > 0 ? '+' : '' }}{{ line.totalPercent }}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import BuffTextGroup from '@/presentation/components/BuffTextGroup.vue'
import type { BuffTextItem, MergedAttributeLine } from '@/shared/types/buff-display'

const props = withDefaults(defineProps<{
  /** 是否可见 */
  visible: boolean
  /** 参与者名称 */
  participantName: string
  /** 排序后的 Buff 完整分组 */
  groups: BuffTextItem[]
  /** 次要分组（极多 Buff 时折叠的超期/永久效果） */
  secondaryGroups?: BuffTextItem[]
  /** 合并标签列表 */
  mergedLabels: MergedAttributeLine[]
  /** 调试模式 */
  debugMode?: boolean
}>(), {
  debugMode: false,
})

const emit = defineEmits<{
  close: []
}>()

const panelRef = ref<HTMLElement | null>(null)
const showSecondary = ref(false)

// ponytail: 全局 click 监听器，点击面板外部关闭。使用 cleanup 函数避免泄漏
let clickCleanup: (() => void) | null = null
watch(() => props.visible, (val) => {
  if (clickCleanup) { clickCleanup(); clickCleanup = null }
  if (val) {
    const handler = (e: MouseEvent) => {
      if (panelRef.value && !panelRef.value.contains(e.target as Node)) {
        emit('close')
      }
    }
    // 下一帧注册，避免本次点击立即关闭
    const timer = setTimeout(() => {
      document.addEventListener('click', handler)
      clickCleanup = () => {
        document.removeEventListener('click', handler)
        clearTimeout(timer)
      }
    }, 0)
  }
})
onUnmounted(() => { if (clickCleanup) clickCleanup() })

// ponytail: 直接使用 props.groups —— useBuffDisplay 已经完成了排序
// 如果在面板中需要不同排序，考虑将排序函数提升为共享模块
const sortedGroups = computed(() => props.groups)

interface SummaryLine {
  attribute: string
  baseStr: string
  totalStr: string
  totalPercent: number
}

const summaryLines = computed<SummaryLine[]>(() => {
  return props.mergedLabels
    .filter((l) => l.isChanged)
    .map((l) => ({
      attribute: l.attribute,
      baseStr: l.baseValue != null ? `${Math.round(l.baseValue)}` : `--`,
      totalStr: l.baseValue != null ? `${Math.round(l.baseValue * (1 + l.totalPercent / 100))}` : `--`,
      totalPercent: l.totalPercent,
    }))
})
</script>

<style scoped>
.buff-text-panel {
  position: fixed;
  z-index: var(--z-modal);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(440px, 90vw);
  max-height: 70vh;
  background: rgba(15, 23, 42, 0.97);
  border: 1px solid var(--border-common-color-dark);
  border-radius: var(--radius-lg);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(12px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-common-color-dark);
  flex-shrink: 0;
}

.panel-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.panel-close {
  background: none;
  border: none;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xl);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast) ease;
}

.panel-close:hover {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.1);
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) 0;
}

.panel-groups-wrapper {
  /* 包装 primary + secondary 分组，与底部的 v-else 空状态共享 v-if/v-else */
}

.panel-groups {
  padding: 0;
}

.panel-empty {
  text-align: center;
  padding: var(--space-8);
  color: var(--color-text-tertiary);
  font-style: italic;
}

/* 次要分组（极多 Buff 折叠） */
.panel-secondary {
  margin: var(--space-1) var(--space-4);
  border-top: 1px dashed var(--border-common-color-dark);
  padding-top: var(--space-1);
}

.secondary-toggle {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  cursor: pointer;
  user-select: none;
  padding: var(--space-1) 0;
}

.secondary-toggle:hover {
  color: var(--color-info);
}

.secondary-groups {
  opacity: 0.85;
}

/* 分割线 */
.panel-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--border-common-color-dark), transparent);
  margin: var(--space-2) var(--space-4);
}

/* 属性汇总 */
.panel-summary {
  padding: 0 var(--space-4) var(--space-3);
}

.summary-line {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  font-family: var(--font-family-mono);
}

.summary-label {
  color: var(--color-text-tertiary);
  min-width: 48px;
}

.summary-base {
  color: var(--color-text-disabled);
}

.summary-arrow {
  color: var(--color-text-disabled);
}

.summary-total {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-bold);
}

.summary-delta {
  font-weight: var(--font-weight-semibold);
}

.delta-positive {
  color: var(--color-energy);
}

.delta-negative {
  color: var(--color-danger);
}

.delta-zero {
  color: var(--color-text-tertiary);
}

/* 过渡动画 */
.panel-fade-enter-active,
.panel-fade-leave-active {
  transition: all 200ms ease-out;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.95);
}
</style>
