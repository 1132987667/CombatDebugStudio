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
      <input v-model="filterText" placeholder="过滤关键词..." class="filter-input" aria-label="过滤关键词" />
      <select v-model="filterPhase" class="filter-select">
        <option value="">全部阶段</option>
        <option v-for="p in phaseTypes" :key="p" :value="p">{{ p }} · {{ phaseLabel(p) }}</option>
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
      <input v-model="filterCorrelation" placeholder="因果链 correlationId..." class="filter-input filter-corr"
        aria-label="按因果链过滤" />
      <label class="trace-toggle" title="显示 trace 级细节（被动跳过检查等高频噪音）——默认隐藏，只留关键事件">
        <input v-model="showTrace" type="checkbox" />
        <span>trace 细节</span>
      </label>
      <span class="trace-count">{{ visibleCount }} 条</span>
    </div>

    <!-- 节点列表：按回合分组，组内根节点带行动序号 -->
    <div class="trace-list">
      <EmptyState v-if="turnGroups.length === 0">暂无调试日志</EmptyState>
      <div v-for="group in turnGroups" :key="group.turn" class="turn-group">
        <div class="turn-header">
          <span class="turn-title">{{ group.turn > 0 ? `第 ${group.turn} 回合` : '战斗全局' }}</span>
          <span class="turn-actions">{{ group.roots.length }} 个行动</span>
        </div>
        <div v-for="(root, idx) in group.roots" :key="root.id" class="root-item">
          <span v-if="group.turn > 0" class="action-seq" :title="`第 ${group.turn} 回合 · 第 ${idx + 1} 个行动`">#{{ idx + 1 }}</span>
          <TraceTreeNode :node="root" :depth="0" :actor-names="actorNames" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { TraceEventNode } from '@/shared/types/trace-event'
import { TraceLevel, TracePhase, TracePhaseLabel } from '@/shared/types/trace-event'
import TraceTreeNode from './TraceTreeNode.vue'
import EmptyState from '@/presentation/components/EmptyState.vue'

interface Props {
  roots: TraceEventNode[]
  /** 实体 ID → 角色名 映射（透传给节点行，显示名字而非内部 ID） */
  actorNames?: Record<string, string>
}

const props = withDefaults(defineProps<Props>(), {
  roots: () => [],
  actorNames: () => ({}),
})

const filterText = ref('')
const filterPhase = ref('')
const filterActor = ref('')
const filterBattle = ref('')
const filterLevel = ref('')
const filterCorrelation = ref('')
/** 默认隐藏 trace 级细节（被动跳过检查等高频噪音），需要时开启 */
const showTrace = ref(false)

const levelTypes = Object.values(TraceLevel)

/** phase 显示标签：英文值 + 中文名（未知 phase 回退英文原值） */
const phaseLabel = (p: string): string => TracePhaseLabel[p as TracePhase] ?? p

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

/** 递归剪除 trace 级节点（保留其非 trace 子节点） */
function pruneTrace(nodes: TraceEventNode[]): TraceEventNode[] {
  const result: TraceEventNode[] = []
  for (const n of nodes) {
    if (n.level === 'trace') continue
    if (n.children && n.children.length > 0) {
      const children = pruneTrace(n.children)
      result.push(children.length > 0 ? { ...n, children } : n)
    } else {
      result.push(n)
    }
  }
  return result
}

/** 过滤后的节点（节点自身或子树命中则保留；trace 细节默认剪除） */
const filteredRoots = computed(() => {
  let nodes = showTrace.value ? props.roots : pruneTrace(props.roots)
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

interface TurnGroup {
  turn: number
  roots: TraceEventNode[]
}

/** 按回合分组（turn 0 = 无回合信息的全局事件，置顶），组内保持事件发生顺序 */
const turnGroups = computed<TurnGroup[]>(() => {
  const map = new Map<number, TraceEventNode[]>()
  for (const n of filteredRoots.value) {
    const t = n.turn != null ? Number(n.turn) : 0
    if (!map.has(t)) map.set(t, [])
    map.get(t)!.push(n)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([turn, roots]) => ({ turn, roots }))
})
</script>

<style scoped lang="scss">
.trace-log-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* 过滤条：test1 .filters（深底 + 底边框，控件统一圆角输入框） */
.trace-filter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-default);
  background: rgba(255, 255, 255, 0.008);
  align-items: center;
  flex-shrink: 0;
}

.filter-input {
  flex: 1;
  min-width: 120px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  /* AGENTS.md 红线：文本不低于 --font-size-md（浏览器 select/input 默认 13.3px，显式覆盖） */
  font-size: var(--font-size-md);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  outline: none;
  transition: 0.18s;
}

.filter-input::placeholder {
  color: var(--color-text-disabled);
}

.filter-input:focus,
.filter-select:focus {
  border-color: rgba(var(--rgb-energy), 0.5);
  box-shadow: 0 0 0 3px rgba(var(--rgb-energy), 0.1);
  background: var(--color-bg-tertiary);
}

.filter-corr {
  flex: 2;
  font-family: var(--font-family-mono);
}

.filter-select {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  /* AGENTS.md 红线：文本不低于 --font-size-md */
  font-size: var(--font-size-md);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  outline: none;
  transition: 0.18s;
  cursor: pointer;
}

.filter-select option {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.trace-count {
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-md);
  white-space: nowrap;
  margin-left: auto;
}

/* trace 细节开关：低调的小 checkbox */
.trace-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;

  input {
    accent-color: var(--color-energy);
    cursor: pointer;
  }

  &:hover {
    color: var(--color-text-secondary);
  }
}

.trace-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-family-mono);
}

/* ====== 回合分组 ====== */
.turn-group {
  margin-bottom: var(--space-3);
}

/* 分组头吸顶：滚动时始终可见当前回合上下文 */
.turn-header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  margin-bottom: var(--space-1);
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-primary);
}

.turn-title {
  font-weight: var(--font-weight-semibold);
  color: var(--color-energy);
  font-size: var(--font-size-md);
  letter-spacing: 0.03em;
}

.turn-actions {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

/* 根节点行：行动序号 + 因果链树 */
.root-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
}

.action-seq {
  min-width: 32px;
  text-align: right;
  padding-top: 6px; /* 对齐行内文本 */
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono);
  flex-shrink: 0;
  user-select: none;
}

/* 自定义滚动条（test1） */
.trace-list::-webkit-scrollbar {
  width: 11px;
  height: 11px;
}

.trace-list::-webkit-scrollbar-track {
  background: transparent;
}

.trace-list::-webkit-scrollbar-thumb {
  background: var(--color-bg-tertiary);
  border-radius: 8px;
  border: 3px solid transparent;
  background-clip: padding-box;
}

.trace-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-bg-tertiary-hover);
  background-clip: padding-box;
}
</style>
