<!--
 * 文件: TraceLogTree.vue
 * 功能: 树状调试日志渲染组件
 * 描述: 递归渲染 TraceLogEntry 树，支持可折叠子树和过滤，
 *       替换 DebugLogDialog 的扁平列表。
 *
 * 使用方式：
 *   <TraceLogTree :roots="traceLogs" />
 *   其中 traceLogs = collector.getRootsByTurn(turn)
-->

<template>
  <div class="trace-log-tree">
    <!-- 过滤条 -->
    <div class="trace-filter">
      <input v-model="filterText" placeholder="过滤关键词..." class="filter-input" />
      <select v-model="filterStep" class="filter-select">
        <option value="">全部步骤</option>
        <option v-for="s in stepTypes" :key="s" :value="s">{{ s }}</option>
      </select>
      <span class="trace-count">{{ visibleCount }} 条</span>
    </div>

    <!-- 节点列表 -->
    <div class="trace-list">
      <div v-if="filteredRoots.length === 0" class="trace-empty">
        暂无调试日志
      </div>
      <TraceTreeNode v-for="node in filteredRoots" :key="node.traceId" :node="node" :depth="0" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TraceLogEntry } from '@/shared/types/trace-log'
import TraceTreeNode from './TraceTreeNode.vue'

interface Props {
  roots: TraceLogEntry[]
}

const props = withDefaults(defineProps<Props>(), {
  roots: () => [],
})

const filterText = ref('')
const filterStep = ref('')

/** 收集所有出现的 stepName 作为过滤选项 */
const stepTypes = computed(() => {
  const set = new Set<string>()
  const walk = (nodes: TraceLogEntry[]) => {
    for (const n of nodes) {
      if (n.stepName) set.add(n.stepName)
      if (n.children) walk(n.children)
    }
  }
  walk(props.roots)
  return Array.from(set).sort()
})

/** 过滤后的节点 */
const filteredRoots = computed(() => {
  let nodes = props.roots

  if (filterStep.value) {
    nodes = nodes.filter((n) => matchesStep(n, filterStep.value))
  }

  if (filterText.value) {
    const kw = filterText.value.toLowerCase()
    nodes = nodes.filter((n) => matchesText(n, kw))
  }

  return nodes
})

/** 计算显示的条目数 */
const visibleCount = computed(() => {
  let count = 0
  const walk = (nodes: TraceLogEntry[]) => {
    for (const n of nodes) {
      count++
      if (n.children) walk(n.children)
    }
  }
  walk(filteredRoots.value)
  return count
})

function matchesStep(node: TraceLogEntry, step: string): boolean {
  if (node.stepName === step) return true
  if (node.children) return node.children.some((c) => matchesStep(c, step))
  return false
}

function matchesText(node: TraceLogEntry, kw: string): boolean {
  const searchText = `${node.stepName} ${node.description} ${node.message ?? ''}`.toLowerCase()
  if (searchText.includes(kw)) return true
  if (node.children) return node.children.some((c) => matchesText(c, kw))
  return false
}
</script>

<style scoped lang="scss">
.trace-log-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.trace-filter {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border-default);
  align-items: center;
  flex-shrink: 0;
}

.filter-input {
  flex: 1;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.filter-select {
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.trace-count {
  color: var(--color-text-tertiary);
  white-space: nowrap;
}

.trace-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-1) 0;
  font-family: 'Consolas', 'Monaco', monospace;
}

.trace-empty {
  text-align: center;
  color: var(--color-text-tertiary);
  padding: var(--space-6);
}
</style>
