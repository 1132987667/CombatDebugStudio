<template>
  <div
    class="buff-text-bar"
    :class="{ 'is-expanded': expanded, 'is-empty': isEmpty }"
    @click="handleClick"
  >
    <!-- 空状态 -->
    <span v-if="isEmpty" class="bar-placeholder">无效果</span>

    <!-- 控制标签（不折叠） -->
    <template v-else>
      <BuffTextTag
        v-for="ctrl in displayControlLabels"
        :key="ctrl.instanceId"
        :text="ctrl.name"
        type="control"
        :turns-left="ctrl.remainingTurns"
        @hover.stop="onTagHover($event, ctrl)"
        @leave="onTagLeave"
      />

      <!-- 合并属性标签 -->
      <BuffTextTag
        v-for="attr in displayAttrLabels"
        :key="attr.attribute"
        :text="formatAttrLine(attr)"
        :type="attr.totalPercent > 0 ? 'buff' : 'debuff'"
        @hover.stop="onAttrHover($event, attr)"
        @leave="onTagLeave"
      />

      <!-- 折叠指示器 -->
      <span
        v-if="collapsedCount > 0"
        class="bar-collapse-badge"
        title="点击展开全部状态"
      >+{{ collapsedCount }}</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BuffTextTag from '@/presentation/components/BuffTextTag.vue'
import type { BuffTextItem, MergedAttributeLine } from '@/shared/types/buff-display'

const props = withDefaults(defineProps<{
  /** 控制标签列表 */
  controlLabels: BuffTextItem[]
  /** 合并属性标签列表（已排序） */
  mergedLabels: MergedAttributeLine[]
  /** 折叠后隐藏的标签数 */
  collapsedCount: number
  /** 是否展开状态 */
  expanded?: boolean
  /** 单行显示阈值（超过此数量折叠） */
  maxVisible?: number
}>(), {
  expanded: false,
  maxVisible: 5,
})

const emit = defineEmits<{
  /** 点击展开/收起 */
  toggle: []
  /** 悬停某个 Buff 标签 */
  hoverBuff: [item: BuffTextItem, event: MouseEvent]
  /** 悬停属性标签 */
  hoverAttr: [attr: MergedAttributeLine, event: MouseEvent]
  /** 离开标签 */
  leave: []
}>()

const isEmpty = computed(() =>
  props.controlLabels.length === 0 && props.mergedLabels.length === 0,
)

/** 控制标签：全部显示（不折叠） */
const displayControlLabels = computed(() => props.controlLabels)

/** 属性标签：最多显示 maxVisible - controlCount 个 */
// ponytail: 切片逻辑与 useBuffDisplay 的 collapsedCount 独立计算，两边默认值都是 5，
// 但如果修改了 composable 的 collapseThreshold，这里需要同步修改 maxVisible prop 默认值。
const displayAttrLabels = computed(() => {
  const remaining = props.maxVisible - props.controlLabels.length
  if (remaining <= 0) return []
  return props.mergedLabels.slice(0, remaining)
})

function formatAttrLine(attr: MergedAttributeLine): string {
  const arrow = attr.totalPercent > 0 ? '↑' : '↓'
  return `${attr.attribute}${arrow}${Math.abs(attr.totalPercent)}%`
}

function handleClick() {
  if (!isEmpty.value) {
    emit('toggle')
  }
}

function onTagHover(event: MouseEvent, item: BuffTextItem) {
  emit('hoverBuff', item, event)
}

function onAttrHover(event: MouseEvent, attr: MergedAttributeLine) {
  emit('hoverAttr', attr, event)
}

function onTagLeave() {
  emit('leave')
}
</script>

<style scoped>
.buff-text-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 4px;
  padding: 3px 6px;
  min-height: 24px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast) ease;
  user-select: none;
}

.buff-text-bar:hover {
  background: rgba(255, 255, 255, 0.04);
}

.buff-text-bar.is-expanded {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.buff-text-bar.is-empty {
  cursor: default;
}
.buff-text-bar.is-empty:hover {
  background: transparent;
}

.bar-placeholder {
  font-size: var(--font-size-xs);
  color: var(--color-text-disabled);
  font-style: italic;
}

.bar-collapse-badge {
  display: inline-flex;
  align-items: center;
  padding: 0 6px;
  font-size: var(--font-size-xs);
  color: var(--color-info);
  font-weight: var(--font-weight-bold);
  border-radius: var(--radius-sm);
  background: rgba(79, 195, 247, 0.1);
  border: 1px solid rgba(79, 195, 247, 0.25);
  transition: background var(--transition-fast) ease;
}

.bar-collapse-badge:hover {
  background: rgba(79, 195, 247, 0.2);
}
</style>
