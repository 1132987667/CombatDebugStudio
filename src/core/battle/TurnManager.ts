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
 */
export class TurnManager {
  private buffSystem = BuffSystem.getInstance()

  /**
   * 获取当前回合数
   * @param battle 战斗数据
   * @returns 当前回合索引（从0开始）
   */
  public getCurrentTurn(battle: BattleData): number {
    return battle.currentTurn
  }

  /**
   * 获取当前回合编号（从1开始，供显示用）
   * @param battle 战斗数据
   * @returns 当前回合编号
   */
  public getTurnNumber(battle: BattleData): number {
    return battle.currentRound || 1
  }

  /**
   * 获取当前回合的参与者ID
   * 自动跳过死亡角色，直到找到存活的参与者或回到起点
   * @param battle 战斗数据
   * @param participants 参与者映射
   * @returns 当前回合参与者的ID，如果没有存活参与者则返回null
   */
  public getCurrentParticipantId(
    battle: BattleData,
    participants: Map<string, BattleParticipant>,
  ): string | null {
    if (battle.turnOrder.length === 0) {
      return null
    }

    const startIndex = battle.currentTurn % battle.turnOrder.length
    let checkedCount = 0

    while (checkedCount < battle.turnOrder.length) {
      const index = (startIndex + checkedCount) % battle.turnOrder.length
      const participantId = battle.turnOrder[index]
      const participant = participants.get(participantId)

      if (participant && participant.isAlive()) {
        return participantId
      }

      checkedCount++
    }

    return null
  }

  /**
   * 推进到下一回合
   * @param battle 战斗数据
   */
  public advanceTurn(battle: BattleData): void {
    if (battle.turnOrder.length === 0) {
      return
    }

    battle.currentTurn = (battle.currentTurn + 1) % battle.turnOrder.length
  }

  /**
   * 根据参与者基础速度创建回合顺序
   * 速度高的参与者排在前面，相同速度时随机排序
   * @param participants 参与者数组
   * @returns 按速度排序的参与者ID数组
   */
  public createTurnOrder(participants: BattleParticipant[]): string[] {
    return participants
      .filter((p) => p.isAlive())
      .sort((a, b) => this.compareSpeed(a, b))
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

  /**
   * 获取当前回合顺序数组
   * @param battle 战斗数据
   * @returns 参与者ID数组
   */
  public getTurnOrder(battle: BattleData): string[] {
    return [...battle.turnOrder]
  }

  /**
   * 设置回合顺序
   * @param battle 战斗数据
   * @param turnOrder 新的回合顺序
   */
  public setTurnOrder(battle: BattleData, turnOrder: string[]): void {
    battle.turnOrder = turnOrder
    battle.currentTurn = 0
  }

  /**
   * 初始化战斗的回合信息
   * @param battle 战斗数据
   * @param turnOrder 参与者ID数组，按速度从高到低排序
   */
  public initializeBattle(battle: BattleData, turnOrder: string[]): void {
    battle.turnOrder = turnOrder
    battle.currentTurn = 0
  }

  /**
   * 比较两个参与者的速度
   * @param a 第一个参与者
   * @param b 第二个参与者
   * @returns 正数表示b速度更高，负数表示a速度更高，0表示速度相同
   */
  private compareSpeed(a: BattleParticipant, b: BattleParticipant): number {
    const speedA = a.getAttribute('SPD') || 0
    const speedB = b.getAttribute('SPD') || 0

    if (speedA !== speedB) {
      return speedB - speedA
    }

    return Math.random() - 0.5
  }
}
