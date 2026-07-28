/**
 * 文件: BattleSummaryGenerator.ts
 * 功能: 战报生成器 — 战斗过程中累积数据，战斗结束时生成 BattleSummary
 * 描述: 通过 onAction 接收 CombatRecord 增量更新累加器，
 *      通过 onBattleEnd 生成最终战报。
 *      集成点在 BattleRecorder.recordCombatRecord() 和
 *      BattleEventManager.handleBattleEndEvent()。
 * 版本: 1.0.0
 */

import type { CombatRecord } from '@/domain/battle/combat-record'
import type { BattleSummary, BattleSummaryAccumulator } from '@/shared/types/battle-summary'
import { createAccumulator } from '@/shared/types/battle-summary'
import { ParticipantSide, ParticipantSideName } from '@/domain/battle/type/types'

/**
 * 战报生成器
 * 单例模式，全系统共享同一个实例。
 * ponytail: 仅存储最新一场战斗的战报。如果需要多场历史战报，
 * 升级路径：改为 Map<string, BattleSummary> 或持久化到 localStorage。
 */
export class BattleSummaryGenerator {
  private static _instance: BattleSummaryGenerator | null = null

  /** 当前战斗的累加器 */
  private accumulator: BattleSummaryAccumulator | null = null
  /** 最新生成的战报 */
  private _lastSummary: BattleSummary | null = null

  static get instance(): BattleSummaryGenerator {
    if (!this._instance) {
      this._instance = new BattleSummaryGenerator()
    }
    return this._instance
  }

  /** 获取最新战报 */
  get lastSummary(): BattleSummary | null {
    return this._lastSummary
  }

  /**
   * 战斗开始时初始化累加器
   */
  startBattle(battleId: string): void {
    this.accumulator = createAccumulator(battleId)
    this._lastSummary = null
  }

  /**
   * 接收一条 CombatRecord，更新累加器
   * 在 BattleRecorder.recordCombatRecord() 中调用
   */
  onAction(record: CombatRecord): void {
    const acc = this.accumulator
    if (!acc) return

    // 回合
    if (record.turn > 0) acc.totalRounds.add(record.turn)

    // 伤害
    if (record.damage > 0) {
      acc.totalDamageDealt += record.damage
      const actorTotal = acc.perActorDamage.get(record.actorId) ?? 0
      acc.perActorDamage.set(record.actorId, actorTotal + record.damage)

      // 受击方
      const takenTotal = acc.perActorTaken.get(record.targetId) ?? 0
      acc.perActorTaken.set(record.targetId, takenTotal + record.damage)

      // 最高单次伤害
      if (!acc.highestDamage || record.damage > acc.highestDamage.value) {
        acc.highestDamage = {
          actor: record.actorName,
          value: record.damage,
          crit: record.damageBreakdown?.isCritical ?? false,
        }
      }

      // 受击总伤害
      acc.totalDamageTaken += record.damage
    }

    // 治疗
    if (record.heal > 0) {
      acc.totalHealing += record.heal
      const healTotal = acc.perActorHeal.get(record.actorId) ?? 0
      acc.perActorHeal.set(record.actorId, healTotal + record.heal)

      if (!acc.highestHeal || record.heal > acc.highestHeal.value) {
        acc.highestHeal = {
          actor: record.actorName,
          value: record.heal,
        }
      }
    }

    // 时间线
    acc.timeline.push({
      turn: record.turn,
      actor: record.actorName,
      action: record.actionType,
      target: record.targetName ?? '',
      damage: record.damage > 0 ? record.damage : undefined,
      heal: record.heal > 0 ? record.heal : undefined,
      crit: record.damageBreakdown?.isCritical,
    })
  }

  /**
   * 战斗结束时生成战报
   * @param winner 胜利方阵营
   * @param participants 参与者最终状态列表（可选）
   */
  onBattleEnd(
    winner: ParticipantSide,
    participants?: Array<{
      id: string
      name: string
      team: string
      hpEnd: number
      hpMax: number
    }>,
  ): BattleSummary | null {
    const acc = this.accumulator
    if (!acc) return null

    const duration = Date.now() - acc.startTime
    const totalRounds = acc.totalRounds.size

    // 构建参与者数组
    const participantList = (participants ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      hpEnd: p.hpEnd,
      hpMax: p.hpMax,
      totalDamageDealt: acc.perActorDamage.get(p.id) ?? 0,
      totalDamageTaken: acc.perActorTaken.get(p.id) ?? 0,
      totalHealingReceived: acc.perActorHeal.get(p.id) ?? 0,
    }))

    const summary: BattleSummary = {
      battleId: acc.battleId,
      totalRounds,
      winner: ParticipantSideName[winner],
      duration,
      totalDamageDealt: acc.totalDamageDealt,
      totalDamageTaken: acc.totalDamageTaken,
      highestSingleDamage: acc.highestDamage,
      totalHealing: acc.totalHealing,
      highestSingleHeal: acc.highestHeal,
      passiveTriggers: [],
      participants: participantList,
      actionTimeline: acc.timeline,
    }

    this._lastSummary = summary
    this.accumulator = null // 释放累加器
    return summary
  }

  /** 手动清空 */
  reset(): void {
    this.accumulator = null
    this._lastSummary = null
  }
}
