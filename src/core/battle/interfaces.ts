/**
 * 文件: interfaces.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗系统核心接口定义
 * 描述: 定义战斗系统的核心接口，包括战斗系统、回合管理器、动作执行器、参与者管理器、AI系统等
 * 版本: 1.0.0
 */

// 战斗系统核心接口定义

// 类型导入
import type {
  BattleState,
  BattleAction,
  BattleParticipant,
  BattleData,
  ParticipantSide,
} from '@/types/battle'

import type { BattleAI } from '@/core/BattleAI'

/**
 * 战斗系统接口
 * 定义了战斗系统的核心功能，包括战斗创建、执行、查询和管理
 */
export interface IBattleSystem {
  /**
   * 创建新的战斗
   * @param participantsInfo - 参与者数组
   * @returns BattleState - 创建的战斗状态
   */
  createBattle(participantsInfo: BattleParticipant[]): BattleState

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
  endBattle(battleId: string, winner: ParticipantSide): void

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
  startAutoBattle(): void

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
  setBattleSpeed(battleId: string, speed: number): void

  /**
   * 获取当前战斗数据
   * @param battleId - 战斗ID
   * @returns BattleData | undefined - 战斗数据，如果不存在则返回undefined
   */
  getCurBattleData(): BattleData | undefined

  /**
   * 获取当前战斗的参与者信息
   * @returns BattleParticipant[] - 当前战斗的参与者数组
   */
  getCurParticipantsInfo(): BattleParticipant[]

  /**
   * 重置当前战斗
   * @param battleId - 战斗ID
   */
  resetBattle(battleId: string): void

  /**
   * 事件监听方法
   * @param event - 事件名称
   * @param callback - 回调函数
   */
  on(event: string, callback: Function): void

  /**
   * 移除事件监听方法
   * @param event - 事件名称
   * @param callback - 回调函数
   */
  off(event: string, callback: Function): void
}

/**
 * 回合管理器接口
 * 负责管理战斗回合的初始化、推进和查询
 */
export interface ITurnManager {
  /**
   * 获取当前回合数
   * @param battle 战斗数据
   * @returns 当前回合索引（从0开始）
   */
  getCurrentTurn(battle: BattleData): number

  /**
   * 获取当前回合编号（从1开始，供显示用）
   * @param battle 战斗数据
   * @returns 当前回合编号
   */
  getTurnNumber(battle: BattleData): number

  /**
   * 获取当前回合的参与者ID
   * 自动跳过死亡角色，直到找到存活的参与者或回到起点
   * @param battle 战斗数据
   * @param participants 参与者映射
   * @returns 当前回合参与者的ID，如果没有存活参与者则返回null
   */
  getCurrentParticipantId(
    battle: BattleData,
    participants: Map<string, BattleParticipant>,
  ): string | null

  /**
   * 推进到下一回合
   * @param battle 战斗数据
   */
  advanceTurn(battle: BattleData): void

  /**
   * 根据参与者速度创建回合顺序
   * @param participants 参与者数组
   * @returns 按速度排序的参与者ID数组
   */
  createTurnOrder(participants: BattleParticipant[]): string[]

  /**
   * 初始化战斗的回合信息
   * @param battle 战斗数据
   * @param turnOrder 参与者ID数组，按速度从高到低排序
   */
  initializeBattle(battle: BattleData, turnOrder: string[]): void
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
export const AI_SYSTEM_TOKEN = Symbol('AISystem')
