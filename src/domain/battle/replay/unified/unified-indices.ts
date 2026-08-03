/**
 * 文件: unified-indices.ts
 * 功能: 统一存档索引构建（纯函数）
 * 描述: 依据《调试日志UI-V4.html》buildIndices 移植：
 *       - timestamp 排序事件列表（双工作台共同消费序）
 *       - id → event / parentId → children 映射（树投影 + 检视器子事件）
 *       - 随机判定 RNG 序号注入（rolls[].idx，供凭证展示）
 *       - 状态增量 _delta 注入（HP/EN 相对前一状态的差值，经 snapshot/anchor 游标推演）
 *       - 总时长（末事件 timestamp + 500ms）
 */

import type { ArchiveDelta, UnifiedArchive, UnifiedEvent } from './unified-archive'

/** 状态游标：从 initialState 出发，沿事件序推演当前 HP/EN（用于计算每事件增量） */
interface SimCursor {
  hp: number
  en: number
}

export interface ArchiveIndices {
  /** timestamp 排序事件列表 */
  evs: UnifiedEvent[]
  /** id → event */
  byId: Map<string, UnifiedEvent>
  /** parentId → children（按 timestamp 排序） */
  children: Map<string, UnifiedEvent[]>
  /** 总时长（末事件 timestamp + 500ms） */
  duration: number
  /** 末事件 timestamp */
  lastTimestamp: number
}

/** 构造初始游标表 */
function freshCursors(log: UnifiedArchive): Map<string, SimCursor> {
  const cursors = new Map<string, SimCursor>()
  for (const p of log.initialState.participants) {
    cursors.set(p.id, { hp: p.hp, en: p.energy })
  }
  return cursors
}

/** 将快照条目（snapshot/anchor.participants 成员）应用到游标，并采集增量 */
function applyEntries(
  entries: Array<{ id: string; hp?: number; energy?: number }>,
  cursors: Map<string, SimCursor>,
  deltas: ArchiveDelta[],
): void {
  for (const e of entries) {
    const cur = cursors.get(e.id)
    if (!cur) continue
    const fields: ArchiveDelta['fields'] = []
    if (e.hp != null) {
      if (e.hp !== cur.hp) fields.push({ k: 'HP', before: cur.hp, after: e.hp })
      cur.hp = e.hp
    }
    if (e.energy != null) {
      if (e.energy !== cur.en) fields.push({ k: 'EN', before: cur.en, after: e.energy })
      cur.en = e.energy
    }
    if (fields.length) deltas.push({ id: e.id, fields })
  }
}

/** 构建统一存档索引 */
export function buildArchiveIndices(log: UnifiedArchive): ArchiveIndices {
  const evs = [...log.events].sort((a, b) => a.timestamp - b.timestamp)

  const byId = new Map<string, UnifiedEvent>()
  for (const e of evs) byId.set(e.id, e)

  const children = new Map<string, UnifiedEvent[]>()
  for (const e of evs) {
    if (!e.parentId) continue
    const list = children.get(e.parentId)
    if (list) list.push(e)
    else children.set(e.parentId, [e])
  }
  for (const list of children.values()) list.sort((a, b) => a.timestamp - b.timestamp)

  const cursors = freshCursors(log)
  let rng = 0
  for (const e of evs) {
    const rolls = (e.payload as Record<string, unknown>)?.rolls
    if (Array.isArray(rolls)) {
      for (const r of rolls as Array<{ idx?: number }>) r.idx = ++rng
    }
    const deltas: ArchiveDelta[] = []
    const anchor = (e.payload as Record<string, unknown>)?.anchor as
      | { participants?: Array<{ id: string; hp?: number; energy?: number }> }
      | undefined
    if (anchor?.participants) applyEntries(anchor.participants, cursors, deltas)
    if (e.snapshot?.participants) applyEntries(e.snapshot.participants, cursors, deltas)
    if (deltas.length) e._delta = deltas
  }

  const lastTimestamp = evs.length ? evs[evs.length - 1].timestamp : 0
  return { evs, byId, children, duration: lastTimestamp + 500, lastTimestamp }
}
