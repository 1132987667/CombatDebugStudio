import type { IBattleSystem } from '@/core/battle/interfaces'
import { BattleStateManager } from '@/core/battle/state/BattleStateManager'
import { battleLogManager } from '@/utils/logging'

/**
 * 自动战斗管理器
 * 负责自动战斗的控制、状态管理和错误处理
 */
export class AutoBattleManager {
  private battleSystem: IBattleSystem
  private battleStateManager: BattleStateManager
  private battleLogManager = battleLogManager
  private isAutoPlaying = false
  private isPaused = true
  private battleSpeed = 1
  private battleId: string | null = null
  private autoBattleTaskId: symbol | null = null

  /**
   * 构造函数
   * @param battleSystem 战斗系统实例
   * @param battleStateManager 战斗状态管理器实例
   */
  constructor(
    battleSystem: IBattleSystem,
    battleStateManager: BattleStateManager,
  ) {
    this.battleSystem = battleSystem
    this.battleStateManager = battleStateManager
  }

  /**
   * 获取是否自动播放
   */
  getIsAutoPlaying() {
    return this.isAutoPlaying
  }

  /**
   * 获取是否暂停
   */
  getIsPaused() {
    return this.isPaused
  }

  /**
   * 获取战斗速度
   */
  getBattleSpeed() {
    return this.battleSpeed
  }

  /**
   * 设置战斗ID
   * @param battleId 战斗ID
   */
  setBattleId(battleId: string) {
    this.battleId = battleId
  }

  /**
   * 开始自动战斗
   */
  async startAutoBattle(): Promise<boolean> {
    console.log('startAutoBattle', this.battleId)
    if (!this.battleId) {
      this.battleLogManager.addSystemLog('请先创建战斗')
      return false
    }

    try {
      this.isAutoPlaying = true
      this.isPaused = false

      // 启动自动战斗
      this.battleSystem.startAutoBattle()

      // 设置战斗速度
      this.battleSystem.setBattleSpeed(this.battleId, this.battleSpeed)

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
   */
  async stopAutoBattle() {
    if (!this.battleId) {
      return
    }

    try {
      // 停止自动战斗
      this.battleSystem.stopAutoBattle(this.battleId)

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
   */
  async toggleAutoPlay() {
    if (this.isAutoPlaying) {
      await this.stopAutoBattle()
    } else {
      await this.startAutoBattle()
    }
  }

  /**
   * 切换暂停状态
   */
  togglePause() {
    if (this.isAutoPlaying) {
      this.stopAutoBattle()
    }
    this.isPaused = !this.isPaused
  }

  /**
   * 设置战斗速度
   * @param speed 速度倍率
   */
  setSpeed(speed: number) {
    this.battleSpeed = speed

    if (this.isAutoPlaying && this.battleId) {
      try {
        this.battleSystem.setBattleSpeed(this.battleId, speed)
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
   */
  async executeSingleTurn() {
    if (!this.battleId) {
      this.battleLogManager.addSystemLog('请先开始战斗')
      return
    }

    try {
      this.isPaused = false

      await this.battleSystem.processTurn(this.battleId)

      this.battleStateManager.syncBattleState()

      const battleState = this.battleSystem.getBattleState(this.battleId)
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
