/**
 * 文件: unified-summary.ts
 * 功能: 战斗摘要统计（纯函数）：按事件流汇总每单位输出/承伤/治疗/暴击/闪避/抵抗/Buff/击杀
 * 描述: 供「战斗摘要」面板与 Markdown/CSV 导出使用，指标从统一事件流派生，不改动存档数据。
 *       dot（持续伤害）事件常无 sourceId，故「承伤」按 targetId 统计，不要求与「输出」对账相等。
 */

import type { UnifiedArchive } from './unified-archive'

export interface UnitSummary {
  id: string
  /** 主动行动次数（action_execution 发起） */
  attacks: number
  /** 造成伤害合计（damage_calculation result，闪避不计） */
  dealt: number
  /** 承受伤害合计（含 dot） */
  taken: number
  /** 治疗量合计 */
  healed: number
  /** 暴击次数（sourceId 归属） */
  crits: number
  /** 闪避次数（targetId 归属） */
  dodges: number
  /** Buff 施加被抵抗次数 */
  resists: number
  /** Buff 成功施加次数 */
  buffsApplied: number
  /** 击杀次数（致死事件归属 sourceId） */
  kills: number
}

export interface BattleSummary {
  battleId: string
  rounds: number
  durationMs: number
  winner?: string
  units: Record<string, UnitSummary>
}

function empty(id: string): UnitSummary {
  return {
    id,
    attacks: 0,
    dealt: 0,
    taken: 0,
    healed: 0,
    crits: 0,
    dodges: 0,
    resists: 0,
    buffsApplied: 0,
    kills: 0,
  }
}

/** 从统一存档汇总战斗指标（单次遍历）；maxTimestamp 传入时仅统计截止该时间点之前的事件（时间切面） */
export function summarizeBattle(archive: UnifiedArchive, maxTimestamp?: number): BattleSummary {
  const units: Record<string, UnitSummary> = {}
  const get = (id?: string): UnitSummary => {
    if (!id) return empty('')
    if (!units[id]) units[id] = empty(id)
    return units[id]
  }
  // 预置全部参战单位，保证摘要表始终覆盖无行动者
  for (const p of archive.initialState.participants) {
    if (!units[p.id]) units[p.id] = empty(p.id)
  }

  let rounds = 0
  let reachedEnd = true
  for (const e of archive.events) {
    if (maxTimestamp !== undefined && e.timestamp > maxTimestamp) {
      reachedEnd = false
      break
    }
    const pl = e.payload ?? {}
    if (e.phase === 'turn_flow' && typeof e.turn === 'number') {
      rounds = Math.max(rounds, e.turn)
      continue
    }
    switch (e.phase) {
      case 'action_execution':
        get(e.sourceId).attacks++
        break
      case 'damage_calculation': {
        const result = typeof pl.result === 'number' ? pl.result : 0
        if (pl.dodge) {
          get(e.targetId).dodges++
        } else {
          if (e.sourceId) get(e.sourceId).dealt += result
          if (e.targetId) get(e.targetId).taken += result
        }
        if (pl.crit && e.sourceId) get(e.sourceId).crits++
        if (pl.death && e.sourceId) get(e.sourceId).kills++
        break
      }
      case 'heal_calculation': {
        const result = typeof pl.result === 'number' ? pl.result : 0
        if (e.sourceId) get(e.sourceId).healed += result
        break
      }
      case 'buff_lifecycle': {
        const tgt = get(e.targetId)
        if (pl.action === 'apply') {
          if (pl.resisted) tgt.resists++
          else tgt.buffsApplied++
        }
        break
      }
      default:
        break
    }
  }

  // 截止时间：显式传入用截断点，否则用事件流尾部；截断未到战斗结束则胜方未知
  const last =
    maxTimestamp !== undefined ? Math.min(maxTimestamp, archive.events.length ? archive.events[archive.events.length - 1].timestamp : maxTimestamp) : archive.events.length ? archive.events[archive.events.length - 1].timestamp : 0
  const winner = reachedEnd ? archive.winner : undefined
  return { battleId: archive.battleId, rounds, durationMs: last, winner, units }
}
