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
  BattleEntity,
  BattleData,
  ParticipantSide,
} from '@/domain/battle/types'

import type { BattleAI } from '@/domain/battle/ai/BattleAI'
import type { BuffSystem } from '@/domain/buff/BuffSystem'

/**
 * 战斗系统接口
 * 定义了战斗系统的核心功能，包括战斗创建、执行、查询和管理
 */
export interface IBattleSystem {
  /**
   * 初始化战斗
   * @param allyParticipants - 参与者数组
   * @param enemyParticipants - 参与者数组
   * @returns BattleState - 初始化后的战斗状态
   */
  initialize(
    allyParticipants: BattleEntity[],
    enemyParticipants: BattleEntity[],
  ): BattleState

  /**
   * 处理战斗回合
   * @returns Promise<void> - 异步处理完成
   */
  processTurn(): Promise<void>

  /**
   * 执行战斗动作
   * @param action - 要执行的战斗动作
   * @returns Promise<BattleAction> - 执行后的动作结果
   */
  executeAction(action: BattleAction): Promise<BattleAction>

  /**
   * 获取战斗状态
   * @returns BattleState | undefined - 战斗状态，如果不存在则返回undefined
   */
  getBattleState(): BattleState | undefined

  /**
   * 结束战斗
   * @param winner - 胜利者类型
   */
  endBattle(winner: ParticipantSide): void

  /**
   * 重置当前战斗
   */
  resetBattle(): void

  /**
   * 回合执行完成回调
   * @param turn - 回合标识
   */
  onTurnExecuted(turn: number): void

  /**
   * 自动战斗相关方法
   */

  /**
   * 开始自动战斗
   */
  startBattle(): Promise<void>

  /**
   * 停止自动战斗
   */
  stopAutoBattle(): void

  /**
   * 设置自动战斗速度
   * @param speed - 新的自动战斗速度（1-10）
   */
  setBattleSpeed(speed: number): void

  /**
   * 获取当前是否处于自动战斗状态
   * @returns 是否处于自动战斗状态
   */
  getAutoBattle(): boolean

  /**
   * 获取当前是否处于暂停状态
   * @returns 是否处于暂停状态
   */
  getIsPaused(): boolean

  /**
   * 获取当前战斗速度倍率
   * @returns 战斗速度倍率
   */
  getBattleSpeed(): number

  /**
   * 设置战斗速度倍率
   * @param speed 战斗速度倍率
   */
  setSpeed(speed: number): void

  /**
   * 切换暂停状态
   */
  togglePause(): void

  /**
   * 获取当前战斗数据
   * @returns BattleData | undefined - 战斗数据，如果不存在则返回undefined
   */
  getBattleData(): BattleData | undefined

  /**
   * 获取当前战斗的参与者信息
   * @returns BattleEntity[] - 当前战斗的参与者数组
   */
  getCurParticipantsInfo(): BattleEntity[]

  /**
   * 加载技能配置
   * @param skillConfigs 技能配置数组
   */
  loadSkillConfigs(skillConfigs: any[]): void

  /**
   * 获取当前回合数
   * @returns 当前回合数（从1开始）
   */
  getRound(): number

  /**
   * 获取Buff系统实例
   * @returns Buff系统实例
   */
  getBuffSystem(): BuffSystem

  /**
   * 触发单个角色的被动技能
   * 用于在调试面板中动态添加角色时触发被动技能
   * @param participant 参与者
   */
  triggerPassiveSkillsForCharacter(participant: BattleEntity): void

  /**
   * 从当前战斗状态生成命令序列（第三阶段）
   * 将 BattleSystem 从状态修改器转变为命令生成器
   * @returns BattleCommand[] 命令序列
   */
  generateCommandsForTurn(): import('@/shared/types/battle-commands').BattleCommand[]

  /**
   * 推进到下一回合（递增回合计数器）
   * ponytail: 从 generateCommandsForTurn 中抽取，消除命令生成器的副作用
   */
  advanceRound(): void
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
    participants: Map<string, BattleEntity>,
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
  createTurnOrder(participants: BattleEntity[]): string[]

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

  /**
   * 执行默认动作
   * 当AI决策失败或需要默认行为时执行
   * @param battle - 当前战斗数据
   * @param participant - 执行动作的参与者
   * @returns Promise<void> - 异步执行完成
   */
  executeDefaultAction(
    battle: BattleData,
    participant: BattleEntity,
  ): Promise<void>
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
    participants: Map<string, BattleEntity>,
  ): Map<string, BattleAI>

  /**
   * 做出战斗决策
   * @param battleState - 当前战斗状态
   * @param participant - 当前参与者
   * @returns BattleAction - 决策的战斗动作
   */
  makeDecision(
    battleState: BattleState,
    participant: BattleEntity,
  ): BattleAction

  /**
   * 执行AI动作
   * 综合决策、目标选择和动作执行
   * @param battle - 当前战斗数据
   * @param participant - 当前参与者
   * @param actionExecutor - 动作执行器
   * @returns Promise<void> - 异步执行完成
   */
  executeAIAction(
    battle: BattleData,
    participant: BattleEntity,
    actionExecutor: IActionExecutor,
  ): Promise<void>
}

// 依赖注入令牌
// 用于依赖注入系统，确保模块间的松耦合
export const BATTLE_SYSTEM_TOKEN = Symbol('BattleSystem')
export const TURN_MANAGER_TOKEN = Symbol('TurnManager')
export const ACTION_EXECUTOR_TOKEN = Symbol('ActionExecutor')
export const AI_SYSTEM_TOKEN = Symbol('AISystem')
export const BATTLE_RECORDER_TOKEN = Symbol('BattleRecorder')
export const BATTLE_RULE_MANAGER_TOKEN = Symbol('BattleRuleManager')
