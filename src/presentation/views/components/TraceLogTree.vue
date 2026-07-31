<!--
 * 文件: TraceLogTree.vue
 * 功能: 树状调试追踪渲染组件（P2：五维过滤 + 因果链查询）
 * 描述: 递归渲染 TraceEventNode 树，支持 phase / actorId / battleId / level / correlationId / 文本 过滤。
 *       过滤语义：节点自身命中或子树命中则保留（树形过滤）。
 *       替换 DebugLogDialog 的扁平列表。
 *
 * 使用方式：
 *   <TraceLogTree :roots="traceRoots" />
 *   其中 traceRoots = collector.getRootsByTurn(turn)
-->

<template>
  <div class="trace-log-tree">
    <!-- 过滤条（五维 + 因果链查询） -->
    <div class="trace-filter">
      <input v-model="filterText" placeholder="过滤关键词..." class="filter-input" />
      <select v-model="filterPhase" class="filter-select">
        <option value="">全部阶段</option>
        <option v-for="p in phaseTypes" :key="p" :value="p">{{ p }}</option>
      </select>
      <select v-model="filterActor" class="filter-select">
        <option value="">全部角色</option>
        <option v-for="a in actorTypes" :key="a" :value="a">{{ a }}</option>
      </select>
      <select v-model="filterBattle" class="filter-select">
        <option value="">全部战斗</option>
        <option v-for="b in battleTypes" :key="b" :value="b">{{ b }}</option>
      </select>
      <select v-model="filterLevel" class="filter-select">
        <option value="">全部级别</option>
        <option v-for="l in levelTypes" :key="l" :value="l">{{ l }}</option>
      </select>
      <input v-model="filterCorrelation" placeholder="因果链 correlationId..." class="filter-input filter-corr" />
      <span class="trace-count">{{ visibleCount }} 条</span>
    </div>

    <!-- 节点列表 -->
    <div class="trace-list">
      <EmptyState v-if="filteredRoots.length === 0">暂无调试日志</EmptyState>
      <TraceTreeNode v-for="node in filteredRoots" :key="node.id" :node="node" :depth="0" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TraceEventNode } from '@/shared/types/trace-event'
import { TraceLevel } from '@/shared/types/trace-event'
import TraceTreeNode from './TraceTreeNode.vue'
import EmptyState from '@/presentation/components/EmptyState.vue'

interface Props {
  roots: TraceEventNode[]
}

const props = withDefaults(defineProps<Props>(), {
  roots: () => [],
})

const filterText = ref('')
const filterPhase = ref('')
const filterActor = ref('')
const filterBattle = ref('')
const filterLevel = ref('')
const filterCorrelation = ref('')

const levelTypes = Object.values(TraceLevel)

/** 收集树中出现的 phase / actorId / battleId 作为过滤选项 */
const phaseTypes = computed(() => collectValues((n) => n.phase))
const actorTypes = computed(() => collectValues((n) => [n.sourceId, n.targetId].filter(Boolean)))
const battleTypes = computed(() => collectValues((n) => n.battleId))

function collectValues(pick: (n: TraceEventNode) => string | string[] | undefined): string[] {
  const set = new Set<string>()
  const walk = (nodes: TraceEventNode[]) => {
    for (const n of nodes) {
      const v = pick(n)
      if (typeof v === 'string') set.add(v)
      else v?.forEach((x) => set.add(x))
      if (n.children) walk(n.children)
    }
  }
  walk(props.roots)
  return Array.from(set).sort()
}

/** 过滤后的节点（节点自身或子树命中则保留） */
const filteredRoots = computed(() => {
  let nodes = props.roots
  if (filterPhase.value) nodes = nodes.filter((n) => matches(n, (x) => x.phase === filterPhase.value))
  if (filterActor.value) {
    const actor = filterActor.value
    nodes = nodes.filter((n) => matches(n, (x) => x.sourceId === actor || x.targetId === actor))
  }
  if (filterBattle.value) {
    const battle = filterBattle.value
    nodes = nodes.filter((n) => matches(n, (x) => x.battleId === battle))
  }
  if (filterLevel.value) {
    const level = filterLevel.value
    nodes = nodes.filter((n) => matches(n, (x) => x.level === level))
  }
  if (filterCorrelation.value) {
    const corr = filterCorrelation.value.trim()
    if (corr) nodes = nodes.filter((n) => matches(n, (x) => x.correlationId === corr))
  }
  if (filterText.value) {
    const kw = filterText.value.toLowerCase()
    nodes = nodes.filter((n) => matches(n, (x) => `${x.summary} ${x.phase}`.toLowerCase().includes(kw)))
  }
  return nodes
})

/** 节点自身命中 predicate，或任一子树命中（树形过滤保留祖先） */
function matches(node: TraceEventNode, pred: (n: TraceEventNode) => boolean): boolean {
  if (pred(node)) return true
  if (node.children) return node.children.some((c) => matches(c, pred))
  return false
}

/** 计算显示的条目数 */
const visibleCount = computed(() => {
  let count = 0
  const walk = (nodes: TraceEventNode[]) => {
    for (const n of nodes) {
      count++
      if (n.children) walk(n.children)
    }
  }
  walk(filteredRoots.value)
  return count
})
</script>

<style scoped lang="scss">
.trace-log-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.trace-filter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border-default);
  align-items: center;
  flex-shrink: 0;
}

.filter-input {
  flex: 1;
  min-width: 120px;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
}

.filter-corr {
  flex: 2;
  font-family: 'Consolas', 'Monaco', monospace;
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
</style>
