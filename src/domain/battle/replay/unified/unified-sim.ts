/**
 * 文件: unified-sim.ts
 * 功能: 回放投影状态模拟（纯函数，供 store 驱动）
 * 描述: 依据《调试日志UI-V4.html》freshSim / applyEventToSim / applyListToSim 移植。
 *       回放不从领域实体重放，而是从 initialState 出发，沿事件序应用
 *       snapshot / anchor / buff_lifecycle 增量，推演任意时点状态。
 */

import type { ArchiveBuff, ArchiveStateEntry, UnifiedArchive, UnifiedEvent } from './unified-archive'

export interface SimUnit {
  hp: number
  en: number
  buffs: ArchiveBuff[]
}

/** 任意时点的参与者状态表（id → SimUnit） */
export type SimTable = Record<string, SimUnit>

/** 从 initialState 构造全新状态表（深拷贝 buffs） */
export function freshSim(log: UnifiedArchive): SimTable {
  const sim: SimTable = {}
  for (const p of log.initialState.participants) {
    sim[p.id] = {
      hp: p.hp,
      en: p.energy,
      buffs: (p.buffs ?? []).map((b) => ({ name: b.name, stacks: b.stacks, turns: b.turns })),
    }
  }
  return sim
}

/** 应用一个快照条目列表（缺省字段不变） */
export function applyListToSim(sim: SimTable, list: ArchiveStateEntry[]): void {
  for (const p of list) {
    const s = sim[p.id]
    if (!s) continue
    if (p.hp != null) s.hp = p.hp
    if (p.energy != null) s.en = p.energy
    if (p.buffs) s.buffs = p.buffs.map((b) => ({ name: b.name, stacks: b.stacks, turns: b.turns }))
  }
}

/** 应用单事件到状态表：anchor / snapshot 全量覆盖，buff_lifecycle 走增量规则 */
export function applyEventToSim(sim: SimTable, ev: UnifiedEvent): void {
  const pl = ev.payload ?? {}
  const anchor = pl.anchor as { participants?: ArchiveStateEntry[] } | undefined
  if (anchor?.participants) applyListToSim(sim, anchor.participants)
  if (ev.snapshot?.participants) applyListToSim(sim, ev.snapshot.participants)
  if (ev.phase === 'buff_lifecycle') {
    const s = sim[ev.targetId ?? '']
    if (!s) return
    if (pl.action === 'update' && pl.buff) {
      const b = s.buffs.find((x) => x.name === pl.buff)
      if (b) {
        if (typeof pl.stacks === 'number') b.stacks = pl.stacks
        if (typeof pl.turns === 'number') b.turns = pl.turns
      }
    }
    if (pl.action === 'apply' && !pl.resisted && pl.buff) {
      if (!s.buffs.some((x) => x.name === pl.buff)) {
        s.buffs.push({ name: String(pl.buff), stacks: 1, turns: typeof pl.turns === 'number' ? pl.turns : 2 })
      }
    }
  }
}

/**
 * 从当前状态表继续推进到时点 t（含 t）。
 * @returns 已推进的事件数（供播放循环断点续推）
 */
export function advanceSimTo(sim: SimTable, evs: UnifiedEvent[], t: number, startIdx = 0): number {
  let i = startIdx
  for (; i < evs.length; i++) {
    if (evs[i].timestamp > t) break
    applyEventToSim(sim, evs[i])
  }
  return i
}

/** 当前时点回合号（最近一次 turn_flow start 的 turn；无则 0） */
export function currentTurnAt(evs: UnifiedEvent[], t: number): number {
  let turn = 0
  for (const e of evs) {
    if (e.timestamp > t) break
    if (e.phase === 'turn_flow' && (e.payload as Record<string, unknown>)?.action === 'start') {
      turn = typeof e.turn === 'number' ? e.turn : turn
    }
  }
  return turn
}

/** 当前时点最近事件（无则 null） */
export function lastEventAt(evs: UnifiedEvent[], t: number): UnifiedEvent | null {
  let last: UnifiedEvent | null = null
  for (const e of evs) {
    if (e.timestamp > t) break
    last = e
  }
  return last
}

/** 时长格式化 mm:ss.mmm */
export function formatTime(t: number): string {
  const m = Math.floor(t / 60000)
  const s = Math.floor((t % 60000) / 1000)
  const x = Math.floor(t % 1000)
  return `${m}:${String(s).padStart(2, '0')}.${String(x).padStart(3, '0')}`
}
