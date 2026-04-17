import { defineStore } from 'pinia'
import { ref, shallowRef, computed, reactive, onScopeDispose } from 'vue'
import { PARTICIPANT_SIDE } from '@/types/battle'
import { BattleEventCodes, BattleEventCode } from '@/types/battle-events'
import { container } from '@/core/di/Container'
import type {
  BattleLogEntry,
  BattleLogCategory,
  BattleLogLevel,
  LogSegment,
  LogFilters,
} from '@/types/battle-log'
import { battleActionToLogEntry, LogType } from '@/types/battle-log'
import type { BattleManager } from '@/core/battle/BattleManager'
import type { BattleAction, BattleState } from '@/types/battle'
import { battleLogManager } from '@/utils/logging'
import { GameDataProcessor } from '@/utils/GameDataProcessor'
import type { BattleEntity } from '@/types/battle'

export interface BattleRules {
  speedFirst: boolean
  fixedTurns: boolean
  critEnabled: boolean
  dodgeEnabled: boolean
}

export interface AnimationState {
  damage: { targetId: string; damage: number; damageType: string; isCritical: boolean; isHeal: boolean } | null
  miss: { targetId: string } | null
  buff: { targetId: string; buffName: string; isPositive: boolean } | null
  skill: { sourceId: string; targetId: string; skillName: string; effectType: string; damageType: string } | null
}

export interface LoadingState {
  isLoading: boolean
  operation: string | null
  progress: number | null
}

export interface ErrorState {
  hasError: boolean
  message: string | null
  details: string | null
  field: string | null
}

