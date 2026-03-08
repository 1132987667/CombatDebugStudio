import { defineStore } from 'pinia'
import {
  PARTICIPANT_SIDE,
  BattleSystemEvent,
  type ParticipantSide,
} from '@/types/battle'
import { useCharacterStore } from './characterStore'
import type { UIBattleCharacter } from '@/types'
import type {
  BattleLogEntry,
  BattleLogCategory,
  BattleLogLevel,
} from '@/types/battle-log'
import type {
  BattleLogEventData,
  BattleStateUpdateEventData,
} from '@/types/battle-events'
import type { BattleManager } from '@/core/battle/BattleManager'
import type { BattleSystemAction, BattleState } from '@/types/battle'
import { BattleLogFormatter, battleLogManager } from '@/utils/logging'
import { GameDataProcessor } from '@/utils/GameDataProcessor'

/**
 * 战斗规则接口
 */
export interface BattleRules {
  speedFirst: boolean
  fixedTurns: boolean
  critEnabled: boolean
  dodgeEnabled: boolean
}

/**
 * 动画状态接口
 */
export interface AnimationState {
  damage: {
    targetId: string
    damage: number
    damageType: string
    isCritical: boolean
    isHeal: boolean
  } | null
  miss: {
    targetId: string
  } | null
  buff: {
    targetId: string
    buffName: string
    isPositive: boolean
  } | null
  skill: {
    sourceId: string
    targetId: string
    skillName: string
    effectType: string
    damageType: string
  } | null
}

/**
 * 加载状态接口
 */
export interface LoadingState {
  isLoading: boolean
  operation: string | null // 当前正在执行的操作
  progress: number | null // 操作进度（0-100）
}

/**
 * 错误状态接口
 */
export interface ErrorState {
  hasError: boolean
  message: string | null
  details: string | null
  field: string | null // 出错的字段（用于表单错误）
}

/**
 * 日志过滤器接口
 */
interface LogFilters {
  showAllyActions: boolean
  showEnemyActions: boolean
  showSystemMessages: boolean
  showDamage: boolean
  showHealing: boolean
  showBuffs: boolean
}

/**
 * 战斗状态接口
 */
export interface BattleStoreState {
  rules: BattleRules
  currentActorId: string | null
  loading: LoadingState
  error: ErrorState
  autoPlayMode: boolean
  isBattleActive: boolean
  animationState: AnimationState
  currentBattleId: string | null
  turnOrder: string[]
  battleSpeed: number
  battleManager: BattleManager | null
  logs: BattleLogEntry[]
  filters: LogFilters
  processedActionIds: Set<string>
}

