<template>
  <div class="ht-pane" style="--pc: var(--color-warning)">
    <div class="ht-pane-hd">
      <span class="t">战斗时间线</span>
      <span style="display: flex; gap: var(--space-2); align-items: center">
        <Button size="tiny" :active="store.focusMode" title="聚焦选中事件的因果链，淡化无关分支"
          @click="store.toggleFocus()">聚焦</Button>
        <span class="s">{{ roundCount }} 个回合</span>
      </span>
    </div>
    <div class="ht-pane-bd ht-vscroll" ref="scrollRef" @scroll.passive="onScroll">
      <div v-if="rows.length" class="ht-tree ht-vlist" :style="{ height: totalHeight + 'px' }">
        <div v-for="row in visible" :key="row.id" class="ht-vitem" :data-vid="row.id"
          :ref="(el) => measure(row.id, el as HTMLElement | null)"
          :style="{ transform: `translateY(${offsetOf(row.id)}px)` }">
          <!-- 回合头行 -->
          <div v-if="row.kind === 'round'" class="ht-t-row ht-t-round-row" role="button" tabindex="0"
            :aria-label="`${row.label}，${row.expanded ? '已展开' : '已折叠'}，${row.meta} 个节点`"
            title="点击折叠/展开本回合" @click="toggleRound(row.roundId)"
            @keydown.enter.prevent="toggleRound(row.roundId)" @keydown.space.prevent="toggleRound(row.roundId)">
            <span class="ht-t-tgl" :class="{ open: row.expanded }">▸</span>
            <span class="ht-t-ico">{{ row.icon }}</span>
            <span class="ht-t-lab">{{ row.label }}</span>
            <span class="ht-t-meta">{{ row.meta }} 节点</span>
          </div>
          <!-- 行动/结算节点行（回合内 kid 带缩进引导线，顶层 plain 无） -->
          <div v-else class="ht-t-row" :class="[row.kind === 'kid' ? 'ht-t-kid' : '', { on: row.nodeId === store.debugNodeId }, dimClass(row.node)]"
            role="button" tabindex="0" :aria-label="`${row.label}${dotLabelOf(row.node) ? '，' + dotLabelOf(row.node) : ''}`"
            title="点击检视该节点的事件卡片" :data-nid="row.nodeId"
            @click="store.selectDebugNode(row.nodeId)"
            @keydown.enter.prevent="store.selectDebugNode(row.nodeId)" @keydown.space.prevent="store.selectDebugNode(row.nodeId)">
            <span class="ht-t-ico">{{ row.icon }}</span>
            <span v-if="row.actionType" class="ht-t-tag" :class="row.actionType">{{ tagTextOf(row.actionType) }}</span>
            <span class="ht-t-lab">{{ row.label }}</span>
            <span v-if="row.meta" class="ht-t-meta">{{ row.meta }}</span>
            <span v-if="dotOf(row.node)" class="ht-t-dot" :title="dotLabelOf(row.node) ?? undefined"
              :style="{ background: dotOf(row.node)!, boxShadow: `0 0 6px ${dotOf(row.node)}` }"></span>
          </div>
        </div>
      </div>
      <div v-else class="ht-empty">{{ store.archive ? '存档无时间线节点' : '存档未加载' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ACTION_TAG_TEXT, type ActionTypeTag, type DebugNode, type DebugTreeEntry } from '@/domain/battle/replay/unified/unified-debug-tree'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import { useHaotianStore } from '../stores/haotianStore'
import Button from '@/presentation/components/Button.vue'
import { useVirtualList } from '../composables/useVirtualList'

const props = defineProps<{ active?: boolean }>()

const store = useHaotianStore()

function tagTextOf(t: ActionTypeTag): string {
  return ACTION_TAG_TEXT[t]
}

const expanded = reactive(new Set<string>())

// 存档为异步装配（onMounted），watch 补初始化回合展开态
watch(
  () => store.debugEntries,
  (entries) => {
    for (const e of entries) {
      if (e.kind === 'round') expanded.add(e.id)
    }
  },
  { immediate: true },
)

function toggleRound(id: string): void {
  if (expanded.has(id)) expanded.delete(id)
  else expanded.add(id)
}

// ───────────── 树 → 可见行拍平（round 头 + 展开节点 + 顶层节点）─────────────

interface TreeRow {
  id: string
  kind: 'round' | 'kid' | 'plain'
  /** round 行的回合 id（toggle 用） */
  roundId: string
  /** 节点行目标 node id（select 用） */
  nodeId: string
  label: string
  icon: string
  meta?: string
  /** 行动类型标签（仅行动节点；round/结算节点为空） */
  actionType?: ActionTypeTag
  expanded: boolean
  /** 节点行对应 DebugNode（dot/dim 计算），round 行为 null */
  node: DebugNode | null
}

const rows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = []
  const pushEntry = (e: DebugTreeEntry, kind: 'round' | 'kid' | 'plain'): void => {
    if (e.kind === 'round') return
    out.push({
      id: `${kind}:${e.id}`,
      kind,
      roundId: '',
      nodeId: e.id,
      label: e.name,
      icon: e.icon,
      meta: e.meta,
      actionType: e.actionType,
      expanded: false,
      node: e,
    })
  }
  for (const entry of store.debugEntries) {
    if (entry.kind === 'round') {
      out.push({
        id: `round:${entry.id}`,
        kind: 'round',
        roundId: entry.id,
        nodeId: entry.id,
        label: entry.name,
        icon: PHASE_META.turn_flow.icon,
        meta: String(entry.nodes.length),
        expanded: expanded.has(entry.id),
        node: null,
      })
      if (expanded.has(entry.id)) {
        for (const n of entry.nodes) pushEntry(n, 'kid')
      }
    } else {
      pushEntry(entry, 'plain')
    }
  }
  return out
})

