/**
 * 仇恨管理器 — 管理每名角色的仇恨表
 *
 * 由 BattleSystem 持有，resetBattle 时清空（在 lifecycleManager.resetBattle 之前）。
 * 不修改 BattleEntity 接口（约束 C1）。
 */
export class ThreatManager {
  /** 仇恨表：key = 被攻击者 ID，value = Map<攻击者 ID, 仇恨值> */
  private threatTables = new Map<string, Map<string, number>>()
  private damageCoeff = 1.0
  private tauntMultiplier = 3.0
  private decayPerTurn = 0.1

  configure(coeffs: {
    damageCoeff?: number
    tauntMultiplier?: number
    decayPerTurn?: number
  }): void {
    this.damageCoeff = coeffs.damageCoeff ?? this.damageCoeff
    this.tauntMultiplier = coeffs.tauntMultiplier ?? this.tauntMultiplier
    this.decayPerTurn = coeffs.decayPerTurn ?? this.decayPerTurn
  }

  /**
   * 记录仇恨：攻击者 attacker 对目标 target 造成 damage 伤害
   * fix F3：嘲讽者（target）生成额外仇恨
   */
  recordThreat(
    attackerId: string,
    targetId: string,
    damage: number,
    targetHasTaunt: boolean,
  ): void {
    if (!this.threatTables.has(targetId)) {
      this.threatTables.set(targetId, new Map())
    }
    const table = this.threatTables.get(targetId)!
    const current = table.get(attackerId) ?? 0
    let threat = damage * this.damageCoeff
    if (targetHasTaunt) {
      threat *= this.tauntMultiplier
    }
    table.set(attackerId, current + threat)
  }

  /** 获取 entityId 仇恨值最高的候选敌方 ID */
  getHighestThreatTarget(entityId: string, candidates: string[]): string | null {
    const table = this.threatTables.get(entityId)
    if (!table || table.size === 0) return null
    let bestId: string | null = null
    let bestThreat = -1
    for (const candId of candidates) {
      const threat = table.get(candId) ?? 0
      if (threat > bestThreat) {
        bestThreat = threat
        bestId = candId
      }
    }
    return bestId
  }

  tickDecay(): void {
    for (const table of this.threatTables.values()) {
      for (const [id, threat] of table) {
        const newThreat = threat * (1 - this.decayPerTurn)
        if (newThreat < 1) table.delete(id)
        else table.set(id, newThreat)
      }
    }
  }

  reset(): void {
    this.threatTables.clear()
  }
}
