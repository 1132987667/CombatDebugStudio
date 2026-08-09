/**
 * 文件: unified-debug-tree.ts
 * 功能: 统一事件流 → 调试时间线树派生（纯函数）
 * 描述: 依据《调试日志UI-V4.html》deriveDebugTree 移植。
 *       调试投影（PROJECTION 2 · CORRELATIONID）的树结构：
 *         - 战斗初始化（battle_start + config_load）
 *         - 第 N 回合（turn_flow start 触发）：回合开始·结算 / 行动节点 / 回合结束·结算
 *         - 战斗结束（battle_end）
 *       行动节点 = 该因果链根为 action_execution 的节点（含 hits/actor/target/meta）。
 */

import type { UnifiedEvent } from './unified-archive'
import { PHASE_META } from './unified-archive'

/** 时间线行动类型标签（UI 展示的行动类型语义：普攻 / 小技能 / 大技能 / 被控制 / 跳过） */
export type ActionTypeTag =
  | 'attack'
  | 'skill_small'
  | 'skill_ultimate'
  | 'skill'
  | 'status'
  | 'skip'

/** 行动类型 → 标签文案（时间线 / 行动卡片头部共用，避免文案漂移） */
export const ACTION_TAG_TEXT: Record<ActionTypeTag, string> = {
  attack: '普通攻击',
  skill_small: '小技能',
  skill_ultimate: '大技能',
  skill: '技能',
  status: '被控制',
  skip: '跳过',
}

export interface DebugNode {
  kind: 'node'
  id: string
  name: string
  icon: string
  /** 回合开始/结束·结算节点 */
  phase?: boolean
  /** 行动节点 */
  action?: boolean
  meta?: string
  actor?: string
  target?: string
  hits?: number
  /** 行动类型标签：新引擎由 action_execution payload.actionType 标记；旧存档从同链子事件推断 */
  actionType?: ActionTypeTag
  /** 技能能量消耗：action_execution payload.energyCost（技能行动发射端携带） */
  energyCost?: number
  events: UnifiedEvent[]
}

export interface DebugRoundNode {
  kind: 'round'
  id: string
  name: string
  nodes: DebugNode[]
}

export type DebugTreeEntry = DebugRoundNode | DebugNode

/** 沿 parentId 追溯到因果链根事件 */
function rootOf(e: UnifiedEvent, byId: Map<string, UnifiedEvent>): UnifiedEvent {
  let cur = e
  while (cur.parentId && byId.has(cur.parentId)) cur = byId.get(cur.parentId)!
  return cur
}

/**
 * 派生调试时间线树。
 * @param evs    timestamp 排序事件列表（buildArchiveIndices 输出）
 * @param byId   id → event 映射
 * @param pname  参与者 id → 名字
 */
