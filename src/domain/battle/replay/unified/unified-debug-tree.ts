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
        an = {
          kind: 'node',
          id: `n_${root.id}`,
          name: pname(root.sourceId ?? ''),
          action: true,
          icon: root.sourceId && root.sourceId.length > 0 ? '⚔' : '☠',
          meta: `${String(pl.skill ?? '')} · ${pl.controlMode === 'ai' ? 'AI' : '玩家'}`,
          actor: root.sourceId,
          target: root.targetId,
          hits: typeof pl.hits === 'number' ? pl.hits : 1,
          events: [],
        }
        actionNodes.set(root.id, an)
        if (curRound) curRound.nodes.push(an)
        else entries.push(an) // 回合前/无回合的行动（实时流先行动后回合）不丢弃，挂顶层
      }
      an.events.push(ev)
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
