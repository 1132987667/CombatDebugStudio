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

/** 深拷贝状态表（buffs 数组与条目均复制，避免快照间共享引用被后续推演污染） */
export function cloneSimTable(sim: SimTable): SimTable {
  const out: SimTable = {}
  for (const id in sim) {
    const s = sim[id]
    out[id] = {
      hp: s.hp,
      en: s.en,
      buffs: s.buffs.map((b) => ({ name: b.name, stacks: b.stacks, turns: b.turns })),
    }
  }
  return out
}

/** 推演检查点：idx 为该时点已应用的事件下标（从 idx 续推），t 为事件时间戳 */
export interface SimCheckpoint {
  idx: number
  t: number
  /** 已应用事件（下标 idx-1）的 id，供增量扩展校验前缀一致（实时流尾部追加场景） */
  lastId: string | null
  sim: SimTable
}

/**
 * 预构建/增量扩展检查点序列：起点（idx 0）＋ 每 interval 个事件一份状态快照。
 * 快进/回跳时从最近的检查点续推，避免 seek 每次都从 initialState 全量重跑。
 *
 * 传入 prev 时走增量路径（实时流尾部追加场景）：从末位检查点克隆状态后只重放
 * 尾部新增事件，避免每帧全量重建。增量安全前提——新 evs 前 idx 个事件与 prev 构建
 * 时一致（以 lastId 校验）；前缀不一致（事件被重排/回拨）时回退全量重建。
 */
export function buildSimCheckpoints(
  log: UnifiedArchive,
  evs: UnifiedEvent[],
  interval = 200,
  prev?: SimCheckpoint[],
): SimCheckpoint[] {
  const base = prev && prev.length ? prev[prev.length - 1] : null
  const prefixOk =
    !!base && (base.idx === 0 || (evs.length >= base.idx && evs[base.idx - 1]?.id === base.lastId))
  if (prefixOk) {
    const out = prev!.slice()
    const sim = cloneSimTable(base!.sim)
    for (let i = base!.idx; i < evs.length; i++) {
      applyEventToSim(sim, evs[i])
      if ((i + 1) % interval === 0) {
        out.push({ idx: i + 1, t: evs[i].timestamp, lastId: evs[i].id, sim: cloneSimTable(sim) })
      }
    }
    return out
  }

  const cps: SimCheckpoint[] = [{ idx: 0, t: 0, lastId: null, sim: freshSim(log) }]
  const sim = freshSim(log)
  for (let i = 0; i < evs.length; i++) {
    applyEventToSim(sim, evs[i])
    if ((i + 1) % interval === 0) {
      cps.push({ idx: i + 1, t: evs[i].timestamp, lastId: evs[i].id, sim: cloneSimTable(sim) })
    }
  }
  return cps
}

/** 定位不晚于 t 的最近检查点（cps 按 t 升序）；空序列返回 null */
export function nearestCheckpoint(cps: SimCheckpoint[], t: number): SimCheckpoint | null {
  if (!cps.length) return null
  let best = cps[0]
  for (const cp of cps) {
    if (cp.t > t) break
    best = cp
  }
  return best
}

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