export function deriveDebugTree(
  evs: UnifiedEvent[],
  byId: Map<string, UnifiedEvent>,
  pname: (id: string) => string,
): DebugTreeEntry[] {
  const entries: DebugTreeEntry[] = []
  const initNode: DebugNode = { kind: 'node', id: 'n_init', name: '战斗初始化', icon: PHASE_META.battle_lifecycle.icon, events: [] }
  const endNode: DebugNode = { kind: 'node', id: 'n_end', name: '战斗结束', icon: PHASE_META.battle_lifecycle.icon, events: [] }
  const rounds: DebugRoundNode[] = []
  const actionNodes = new Map<string, DebugNode>()
  const phaseNodes = new Map<string, DebugNode>()
  let curRound: DebugRoundNode | null = null

  const payloadOf = (e: UnifiedEvent): Record<string, unknown> => e.payload ?? {}

  for (const ev of evs) {
    if (ev.phase === 'battle_lifecycle') {
      if (payloadOf(ev).action === 'battle_start') initNode.events.push(ev)
      else endNode.events.push(ev)
      continue
    }
    if (ev.phase === 'config_load') {
      initNode.events.push(ev)
      continue
    }
    if (ev.phase === 'turn_flow') {
      const action = payloadOf(ev).action
      if (action === 'start') {
        curRound = {
          kind: 'round',
          id: `n_r${ev.turn ?? 0}`,
          name: `第 ${ev.turn ?? 0} 回合`,
          nodes: [],
        }
        rounds.push(curRound)
      }
      const pn: DebugNode = {
        kind: 'node',
        id: `n_${ev.id}`,
        name: action === 'start' ? '回合开始 · 结算' : '回合结束 · 结算',
        icon: action === 'start' ? '▼' : '▲',
        phase: true,
        events: [ev],
      }
      phaseNodes.set(ev.id, pn)
      if (curRound) curRound.nodes.push(pn)
      continue
    }

    const root = rootOf(ev, byId)
    if (root.phase === 'action_execution') {
      let an = actionNodes.get(root.id)
      if (!an) {
        const pl = payloadOf(root)
        const skillName = typeof pl.skill === 'string' && pl.skill ? pl.skill : ''
        an = {
          kind: 'node',
          id: `n_${root.id}`,
          // 行动节点标签：名字 · 技能名。技能名取 payload.skill（demo）；
          // 真实录制 action_execution 不携带 skill，同链 damage/heal 事件的 skillName 是其可靠来源（见下方 skillOf 解析）。
          name: skillName ? `${pname(root.sourceId ?? '')} · ${skillName}` : pname(root.sourceId ?? ''),
          action: true,
          // 时间线行动节点不设图标（V4 参考的 ⚔/☠ 因 AGENTS 禁 emoji 已弃，直接用名字+技能名表达）
          icon: '',
          // 控制模式：真实引擎为大写枚举（AI/AUTO/MANUAL）；demo 曾用小写 'ai'。仅映射已知值，未知不显示
          meta: pl.controlMode === 'ai' || pl.controlMode === 'AI'
            ? 'AI'
            : pl.controlMode === 'AUTO'
              ? '自动'
              : pl.controlMode === 'MANUAL'
                ? '手动'
                : '',
          actor: root.sourceId,
          target: root.targetId,
          hits: typeof pl.hits === 'number' ? pl.hits : 1,
          energyCost: energyCostOfPayload(pl),
          events: [],
        }
        actionNodes.set(root.id, an)
        if (curRound) curRound.nodes.push(an)
        else entries.push(an) // 回合前/无回合的行动（实时流先行动后回合）不丢弃，挂顶层
      }
      an.events.push(ev)
      // 行动节点事件归集完成后补全缺失信息：
      // ① 技能名：action_execution 无 skill 时，从同链 damage/heal 事件解析（普攻/技能路径均可）
      if (!skillNameOf(an)) {
        const s = resolveActionSkill(an.events)
        if (s) an.name = `${pname(an.actor ?? '')} · ${s}`
      }
      // ② 目标：真实录制 action_execution 不带 targetId，从同链 damage/heal 的 targetId 补
      if (!an.target) {
        const t = resolveActionTarget(an.events)
        if (t) an.target = t
      }
      // ③ 行动类型：新引擎标记（status/skip 无子事件，仅事件流无法区分）；旧存档回退推断
      if (!an.actionType) {
        const t = resolveActionType(an)
        if (t) an.actionType = t
      }
    } else if (root.phase === 'turn_flow') {
      const pn = phaseNodes.get(root.id)
      if (pn) pn.events.push(ev)
    }
  }

  if (initNode.events.length) entries.push(initNode)
  entries.push(...rounds)
  if (endNode.events.length) entries.push(endNode)
  return entries
}

/** 全部节点拍平（round 展开），供选中定位 */
export function allNodesFlat(entries: DebugTreeEntry[]): DebugNode[] {
  const out: DebugNode[] = []
  for (const e of entries) {
    if (e.kind === 'round') out.push(...e.nodes)
    else out.push(e)
  }
  return out
}

/** 定位事件所属节点（未命中返回 null） */
export function nodeOfEvent(entries: DebugTreeEntry[], eventId: string): DebugNode | null {
  return allNodesFlat(entries).find((n) => n.events.some((e) => e.id === eventId)) ?? null
}

/** 行动能量消耗：action_execution payload.energyCost（技能行动发射端携带，普攻/0 视为无消耗） */
function energyCostOfPayload(pl: Record<string, unknown>): number | undefined {
  const c = pl.energyCost
  return typeof c === 'number' && c > 0 ? c : undefined
}

