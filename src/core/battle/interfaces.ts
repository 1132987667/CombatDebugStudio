// 战斗系统核心接口定义

// 类型导入
import type {
  BattleState,
  BattleAction,
  BattleParticipant,
  BattleEntityType,
  ParticipantInfo,
} from '@/types/battle'

import type { BattleAI } from '@/core/BattleAI'

/**
 * 战斗系统接口
 * 定义了战斗系统的核心功能，包括战斗创建、执行、查询和管理
 */
export interface IBattleSystem {
  /**
   * 创建新的战斗
   * @param participantsInfo - 参与者信息数组
   * @returns BattleState - 创建的战斗状态
   */
  createBattle(participantsInfo: ParticipantInfo[]): BattleState

  /**
   * 处理战斗回合
   * @param battleId - 战斗ID
   * @returns Promise<void> - 异步处理完成
   */
  processTurn(battleId: string): Promise<void>

  /**
   * 执行战斗动作
   * @param action - 要执行的战斗动作
   * @returns Promise<BattleAction> - 执行后的动作结果
   */
  executeAction(action: BattleAction): Promise<BattleAction>

  /**
   * 获取战斗状态
   * @param battleId - 战斗ID
   * @returns BattleState | undefined - 战斗状态，如果不存在则返回undefined
   */
  getBattleState(battleId: string): BattleState | undefined

  /**
   * 结束战斗
   * @param battleId - 战斗ID
   * @param winner - 胜利者类型
   */
  endBattle(battleId: string, winner: BattleEntityType): void

  /**
   * 获取所有战斗
   * @returns BattleState[] - 所有战斗状态的数组
   */
  getAllBattles(): BattleState[]

  /**
   * 获取活跃战斗
   * @returns BattleState[] - 活跃战斗状态的数组
   */
  getActiveBattles(): BattleState[]

  /**
   * 清理已完成战斗
   */
  clearCompletedBattles(): void

  /**
   * 回合执行完成回调
   * @param battleId - 战斗ID
   * @param turn - 回合标识
   */
  onTurnExecuted(battleId: string, turn: number): void

  /**
   * 自动战斗相关方法
   */

  /**
   * 开始自动战斗
   * @param battleId - 战斗ID
   * @param speed - 自动战斗速度（1-10）
   */
  startAutoBattle(battleId: string, speed: number): void

  /**
   * 停止自动战斗
   * @param battleId - 战斗ID
   */
  stopAutoBattle(battleId: string): void

  /**
   * 检查是否处于自动战斗状态
   * @param battleId - 战斗ID
   * @returns boolean - 是否处于自动战斗状态
   */
  isAutoBattleActive(battleId: string): boolean

  /**
   * 设置自动战斗速度
   * @param battleId - 战斗ID
   * @param speed - 新的自动战斗速度（1-10）
   */
  setAutoBattleSpeed(battleId: string, speed: number): void
}

/**
 * 回合管理器接口
 * 负责管理战斗回合的推进和计算
 */
export interface ITurnManager {
  /**
   * 计算下一回合的行动者
   * @param battleId - 战斗ID
   * @returns string | null - 下一回合行动者的ID，如果没有则返回null
   */
  calculateNextTurn(battleId: string): string | null

  /**
   * 获取当前回合数
   * @param battleId - 战斗ID
   * @returns number - 当前回合数
   */
  getCurrentTurn(battleId: string): number

  /**
   * 推进回合
   * @param battleId - 战斗ID
   */
  advanceTurn(battleId: string): void
}

/**
 * 动作执行器接口
 * 负责执行和验证战斗动作
 */
export interface IActionExecutor {
  /**
   * 执行战斗动作
   * @param action - 要执行的战斗动作
   * @returns Promise<void> - 异步执行完成
   */
  executeAction(action: BattleAction): Promise<void>

  /**
   * 验证战斗动作是否有效
   * @param action - 要验证的战斗动作
   * @returns boolean - 动作是否有效
   */
  validateAction(action: BattleAction): boolean
}

/**
 * 参与者管理器接口
 * 负责管理战斗参与者的创建、查询和更新
 */
export interface IParticipantManager {
  /**
   * 创建战斗参与者
   * @param info - 参与者信息
   * @returns BattleParticipant - 创建的参与者对象
   */
  createParticipant(info: ParticipantInfo): BattleParticipant

  /**
   * 获取战斗参与者
   * @param battleId - 战斗ID
   * @param participantId - 参与者ID
   * @returns BattleParticipant | undefined - 参与者对象，如果不存在则返回undefined
   */
  getParticipant(
    battleId: string,
    participantId: string,
  ): BattleParticipant | undefined

  /**
   * 更新战斗参与者
   * @param battleId - 战斗ID
   * @param participantId - 参与者ID
   * @param updates - 要更新的属性
   */
  updateParticipant(
    battleId: string,
    participantId: string,
    updates: Partial<BattleParticipant>,
  ): void
}

/**
 * AI系统接口
 * 负责创建AI实例并做出战斗决策
 */
export interface IAISystem {
  /**
   * 创建AI实例
   * @param participants - 参与者映射表
   * @returns Map<string, BattleAI> - AI实例映射表
   */
  createAIInstances(
    participants: Map<string, BattleParticipant>,
  ): Map<string, BattleAI>

  /**
   * 做出战斗决策
   * @param battleState - 当前战斗状态
   * @param participant - 当前参与者
   * @returns BattleAction - 决策的战斗动作
   */
  makeDecision(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAction

  /**
   * 选择攻击目标
   * @param battleState - 当前战斗状态
   * @param participant - 当前参与者
   * @returns string - 目标参与者ID
   */
  selectTarget(battleState: BattleState, participant: BattleParticipant): string

  /**
   * 判断是否应该使用技能
   * @param participant - 当前参与者
   * @returns boolean - 是否应该使用技能
   */
  shouldUseSkill(participant: BattleParticipant): boolean
}

// 依赖注入令牌
// 用于依赖注入系统，确保模块间的松耦合
export const BATTLE_SYSTEM_TOKEN = Symbol('BattleSystem')
export const TURN_MANAGER_TOKEN = Symbol('TurnManager')
export const ACTION_EXECUTOR_TOKEN = Symbol('ActionExecutor')
export const PARTICIPANT_MANAGER_TOKEN = Symbol('ParticipantManager')
export const AI_SYSTEM_TOKEN = Symbol('AISystem')
