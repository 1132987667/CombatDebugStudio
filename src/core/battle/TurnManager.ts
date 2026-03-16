/**
 * 文件: TurnManager.ts
 * 创建日期: 2026-02-09
 * 功能: 回合管理器
 * 描述: 负责管理战斗回合的初始化、推进和查询，实现了ITurnManager接口，处理回合顺序和回合计数
 */

import type { BattleParticipant, BattleData } from '@/types/battle'
import { BuffSystem } from '@/core/BuffSystem'
import { ModifierStack } from '@/core/ModifierStack'
import type { AttributeType } from '@/types/modifier'

/**
 * 回合管理器类
 * 负责管理战斗回合的初始化、推进和查询
 * 是回合数据的唯一数据源
 * 推荐通过容器注入使用
 */
export class TurnManager {
  private buffSystem: BuffSystem

  /**
   * 私有构造函数
   * @param buffSystem Buff系统实例（通过构造函数注入）
   */
  constructor(buffSystem: BuffSystem) {
    this.buffSystem = buffSystem
  }

  /**
   * 根据参与者有效速度创建回合顺序
   * 速度高的参与者排在前面，相同速度时随机排序
   * @param participants 参与者数组
   * @returns 按速度排序的参与者ID数组
   */
  public createTurnOrder(participants: BattleParticipant[]): string[] {
    return participants
      .filter((p) => p.isAlive())
      .sort((a, b) => {
        const speedA = this.calculateEffectiveSpeed(a)
        const speedB = this.calculateEffectiveSpeed(b)

        if (speedA !== speedB) {
          return speedB - speedA
        }

        return Math.random() - 0.5
      })
      .map((p) => p.id)
  }

  /**
   * 重新计算回合顺序
   * 考虑所有角色的实际属性值（包括Buff效果）后重新排序
   * 速度高的参与者排在前面，相同速度时随机排序
   * @param battle 战斗数据
   * @returns 按实际速度排序的参与者ID数组
   */
  public recalculateTurnOrder(battle: BattleData): string[] {
    const participants = Array.from(battle.participants.values()).filter(
      (p) => p.isAlive(),
    )

    return participants
      .sort((a, b) => {
        const speedA = this.calculateEffectiveSpeed(a)
        const speedB = this.calculateEffectiveSpeed(b)

        if (speedA !== speedB) {
          return speedB - speedA
        }

        return Math.random() - 0.5
      })
      .map((p) => p.id)
  }

  /**
   * 计算考虑Buff修饰符后的实际速度
   * @param participant 参与者
   * @returns 考虑所有修饰符后的实际速度值
   */
  public calculateEffectiveSpeed(participant: BattleParticipant): number {
    const baseSpeed = participant.getAttribute('SPD')

    const modifierStack = this.buffSystem.getModifierStack(participant.id)

    return modifierStack.calculate('SPD' as AttributeType, baseSpeed)
  }
}
