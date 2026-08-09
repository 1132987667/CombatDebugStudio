<template>
  <div class="ht-pane" style="--pc: var(--color-energy)">
    <div class="ht-pane-hd">
      <span class="t">行动卡片</span>
      <span style="display: flex; gap: 6px; align-items: center">
        <Button class="ht-tbtn" title="上一事件（←）" @click="store.stepEvent(-1)">上一事件</Button>
        <Button class="ht-tbtn" title="下一事件（空格/→）" @click="store.stepEvent(1)">下一事件</Button>
      </span>
    </div>
    <div class="ht-stream-hd">
      <div class="ht-sh-title">{{ nodeTitle }}</div>
      <div v-if="isAction" class="ht-sh-meta">
        <div v-if="actionType" class="ht-sh-row">
          <em>行动类型</em>
          <b class="ht-sh-tag" :class="actionType">{{ actionTagText }}</b>
        </div>
        <div v-if="energyCost" class="ht-sh-row">
          <em>消耗</em>
          <b>{{ energyCost }}能量</b>
        </div>
        <div v-for="t in targetRows" :key="t.targetId || 'unknown'" class="ht-sh-row">
          <em>目标</em>
          <b>{{ t.name }}</b>
          <span class="ht-sh-arrow">→</span>
          <span class="ht-sh-result">{{ t.result }}</span>
        </div>
      </div>
      <div v-else class="ht-sh-sub">{{ nodeSub }}</div>
    </div>
    <div class="ht-pane-bd ht-vscroll" ref="scrollRef" @scroll.passive="onScroll">
      <div v-if="items.length" class="ht-vlist" :style="{ height: totalHeight + 'px' }">
        <div v-for="item in visible" :key="item.id" class="ht-vitem" :data-id="item.id"
          :ref="(el) => measure(item.id, el as HTMLElement | null)"
          :style="{ transform: `translateY(${offsetOf(item.id)}px)` }">
          <div class="ht-ev" :title="`${item.summary}（点击检视，右键切换书签）`"
            role="button" tabindex="0"
            :aria-label="`${item.summary}${store.isBookmarked(item.id) ? ' · 已书签' : ''}`"
            :class="[toneClass(item), { on: item.id === store.selectedId, 'dbg-dim': meta(item).debugOnly, bm: store.isBookmarked(item.id), dim: isDim(item.id), chain: isChain(item.id) }]"
            @click="store.focusEvent(item.id, { seek: true })"
            @keydown.enter.prevent="store.focusEvent(item.id, { seek: true })"
            @keydown.space.prevent="store.focusEvent(item.id, { seek: true })"
            @contextmenu.prevent="store.toggleBookmark(item.id)">
            <div class="ht-ev-hd">
              <span v-if="item.payload?.seg" class="ht-ev-step">段 {{ item.payload.seg }}</span>
              <span class="ht-ev-title" :title="item.summary">{{ cardTitle(item) }}</span>
              <button type="button" class="ht-bm-btn ht-ev-bm" :class="{ on: store.isBookmarked(item.id) }"
                :title="store.isBookmarked(item.id) ? '移除书签' : '添加书签'"
                :aria-label="store.isBookmarked(item.id) ? '移除书签' : '添加书签'"
                @click.stop="store.toggleBookmark(item.id)">◆</button>
              <span class="ht-ev-badge" :class="badgeOf(item)[0]">{{ badgeOf(item)[1] }}</span>
            </div>
            <div class="ht-ev-meta">
              <template v-if="item.sourceId">{{ store.pname(item.sourceId) }}</template>
              <template v-if="item.targetId">{{ item.sourceId ? ' → ' : '' }}{{ store.pname(item.targetId) }}</template>
            </div>
            <div v-if="segIndicators.length" class="ht-ev-multi">
              <i v-for="(m, j) in segIndicators" :key="j" :class="[m, curSeg === j + 1 ? 'cur' : '']"></i>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="ht-empty">{{ store.archive ? '选中时间线节点以查看事件卡片' : '存档未加载，请从顶部选择数据源' }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, watch } from 'vue'