/** 节点当前已解析的技能名（payload.skill 或经 resolveActionSkill 补全） */
function skillNameOf(n: DebugNode): string {
  const sep = ' · '
  const i = n.name.lastIndexOf(sep)
  return i >= 0 ? n.name.slice(i + sep.length) : ''
}

/**
 * 从行动链事件推断技能名：真实录制 action_execution 不带 skill，
 * 但同链 damage_calculation / heal_calculation 事件的 payload.skillName（TraceDamageLogger 发射）携带。
 * 取首个命中；无则返回 ''（时间线仅显示名字）。
 */
function resolveActionSkill(events: UnifiedEvent[]): string {
  for (const e of events) {
    if (e.phase !== 'damage_calculation' && e.phase !== 'heal_calculation') continue
    const s = (e.payload as Record<string, unknown>)?.skillName
    if (typeof s === 'string' && s) return s
  }
  return ''
}

/**
 * 从行动链事件推断目标：真实录制 action_execution 不带 targetId，
 * 同链 damage/heal 事件的 targetId 是其可靠来源。取首个命中；无则返回 undefined。
 */
function resolveActionTarget(events: UnifiedEvent[]): string | undefined {
  for (const e of events) {
    if (e.phase !== 'damage_calculation' && e.phase !== 'heal_calculation') continue
    if (e.targetId) return e.targetId
  }
  return undefined
}

/** 技能类型 → 行动类型标签（small/ultimate 细分小/大技能，其余归通用技能） */
function skillTag(st: string): ActionTypeTag {
  if (st === 'small') return 'skill_small'
  if (st === 'ultimate') return 'skill_ultimate'
  return 'skill'
}

/** 从同链 damage/heal 事件取技能类型（新引擎 TraceDamageLogger/HealCalculator 携带） */
function resolveChildSkillType(events: UnifiedEvent[]): string | undefined {
  for (const e of events) {
    if (e.phase !== 'damage_calculation' && e.phase !== 'heal_calculation') continue
    const st = (e.payload as Record<string, unknown>)?.skillType
    if (typeof st === 'string' && st) return st
  }
  return undefined
}

/**
 * 解析行动节点类型标签。优先读 action_execution payload.actionType（新引擎标记，
 * 含 status/skip 这两个无子事件、仅事件流无法区分的分支）；旧存档回退同链子事件推断
 * （skillName==='普通攻击' → 普攻；skillType → 小/大技能；其他技能名 → 通用技能）。
 */
function resolveActionType(n: DebugNode): ActionTypeTag | undefined {
  const root = n.events.find((e) => e.phase === 'action_execution')
  const pl = root ? (root.payload as Record<string, unknown>) : undefined
  const at = typeof pl?.actionType === 'string' ? pl.actionType : ''
  if (at === 'status' || at === 'skip' || at === 'attack') return at
  if (at === 'skill') {
    const st = typeof pl?.skillType === 'string' ? pl.skillType : ''
    return skillTag(st)
  }
  // 旧存档：从同链子事件推断
  const skillName = skillNameOf(n)
  if (skillName === '普通攻击') return 'attack'
  const st = resolveChildSkillType(n.events)
  if (st) return skillTag(st)
  if (skillName) return 'skill'
  return undefined
}

/**
 * 行动节点的多段结果（h=命中 / m=闪避 / c=暴击）。
 * 依据 V4 buildSegResults：第 i 段的结果来自该行动链中 damage_calculation 且 payload.seg === i 的事件。
 */
export function buildSegResults(node: DebugNode): Array<'h' | 'm' | 'c'> {
  const res: Array<'h' | 'm' | 'c'> = []
  for (let i = 1; i <= (node.hits ?? 1); i++) {
    const dmg = node.events.find((e) => {
      if (e.phase !== 'damage_calculation') return false
      const pl = e.payload as Record<string, unknown>
      return pl.seg === i
    })
    if (dmg) {
      const pl = dmg.payload as Record<string, unknown>
      if (pl.dodge) res.push('m')
      else if (pl.crit) res.push('c')
      else res.push('h')
    } else res.push('h')
  }
  return res
}
