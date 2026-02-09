/**
 * 文件: TurnManager.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 回合管理器
 * 描述: 负责管理战斗回合的初始化、推进和查询，实现了ITurnManager接口，处理回合顺序和回合计数
 * 版本: 1.0.0
 */

import type { BattleParticipant } from '@/types/battle'

/**
 * 战斗回合数据接口
 * 存储单个战斗的回合状态信息
 */
interface BattleData {
  /** 当前回合索引，从0开始 */
  currentTurn: number
  /** 回合顺序数组，存储参与者ID，按速度排序 */
  turnOrder: string[]
  /** 战斗是否处于活跃状态 */
  isActive: boolean
}

/**
 * 回合管理器类
 * 负责管理战斗回合的初始化、推进和查询
 * 实现了ITurnManager接口，处理回合顺序和回合计数
 */
export class TurnManager {
  /** 战斗数据存储映射，以battleId为键 */
  private battles = new Map<string, BattleData>()

  /**
   * 初始化战斗的回合信息
   * 在战斗创建时调用，设置初始回合顺序
   * @param battleId - 战斗的唯一标识符
   * @param turnOrder - 参与者ID数组，按速度从高到低排序
   */
  public initializeBattle(battleId: string, turnOrder: string[]): void {
    this.battles.set(battleId, {
      currentTurn: 0,
      turnOrder: turnOrder,
      isActive: true,
    })
  }

  /**
   * 计算并推进到下一回合
   * 自动增加回合索引，超出数组范围时循环回0
   * @param battleId - 战斗的唯一标识符
   * @returns 下一回合参与者的ID，如果战斗不存在或已结束则返回null
   */
  public calculateNextTurn(battleId: string): string | null {
    const battle = this.battles.get(battleId)
    if (!battle || !battle.isActive) {
      return null
    }

    battle.currentTurn++
    if (battle.currentTurn >= battle.turnOrder.length) {
      battle.currentTurn = 0
    }

    if (battle.currentTurn < battle.turnOrder.length) {
      return battle.turnOrder[battle.currentTurn]
    }
    return null
  }

  /**
   * 获取当前回合号
   * @param battleId - 战斗的唯一标识符
   * @returns 当前回合索引，如果战斗不存在则返回0
   */
  public getCurrentTurn(battleId: string): number {
    const battle = this.battles.get(battleId)
    return battle?.currentTurn ?? 0
  }

  /**
   * 推进到下一回合
   * 仅更新回合索引，不返回下一参与者ID
   * @param battleId - 战斗的唯一标识符
   */
  public advanceTurn(battleId: string): void {
    const battle = this.battles.get(battleId)
    if (!battle) return

    battle.currentTurn++
    if (battle.currentTurn >= battle.turnOrder.length) {
      battle.currentTurn = 0
    }
  }

  /**
   * 根据参与者速度创建回合顺序
   * 速度高的参与者排在前面，相同速度时随机排序
   * @param participants - 参与战斗的参与者数组
   * @returns 按速度排序的参与者ID数组
   */
  public createTurnOrder(participants: BattleParticipant[]): string[] {
    return participants.sort((a, b) => this.compareSpeed(a, b)).map((p) => p.id)
  }

  /**
   * 移除战斗数据
   * 在战斗结束时调用，清理占用的内存
   * @param battleId - 要移除的战斗ID
   */
  public removeBattle(battleId: string): void {
    this.battles.delete(battleId)
  }

  /**
   * 比较两个参与者的速度
   * 私有方法，仅在createTurnOrder中调用
   * @param a - 第一个参与者
   * @param b - 第二个参与者
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
