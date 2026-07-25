<!--
 * 文件: TraceTreeNode.vue
 * 功能: 递归树节点组件
 * 描述: 渲染一个 TraceLogEntry 节点及其子节点，支持可折叠。
-->

<template>
  <div class="trace-node" :style="{ paddingLeft: depth * 16 + 'px' }">
    <div class="trace-row" :class="[
      'step-' + node.stepName,
      { 'is-expandable': hasChildren, 'is-expanded': expanded }
    ]" @click="toggle">
      <!-- 展开/折叠箭头 -->
      <span v-if="hasChildren" class="trace-arrow">{{ expanded ? '▼' : '▶' }}</span>
      <span v-else class="trace-arrow trace-arrow-placeholder"> </span>

      <!-- 步骤名 -->
      <span class="trace-step" :class="'step-' + node.stepName">
        {{ node.stepName }}
      </span>

      <!-- 数值 -->
      <span v-if="node.stepValue !== 0" class="trace-value" :class="valueColorClass">
        {{ node.stepValue }}
      </span>

      <!-- 描述 -->
      <span class="trace-desc">{{ node.description || node.message || '' }}</span>
    </div>

    <!-- 子节点 -->
    <div v-if="expanded && hasChildren" class="trace-children">
      <TraceTreeNode v-for="child in node.children" :key="child.traceId" :node="child" :depth="depth + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TraceLogEntry } from '@/shared/types/trace-log'

interface Props {
  node: TraceLogEntry
  depth: number
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
})

const expanded = ref(props.depth < 1) // 第一层默认展开

const hasChildren = computed(() => props.node.children && props.node.children.length > 0)

const toggle = () => {
  if (hasChildren.value) expanded.value = !expanded.value
}

/** 根据 stepName 和数值正负决定颜色 */
const valueColorClass = computed(() => {
  const name = props.node.stepName?.toLowerCase() ?? ''
  if (name === 'result' || name === 'final') return 'value-final'
  if (name === 'crit' || name === 'critical') return 'value-crit'
  if (name === 'heal') return 'value-heal'
  if (name.includes('damage') || name.includes('dmg') || name === 'base') return 'value-damage'
  if (props.node.stepValue > 0) return 'value-positive'
  if (props.node.stepValue < 0) return 'value-negative'
  return ''
})
</script>

<style scoped lang="scss">
.trace-node {
  user-select: none;
}

.trace-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
  cursor: default;
  line-height: 1.6;
  min-height: 22px;

  &:hover {
    background: var(--color-bg-hover);
  }

  &.is-expandable {
    cursor: pointer;
  }
}

.trace-arrow {
  display: inline-block;
  width: 12px;
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  text-align: center;
}

.trace-arrow-placeholder {
  visibility: hidden;
}

.trace-step {
  color: var(--color-info);
  font-weight: var(--font-weight-medium);
  flex-shrink: 0;
  min-width: 60px;

  &.step-result,
  &.step-final {
    color: var(--color-warning);
    font-weight: var(--font-weight-bold);
  }

  &.step-base,
  &.step-BaseDamage {
    color: var(--color-text-secondary);
  }

  &.step-crit,
  &.step-CritCheck {
    color: var(--color-crit);
  }

  &.step-defense,
  &.step-Defense {
    color: var(--color-debuff);
  }

  &.step-heal,
  &.step-Heal {
    color: var(--color-heal);
  }

  &.step-buff_apply,
  &.step-buff_remove,
  &.step-buff_update,
  &.step-buff_modifier {
    color: var(--color-energy);
  }
}

.trace-value {
  font-family: 'JetBrains Mono', monospace;
  font-weight: var(--font-weight-semibold);
  flex-shrink: 0;
  min-width: 30px;
  text-align: right;

  &.value-damage {
    color: var(--color-damage);
  }

  &.value-heal {
    color: var(--color-heal);
  }

  &.value-crit {
    color: var(--color-crit);
  }

  &.value-final {
    color: var(--color-warning);
    font-weight: var(--font-weight-bold);
  }

  &.value-positive {
    color: var(--color-energy);
  }

  &.value-negative {
    color: var(--color-warning);
  }
}

.trace-desc {
  color: var(--color-text-secondary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
