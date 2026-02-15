/**
 * 文件: AISystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: AI系统
 * 描述: 负责创建AI实例、做出战斗决策、选择目标和使用技能，实现了IAISystem接口，处理AI的智能行为逻辑
 * 版本: 1.0.0
 */

import type {
  BattleParticipant,
  BattleState,
  BattleAction,
  BattleData,
} from '@/types/battle'
import { BATTLE_CONSTANTS } from '@/types/battle'
import { BattleAIFactory, BattleAI } from '../BattleAI'
import type { IActionExecutor } from './interfaces'

/**
 * AI系统类
 * 负责创建AI实例、做出战斗决策、选择目标和使用技能
 * 实现了IAISystem接口，处理AI的智能行为逻辑
 */
export class AISystem {
  /** AI实例存储映射，以参与者ID为键，用于缓存和复用 */
  private aiInstances = new Map<string, BattleAI>()

  /**
   * 创建AI实例集合
   * 为每个参与者创建对应类型的AI实例，并缓存到管理器中
   * @param participants - 参与者映射表，包含所有需要AI控制的参与者
   * @returns Map<string, BattleAI> - 以参与者ID为键的AI实例映射表
   */
  public createAIInstances(
    participants: Map<string, BattleParticipant>,
  ): Map<string, BattleAI> {
    const aiInstances = new Map<string, BattleAI>()

    participants.forEach((participant) => {
      const ai = BattleAIFactory.createAI(participant.type)
      aiInstances.set(participant.id, ai)
      this.aiInstances.set(participant.id, ai)
    })

    return aiInstances
  }

  /**
   * 获取或创建AI实例
   * 如果参与者已有AI实例则返回，否则创建新的AI实例
   * @param participant - 需要AI实例的参与者
   * @returns BattleAI | null - AI实例，如果无法创建返回null
   */
  private getOrCreateAI(participant: BattleParticipant): BattleAI | null {
    let ai = this.aiInstances.get(participant.id)

    if (!ai) {
      ai = BattleAIFactory.createAI(participant.type)
      this.aiInstances.set(participant.id, ai)
    }

    return ai
  }

  /**
   * 做出战斗决策
   * 根据当前战斗状态和参与者信息，生成最优的战斗动作
   * @param battleState - 当前战斗状态，包含所有参与者信息和回合状态
   * @param participant - 当前需要决策的参与者
   * @returns BattleAction - 生成的战斗动作，包含攻击目标、技能选择等
   */
  public makeDecision(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAction {
    const ai = this.getOrCreateAI(participant)
    if (!ai) {
      throw new Error(`Failed to create AI for participant: ${participant.id}`)
    }

    return ai.makeDecision(battleState, participant)
  }

  /**
   * 执行AI动作
   * 综合决策、目标选择和动作执行，生成并执行完整的AI回合动作
   * @param battle - 当前战斗数据对象
   * @param participant - 当前执行动作的参与者
   * @param actionExecutor - 动作执行器实例，用于执行生成的战斗动作
   * @returns Promise<void> - 异步执行，完成后无返回值
   */
  public async executeAIAction(
    battle: BattleData,
    participant: BattleParticipant,
    actionExecutor: IActionExecutor,
  ): Promise<void> {
    const ai = this.getOrCreateAI(participant)
    if (!ai) {
      await actionExecutor.executeDefaultAction(battle, participant)
      return
    }

    const battleState = this.convertToBattleState(battle)
    const action = ai.makeDecision(battleState, participant)
    action.turn = battle.currentTurn + 1

    const target = battle.participants.get(action.targetId)
    if (target && target.isAlive()) {
      await actionExecutor.executeAction(action)
    } else {
      await actionExecutor.executeDefaultAction(battle, participant)
    }
  }

  /**
   * 移除单个AI实例
   * 当参与者被移除或死亡时，清理其对应的AI实例缓存
   * @param participantId - 要移除AI实例的参与者ID
   */
  public removeAI(participantId: string): void {
    this.aiInstances.delete(participantId)
  }

  /**
   * 清空所有AI实例
   * 在系统重置或大规模清理时调用
   */
  public clearAllAI(): void {
    this.aiInstances.clear()
  }

  /**
   * 转换为战斗状态
   * 将内部BattleData转换为BattleState，用于AI决策
   * 私有方法，仅在AI决策过程中调用
   * @param battle - 战斗数据对象
   * @returns BattleState - 转换后的战斗状态对象
   */
  private convertToBattleState(battle: BattleData): BattleState {
    return {
      battleId: battle.battleId,
      participants: new Map(battle.participants),
      actions: [...battle.actions],
      turnOrder: [...battle.turnOrder],
      currentTurn: battle.currentTurn,
      isActive: battle.isActive,
      startTime: 0,
      endTime: undefined,
      winner: undefined,
    }
  }
}