export const useBattleStore = defineStore('battle', {
  state: (): BattleStoreState => ({
    rules: {
      speedFirst: true,
      fixedTurns: false,
      critEnabled: true,
      dodgeEnabled: false,
    },
    currentActorId: null,
    loading: {
      isLoading: false,
      operation: null,
      progress: null,
    },
    error: {
      hasError: false,
      message: null,
      details: null,
      field: null,
    },
    autoPlayMode: false,
    isBattleActive: false,
    animationState: {
      damage: null,
      miss: null,
      buff: null,
      skill: null,
    },
    currentBattleId: null,
    turnOrder: [],
    battleSpeed: 1,
    battleManager: null,
    logs: [],
    filters: {
      showAllyActions: true,
      showEnemyActions: true,
      showSystemMessages: true,
      showDamage: true,
      showHealing: true,
      showBuffs: true,
    },
    processedActionIds: new Set(),
  }),

  getters: {
    /**
     * 获取当前战斗规则
     */
    getRules: (state): BattleRules => {
      return state.rules
    },

    /**
     * 获取当前行动者ID
     */
    getCurrentActorId: (state): string | null => {
      return state.currentActorId
    },

    /**
     * 获取加载状态
     */
    getLoadingState: (state): LoadingState => {
      return state.loading
    },

    /**
     * 获取是否正在加载
     */
    isBattleLoading: (state): boolean => {
      return state.loading.isLoading
    },

    /**
     * 获取当前加载的操作
     */
    getCurrentOperation: (state): string | null => {
      return state.loading.operation
    },

    /**
     * 获取加载进度
     */
    getLoadingProgress: (state): number | null => {
      return state.loading.progress
    },

    /**
     * 获取错误状态
     */
    getErrorState: (state): ErrorState => {
      return state.error
    },

    /**
     * 获取是否有错误
     */
    hasError: (state): boolean => {
      return state.error.hasError
    },

    /**
     * 获取错误信息
     */
    getErrorMessage: (state): string | null => {
      return state.error.message
    },

    /**
     * 获取错误详情
     */
    getErrorDetails: (state): string | null => {
      return state.error.details
    },

    /**
     * 获取出错的字段
     */
    getErrorField: (state): string | null => {
      return state.error.field
    },

    /**
     * 获取战斗活跃状态
     */
    getIsBattleActive: (state): boolean => {
      return state.isBattleActive
    },

    /**
     * 获取战斗日志
     */
    getBattleLogs: (state): BattleLogEntry[] => {
      return state.logs
    },

    /**
     * 获取动画状态
     */
    getAnimationState: (state): AnimationState => {
      return state.animationState
    },

    /**
     * 获取当前战斗ID
     */
    getCurrentBattleId: (state): string | null => {
      return state.currentBattleId
    },

    /**
     * 获取回合顺序
     */
    getTurnOrder: (state): string[] => {
      return state.turnOrder
    },

    /**
     * 获取战斗速度
     */
    getBattleSpeed: (state): number => {
      return state.battleSpeed
    },

    /**
     * 获取过滤后的战斗日志
     */
    filteredLogs(): BattleLogEntry[] {
      return this.logs.filter((log) => {
        const category = log.category

        if (category === 'system' && !this.filters.showSystemMessages) {
          return false
        }
        if (
          category === 'action' &&
          log.source !== '系统' &&
          !log.source.includes(PARTICIPANT_SIDE.ENEMY) &&
          !this.filters.showAllyActions
        ) {
          return false
        }
        if (
          category === 'action' &&
          log.source.includes(PARTICIPANT_SIDE.ENEMY) &&
          !this.filters.showEnemyActions
        ) {
          return false
        }
        if (!this.filters.showDamage && category === 'damage') {
          return false
        }
        if (!this.filters.showHealing && category === 'heal') {
          return false
        }
        if (!this.filters.showBuffs && category === 'status') {
          return false
        }
        return true
      })
    },

    /**
     * 获取日志数量
     */
    logCount: (state): number => {
      return state.logs.length
    },
  },

  actions: {
    /**
     * 初始化战斗管理器
     */
    initializeBattleManager(battleManager: BattleManager) {
      this.battleManager = battleManager

      battleManager.on(BattleSystemEvent.BATTLE_LOG, (data: any) => {
        if (data && data.log) {
          console.log('接受战斗日志:', data)
          this.addBattleLog(data.log)
        }
      })

      battleManager.on(BattleSystemEvent.BATTLE_STATE_UPDATE, (data: any) => {
        if (data) {
          this.currentBattleId = data.battleId
          this.turnOrder = data.turnOrder || []
          this.setBattleActive(true)
          this.battleManager?.syncBattleState()
        }
      })

      battleManager.on(BattleSystemEvent.BATTLE_END, (data: any) => {
        this.setBattleActive(false)
        this.setAutoPlayMode(false)
        if (data && data.winner) {
          this.addBattleLog({
            turn: '战斗结束',
            source: '系统',
            action: '宣布',
            target: '',
            result: `战斗结束！胜利者: ${data.winner === 'ALLY' ? '我方' : '敌方'}`,
            level: 'info',
            category: 'system',
          })
        }
      })

      battleManager.on(BattleSystemEvent.TURN_START, (data: any) => {
        if (data && data.actorId) {
          this.setCurrentActorId(data.actorId)
          this.addBattleLog({
            turn: `回合${data.turn}`,
            source: '系统',
            action: '开始',
            target: '',
            result: `回合${data.turn}开始，当前行动者: ${data.actorId}`,
            level: 'info',
            category: 'system',
          })
        }
      })

      battleManager.on(BattleSystemEvent.TURN_END, (data: any) => {
        if (data) {
          this.addBattleLog({
            turn: `回合${data.turn}`,
            source: '系统',
            action: '结束',
            target: '',
            result: `回合${data.turn}结束`,
            level: 'info',
            category: 'system',
          })
        }
      })

      battleManager.on(BattleSystemEvent.DAMAGE_ANIMATION, (data: any) => {
        this.setAnimationState('damage', data)
      })

      battleManager.on(BattleSystemEvent.MISS_ANIMATION, (data: any) => {
        this.setAnimationState('miss', data)
      })

      battleManager.on(BattleSystemEvent.BUFF_EFFECT, (data: any) => {
        this.setAnimationState('buff', data)
      })

      battleManager.on(BattleSystemEvent.SKILL_EFFECT, (data: any) => {
        this.setAnimationState('skill', data)
      })

      this.addSystemLog('战斗管理器已初始化')
    },

    /**
     * 添加系统日志
     */
    addSystemLog(message: string) {
      battleLogManager.addSystemLog(message, 'info')
      const log: BattleLogEntry = {
        turn: '系统',
        source: '系统',
        action: '通知',
        target: '',
        result: message,
        level: 'info',
        category: 'system',
        htmlResult: message,
      }
      this.logs.push(log)
    },

    /**
     * 添加警告日志
     */
    addWarningLog(message: string) {
      battleLogManager.addSystemBattleLog(message, 'warning')
      const log: BattleLogEntry = {
        turn: '系统',
        source: '系统',
        action: '警告',
        target: '',
        result: message,
        level: 'warning',
        category: 'system',
        htmlResult: message,
      }
      this.logs.push(log)
    },

    /**
     * 添加调试日志
     */
    addDebugLog(message: string) {
      battleLogManager.addSystemBattleLog(message, 'debug')
    },

    /**
     * 添加系统战斗日志
     */
    addSystemBattleLog(message: string, level: BattleLogLevel = 'info') {
      battleLogManager.addSystemBattleLog(message, level)
      const log: BattleLogEntry = {
        turn: '系统',
        source: '系统',
        action: '系统消息',
        target: '',
        result: message,
        level,
        category: 'system',
        htmlResult: message,
      }
      this.logs.push(log)
    },

    /**
     * 添加错误日志
     */
    addErrorLog(message: string) {
      battleLogManager.addErrorLog(message)
      const log: BattleLogEntry = {
        turn: '系统',
        source: '系统',
        action: '错误',
        target: '',
        result: message,
        level: 'error',
        category: 'system',
        htmlResult: message,
      }
      this.logs.push(log)
    },

    /**
     * 添加通用日志
     */
    addLog(
      turn: string,
      source: string,
      action: string,
      target: string,
      result: string,
      category: BattleLogCategory = 'system',
      level?: BattleLogLevel,
      htmlResult?: string,
    ) {
      battleLogManager.addLog(
        turn,
        source,
        action,
        target,
        result,
        category,
        level,
        htmlResult,
      )
      const log: BattleLogEntry = {
        turn,
        source,
        action,
        target,
        result,
        level: level || 'info',
        category,
        htmlResult,
      }
      this.logs.push(log)
    },

    /**
     * 添加动作日志
     */
    addActionLog(
      source: string,
      action: string,
      target: string,
      result: string,
    ) {
      battleLogManager.addActionLog(source, action, target, result, 'info')
      const log: BattleLogEntry = {
        turn: '当前回合',
        source,
        action,
        target,
        result,
        level: 'info',
        category: 'action',
        htmlResult: result,
      }
      this.logs.push(log)
    },

    /**
     * 更新日志过滤器
     */
    updateFilters(newFilters: Partial<LogFilters>) {
      this.filters = { ...this.filters, ...newFilters }
      battleLogManager.updateFilters({
        damage: this.filters.showDamage,
        heal: this.filters.showHealing,
        status: this.filters.showBuffs,
        crit: true,
      })
    },

    /**
     * 清除日志
     */
    clearLogs() {
      battleLogManager.clearLogs()
      this.logs = []
      this.processedActionIds.clear()
    },

    /**
     * 更新战斗规则
     */
    updateRules(newRules: Partial<BattleRules>) {
      Object.assign(this.rules, newRules)
      this.addSystemLog(`战斗规则已更新: ${JSON.stringify(newRules)}`)
    },

    /**
     * 设置当前行动者
     */
    setCurrentActorId(actorId: string | null) {
      this.currentActorId = actorId
    },

    /**
     * 设置加载状态
     */
    setLoading(
      loading: boolean,
      operation: string | null = null,
      progress: number | null = null,
    ) {
      this.loading = {
        isLoading: loading,
        operation,
        progress,
      }
    },

    /**
     * 更新加载进度
     */
    updateLoadingProgress(progress: number) {
      this.loading.progress = Math.max(0, Math.min(100, progress))
    },

    /**
     * 设置错误信息
     */
    setError(
      message: string | null,
      details: string | null = null,
      field: string | null = null,
    ) {
      this.error = {
        hasError: !!message,
        message,
        details,
        field,
      }

      // 在控制台输出错误详情
      if (message && details) {
        console.error(`[Battle Error] ${message}: ${details}`)
      } else if (message) {
        console.error(`[Battle Error] ${message}`)
      }
    },

    /**
     * 清除错误信息
     */
    clearError() {
      this.error = {
        hasError: false,
        message: null,
        details: null,
        field: null,
      }
    },

    /**
     * 清除所有状态
     */
    clearState() {
      this.setLoading(false)
      this.clearError()
    },

    /**
     * 设置自动播放模式
     */
    setAutoPlayMode(mode: boolean) {
      this.autoPlayMode = mode
    },

    /**
     * 设置战斗活跃状态
     */
    setBattleActive(active: boolean) {
      this.isBattleActive = active
    },

    /**
     * 添加战斗日志
     */
    addBattleLog(log: BattleLogEntry) {
      battleLogManager.addLog(
        log.turn,
        log.source,
        log.action,
        log.target,
        log.result,
        log.category,
        log.level,
        log.htmlResult,
      )
      this.logs.push(log)
    },

    /**
     * 清除战斗日志
     */
    clearBattleLogs() {
      battleLogManager.clearLogs()
      this.logs = []
      this.processedActionIds.clear()
    },

    /**
     * 设置动画状态
     */
    setAnimationState(
      type: keyof AnimationState,
      data: AnimationState[keyof AnimationState],
    ) {
      this.animationState[type] = data
      // 动画状态自动清除
      setTimeout(() => {
        this.animationState[type] = null
      }, 1000)
    },

    /**
     * 开始战斗
     */
    async startBattle() {
      this.setLoading(true, '开始战斗')
      this.clearError()

      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化')
        }
        const characterStore = useCharacterStore()
        const enabledAllyTeam = Array.from(
          characterStore.allyTeam.values(),
        ).filter((c) => c.enabled)
        const enabledEnemyTeam = Array.from(
          characterStore.enemyTeam.values(),
        ).filter((e) => e.enabled)

        const battleId = await this.battleManager.startBattle()
        if (!battleId) {
          throw new Error('战斗创建失败，请检查参战队伍配置')
        }

        const autoBattleStarted =
          await this.battleManager.startAutoBattle(battleId)
        if (!autoBattleStarted) {
          throw new Error('自动战斗启动失败')
        }

        this.currentBattleId = battleId
        this.battleManager.syncBattleState()
        this.setBattleActive(true)
        this.autoPlayMode = true
        this.addSystemLog(`战斗已开始`)

        this.addBattleLog({
          turn: '战斗开始',
          source: '系统',
          action: '宣布',
          target: '',
          result: `战斗开始！参战角色: ${enabledAllyTeam.length}人 | 参战敌人: ${enabledEnemyTeam.length}人`,
          level: 'info',
          category: 'system',
        })

        return true
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.setError(errorMsg, error instanceof Error ? error.stack : null)
        this.addErrorLog(`开始战斗失败: ${errorMsg}`)
        return false
      } finally {
        this.setLoading(false)
      }
    },

    /**
     * 结束战斗
     */
    async endBattle(
      winner: typeof PARTICIPANT_SIDE.ALLY = PARTICIPANT_SIDE.ALLY,
    ) {
      this.setLoading(true, '结束战斗')
      this.clearError()

      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化')
        }

        // 结束战斗
        this.battleManager.endBattle(winner)
        // 同步战斗状态
        this.battleManager.syncBattleState()
        this.setBattleActive(false)
        this.addSystemLog(
          `战斗结束！胜利者: ${winner === PARTICIPANT_SIDE.ALLY ? '我方' : '敌方'}`,
        )
        return true
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.setError(errorMsg, error instanceof Error ? error.stack : null)
        this.addErrorLog(`结束战斗失败: ${errorMsg}`)
        return false
      } finally {
        this.setLoading(false)
      }
    },

    /**
     * 重置战斗
     */
    async resetBattle() {
      this.setLoading(true, '重置战斗')
      this.clearError()

      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化')
        }

        // 重置战斗系统
        this.battleManager.resetBattle()
        // 重置当前行动者
        this.setCurrentActorId(null)
        this.setBattleActive(false)
        this.clearBattleLogs()
        this.currentBattleId = null
        this.turnOrder = []
        this.addSystemLog('战斗已重置')
        return true
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.setError(errorMsg, error instanceof Error ? error.stack : null)
        this.addErrorLog(`重置战斗失败: ${errorMsg}`)
        return false
      } finally {
        this.setLoading(false)
      }
    },

    /**
     * 执行单个回合
     */
    async processSingleTurn() {
      this.setLoading(true, '执行回合')
      this.clearError()

      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化')
        }

        // 执行单个回合
        await this.battleManager.processSingleTurn()
        // 同步战斗状态
        this.battleManager.syncBattleState()
        return true
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.setError(errorMsg, error instanceof Error ? error.stack : null)
        this.addErrorLog(`执行回合时出错: ${errorMsg}`)
        return false
      } finally {
        this.setLoading(false)
      }
    },

    /**
     * 切换自动战斗状态
     */
    async toggleAutoPlay() {
      this.setLoading(true)
      this.clearError()

      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化')
        }

        if (this.autoPlayMode) {
          // 停止自动播放
          if (this.currentBattleId) {
            this.battleManager.stopAutoBattle(this.currentBattleId)
          }
          this.autoPlayMode = false
          this.isBattleActive = false
          this.addSystemLog('停止自动战斗')
        } else {
          // 开始自动播放
          if (this.currentBattleId) {
            await this.battleManager.startAutoBattle(this.currentBattleId)
          }
          this.autoPlayMode = true
          this.isBattleActive = true
          this.battleManager.syncBattleState()
          this.addSystemLog('开始自动战斗')
        }
        return true
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.setError(errorMsg, error instanceof Error ? error.stack : null)
        this.addErrorLog(`切换自动战斗状态失败: ${errorMsg}`)
        // 恢复原状态
        this.autoPlayMode = !this.autoPlayMode
        return false
      } finally {
        this.setLoading(false)
      }
    },

    /**
     * 导入战斗状态
     */
    async importState() {
      this.setLoading(true)
      this.clearError()

      try {
        const savedState = localStorage.getItem('battleState')
        if (savedState) {
          try {
            const state = JSON.parse(savedState)
            this.addSystemLog('战斗状态已导入')
            return true
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e)
            throw new Error(`导入失败: ${errorMsg}`)
          }
        } else {
          throw new Error('没有找到保存的战斗状态')
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.setError(errorMsg, error instanceof Error ? error.stack : null)
        this.addErrorLog(`导入失败: ${errorMsg}`)
        return false
      } finally {
        this.setLoading(false)
      }
    },

    /**
     * 导出战斗状态
     */
    exportState(currentTurn: number) {
      try {
        const characterStore = useCharacterStore()
        const allyTeam = Array.from(characterStore.allyTeam.values())
        const enemyTeam = Array.from(characterStore.enemyTeam.values())

        const state = {
          battleCharacters: allyTeam,
          enemyParty: enemyTeam,
          currentTurn,
          rules: this.rules,
          battleLogs: this.logs,
        }
        const json = JSON.stringify(state, null, 2)
        localStorage.setItem('battleState', json)
        this.addSystemLog('战斗状态已导出')
        return true
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.setError(errorMsg, error instanceof Error ? error.stack : null)
        this.addErrorLog(`导出状态时出错: ${errorMsg}`)
        return false
      }
    },

    /**
     * 设置战斗速度
     */
    setBattleSpeed(speed: number) {
      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化')
        }

        this.battleManager.setBattleSpeed(speed)
        this.battleSpeed = speed
        this.addSystemLog(`战斗速度已调整为: ${speed}倍`)
        return true
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.setError(errorMsg, error instanceof Error ? error.stack : null)
        this.addErrorLog(`设置战斗速度失败: ${errorMsg}`)
        return false
      }
    },

    /**
     * 清理战斗管理器事件监听器
     */
    destroy() {
      try {
        if (!this.battleManager) return

        // 移除所有事件监听器
        this.battleManager.off(BattleSystemEvent.BATTLE_LOG)
        this.battleManager.off(BattleSystemEvent.BATTLE_STATE_UPDATE)
        this.battleManager.off(BattleSystemEvent.DAMAGE_ANIMATION)
        this.battleManager.off(BattleSystemEvent.MISS_ANIMATION)
        this.battleManager.off(BattleSystemEvent.BATTLE_END)
        this.battleManager.off(BattleSystemEvent.BUFF_EFFECT)
        this.battleManager.off(BattleSystemEvent.SKILL_EFFECT)
        this.battleManager.off(BattleSystemEvent.TURN_START)
        this.battleManager.off(BattleSystemEvent.TURN_END)

        // 清理战斗状态
        this.currentActorId = null
        this.isBattleActive = false
        this.autoPlayMode = false
        this.clearBattleLogs()
        this.currentBattleId = null
        this.turnOrder = []

        // 清理动画状态
        this.animationState = {
          damage: null,
          miss: null,
          buff: null,
          skill: null,
        }

        // 清理战斗管理器引用
        this.battleManager = null

        console.log('战斗管理器事件监听器已清理')
      } catch (error) {
        console.error('清理战斗管理器事件监听器时出错:', error)
      }
    },

    /**
     * 解析战斗动作并生成日志
     */
    async parseBattleAction(
      action: BattleSystemAction,
      battleState: BattleState,
    ): Promise<{ log: BattleLogEntry | null; shouldDisplay: boolean }> {
      if (this.processedActionIds.has(action.id)) {
        return { log: null, shouldDisplay: false }
      }
      this.processedActionIds.add(action.id)

      let sourceName = action.sourceId
      let targetName = action.targetId

      if (action.sourceId === 'system') {
        sourceName = '系统'
      } else {
        const sourceParticipant = battleState.participants.get(action.sourceId)
        if (sourceParticipant) {
          sourceName = sourceParticipant.name
        }
      }

      if (action.targetId === 'system') {
        targetName = ''
      } else {
        const targetParticipant = battleState.participants.get(action.targetId)
        if (targetParticipant) {
          targetName = targetParticipant.name
        }
      }

      const sourceIsAlly =
        action.sourceId !== 'system'
          ? battleState.participants.get(action.sourceId)?.team === PARTICIPANT_SIDE.ALLY
          : false
      const targetIsAlly = action.targetId && action.targetId !== 'system'
        ? battleState.participants.get(action.targetId)?.team === PARTICIPANT_SIDE.ALLY
        : undefined

      const turn = action.turn || 1
      const options = {
        turn,
        source: sourceName,
        target: targetName,
        damage: action.damage,
        heal: action.heal,
        skillName: (await this.getSkillName(action.skillId)) || '',
        damageType: '物理',
        sourceIsAlly,
        targetIsAlly,
      }

      let actionType:
        | 'normal_attack'
        | 'battle_start'
        | 'battle_end'
        | 'heal_skill'
        | 'skill_attack' = 'normal_attack'
      let logCategory: BattleLogCategory = 'action'

      if (action.sourceId === 'system') {
        if (action.effects?.some((e) => e.description.includes('战斗开始'))) {
          actionType = 'battle_start'
          logCategory = 'system'
          const match = action.effects[0].description.match(
            /参战角色: (\d+) 人，参战敌人: (\d+) 人/,
          )
          if (match) {
            options.source = match[1]
            options.target = match[2]
          }
        } else if (
          action.effects?.some((e) => e.description.includes('战斗结束'))
        ) {
          actionType = 'battle_end'
          logCategory = 'system'
          const match = action.effects[0].description.match(/胜利者: (.+)/)
          if (match) {
            options.source = match[1] === '角色方' ? '我方' : '敌方'
          }
        }
      } else if (action.type === 'skill') {
        if (action.heal && action.heal > 0) {
          actionType = 'heal_skill'
        } else if (action.damage && action.damage > 0) {
          actionType = 'skill_attack'
        }
      }

      const formattedLog = BattleLogFormatter.createBattleLogHTML(
        actionType,
        options,
        logCategory,
      )

      const fullLog: BattleLogEntry = {
        turn: formattedLog.turn,
        source: sourceName,
        action: '对',
        target: targetName,
        result: formattedLog.htmlResult || '',
        level: formattedLog.level,
        category: formattedLog.category,
        htmlResult: formattedLog.htmlResult,
      }

      const shouldDisplay = this.shouldDisplayLog(fullLog)

      return { log: fullLog, shouldDisplay }
    },

    /**
     * 同步战斗日志
     */
    async syncBattleLogs(battleState: BattleState) {
      const sortedActions = [...battleState.actions].sort((a, b) => {
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp
        }
        const turnA = a.turn || 0
        const turnB = b.turn || 0
        if (turnA !== turnB) {
          return turnA - turnB
        }
        return a.id.localeCompare(b.id)
      })

      for (const action of sortedActions) {
        const { log, shouldDisplay } = await this.parseBattleAction(
          action,
          battleState,
        )

        if (!shouldDisplay || !log) {
          continue
        }

        this.addLog(
          log.turn,
          log.source,
          log.action,
          log.target,
          log.result || '',
          log.category,
          log.level,
          log.htmlResult,
        )
      }
    },

    /**
     * 获取技能名称
     */
    async getSkillName(skillId: string | undefined): Promise<string> {
      if (!skillId) return ''
      const skill = GameDataProcessor.findSkillById(skillId)
      if (skill?.name) {
        return skill.name
      }
      return '未知技能'
    },

    /**
     * 判断日志是否应该显示
     */
    shouldDisplayLog(log: BattleLogEntry): boolean {
      const category = log.category

      const isLogExists = this.logs.some(
        (existingLog) =>
          existingLog.turn === log.turn &&
          existingLog.htmlResult === log.htmlResult,
      )

      if (isLogExists) {
        return false
      }

      if (category === 'system' && !this.filters.showSystemMessages) {
        return false
      }

      if (
        category === 'action' &&
        log.source !== '系统' &&
        !log.source.includes(PARTICIPANT_SIDE.ENEMY) &&
        !this.filters.showAllyActions
      ) {
        return false
      }

      if (
        category === 'action' &&
        log.source.includes(PARTICIPANT_SIDE.ENEMY) &&
        !this.filters.showEnemyActions
      ) {
        return false
      }

      if (!this.filters.showDamage && category === 'damage') {
        return false
      }

      if (!this.filters.showHealing && category === 'heal') {
        return false
      }

      if (!this.filters.showBuffs && category === 'status') {
        return false
      }

      return true
    },
  },
})
