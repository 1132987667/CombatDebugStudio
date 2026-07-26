import type { BattleEntity } from '@/domain/battle/type/types'

interface DamageEntry {
  target: BattleEntity
  damage: number
  heal: number
  /** 减免前原始伤害（供 DAMAGE_TAKEN 事件发射使用） */
  rawDamage: number
}

/**
 * 延迟伤害令牌
 * ponytail: 替代全局 deferDamage toggle — 每次技能执行创建新 token，
 * 调用方在动画完成后调用 applyAll() 统一扣血。token 随作用域自动回收，
 * 异常路径漏调 applyAll 最多丢单次伤害，不会污染全局状态。
 */
export class DeferredDamageToken {
  private entries: DamageEntry[] = []
  private applied = false
  /** ponytail: applyAll 后的快照，供后续 getTotalDamage/getTotalHeal 查询 */
  private totalDamageSnapshot = 0
  private totalHealSnapshot = 0

  record(target: BattleEntity, damage: number, heal: number = 0, rawDamage?: number): void {
    this.entries.push({ target, damage, heal, rawDamage: rawDamage ?? damage })
  }

  /** 获取所有记录条目（供 BattleExecutor 遍历扣血并发射事件） */
  getEntries(): ReadonlyArray<DamageEntry> {
    return this.entries
  }

  /** 清空记录条目（在手动遍历扣血后调用，替代 applyAll） */
  clear(): void {
    this.entries = []
  }

  /** 统一应用所有记录的伤害/治疗，首次调用后锁定 */
  applyAll(): void {
    if (this.applied) return
    this.applied = true
    let totalDmg = 0
    let totalHeal = 0
    for (const entry of this.entries) {
      if (!entry.target.isAlive()) continue
      if (entry.damage > 0) {
        entry.target.takeDamage(entry.damage)
      }
      if (entry.heal > 0) {
        entry.target.heal(entry.heal)
      }
      totalDmg += entry.damage
      totalHeal += entry.heal
    }
    this.totalDamageSnapshot = totalDmg
    this.totalHealSnapshot = totalHeal
    this.entries = []
  }

  /** 累计总伤害（applyAll 前后均可调用） */
  getTotalDamage(): number {
    if (this.applied) return this.totalDamageSnapshot
    return this.entries.reduce((sum, e) => sum + e.damage, 0)
  }

  /** 累计总治疗（applyAll 前后均可调用） */
  getTotalHeal(): number {
    if (this.applied) return this.totalHealSnapshot
    return this.entries.reduce((sum, e) => sum + e.heal, 0)
  }
}
