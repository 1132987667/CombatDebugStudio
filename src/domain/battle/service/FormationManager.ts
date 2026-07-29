/**
 * 阵型管理器 — 管理阵型配置、Buff 施加与清理
 *
 * 约束 C2：不走 DI，BattleSystem 构造函数内直接创建。
 * 约束 C1：不修改 BattleEntity 接口，阵型信息由本管理器维护。
 */
import type { FormationConfig } from '@/shared/types/formation'
import { ParticipantSide, type BattleEntity } from '@/domain/battle/type/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'

export class FormationManager {
  private allyFormation: FormationConfig | null = null
  private enemyFormation: FormationConfig | null = null
  /** 已施加的阵型 Buff 实例 ID，用于精确清理（修复 S2） */
  private appliedBuffIds: string[] = []

  applyFormation(
    side: ParticipantSide,
    config: FormationConfig,
    participants: BattleEntity[],
    buffSystem: BuffSystem,
  ): void {
    if (side === ParticipantSide.ALLY) this.allyFormation = config
    else this.enemyFormation = config

    for (const p of participants) {
      const slot = config.slots.find(s => s.index === p.seatIndex)
      if (!slot) continue

      for (const effect of config.effects) {
        if (effect.condition === 'all' || effect.condition === slot.row) {
          // 通过 BuffSystem.addBuff 施加阵型 Buff，走完整 effectPlan 管道（修复 F1）
          const instanceId = buffSystem.addBuff(
            p.id,
            effect.buffId,
            { duration: -1, dispellable: false },
            0,
          )
          if (instanceId) this.appliedBuffIds.push(instanceId)
        }
      }
    }
  }

  getRow(side: ParticipantSide, seatIndex: number): 'front' | 'back' | null {
    const formation = side === ParticipantSide.ALLY ? this.allyFormation : this.enemyFormation
    if (!formation) return null
    const slot = formation.slots.find(s => s.index === seatIndex)
    return slot?.row ?? null
  }

  hasFrontProtection(side: ParticipantSide): boolean {
    const formation = side === ParticipantSide.ALLY ? this.allyFormation : this.enemyFormation
    return formation?.frontProtection ?? false
  }

  /** 通过 buffSystem.removeBuff 精确移除阵型 Buff（修复 S2） */
  removeAll(buffSystem: BuffSystem): void {
    for (const instanceId of this.appliedBuffIds) {
      buffSystem.removeBuff(instanceId)
    }
    this.appliedBuffIds = []
    this.allyFormation = null
    this.enemyFormation = null
  }

  reset(): void {
    this.allyFormation = null
    this.enemyFormation = null
    this.appliedBuffIds = []
  }
}
