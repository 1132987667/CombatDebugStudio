import type { IBattleSystem } from '@/core/battle/interfaces'
import { BattleStateManager } from '@/core/battle/state/BattleStateManager'
import { battleLogManager } from '@/utils/logging'

/**
 * 自动战斗管理器
 * 负责自动战斗的控制、状态管理和错误处理
 * @description 该类是战斗系统的核心组件之一，主要提供自动战斗的启动、停止、速度控制、单回合执行等功能
 *              支持暂停/恢复机制，允许用户在自动战斗过程中进行干预
 *              与BattleSystem配合实现战斗自动化，与BattleStateManager同步战斗状态
 * @see BattleManager 主战斗管理器，负责协调各子管理器
 * @see BattleStateManager 战斗状态管理器，用于同步战斗状态
 * @see IBattleSystem 战斗系统接口，定义战斗核心操作
 */
export class AutoBattleManager {
  /**
   * 战斗系统实例，负责核心战斗逻辑执行
   */
  private battleSystem: IBattleSystem
  /**
   * 战斗日志管理器，负责记录系统日志和战斗日志
   */
  private battleLogManager = battleLogManager
  /**
   * 战斗状态管理器，负责战斗状态的同步和管理
   */
  private battleStateManager: BattleStateManager
  /**
   * 当前是否处于自动战斗状态
   */
  private isAutoPlaying = false
  /**
   * 当前是否处于暂停状态
   */
  private isPaused = true
  /**
   * 当前战斗速度倍率，默认为1
   */
  private battleSpeed = 1
  /**
   * 当前战斗ID，用于标识一场战斗
   */
  private battleId: string | null = null
  /**
   * 自动战斗任务ID，用于取消或管理异步任务
   */
  private autoBattleTaskId: symbol | null = null

  /**
   * 构造函数
   * @param battleSystem 战斗系统实例，用于执行核心战斗逻辑
   * @param battleStateManager 战斗状态管理器实例，用于同步和管理战斗状态
   */
  constructor(
    battleSystem: IBattleSystem,
    battleStateManager: BattleStateManager,
  ) {
    this.battleSystem = battleSystem
    this.battleStateManager = battleStateManager
  }

  /**
   * 获取当前是否处于自动战斗状态
   * @returns boolean 是否正在自动战斗
   */
  getIsAutoPlaying() {
    return this.isAutoPlaying
  }

  /**
   * 获取当前是否处于暂停状态
   * @returns boolean 是否暂停
   */
  getIsPaused() {
    return this.isPaused
  }

  /**
   * 获取当前战斗速度倍率
   * @returns number 当前战斗速度倍率
   */
  getBattleSpeed() {
    return this.battleSpeed
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
    console.log('startAutoBattle', battleId)
    if (!battleId) {
      this.battleLogManager.addSystemLog('请先创建战斗')
      return false
    }

    try {
      this.isAutoPlaying = true
      this.isPaused = false

      // 启动自动战斗
      this.battleSystem.startAutoBattle()

      // 设置战斗速度
      this.battleSystem.setBattleSpeed(this.battleSpeed)

      this.battleLogManager.addSystemLog('开始自动战斗')

      // 同步战斗状态
      this.battleStateManager.syncBattleState()
      return true
    } catch (error) {
      console.error('开始自动战斗时出错:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.battleLogManager.addErrorLog(`开始自动战斗时出错: ${errorMsg}`)
      this.isAutoPlaying = false
      this.isPaused = true
      return false
    }
  }

  /**
   * 停止自动战斗
   * 停止当前正在进行的自动战斗，将自动战斗状态和暂停状态都设置为false
   * @param battleId 战斗ID，用于标识一场具体的战斗
   */
  async stopAutoBattle(battleId: string) {
    if (!battleId) {
      return
    }

    try {
      // 停止自动战斗
      this.battleSystem.stopAutoBattle()

      this.isAutoPlaying = false
      this.isPaused = true

      this.battleLogManager.addSystemLog('停止自动战斗')
    } catch (error) {
      console.error('停止自动战斗时出错:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.battleLogManager.addErrorLog(`停止自动战斗时出错: ${errorMsg}`)
    }
  }

  /**
   * 切换自动战斗状态
   * 在开始和停止自动战斗之间切换，根据当前isAutoPlaying状态决定是启动还是停止
   */
  async toggleAutoPlay() {
    if (this.isAutoPlaying) {
      if (this.battleId) {
        await this.stopAutoBattle(this.battleId)
      }
    } else {
      if (this.battleId) {
        await this.startAutoBattle(this.battleId)
      }
    }
  }

  /**
   * 切换暂停状态
   * 切换isPaused的状态，如果当前正在自动战斗则先停止
   */
  togglePause() {
    if (this.isAutoPlaying && this.battleId) {
      this.stopAutoBattle(this.battleId)
    }
    this.isPaused = !this.isPaused
  }

  /**
   * 设置战斗速度
   * 设置自动战斗的速度倍率，仅在自动战斗进行中生效
   * @param speed 速度倍率，支持0.5、1、2等常见倍率
   */
  setSpeed(speed: number) {
    this.battleSpeed = speed

    if (this.isAutoPlaying && this.battleId) {
      try {
        this.battleSystem.setBattleSpeed(speed)
        this.battleLogManager.addSystemLog(`战斗速度已调整为: ${speed}倍`)
      } catch (error) {
        console.error('设置战斗速度时出错:', error)
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.battleLogManager.addErrorLog(`设置战斗速度时出错: ${errorMsg}`)
      }
    }
  }

  /**
   * 执行单个回合
   * 手动触发执行一个回合的战斗，执行完成后自动暂停
   * 常用于分析战斗细节或调试战斗逻辑
   */
  async executeSingleTurn() {
    if (!this.battleId) {
      this.battleLogManager.addSystemLog('请先开始战斗')
      return
    }

    try {
      this.isPaused = false

      await this.battleSystem.processTurn()

      this.battleStateManager.syncBattleState()

      const battleState = this.battleSystem.getBattleState()
      if (battleState) {
        await this.battleLogManager.syncBattleLogs(battleState)
      }

      this.isPaused = true
    } catch (error) {
      console.error('执行回合时出错:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.battleLogManager.addErrorLog(`执行回合时出错: ${errorMsg}`)
      this.isPaused = true
    }
  }

  /**
   * 重置自动战斗状态
   * 将所有状态重置为初始值，包括isAutoPlaying、isPaused、battleSpeed和autoBattleTaskId
   * 通常在开始新战斗前调用，以确保状态干净
   */
  resetState() {
    this.isAutoPlaying = false
    this.isPaused = true
    this.battleSpeed = 1
    if (this.autoBattleTaskId) {
      this.autoBattleTaskId = null
    }
  }
}
