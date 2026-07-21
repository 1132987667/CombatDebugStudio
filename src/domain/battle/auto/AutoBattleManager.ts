import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStateManager } from '@/domain/battle/state/BattleStateManager'
import { LogLevel } from '@/shared/types/battle-log'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

/**
 * 自动战斗管理器
 * 负责自动战斗的控制、状态管理和错误处理
 * @description 该类是战斗系统的核心组件之一，主要提供自动战斗的启动、停止、速度控制、单回合执行等功能
 *              支持暂停/恢复机制，允许用户在自动战斗过程中进行干预
 *              与BattleSystem配合实现战斗自动化，与BattleStateManager同步战斗状态
 * @see BattleManager 主战斗管理器，负责协调各子管理器
 * @see BattleStateManager 战斗状态管理器，用于同步战斗状态
 * @see BattleSystem 战斗系统核心实现，定义战斗核心操作
 */
export class AutoBattleManager {
  /**
   * 战斗系统实例，负责核心战斗逻辑执行
   */
  private battleSystem: BattleSystem
  /**
   * 战斗日志管理器，负责记录系统日志和战斗日志
   */
  private get logger() { return LoggerProvider.logger }
  /**
   * 战斗状态管理器，负责战斗状态的同步和管理
   */
  private battleStateManager: BattleStateManager

  /**
   * 当前战斗ID，用于标识一场战斗
   */
  private battleId: string | null = null

  /**
   * 单步执行中的锁标志，防止快速连点导致并发 processTurn
   * ponytail: 不依赖 UI 层的防抖，在逻辑层兜底
   */
  private isProcessing: boolean = false

  /**
   * 构造函数
   * @param battleSystem 战斗系统实例，用于执行核心战斗逻辑
   * @param battleStateManager 战斗状态管理器实例，用于同步和管理战斗状态
   */
  constructor(
    battleSystem: BattleSystem,
    battleStateManager: BattleStateManager,
  ) {
    this.battleSystem = battleSystem
    this.battleStateManager = battleStateManager
  }

  /**
   * 设置当前战斗ID
   * @param battleId 战斗ID，用于标识一场具体的战斗
   */
  setBattleId(battleId: string) {
    this.battleId = battleId
  }

  /**
   * 开始自动战斗
   * 启动自动战斗模式，战斗将持续进行直到手动停止或战斗结束
   * @param battleId 战斗ID，用于标识一场具体的战斗
   * @returns Promise<boolean> 是否成功启动自动战斗
   * @throws 如果battleId为空或启动过程中发生错误，返回false并记录错误日志
   */
  async startAutoBattle(battleId: string): Promise<boolean> {
    if (!battleId) {
      this.logger.addSystemLog({
        message: '请先创建战斗',
        level: LogLevel.WARN,
      })
      return false
    }

    this.battleId = battleId

    try {
      // 启动自动战斗
      this.battleSystem.startAutoBattleLoop()
      this.logger.addSystemLog({ message: '开始自动战斗' })
      // 同步战斗状态
      this.battleStateManager.syncBattleState()
      return true
    } catch (error) {
      console.error('开始自动战斗时出错:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.addDebugLog(`开始自动战斗时出错: ${errorMsg}`)
      return false
    }
  }

  /**
   * 停止自动战斗
   * 停止当前的自动战斗模式
   * @returns boolean 是否成功停止
   */
  stopAutoBattle(): boolean {
    try {
      this.battleSystem.stopAutoBattle()
      this.logger.addSystemLog({ message: '停止自动战斗' })
      this.battleStateManager.syncBattleState()
      return true
    } catch (error) {
      console.error('停止自动战斗时出错:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.addDebugLog(`停止自动战斗时出错: ${errorMsg}`)
      return false
    }
  }

  /**
   * 执行单个回合
   * 手动触发执行一个回合的战斗，执行完成后自动暂停
   * 常用于分析战斗细节或调试战斗逻辑
   */
  async executeSingleTurn() {
    if (!this.battleId) {
      this.logger.addSystemLog({ message: '请先开始战斗', level: LogLevel.WARN })
      return
    }

    // ⭐ 单步执行仅在暂停状态下允许，防止自动战斗运行期间误触
    if (!this.battleSystem.getIsPaused()) {
      this.logger.addSystemLog({ message: '单步执行仅在暂停状态下可用', level: LogLevel.WARN })
      return
    }

    // ⭐ 并发锁：防止快速连点导致两个 processTurn 异步并发执行
    if (this.isProcessing) {
      this.logger.addDebugLog('已有单步执行进行中，忽略重复请求')
      return
    }

    this.isProcessing = true

    try {
      // 临时恢复以执行一个回合
      this.battleSystem.togglePause()

      await this.battleSystem.processTurn()

      this.battleStateManager.syncBattleState()

      const battleState = this.battleSystem.getBattleState()
      if (battleState) {
        await this.logger.syncBattleLogs(battleState)
      }

      // 执行完成后暂停（仅在战斗仍活跃时才切换，防止 ENDED 被误切为 PAUSED）
      if (!this.battleSystem.getIsPaused() && this.battleSystem.isBattleInProgress()) {
        this.battleSystem.togglePause()
      }
    } catch (error) {
      console.error('执行回合时出错:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.addDebugLog(`执行回合时出错: ${errorMsg}`)
      // 出错时也暂停（仅在战斗仍活跃时）
      if (!this.battleSystem.getIsPaused() && this.battleSystem.isBattleInProgress()) {
        this.battleSystem.togglePause()
      }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * 重置自动战斗状态
   * 将所有状态重置为初始值
   * 通常在开始新战斗前调用，以确保状态干净
   */
  resetState() {
    this.battleId = null
  }
}