const roundCount = computed(() => rows.value.filter((r) => r.kind === 'round').length)

// ───────────── 虚拟列表（复用 useVirtualList）─────────────

const { scrollRef, onScroll, updateView, remeasure, resetScroll, measure, offsetOf, totalHeight, visible } =
  useVirtualList<TreeRow>({
    items: () => rows.value,
    estimate: 34,
    gap: 2,
    padding: 2,
    rowQuery: '.ht-vitem',
    attr: 'data-vid',
  })

// 切换存档 / 展开折叠导致行集变化时修正视口
watch(
  () => [store.debugEntries, rows.value.length] as const,
  () => {
    nextTickSync()
  },
)
function nextTickSync(): void {
  void Promise.resolve().then(() => {
    updateView()
    remeasure()
  })
}

// 容器从隐藏变为可见（昊天镜 tab 激活 / 切到调试模式）时重测视口与行高，
// 避免 v-show 隐藏期 offsetHeight=0 被忽略后 totalHeight 全部用 estimate 撑大
watch(
  [() => props.active, () => store.mode],
  () => nextTickSync(),
)

// ───────────── 节点标记（阵亡 > 暴击 > 闪避）─────────────

/** 节点标记文本（阵亡 > 暴击 > 闪避），供无障碍与悬浮说明 */
function dotLabelOf(n: DebugNode | null): string | null {
  if (!n) return null
  const hasDeath = n.events.some(
    (e) =>
      (e.payload as Record<string, unknown>)?.death ||
      (e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end'),
  )
  if (hasDeath) return '包含阵亡'
  if (n.events.some((e) => (e.payload as Record<string, unknown>)?.crit)) return '包含暴击'
  if (n.events.some((e) => (e.payload as Record<string, unknown>)?.dodge)) return '包含闪避'
  return null
}

/** 节点标记：阵亡 > 暴击 > 闪避 */
function dotOf(n: DebugNode | null): string | null {
  if (!n) return null
  const hasDeath = n.events.some(
    (e) =>
      (e.payload as Record<string, unknown>)?.death ||
      (e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end'),
  )
  if (hasDeath) return 'var(--color-danger)'
  if (n.events.some((e) => (e.payload as Record<string, unknown>)?.crit)) return 'var(--color-warning)'
  if (n.events.some((e) => (e.payload as Record<string, unknown>)?.dodge)) return 'var(--color-energy)'
  return null
}

/** 聚焦模式下淡化与选中事件因果链无关的节点 */
function dimClass(n: DebugNode | null): Record<string, boolean> {
  if (!n || !store.focusMode || !store.selectedEvent) return {}
  const related = n.events.some((e) => store.isRelated(e.id))
  return { dim: !related }
}
</script>
