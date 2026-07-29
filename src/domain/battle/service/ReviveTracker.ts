/**
 * 复活追踪器 — 管理每名角色的复活次数和冷却
 *
 * 由 BattleSystem 持有，resetBattle 时清空。
 * 不修改 BattleEntity 接口（约束 C1）。
 */
export interface ReviveRecord {
  count: number
  cooldownRemaining: number
}

export class ReviveTracker {
  private records = new Map<string, ReviveRecord>()

  canRevive(entityId: string, maxRevives: number): boolean {
    const rec = this.records.get(entityId)
    if (!rec) return true
    return rec.count < maxRevives && rec.cooldownRemaining <= 0
  }

  recordRevive(entityId: string, cooldown: number): void {
    const rec = this.records.get(entityId) ?? { count: 0, cooldownRemaining: 0 }
    rec.count++
    rec.cooldownRemaining = cooldown
    this.records.set(entityId, rec)
  }

  tickCooldowns(): void {
    for (const rec of this.records.values()) {
      if (rec.cooldownRemaining > 0) rec.cooldownRemaining--
    }
  }

  getReviveCount(entityId: string): number {
    return this.records.get(entityId)?.count ?? 0
  }

  reset(): void {
    this.records.clear()
  }
}
