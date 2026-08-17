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
        <div v-if="skillDescription" class="ht-sh-skill-desc">{{ skillDescription }}</div>
        <div v-if="energyCost" class="ht-sh-row">
          <em>消耗</em>
          <b>{{ energyCost }}能量</b>
          <template v-if="actorEnergy != null">
            <span class="ht-sh-arrow">·</span>
            <span>剩余 {{ actorEnergy }}能量</span>
          </template>
        </div>
        <div v-for="t in targetRows" :key="t.targetId || 'unknown'" class="ht-sh-tgt">
          <div class="ht-sh-row">
            <em>目标</em>
            <b>{{ t.name }}</b>
            <span class="ht-sh-arrow">→</span>
            <span class="ht-sh-result">{{ t.result }}</span>
          </div>
          <div v-if="t.hp" class="ht-bar ht-bar-hp" :title="`气血 ${t.hp.before} → ${t.hp.after}`" aria-hidden="true">
            <i class="seg keep" :style="{ width: hpKeepWidth(t) }"></i>
            <i class="seg change" :class="t.hp.kind" :style="{ width: hpChangeWidth(t) }"></i>
            <span class="ht-bar-text">{{ hpText(t) }}</span>
          </div>
          <div v-if="t.en" class="ht-bar ht-bar-en" :title="`能量 ${t.en.before} → ${t.en.after}`" aria-hidden="true">
            <i class="seg keep" :style="{ width: enKeepWidth(t) }"></i>
            <i class="seg change" :class="t.en.kind" :style="{ width: enChangeWidth(t) }"></i>
            <span class="ht-bar-text">{{ enText(t) }}</span>
          </div>
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

import { ConfigDataSource } from '@/shared/utils/ConfigDataSource'
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

/** 行动者剩余能量：行动链内该角色 EN 末态（action_execution 扣费后快照；真实录制无 EN 快照时不显示） */
const actorEnergy = computed<number | undefined>(() => {
  const n = currentNode.value
  if (!n?.action || !n.actor) return undefined
  let last: number | undefined
  for (const e of n.events) {
    for (const d of e._delta ?? []) {
      if (d.id !== n.actor) continue
      for (const f of d.fields) {
        if (f.k === 'EN') last = f.after
      }
    }
  }
  return last
})

/** 技能配置（静态 JSON 源，模块级单例；按技能名查描述） */
const skillConfigs = new ConfigDataSource().getSkills()

/** 节点技能名：从行动节点名"名字 · 技能名"解析（deriveDebugTree 已补全技能名） */
function skillNameOfNode(n: DebugNode): string {
  const sep = ' · '
  const i = n.name.lastIndexOf(sep)
  return i >= 0 ? n.name.slice(i + sep.length) : ''
}

/** 技能描述：技能类行动（小/大/通用技能；被动技能 actionType 归通用 skill）在头部下方展示配置 description */
const skillDescription = computed<string>(() => {
  const n = currentNode.value
  if (!n?.action || !actionType.value) return ''
  if (!SKILL_TAGS.includes(actionType.value)) return ''
  const name = skillNameOfNode(n)
  if (!name) return ''
  return skillConfigs.find((s) => s.name === name)?.description ?? ''
})

/** 目标结果行：遍历节点事件的每个目标，聚合伤害/治疗/状态结果（目标可多个，结果可不同） */
interface HpBar { kind: 'damage' | 'heal'; before: number; after: number; max: number }
interface EnBar { kind: 'cost' | 'gain'; before: number; after: number; max: number }

interface TargetRow {
  targetId: string
  name: string
  result: string
  /** 气血条：本次行动该目标 HP 前后值（max 为上限，条上绿=剩余、红=扣减/亮绿=治疗） */
  hp?: HpBar
  /** 能量条：本次行动该目标 EN 前后值（仅目标行；施法者自身扣能量不走此条） */
  en?: EnBar
}

/** 条段宽度百分比（clamp 0~100，max 兜底除零） */
function barPct(v: number, max: number): string {
  const m = max > 0 ? max : 1
  return `${Math.round(Math.min(100, Math.max(0, (v / m) * 100)) * 10) / 10}%`
}
/** 气血条"剩余/原有"段宽度：伤害取行动后剩余，治疗取行动前原有 */
function hpKeepWidth(t: TargetRow): string {
  const h = t.hp!
  return barPct(h.kind === 'damage' ? h.after : h.before, h.max)
}
/** 气血条"本次变化"段宽度：扣血量或治疗量 */
function hpChangeWidth(t: TargetRow): string {
  const h = t.hp!
  return barPct(h.kind === 'damage' ? h.before - h.after : h.after - h.before, h.max)
}
/** 能量条"剩余/原有"段宽度 */
function enKeepWidth(t: TargetRow): string {
  const e = t.en!
  return barPct(e.kind === 'cost' ? e.after : e.before, e.max)
}
/** 能量条"本次变化"段宽度：扣除量或回复量 */
function enChangeWidth(t: TargetRow): string {
  const e = t.en!
  return barPct(e.kind === 'cost' ? e.before - e.after : e.after - e.before, e.max)
}
/** 条内文字：当前/最大 - 扣减量（伤害/扣能量）或 + 变化量（治疗/回能量） */
function hpText(t: TargetRow): string {
  const h = t.hp!
  const d = h.kind === 'damage' ? h.before - h.after : h.after - h.before
  return `${h.after}/${h.max} ${h.kind === 'damage' ? '-' : '+'} ${d}`
}
function enText(t: TargetRow): string {
  const e = t.en!
  const d = e.kind === 'cost' ? e.before - e.after : e.after - e.before
  return `${e.after}/${e.max} ${e.kind === 'cost' ? '-' : '+'} ${d}`
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
  // HP/EN 前后值：从事件链 _delta 聚合（首个 delta 的 before 视为行动前，末个 delta 的 after 视为行动后；
  // 链内多段伤害/治疗的快照是游标连续的，首尾即本次行动的起点与终点）
  const hpDelta = new Map<string, { before: number; after: number }>()
  const enDelta = new Map<string, { before: number; after: number }>()
  for (const e of n.events) {
    for (const d of e._delta ?? []) {
      for (const f of d.fields) {
        if (f.k === 'HP') {
          const cur = hpDelta.get(d.id)
          if (cur) cur.after = f.after
          else hpDelta.set(d.id, { before: f.before, after: f.after })
        } else if (f.k === 'EN') {
          const cur = enDelta.get(d.id)
          if (cur) cur.after = f.after
          else enDelta.set(d.id, { before: f.before, after: f.after })
        }
      }
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
      const row: TargetRow = { targetId: tid, name: tid ? store.pname(tid) : '未知', result: res.join('；') }
      const p = store.archive?.initialState.participants.find((x) => x.id === tid)
      const hd = hpDelta.get(tid)
      if (p && hd && hd.before !== hd.after) {
        row.hp = { kind: hd.after < hd.before ? 'damage' : 'heal', before: hd.before, after: hd.after, max: p.maxHp }
      }
      const ed = enDelta.get(tid)
      if (p && ed && ed.before !== ed.after) {
        row.en = { kind: ed.after < ed.before ? 'cost' : 'gain', before: ed.before, after: ed.after, max: p.maxEnergy }
      }
      return row
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