import { ACTION_TAG_TEXT, type ActionTypeTag, type DebugNode } from '@/domain/battle/replay/unified/unified-debug-tree'
import { buildSegResults } from '@/domain/battle/replay/unified/unified-debug-tree'
import type { UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { PHASE_META } from '@/domain/battle/replay/unified/unified-archive'
import Button from '@/presentation/components/Button.vue'
import { useHaotianStore } from '../stores/haotianStore'
import { useVirtualList } from '../composables/useVirtualList'

const props = defineProps<{ active?: boolean }>()

const store = useHaotianStore()

const meta = (ev: UnifiedEvent) => PHASE_META[ev.phase]

/** 事件所属回合：优先事件自带 turn，其次快照 turn；都没有则省略不显示 */
function turnOf(ev: UnifiedEvent): number | undefined {
  if (typeof ev.turn === 'number') return ev.turn
  const snapTurn = ev.snapshot?.turn
  return typeof snapTurn === 'number' ? snapTurn : undefined
}

// ───────────── 虚拟列表（复用 useVirtualList）─────────────

const items = computed<UnifiedEvent[]>(() => currentNode.value?.events ?? [])

const { scrollRef, onScroll, updateView, remeasure, resetScroll, measure, offsetOf, totalHeight, visible } =
  useVirtualList<UnifiedEvent>({
    items: () => items.value,
    estimate: 122,
    gap: 10,
    padding: 12,
    rowQuery: '.ht-vitem',
    attr: 'data-id',
  })

// 切换节点时回到顶部并重测视口
watch(
  () => store.debugNodeId,
  () => resetScroll(),
)

// 容器从隐藏变为可见（昊天镜 tab 激活 / 切到调试模式）时重测视口与已渲染卡片高度
watch(
  [() => props.active, () => store.mode],
  () => {
    nextTick(updateView)
    remeasure()
  },
)

// ───────────── 卡片内容 ─────────────

const isDim = (id: string): boolean => store.focusMode && !!store.selectedEvent && !store.isRelated(id)
/** 当前选中事件的同 correlationId 事件（链导航标记：一次行动的完整链路高亮） */
const isChain = (id: string): boolean => !!store.selectedEvent && store.chainEvents.some((c) => c.id === id)

const currentNode = computed<DebugNode | null>(() => {
  if (!store.debugNodeId) return null
  return store.debugNodes.find((n) => n.id === store.debugNodeId) ?? null
})

const nodeTitle = computed(() => {
  const n = currentNode.value
  if (!n) return '等待载入…'
  // 行动节点标题 = 当前回合数 + 行动人角色名（居中）；非行动节点沿用节点名
  if (n.action) {
    const name = n.actor ? store.pname(n.actor) : n.name
    return nodeTurn.value ? `第 ${nodeTurn.value} 回合 · ${name}` : name
  }
  return n.name
})

/** 节点发生回合：从节点事件取首个回合号（事件自带 turn 或快照 turn） */
const nodeTurn = computed<number | undefined>(() => {
  const n = currentNode.value
  if (!n) return undefined
  for (const e of n.events) {
    const t = turnOf(e)
    if (typeof t === 'number') return t
  }
  return undefined
})

/** 行动类型标签：与时间线一致（普通攻击 / 小技能 / 大技能 / 被控制 / 跳过） */
const isAction = computed(() => !!currentNode.value?.action)
const actionType = computed<ActionTypeTag | undefined>(() => currentNode.value?.actionType)
const actionTagText = computed<string>(() =>
  actionType.value ? ACTION_TAG_TEXT[actionType.value] : '',
)

/** 技能行动标签：仅技能（含小/大技能）显示能量消耗，普攻/被控制/跳过无消耗 */
const SKILL_TAGS: readonly ActionTypeTag[] = ['skill', 'skill_small', 'skill_ultimate']
/** 能量消耗：技能行动由 action_execution payload.energyCost 携带；无数据时不显示 */
const energyCost = computed<number | undefined>(() => {
  const n = currentNode.value
  if (!n?.action || !actionType.value) return undefined
  if (!SKILL_TAGS.includes(actionType.value)) return undefined
  return n.energyCost
})

/** 目标结果行：遍历节点事件的每个目标，聚合伤害/治疗/状态结果（目标可多个，结果可不同） */
interface TargetRow {
  targetId: string
  name: string
  result: string
}

const targetRows = computed<TargetRow[]>(() => {
  const n = currentNode.value
  if (!n?.action) return []
  type Acc = {
    damage: number
    heal: number
    crit: boolean
    death: boolean
    dodgeSegs: number
    parts: string[]
  }
  const acc = new Map<string, Acc>()
  const order: string[] = []
  const accOf = (tid: string): Acc => {
    const key = tid || ''
    let a = acc.get(key)
    if (!a) {
      a = { damage: 0, heal: 0, crit: false, death: false, dodgeSegs: 0, parts: [] }
      acc.set(key, a)
      order.push(key)
    }
    return a
  }
  for (const e of n.events) {
    const pl = (e.payload ?? {}) as Record<string, unknown>
    if (e.phase === 'damage_calculation') {
      const a = accOf(e.targetId ?? '')
      if (pl.dodge) a.dodgeSegs++
      else a.damage += typeof pl.result === 'number' ? pl.result : 0
      if (pl.crit) a.crit = true
      if (pl.death) a.death = true
    } else if (e.phase === 'heal_calculation') {
      const a = accOf(e.targetId ?? '')
      a.heal += typeof pl.result === 'number' ? pl.result : 0
    } else if (e.phase === 'buff_lifecycle') {
      const tid = e.targetId ?? (pl.targetId as string | undefined) ?? ''
      const a = accOf(tid)
      // 真实 BuffTraceLogger 用 buffName；demo 存档用 buff。兼容两者，缺省归"状态"
      const buff =
        (typeof pl.buffName === 'string' && pl.buffName) ||
        (typeof pl.buff === 'string' && pl.buff) ||
        '状态'
      const act = pl.action
      if (act === 'apply') a.parts.push(pl.resisted ? `施加 ${buff}（被抵抗）` : `施加 ${buff}`)
      else if (act === 'remove') a.parts.push(`移除 ${buff}`)
      else if (act === 'update') a.parts.push(`更新 ${buff}`)
    }
  }
  return order
    .filter((tid) => {
      const a = acc.get(tid)!
      return a.damage > 0 || a.heal > 0 || a.dodgeSegs > 0 || a.parts.length > 0
    })
    .map((tid) => {
      const a = acc.get(tid)!
      const res: string[] = []
      if (a.damage === 0 && a.heal === 0 && a.dodgeSegs > 0) res.push('闪避')
      else {
        if (a.damage > 0) res.push(`造成 ${a.damage} 伤害${a.crit ? ' · 暴击' : ''}${a.death ? ' · 击杀' : ''}`)
        if (a.heal > 0) res.push(`治疗 ${a.heal}`)
      }
      res.push(...a.parts)
      return { targetId: tid, name: tid ? store.pname(tid) : '未知', result: res.join('；') }
    })
})

const nodeSub = computed(() => {
  const n = currentNode.value
  if (!n) return '—'
  return `系统阶段 · ${n.events.length} 个事件`
})

/** 结算卡片标题剥离"伤害计算 源→目标 "角色段（meta 行已展示角色，避免重复） */
function stripCalcActor(summary: string): string {
  return summary.replace(/^(伤害计算|治疗计算) \S+→\S+ /, '$1 ')
}

/**
 * 卡片标题：action_execution 行显示节点已解析的操作名（"名字 · 技能名"，真实录制
 * 由 deriveDebugTree 从同链 damage/heal 推断），替换引擎占位 summary "X 执行行动"；
 * 结算行（伤害/治疗）剥离 summary 中的"源→目标"角色段（meta 行已展示，见 ht-ev-meta）；
 * 其余事件仍用自身 summary。原始 summary 保留在 title 悬浮提示中。
 */
function cardTitle(item: UnifiedEvent): string {
  if (item.phase === 'action_execution') {
    const n = currentNode.value
    if (n?.action && n.name) return n.name
  }
  if (item.phase === 'damage_calculation' || item.phase === 'heal_calculation') {
    return stripCalcActor(item.summary)
  }
  return item.summary
}

const segIndicators = computed<Array<'c' | 'm' | 'h'>>(() => {
  const n = currentNode.value
  if (!n?.action || (n.hits ?? 1) <= 1) return []
  return buildSegResults(n)
})

const curSeg = computed<number>(() => {
  const seg = store.selectedEvent?.payload?.seg
  return typeof seg === 'number' ? seg : 0
})

function toneClass(ev: UnifiedEvent): string {
  const pl = (ev.payload ?? {}) as Record<string, unknown>
  if (pl.death) return 't-death'
  if (ev.phase === 'damage_calculation') {
    if (pl.dodge) return 't-miss'
    if (pl.crit) return 't-crit'
    return 't-damage'
  }
  if (ev.phase === 'heal_calculation') return 't-heal'
  if (ev.phase === 'buff_lifecycle') return pl.resisted ? 't-debuff' : 't-buff'
  if (ev.phase === 'passive_trigger') return 't-passive'
  if (ev.phase === 'action_execution') return 't-action'
  return 't-phase'
}

function badgeOf(ev: UnifiedEvent): [string, string] {
  const pl = (ev.payload ?? {}) as Record<string, unknown>
  if (meta(ev).debugOnly) return ['b-dbg', '调试']
  if (ev.phase === 'damage_calculation') {
    if (pl.dodge) return ['b-miss', '闪避']
    if (pl.death) return ['b-death', '击杀']
    if (pl.crit) return ['b-crit', '暴击']
    return ['b-hit', '命中']
  }
  if (ev.phase === 'buff_lifecycle') {
    if (pl.resisted) return ['b-resist', '抵抗']
    return pl.action === 'update' ? ['b-ok', '衰减'] : ['b-hit', '施加']
  }
  if (ev.phase === 'passive_trigger') return ['b-miss', '触发']
  if (ev.phase === 'action_execution') return ['b-hit', '行动']
  return ['b-ok', '系统']
}
</script>
