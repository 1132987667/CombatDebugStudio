<!--
 * 文件: TraceTreeNode.vue
 * 功能: 递归树节点组件
 * 描述: 渲染一个 TraceEventNode 节点及其子节点，支持可折叠。
 *       节点行 = phase 徽章 + summary；展开后渲染 payload 表格，
 *       steps 数组按 before→after 效果链展示。
-->

<template>
  <div class="trace-node" :style="{ paddingLeft: depth * 16 + 'px' }">
    <div class="trace-row" :class="[
      'phase-' + node.phase,
      { 'is-expandable': hasChildren, 'is-expanded': expanded }
    ]" @click="toggle">
      <!-- 展开/折叠箭头 -->
      <span v-if="hasChildren" class="trace-arrow">{{ expanded ? '▼' : '▶' }}</span>
      <span v-else class="trace-arrow trace-arrow-placeholder"> </span>

      <!-- phase 徽章 -->
      <span class="phase-badge" :class="'phase-' + node.phase">{{ node.phase }}</span>

      <!-- 摘要 -->
      <span class="trace-summary">{{ node.summary }}</span>

      <!-- trace 级别标记（默认折叠的细节） -->
      <span v-if="node.level === 'trace'" class="level-tag">trace</span>
    </div>

    <!-- payload 表格 -->
    <div v-if="expanded && hasPayload" class="trace-payload">
      <div v-for="(value, key) in node.payload" :key="key" class="payload-row">
        <span class="payload-key">{{ key }}</span>
        <!-- steps 数组：按 before → after 效果链展示 -->
        <span v-if="key === 'steps' && Array.isArray(value)" class="payload-steps">
          <span v-for="(s, i) in value" :key="i" class="step-row">
            <span class="step-before">{{ s.before }}</span>
            <span class="step-arrow">→</span>
            <span class="step-after">{{ s.after }}</span>
            <span class="step-name">{{ s.stepName }}</span>
            <span class="step-desc">{{ s.description }}</span>
          </span>
        </span>
        <span v-else class="payload-value">{{ formatValue(value) }}</span>
      </div>
    </div>

    <!-- 子节点 -->
    <div v-if="expanded && hasChildren" class="trace-children">
      <TraceTreeNode v-for="child in node.children" :key="child.id" :node="child" :depth="depth + 1" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TraceEventNode } from '@/shared/types/trace-event'

interface Props {
  node: TraceEventNode
  depth: number
}

const props = withDefaults(defineProps<Props>(), {
  depth: 0,
})

const expanded = ref(props.depth < 1) // 第一层默认展开

const hasChildren = computed(() => !!props.node.children && props.node.children.length > 0)

const hasPayload = computed(() => Object.keys(props.node.payload ?? {}).length > 0)

const toggle = () => {
  if (hasChildren.value) expanded.value = !expanded.value
}

/** payload 值格式化：对象/数组 → JSON，其余 → 字符串 */
function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
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

.phase-badge {
  font-size: 0.78em;
  line-height: 1.4;
  padding: 0 6px;
  border-radius: 3px;
  background: var(--color-bg-tertiary, #f0f0f0);
  color: var(--color-text-secondary);
  flex-shrink: 0;

  &.phase-damage_calculation {
    background: var(--color-damage, #e04f4f);
    color: #fff;
  }

  &.phase-heal_calculation {
    background: var(--color-heal, #3fa95f);
    color: #fff;
  }

  &.phase-buff_lifecycle,
  &.phase-buff_trigger {
    background: var(--color-energy, #d9a441);
    color: #fff;
  }

  &.phase-passive_trigger {
    background: var(--color-info, #4a7dbd);
    color: #fff;
  }

  &.phase-ai_decision {
    background: var(--color-warning, #b0662f);
    color: #fff;
  }

  &.phase-action_execution {
    background: var(--color-text-tertiary, #888);
    color: #fff;
  }
}

.trace-summary {
  color: var(--color-text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.level-tag {
  font-size: 0.72em;
  color: var(--color-text-tertiary);
  opacity: 0.7;
  flex-shrink: 0;
}

.trace-payload {
  margin-left: 20px;
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-primary);
  border-radius: var(--radius-sm);
  font-size: 0.9em;
}

.payload-row {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  padding: 1px 0;
}

.payload-key {
  color: var(--color-info);
  flex-shrink: 0;
  min-width: 90px;
}

.payload-value {
  color: var(--color-text-secondary);
  word-break: break-all;
}

.payload-steps {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.step-row {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-family: 'JetBrains Mono', monospace;
}

.step-before {
  color: var(--color-text-secondary);
  min-width: 28px;
  text-align: right;
}

.step-arrow {
  color: var(--color-text-tertiary);
}

.step-after {
  color: var(--color-damage);
  min-width: 28px;
}

.step-name {
  color: var(--color-text-tertiary);
  min-width: 60px;
}

.step-desc {
  color: var(--color-text-secondary);
}
</style>
