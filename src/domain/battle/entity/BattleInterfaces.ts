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
} from '@/domain/battle/type/types'

import type { BattleAI } from '@/domain/battle/ai/BattleAI'

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
   * @param rng 可选确定性随机源（未传时回退 Math.random）
   * @returns 按速度排序的参与者ID数组
   */
  createTurnOrder(
    participants: BattleEntity[],
    rng?: import('@/shared/utils/SeededRandom').SeededRandom,
  ): string[]

  /**
   * 初始化战斗的回合信息
   * @param battle 战斗数据
   * @param turnOrder 参与者ID数组，按速度从高到低排序
   */
  initializeBattle(battle: BattleData, turnOrder: string[]): void
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
}

// 依赖注入令牌
// 用于依赖注入系统，确保模块间的松耦合
export const BATTLE_SYSTEM_TOKEN = Symbol('BattleSystem')
export const TURN_MANAGER_TOKEN = Symbol('TurnManager')
export const AI_SYSTEM_TOKEN = Symbol('AISystem')
export const BATTLE_RECORDER_TOKEN = Symbol('BattleRecorder')
export const BATTLE_RULE_MANAGER_TOKEN = Symbol('BattleRuleManager')
