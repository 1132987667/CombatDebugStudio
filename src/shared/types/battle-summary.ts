/**
 * 文件: battle-summary.ts
 * 功能: 战斗战报核心类型定义
 * 描述: 定义 BattleSummary 接口，用于战斗结束后生成的多维度统计数据。
 *       对应设计文档第6节"顶层：战报与复盘"。
 * 版本: 1.0.0
 */

/**
 * 战斗摘要
 * 战斗结束时由 BattleSummaryGenerator 生成
 */
export interface BattleSummary {
  battleId: string
  totalRounds: number
  winner: string
  duration: number // 毫秒

  /** 伤害统计 */
  totalDamageDealt: number
  totalDamageTaken: number
  highestSingleDamage: { actor: string; value: number; crit: boolean } | null
  totalHealing: number
  highestSingleHeal: { actor: string; value: number } | null

  /** 被动/Buff 触发统计 */
  passiveTriggers: Array<{
    passiveId: string
    passiveName: string
    owner: string
    triggerCount: number
  }>

  /** 参与者最终状态 */
  participants: Array<{
    id: string
    name: string
    team: string
    hpEnd: number
    hpMax: number
    totalDamageDealt: number
    totalDamageTaken: number
    totalHealingReceived: number
  }>

  /** 精简动作时间线 */
  actionTimeline: Array<{
    turn: number
    actor: string
    action: string
    target: string
    damage?: number
    heal?: number
    crit?: boolean
  }>
}

/** 战报累加器（内部使用，战斗过程中持续更新） */
export interface BattleSummaryAccumulator {
  battleId: string
  startTime: number
  totalRounds: Set<number>
  totalDamageDealt: number
  /** 受击总伤害数值 */
  totalDamageTaken: number
  highestDamage: { actor: string; value: number; crit: boolean } | null
  totalHealing: number
  highestHeal: { actor: string; value: number } | null
  perActorDamage: Map<string, number> // actorId → total damage dealt
  perActorHeal: Map<string, number> // actorId → total healing done
  perActorTaken: Map<string, number> // actorId → total damage taken
  timeline: Array<{
    turn: number
    actor: string
    action: string
    target: string
    damage?: number
    heal?: number
    crit?: boolean
  }>
}

/** 创建初始累加器 */
export function createAccumulator(battleId: string): BattleSummaryAccumulator {
  return {
    battleId,
    startTime: Date.now(),
    totalRounds: new Set(),
    totalDamageDealt: 0,
    totalDamageTaken: 0,
    highestDamage: null,
    totalHealing: 0,
    highestHeal: null,
    perActorDamage: new Map(),
    perActorHeal: new Map(),
    perActorTaken: new Map(),
    timeline: [],
  }
}