// ================= Store 核心定义 (Composition API) =================
export const useBattleStore = defineStore('battle', () => {
  // 🔹 1. UI 层状态（仅负责视图渲染，与业务逻辑隔离）
  const rules = ref<BattleRules>({
    speedFirst: true,
    fixedTurns: false,
    critEnabled: true,
    dodgeEnabled: false,
  })
  const currentActorId = ref<string | null>(null)
  const loading = reactive<LoadingState>({ isLoading: false, operation: null, progress: null })
  const error = reactive<ErrorState>({ hasError: false, message: null, details: null, field: null })
  const autoPlayMode = ref(false)
  const animationState = reactive<AnimationState>({ damage: null, miss: null, buff: null, skill: null })
  const currentBattleId = ref<string | null>(null)
  const turnOrder = ref<string[]>([])
  const battleSpeed = ref(1)
  const filters = reactive<LogFilters>({
    battle: true, system: true, item: true, action: true, debug: false,
  })
  const processedActionIds = ref(new Set<string>())

  // ================= 生命周期清理 =================
  // 组件卸载或模块热更新时自动执行清理
  onScopeDispose(() => {
    battleManager.value.off(BattleEventCodes.TEAM_DATA_CHANGED)
  })

  const selectedCharacterId = ref<string | null>(null)

  // 🔹 2. 业务层引用（适配器桥接，使用 shallowRef 避免深层 Proxy 开销）
  const battleManager = shallowRef<BattleManager>(container.resolve<BattleManager>('BattleManager'))

  const allyTeam = shallowRef<BattleEntity[]>([])
  const enemyTeam = shallowRef<BattleEntity[]>([])
  const currentTurn = ref(1)
  const isBattleActive = ref(false)

  const syncTeams = () => {
    console.log('接收队伍数据更新')
    allyTeam.value = battleManager.value.getAllyTeam()
    enemyTeam.value = battleManager.value.getEnemyTeam()
    currentTurn.value = battleManager.value.getCurrentTurn()
    isBattleActive.value = battleManager.value.getBattleState()?.battleState === 'ACTIVE'
  }

  const setupSubscriptions = () => {
    battleManager.value.on(BattleEventCodes.TEAM_DATA_CHANGED, syncTeams)
  }
  setupSubscriptions()


  // 🔹 4. 事件处理器（仅负责同步业务数据到响应式状态）
  const handleBattleLogEvent = (data: any) => {
    if (data?.log) {
      console.log('接受战斗日志:', data)
      battleLogManager.addSystemLog(data.log)
    }
  }

  const handleBattleEndEvent = (data: any) => {
    isBattleActive.value = false
    autoPlayMode.value = false
    if (data?.winner) {
      battleLogManager.addBattleLog(
        battleManager.value?.getTurn() ?? 1,
        `战斗结束！胜利者：${data.winner === 'ALLY' ? '我方' : '敌方'}`
      )
    }
  }

  const handleTurnStartEvent = (data: any) => {
    if (data?.actorId) {
      currentActorId.value = data.actorId
      battleLogManager.addTurnStartLog(battleManager.value?.getTurn() ?? 1)
    }
  }

  const handleTurnEndEvent = () => {
    battleLogManager.addTurnEndLog(battleManager.value?.getTurn() ?? 1)
  }

  const handleDamageAnimationEvent = (data: any) => setAnimationState('damage', data)
  const handleMissAnimationEvent = (data: any) => setAnimationState('miss', data)
  const handleBuffEffectEvent = (data: any) => setAnimationState('buff', data)
  const handleSkillEffectEvent = (data: any) => setAnimationState('skill', data)

  const handleBattleResetEvent = () => {
    battleLogManager.addSystemLog('战斗重置')
  }
  // 🔹 3. 事件订阅管理器（防止内存泄漏）

  const events = new Map<BattleEventCode, Function>()
  events.set(BattleEventCodes.BATTLE_LOG, handleBattleLogEvent)
  events.set(BattleEventCodes.BATTLE_ENDED, handleBattleEndEvent)
  events.set(BattleEventCodes.BATTLE_RESET, handleBattleResetEvent)
  events.set(BattleEventCodes.TURN_START, handleTurnStartEvent)
  events.set(BattleEventCodes.TURN_END, handleTurnEndEvent)
  events.set(BattleEventCodes.DAMAGE_ANIMATION, handleDamageAnimationEvent)
  events.set(BattleEventCodes.MISS_ANIMATION, handleMissAnimationEvent)
  events.set(BattleEventCodes.BUFF_EFFECT, handleBuffEffectEvent)
  events.set(BattleEventCodes.SKILL_EFFECT, handleSkillEffectEvent)
  const cleanupEvents = [...events.keys()]

  // 🔹 5. 核心 Actions（纯函数，仅更新本地状态或调用 Manager）
  const initializeBattleManager = (manager: BattleManager) => {
    battleManager.value = manager
    battleLogManager.addSystemLog('战斗管理器已初始化')
  }

  const setLoading = (isLoading: boolean, operation: string | null = null, progress: number | null = null) => {
    loading.isLoading = isLoading
    loading.operation = operation
    loading.progress = progress
  }

  const updateLoadingProgress = (progress: number) => {
    loading.progress = Math.max(0, Math.min(100, progress))
  }

  const setError = (message: string | null, details: string | null = null, field: string | null = null) => {
    error.hasError = !!message
    error.message = message
    error.details = details
    error.field = field
    if (message && details) console.error(`[Battle Error] ${message}: ${details}`)
    else if (message) console.error(`[Battle Error] ${message}`)
  }

  const clearError = () => {
    error.hasError = false
    error.message = null
    error.details = null
    error.field = null
  }

  const clearState = () => {
    setLoading(false)
    clearError()
  }

  const setAutoPlayMode = (mode: boolean) => { autoPlayMode.value = mode }
  const setBattleActive = (active: boolean) => { isBattleActive.value = active }
  const clearBattleLogs = () => {
    battleLogManager.clearLogs()
    processedActionIds.value.clear()
  }

  /**
   * 添加系统日志
   */
  const addLog = (
    turn: string,
    source: string,
    action: string,
    target: string,
    segments: LogSegment[],
    category: BattleLogCategory = 'system',
    level?: BattleLogLevel,
  ) => {
    battleLogManager.addSystemLog(
      turn,
      source,
      action,
      target,
      segments,
      category,
      level,
    )
  }

  /**
   * 更新战斗规则
   */
  const updateRules = (newRules: Partial<BattleRules>) => {
    Object.assign(rules.value, newRules)
    battleLogManager.addSystemLog(
      `战斗规则已更新: ${JSON.stringify(newRules)}`,
    )
  }

  const setAnimationState = (type: keyof AnimationState, data: any) => {
    animationState[type] = data
    const duration = getAnimationDuration()
    setTimeout(() => { animationState[type] = null }, duration)
  }

  const getAnimationDuration = () => {
    const speed = battleSpeed.value
    const delayMap: Record<number, number> = { 1: 1000, 2: 500, 3: 330, 5: 200 }
    return delayMap[speed] || 500
  }

  // 🔹 业务动作包装器（统一错误处理与 Loading 状态）
  const startBattle = async () => {
    setLoading(true, '开始战斗')
    clearError()
    try {
      if (!battleManager.value) throw new Error('战斗管理器未初始化')
      const battleId = await battleManager.value.startBattle()
      if (!battleId) throw new Error('战斗创建失败，请检查参战队伍的配置')
      currentBattleId.value = battleId
      battleManager.value.syncBattleState()
      setBattleActive(true)
      autoPlayMode.value = battleManager.value.getAutoBattle()
      battleLogManager.addSystemLog(`战斗已开始`)
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`开始战斗失败: ${errorMsg}`)
      return false
    } finally { setLoading(false) }
  }

  const endBattle = async (winner: typeof PARTICIPANT_SIDE.ALLY = PARTICIPANT_SIDE.ALLY) => {
    setLoading(true, '结束战斗')
    clearError()
    try {
      if (!battleManager.value) throw new Error('战斗管理器未初始化')
      battleManager.value.endBattle(winner)
      battleManager.value.syncBattleState()
      setBattleActive(false)
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`结束战斗失败: ${errorMsg}`)
      return false
    } finally { setLoading(false) }
  }

  const resetBattle = async () => {
    setLoading(true, '重置战斗')
    clearError()
    try {
      if (!battleManager.value) throw new Error('战斗管理器未初始化')
      battleManager.value.resetBattle()
      currentActorId.value = null
      setBattleActive(false)
      clearBattleLogs()
      currentBattleId.value = null
      turnOrder.value = []
      battleLogManager.addSystemLog('战斗已重置')
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`重置战斗失败: ${errorMsg}`)
      return false
    } finally { setLoading(false) }
  }

  const processSingleTurn = async () => {
    setLoading(true, '执行回合')
    clearError()
    try {
      if (!battleManager.value) throw new Error('战斗管理器未初始化')
      await battleManager.value.processSingleTurn()
      battleManager.value.syncBattleState()
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`执行回合时出错: ${errorMsg}`)
      return false
    } finally { setLoading(false) }
  }

  const toggleAutoPlay = async () => {
    setLoading(true)
    clearError()
    try {
      if (!battleManager.value) throw new Error('战斗管理器未初始化')
      const isActive = battleManager.value.getAutoBattle()
      if (isActive) {
        battleManager.value.stopAutoBattle()
        autoPlayMode.value = false
        isBattleActive.value = false
        battleLogManager.addSystemLog('停止自动战斗')
      } else {
        await battleManager.value.startAutoBattle()
        autoPlayMode.value = true
        isBattleActive.value = true
        battleManager.value.syncBattleState()
        battleLogManager.addSystemLog('开始自动战斗')
      }
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`切换自动战斗状态失败: ${errorMsg}`)
      autoPlayMode.value = !autoPlayMode.value // 恢复原状态
      return false
    } finally { setLoading(false) }
  }

  const importState = async () => {
    setLoading(true)
    clearError()
    try {
      const savedState = localStorage.getItem('battleState')
      if (savedState) {
        JSON.parse(savedState) // 仅验证格式，实际导入逻辑由外部处理
        battleLogManager.addSystemLog('战斗状态已导入')
        return true
      }
      throw new Error('没有找到保存的战斗状态')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      return false
    } finally { setLoading(false) }
  }

  const exportState = (currentTurn: number) => {
    try {
      const allyTeam = battleManager.value?.getAllyTeam() || []
      const enemyTeam = battleManager.value?.getEnemyTeam() || []
      const state = {
        battleCharacters: allyTeam,
        enemyParty: enemyTeam,
        currentTurn,
        rules: rules.value,
        battleLogs: [] // 按需替换为实际日志获取逻辑
      }
      localStorage.setItem('battleState', JSON.stringify(state, null, 2))
      battleLogManager.addSystemLog('战斗状态已导出')
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      return false
    }
  }

  const setBattleSpeed = (speed: number) => {
    try {
      if (!battleManager.value) throw new Error('战斗管理器未初始化')
      battleManager.value.setBattleSpeed(speed)
      battleSpeed.value = speed
      battleLogManager.addSystemLog(`战斗速度已调整为: ${speed}倍`)
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      return false
    }
  }

  const destroy = () => {
    try {
      if (!battleManager.value) return
      cleanupEvents.forEach(key => battleManager.value.off(key))
      cleanupEvents.length = 0
      currentActorId.value = null
      isBattleActive.value = false
      autoPlayMode.value = false
      clearBattleLogs()
      currentBattleId.value = null
      turnOrder.value = []
      animationState.damage = null
      animationState.miss = null
      animationState.buff = null
      animationState.skill = null
      battleManager.value = null
      console.log('战斗管理器事件监听器已清理')
    } catch (err) {
      console.error('清理战斗管理器事件监听器时出错:', err)
    }
  }

  const parseBattleAction = async (action: BattleAction, battleState: BattleState): Promise<{ log: BattleLogEntry | null; shouldDisplay: boolean }> => {
    if (processedActionIds.value.has(action.id)) return { log: null, shouldDisplay: false }
    processedActionIds.value.add(action.id)
    const sourceIsAlly = action.sourceId !== 'system' ? battleState.participants.get(action.sourceId)?.team === PARTICIPANT_SIDE.ALLY : false
    const targetIsAlly = action.targetId && action.targetId !== 'system' ? battleState.participants.get(action.targetId)?.team === PARTICIPANT_SIDE.ALLY : undefined
    const fullLog = battleActionToLogEntry(action, battleState.participants, { turnNumber: action.turn, sourceIsAlly, targetIsAlly })
    return { log: fullLog, shouldDisplay: shouldDisplayLog(fullLog) }
  }

  const syncBattleLogs = async (battleState: BattleState) => {
    const sortedActions = [...battleState.actions].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
      const turnA = a.turn || 0
      const turnB = b.turn || 0
      if (turnA !== turnB) return turnA - turnB
      return a.id.localeCompare(b.id)
    })
    for (const action of sortedActions) {
      const { log, shouldDisplay } = await parseBattleAction(action, battleState)
      if (!shouldDisplay || !log) continue
      battleLogManager.addSystemLog(log.turn, log.source, log.action, log.target, log.segments, log.category, log.level)
    }
  }

  const getSkillName = async (skillId: string | undefined): Promise<string> => {
    if (!skillId) return ''
    const skill = GameDataProcessor.findSkillById(skillId)
    return skill?.name || '未知技能'
  }

  const shouldDisplayLog = (log: BattleLogEntry): boolean => {
    const category = log.category
    const logText = log.segments.map((s) => s.text).join('')
    const isLogExists = false // 简化逻辑，实际可按需接入日志去重
    if (category === 'system' && !filters.system) return false
    if (category === 'action' && log.source !== '系统' && !log.source.includes(PARTICIPANT_SIDE.ENEMY) && !filters.action) return false
    if (category === 'action' && log.source.includes(PARTICIPANT_SIDE.ENEMY) && !filters.action) return false
    if (!filters.battle && category === 'damage') return false
    if (!filters.battle && category === 'heal') return false
    if (!filters.battle && category === 'status') return false
    return true
  }

  const selectCharacter = (characterId: string) => {
    battleManager.value.selectCharacter(characterId)
    // 同步选中状态
    selectedCharacterId.value = characterId
  }

  const setCharacterEnabled = (characterId: string, enabled: boolean) => {
    battleManager.value.setCharacterEnabled(characterId, enabled)
    // BattleManager 内部已 emit 'teamDataChanged'，Store 会自动同步
  }
  // 🔹 生命周期清理（防止 SPA 路由切换导致内存泄漏）
  onScopeDispose(() => {
    destroy()
  })

  // 🔹 暴露给外部
  return {
    // State
    rules, currentActorId, loading, error, autoPlayMode,
    animationState, currentBattleId, turnOrder, battleSpeed, filters,
    processedActionIds, battleManager, selectedCharacterId,

    allyTeam,
    enemyTeam,
    currentTurn,
    isBattleActive,
    syncTeams,
    // Actions
    initializeBattleManager, setLoading, updateLoadingProgress, setError, clearError, clearState,
    setAutoPlayMode, setBattleActive, clearBattleLogs, setAnimationState, getAnimationDuration,
    startBattle, endBattle, resetBattle, processSingleTurn, toggleAutoPlay,
    importState, exportState, setBattleSpeed, destroy, parseBattleAction,
    syncBattleLogs, getSkillName, shouldDisplayLog, addLog, updateRules,
    selectCharacter, setCharacterEnabled,
  }
})
