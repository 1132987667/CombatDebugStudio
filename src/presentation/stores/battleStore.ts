import type { BattleService } from '@/application/facade/BattleFacade'
import type {
  BattleAction,
  BattleEntity,
  BattleState,
} from '@/domain/battle/type/types'
import { BattleStatus, ParticipantSide, ParticipantSideName } from '@/domain/battle/type/types'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { container } from '@/infrastructure/di/Container'
import {
  BattleEventCode,
  BattleEventCodes,
  BattleEventName,
  BattleLogEventData,
  BattleEndedEventData,
  DamageEventData,
  BuffEffectEventData,
  MissEventData,
  SkillEffectEventData,
  AnimationCompleteEventData,
} from '@/domain/battle/type/BattleEventType'
import type { UIParticipantSnapshot } from '@/shared/types/projection'
import type {
  BattleLogCategory,
  BattleLogEntry,
  LogFilters,
  LogSegment,
} from '@/shared/types/battle-log'
import {
  BATTLE_LOG_CATEGORIES,
  battleActionToLogEntry,
  LogType,
  toLogLevel,
} from '@/shared/types/battle-log'
import type { Enemy } from '@/shared/types/enemy'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { defineStore } from 'pinia'
import { onScopeDispose, reactive, ref, shallowRef, shallowReactive } from 'vue'
import { BattleProjection } from '@/application/projection/BattleProjection'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { BATTLE_RULE_MANAGER_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleRuleManager } from '@/domain/battle/service/BattleRuleManager'
import { getActionBudget } from '@/shared/constants/animation-timing'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import { STORAGE_STORE } from '@/domain/port/IPersistentStorage'

export interface BattleRules {
  /** 是否按速度决定行动顺序（true=速度优先，false=固定顺序） */
  speedFirst: boolean
  /** 是否使用固定回合数限制 */
  fixedTurns: boolean
  /** 是否启用暴击机制 */
  critEnabled: boolean
  /** 是否启用闪避机制 */
  dodgeEnabled: boolean
}

/** 动画步骤类型（与 AnimationState key 一一对应） */
export const SkillStepType = {
  DAMAGE: 'damage',
  MISS: 'miss',
  BUFF: 'buff',
  HEAL: 'heal',
  STATUS: 'status',
} as const
export type SkillStepType = (typeof SkillStepType)[keyof typeof SkillStepType]

export interface AnimationState {
  /** 伤害动画数据（目标ID、伤害值、类型、是否暴击/治疗） */
  damage: DamageEventData | null
  /** 闪避动画数据（目标ID） */
  miss: MissEventData | null
  /** Buff效果动画数据（目标ID、Buff名称、正面/负面） */
  buff: BuffEffectEventData | null
  /** 技能特效动画数据（施法者、目标、技能名、效果类型、伤害大类） */
  skill: SkillEffectEventData | null
}

export interface LoadingState {
  /** 是否正在加载中（控制Loading遮罩显示） */
  isLoading: boolean
  /** 当前操作描述文本（如"开始战斗"、"执行回合"） */
  operation: string | null
  /** 加载进度百分比（0-100，用于进度条显示） */
  progress: number | null
}

export interface ErrorState {
  /** 是否存在错误（控制错误提示框显示） */
  hasError: boolean
  /** 错误信息摘要（用户友好的简短描述） */
  message: string | null
  /** 详细错误堆栈（技术细节，用于调试） */
  details: string | null
  /** 出错字段名（表单验证时定位具体字段） */
  field: string | null
}

// ================= Store 核心定义 (Composition API) =================
export const useBattleStore = defineStore('battle', () => {
  // 🔹 1. UI 层状态（仅负责视图渲染，与业务逻辑隔离）
  /** 战斗规则配置（速度优先/固定回合/暴击/闪避开关） */
  const rules = ref<BattleRules>({
    speedFirst: true,
    fixedTurns: false,
    critEnabled: true,
    dodgeEnabled: false,
  })
  /** 当前行动者角色ID（用于高亮显示当前行动方） */
  const currentActorId = ref<string | null>(null)
  /** 全局加载状态（控制 Loading 遮罩层显示与进度反馈） */
  const loading = reactive<LoadingState>({
    isLoading: false,
    operation: null,
    progress: null,
  })
  /** 全局错误状态（统一捕获并展示异常信息） */
  const error = reactive<ErrorState>({
    hasError: false,
    message: null,
    details: null,
    field: null,
  })
  /** 自动播放模式开关（启用后自动执行回合无需手动操作） */
  const autoPlayMode = ref(false)
  /** 暂停状态（暂停时按钮显示"继续"，非暂停显示"暂停"） */
  const isPaused = ref(false)
  /** 动画效果状态管理（伤害数字/闪避/Buff图标/技能特效的触发与清除） */
  const animationState = reactive<AnimationState>({
    damage: null,
    miss: null,
    buff: null,
    skill: null,
  })
  /** 当前战斗会话唯一标识（用于区分不同战斗实例和日志关联） */
  const currentBattleId = ref<string | null>(null)
  /** 回合行动顺序队列（按速度排序后的角色ID列表） */
  const turnOrder = ref<string[]>([])
  /** 战斗动画播放速度倍率（1x/2x/3x/5x 可选，影响动画持续时间） */
  const battleSpeed = ref(1)
  /** 日志过滤器配置（按类别控制日志面板的显示范围） */
  const filters = reactive<LogFilters>({
    battle: true,
    system: true,
    item: true,
    action: true,
    debug: false,
  })
  /** 已处理过的战斗动作ID集合（防止重复解析和显示同一动作） */
  const processedActionIds = ref(new Set<string>())

  const selectedCharacterId = ref<string | null>(null)
  /** 角色库预览实体（未加入队伍，仅供属性监控预览） */
  const previewEntity = shallowRef<BattleEntity | null>(null)

  // 🔹 2. 业务层引用（适配器桥接，使用 shallowRef 避免深层 Proxy 开销）
  /** 战斗应用服务（门面，通过依赖注入获取） */
  const battleService = shallowRef<BattleService | undefined>(
    container.resolve<BattleService>('BattleService'),
  )

  /** 我方队伍成员列表（响应式同步 BattleService 内部状态） */
  const allyTeam = shallowRef<BattleEntity[]>([])
  /** 敌方队伍成员列表（响应式同步 BattleService 内部状态） */
  const enemyTeam = shallowRef<BattleEntity[]>([])
  /** 完整我方队伍（含禁用角色，供参战管理面板使用） */
  const fullAllyTeam = shallowRef<BattleEntity[]>([])
  /** 完整敌方队伍（含禁用角色，供参战管理面板使用） */
  const fullEnemyTeam = shallowRef<BattleEntity[]>([])
  /** 当前战斗回合数（从1开始计数，用于日志和UI显示） */
  const currentTurn = ref(1)
  /** 最大回合数（从 BattleService 读取） */
  const maxTurns = ref(999)
  /** 战斗激活状态标识（true表示战斗进行中，false表示未开始或已结束） */
  const isBattleActive = ref(false)

  const showDebug = ref(true)

  /** ★ 快速战斗模式（跳过动画和等待） */
  const quickMode = ref(false)
  /** ★ 战斗数据生成进度 */
  const generationProgress = reactive({
    isGenerating: false,
    current: 0,
    total: 0,
    percent: 0,
  })
  /** ★ 当前运行的生成器引用（用于 destroy 时取消） */
  let _currentGenerator: import('@/application/service/BattleDataGenerator').BattleDataGenerator | null = null

  /** 参与者快照表 — UI 的唯一数据源（由投影层填充） */
  const participants = reactive(new Map<string, UIParticipantSnapshot>())

  /** 投影层调度器 */
  let projection: BattleProjection | null = null

  /**
   * 初始化投影层：创建 BattleProjection 实例，注册所有参与者并生成初始快照。
   * 仅首次调用时创建实例，后续调用只刷新注册和快照。
   * 手动调用此方法可确保领域实体 → UI 快照的初始状态注入。
   */
  const initProjection = (): void => {
    try {
      if (!projection) {
        const buffSystem = container.resolve<BuffSystem>('BuffSystem')
        projection = new BattleProjection({ participants }, buffSystem)
      }
      const allEntities = [...allyTeam.value, ...enemyTeam.value]
      projection.clear()
      projection.registerAll(allEntities)
      projection.flushAll()
    } catch (err) {
      console.error('[BattleProjection] 初始化/刷新失败:', err)
    }
  }

  /**
   * 同步队伍数据（从 BattleService 拉取最新状态）
   * @description 当收到 TEAM_DATA_CHANGED 事件时调用，更新本地响应式状态并刷新投影层快照
   */
  const syncTeams = () => {
    // 用 shallowReactive 包装参与者，使 Vue computed 能追踪场内属性变更（如 statsVersion）。
    // 原始对象由 BattleSystem 管理并通过事件告知 UI 层，proxy 确保修改走 Vue 响应式系统。
    allyTeam.value = battleService
      .value!.getEnabledAllyTeam()
      .map((p) => shallowReactive(p))
    enemyTeam.value = battleService
      .value!.getEnabledEnemyTeam()
      .map((p) => shallowReactive(p))
    fullAllyTeam.value = battleService
      .value!.getAllyTeam()
      .map((p) => shallowReactive(p))
    fullEnemyTeam.value = battleService
      .value!.getEnemyTeam()
      .map((p) => shallowReactive(p))
    currentTurn.value = battleService.value!.getCurrentTurn()
    maxTurns.value = battleService.value!.getMaxTurns?.() ?? 999
    const battleState = battleService.value!.getBattleState()
    isBattleActive.value =
      battleState?.battleState != null &&
      battleState.battleState !== BattleStatus.ENDED &&
      battleState.battleState !== BattleStatus.CREATED &&
      battleState.battleState !== BattleStatus.PREPARING
    isPaused.value = battleService.value!.getIsPaused()

    // 刷新投影层快照（首次调用时自动初始化）
    initProjection()
  }

  // 所有事件订阅在 events Map 创建后统一注册（见下方 🔹 3. 事件订阅管理器）

  // 🔹 4. 事件处理器（仅负责同步业务数据到响应式状态）

  /** 处理战斗日志事件（将日志数据添加到日志管理器） */
  const handleBattleLogEvent = (data: BattleLogEventData) => {
    if (data?.log) {
      console.log('接受战斗日志:', data)
      battleLogManager.addSystemLog(data.log)
    }
  }

  /** 处理战斗结束事件（重置战斗状态，记录胜负结果） */
  const handleBattleEndEvent = (data: BattleEndedEventData) => {
    isBattleActive.value = false
    isPaused.value = false
    autoPlayMode.value = false
    // 同步 BattleStateManager 的状态
    if (battleService.value) {
      battleService.value.syncBattleState()
    }
    if (data?.winner) {
      battleLogManager.addBattleLog({
        turn: battleService.value?.getTurn() ?? 1,
        message: `战斗结束！胜利者：${ParticipantSideName[data.winner!]}`,
        segments: [
          {
            text: `战斗结束！胜利者：${ParticipantSideName[data.winner!]}`,
          },
        ],
        category: BATTLE_LOG_CATEGORIES.STATUS,
        meta: { role: 'battle' },
      })
    }
  }

  /** 处理回合开始事件（更新当前行动者ID） */
  const handleTurnStartEvent = (data: { actorId: string | null }) => {
    if (data?.actorId) {
      currentActorId.value = data.actorId
    }
  }

  /** 处理当前行动者切换事件（仅更新 UI，不记录回合开始日志） */
  const handleCurrentActorChanged = (data: { actorId: string | null }) => {
    if (data?.actorId) {
      currentActorId.value = data.actorId
    }
  }

  /** 处理回合结束事件 */
  const handleTurnEndEvent = () => {}

  /** 处理伤害动画事件（触发伤害数字飘字效果） */
  const handleDamageAnimationEvent = (data: DamageEventData) =>
    setAnimationState(SkillStepType.DAMAGE, data)
  /** 处理闪避动画事件（触发闪避提示效果） */
  const handleMissAnimationEvent = (data: MissEventData) =>
    setAnimationState(SkillStepType.MISS, data)
  /** 处理Buff效果事件（触发Buff图标显示/隐藏） */
  const handleBuffEffectEvent = (data: BuffEffectEventData) =>
    setAnimationState(SkillStepType.BUFF, data)
  /** 处理技能特效事件（触发技能释放动画） */
  const handleSkillEffectEvent = (data: SkillEffectEventData) =>
    setAnimationState('skill', data)

  /** 处理动画完成事件（清除对应动画状态，避免定时器竞态） */
  const handleAnimationCompleteEvent = (data: AnimationCompleteEventData) => {
    const typeMap: Record<string, keyof AnimationState> = {
      [BattleEventCodes.DAMAGE_ANIMATION]: 'damage',
      [BattleEventCodes.MISS_ANIMATION]: 'miss',
      [BattleEventCodes.BUFF_EFFECT]: 'buff',
      [BattleEventCodes.SKILL_EFFECT]: 'skill',
    }
    const key = typeMap[data.type]
    if (key) clearAnimationState(key)
  }

  /** 处理战斗重置事件（记录系统日志） */
  const handleBattleResetEvent = () => {
    battleLogManager.addSystemLog({ message: '战斗重置' })
  }
  // 🔹 3. 事件订阅管理器（防止内存泄漏）
  /** 事件处理器映射表（将事件码与对应的处理函数关联） */
  const events = new Map<BattleEventCode, (data: any) => void>()
  events.set(BattleEventCodes.BATTLE_LOG, handleBattleLogEvent)
  events.set(BattleEventCodes.BATTLE_ENDED, handleBattleEndEvent)
  events.set(BattleEventCodes.BATTLE_RESET, handleBattleResetEvent)
  events.set(BattleEventCodes.TURN_START, handleTurnStartEvent)
  events.set(BattleEventCodes.TURN_END, handleTurnEndEvent)
  events.set(BattleEventCodes.CURRENT_ACTOR_CHANGED, handleCurrentActorChanged)
  events.set(BattleEventCodes.DAMAGE_ANIMATION, handleDamageAnimationEvent)
  events.set(BattleEventCodes.MISS_ANIMATION, handleMissAnimationEvent)
  events.set(BattleEventCodes.BUFF_EFFECT, handleBuffEffectEvent)
  events.set(BattleEventCodes.SKILL_EFFECT, handleSkillEffectEvent)
  events.set(BattleEventCodes.ANIMATION_COMPLETE, handleAnimationCompleteEvent)
  /** 处理参与者属性变更事件（Buff 触发 recalculateAll 后，在 proxy 上同步调用以使 Vue 响应式系统追踪到变更） */
  const handleAttributeChanged = (data: { characterId: string }) => {
    const id = data.characterId
    // ponytail: 从当前 proxy 数组中找到目标，调用其 recalculateAll 走 proxy set trap
    const proxy =
      allyTeam.value.find((p) => p.id === id) ??
      enemyTeam.value.find((p) => p.id === id) ??
      fullAllyTeam.value.find((p) => p.id === id) ??
      fullEnemyTeam.value.find((p) => p.id === id)
    proxy?.recalcAll()
  }

  events.set(
    BattleEventCodes.PARTICIPANT_ATTRIBUTE_CHANGED,
    handleAttributeChanged,
  )
  events.set(BattleEventCodes.TEAM_DATA_CHANGED, syncTeams)
  /** 需要清理的事件码列表（用于组件卸载时移除监听器） */
  const cleanupEvents = [...events.keys()]

  // 注册所有事件处理器到战斗管理器（桥上 eventBus）
  for (const [eventCode, handler] of events) {
    battleService.value!.on(eventCode as BattleEventName, handler)
  }

  // 🔹 5. 核心 Actions（纯函数，仅更新本地状态或调用 Manager）

  /**
   * 初始化战斗管理器
   * @param manager BattleService 实例（通常在应用启动时注入）
   * @description 将外部传入的战斗管理器实例绑定到 Store 状态中
   */
  const initializeBattleService = (manager: BattleService) => {
    battleService.value = manager
    battleLogManager.addSystemLog({ message: '战斗管理器已初始化' })
  }

  /**
   * 设置全局加载状态
   * @param isLoading 是否正在加载
   * @param operation 当前操作描述（如"开始战斗"、"执行回合"）
   * @param progress 加载进度百分比（0-100）
   */
  const setLoading = (
    isLoading: boolean,
    operation: string | null = null,
    progress: number | null = null,
  ) => {
    loading.isLoading = isLoading
    loading.operation = operation
    loading.progress = progress
  }

  /** 更新加载进度值（自动限制在0-100范围内） */
  const updateLoadingProgress = (progress: number) => {
    loading.progress = Math.max(0, Math.min(100, progress))
  }

  /**
   * 设置全局错误状态
   * @param message 错误信息摘要
   * @param details 详细错误堆栈信息
   * @param field 出错的字段名（用于表单验证错误定位）
   */
  const setError = (
    message: string | null,
    details: string | null = null,
    field: string | null = null,
  ) => {
    error.hasError = !!message
    error.message = message
    error.details = details
    error.field = field
    if (message && details)
      console.error(`[Battle Error] ${message}: ${details}`)
    else if (message) console.error(`[Battle Error] ${message}`)
  }

  /** 清除全局错误状态（重置为初始值） */
  const clearError = () => {
    error.hasError = false
    error.message = null
    error.details = null
    error.field = null
  }

  /** 重置 Store 所有状态到初始值（用于组件卸载或状态清理） */
  const clearState = () => {
    setLoading(false)
    clearError()
  }

  /** 设置自动播放模式开关 */
  const setAutoPlayMode = (mode: boolean) => {
    autoPlayMode.value = mode
  }
  /** 设置战斗激活状态（控制UI交互可用性） */
  const setBattleActive = (active: boolean) => {
    isBattleActive.value = active
  }
  /** 设置显示调试信息状态 */
  const setShowDebug = (show: boolean) => {
    showDebug.value = show
  }
  /** 清空所有战斗日志和已处理动作记录 */
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
    level?: LogType,
  ) => {
    battleLogManager.addSystemLog({
      turn,
      source,
      action,
      target,
      segments,
      category,
      level: level ? toLogLevel(level) : undefined,
    })
  }

  /**
   * 更新战斗规则
   */
  const updateRules = (newRules: Partial<BattleRules>) => {
    Object.assign(rules.value, newRules)
    // ★ 同步暴击/闪避开关到领域层规则管理器，下一场战斗 initialize 时生效
    try {
      const ruleManager = container.resolve<BattleRuleManager>(
        BATTLE_RULE_MANAGER_TOKEN.toString(),
      )
      const config = ruleManager.getConfig()
      ruleManager.updateConfig({
        rules: {
          ...config.rules,
          combat: {
            ...config.rules.combat,
            critEnabled: rules.value.critEnabled,
            dodgeEnabled: rules.value.dodgeEnabled,
          },
        },
      })
    } catch {
      console.warn('[battleStore] BattleRuleManager 未就绪，规则同步跳过')
    }
    battleLogManager.addSystemLog({
      message: `战斗规则已更新: ${JSON.stringify(newRules)}`,
    })
  }

  /**
   * 设置动画效果状态
   * @param type 动画类型
   * @param data 动画数据对象
   * @description 触发指定类型的动画效果，超时后自动清除（ANIMATION_COMPLETE 事件优先）
   */
  const setAnimationState = <T extends keyof AnimationState>(type: T, data: AnimationState[T]) => {
    animationState[type] = data
    // NOTE: 每个动画阶段最多持有 50%T 预算（领域层在同一时长内完成）
    const phaseDuration = getActionBudget(battleSpeed.value) * 0.5
    // 清除之前的超时防止竞态
    if (_stateTimeouts[type]) {
      clearTimeout(_stateTimeouts[type])
    }
    _stateTimeouts[type] = setTimeout(() => {
      animationState[type] = null
      _stateTimeouts[type] = null
    }, phaseDuration)
  }

  /** 存储每个动画类型的 setTimeout id（用于竞态安全的清除） */
  const _stateTimeouts: Record<string, ReturnType<typeof setTimeout> | null> = {
    damage: null,
    miss: null,
    buff: null,
    skill: null,
  }

  /** 主动清除动画状态（由 ANIMATION_COMPLETE 事件驱动） */
  const clearAnimationState = (type: keyof AnimationState) => {
    if (_stateTimeouts[type]) {
      clearTimeout(_stateTimeouts[type])
      _stateTimeouts[type] = null
    }
    animationState[type] = null
  }

  // 🔹 业务动作包装器（统一错误处理与 Loading 状态）

  /**
   * 开始新战斗
   * @returns Promise<boolean> 操作是否成功
   * @description 初始化战斗会话，生成战斗ID，同步状态并启动战斗循环
   */
  const startBattle = async () => {
    setLoading(true, '开始战斗')
    clearError()
    try {
      if (generationProgress.isGenerating) throw new Error('战斗数据生成中，请等待完成')
      if (!battleService.value) throw new Error('战斗管理器未初始化')
      const battleId = await battleService.value.startBattle()
      if (!battleId) throw new Error('战斗创建失败，请检查参战队伍的配置')
      currentBattleId.value = battleId
      battleService.value.syncBattleState()
      setBattleActive(true)
      autoPlayMode.value = battleService.value.getAutoBattle()
      battleLogManager.addSystemLog({ message: '战斗已开始' })
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`开始战斗失败: ${errorMsg}`)
      return false
    } finally {
      setLoading(false)
    }
  }

  /**
   * 结束当前战斗
   * @param winner 胜利方阵营（默认为我方胜利）
   * @returns Promise<boolean> 操作是否成功
   * @description 终止战斗会话，记录胜负结果，清理相关状态
   */
  const endBattle = async (
    winner: typeof ParticipantSide.ALLY = ParticipantSide.ALLY,
  ) => {
    setLoading(true, '结束战斗')
    clearError()
    try {
      if (generationProgress.isGenerating) throw new Error('战斗数据生成中，请等待完成')
      if (!battleService.value) throw new Error('战斗管理器未初始化')
      battleService.value.endBattle(winner)
      battleService.value.syncBattleState()
      setBattleActive(false)
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`结束战斗失败: ${errorMsg}`)
      return false
    } finally {
      setLoading(false)
    }
  }

  /**
   * 重置战斗状态
   * @returns Promise<boolean> 操作是否成功
   * @description 清空所有战斗数据，重置回合数和日志，恢复到初始状态
   */
  const resetBattle = async () => {
    setLoading(true, '重置战斗')
    clearError()
    try {
      if (generationProgress.isGenerating) throw new Error('战斗数据生成中，请等待完成')
      if (!battleService.value) throw new Error('战斗管理器未初始化')
      battleService.value.reset()
      currentActorId.value = null
      setBattleActive(false)
      clearBattleLogs()
      currentBattleId.value = null
      turnOrder.value = []
      battleLogManager.addSystemLog({ message: '战斗已重置' })
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`重置战斗失败: ${errorMsg}`)
      return false
    } finally {
      setLoading(false)
    }
  }

  /**
   * 执行单个回合
   * @returns Promise<boolean> 操作是否成功
   * @description 手动触发下一回合的战斗逻辑执行（用于非自动模式下的单步操作）
   */
  const processSingleTurn = async () => {
    setLoading(true, '执行回合')
    clearError()
    try {
      if (generationProgress.isGenerating) throw new Error('战斗数据生成中，请等待完成')
      if (!battleService.value) throw new Error('战斗管理器未初始化')
      await battleService.value.processSingleTurn()
      battleService.value.syncBattleState()
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`执行回合时出错: ${errorMsg}`)
      return false
    } finally {
      setLoading(false)
    }
  }

  /**
   * 切换自动播放模式
   * @returns Promise<boolean> 操作是否成功
   * @description 在自动战斗和手动模式之间切换，失败时自动恢复原状态
   */
  const toggleAutoPlay = async () => {
    setLoading(true)
    clearError()
    try {
      if (generationProgress.isGenerating) throw new Error('战斗数据生成中，请等待完成')
      if (!battleService.value) throw new Error('战斗管理器未初始化')
      const isActive = battleService.value.getAutoBattle()
      if (isActive) {
        battleService.value.stopAutoBattle()
        autoPlayMode.value = false
        isBattleActive.value = false
        battleLogManager.addSystemLog({ message: '停止自动战斗' })
      } else {
        await battleService.value.startAutoBattle()
        autoPlayMode.value = true
        isBattleActive.value = true
        battleService.value.syncBattleState()
        battleLogManager.addSystemLog({ message: '开始自动战斗' })
      }
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      battleLogManager.addDebugLog(`切换自动战斗状态失败: ${errorMsg}`)
      autoPlayMode.value = !autoPlayMode.value // 恢复原状态
      return false
    } finally {
      setLoading(false)
    }
  }

  /**
   * 切换暂停状态
   * @returns boolean 操作是否成功
   */
  const togglePause = () => {
    try {
      if (generationProgress.isGenerating) return false
      if (!battleService.value) return false
      battleService.value.togglePause()
      isPaused.value = battleService.value.getIsPaused()
      battleLogManager.addSystemLog({
        message: isPaused.value ? '战斗已暂停' : '战斗已继续',
      })
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      return false
    }
  }

  /**
   * 导入战斗状态（从 IndexedDB 恢复）
   * @returns Promise<boolean> 操作是否成功
   * @description 从持久化存储读取之前保存的战斗状态数据
   */
  const importState = async () => {
    setLoading(true)
    clearError()
    try {
      const savedState = await persistentStorage.get(STORAGE_STORE.SNAPSHOTS, 'battleStateExport')
      if (savedState) {
        battleLogManager.addSystemLog({ message: '战斗状态已导入' })
        return true
      }
      throw new Error('没有找到保存的战斗状态')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      return false
    } finally {
      setLoading(false)
    }
  }

  /**
   * 导出战斗状态（保存到 IndexedDB）
   * @param currentTurn 当前回合数
   * @returns boolean 操作是否成功
   * @description 将当前战斗状态（队伍、回合数、规则等）序列化后保存到持久化存储
   */
  const exportState = async (currentTurn: number) => {
    try {
      const allyTeam = battleService.value?.getEnabledAllyTeam() || []
      const enemyTeam = battleService.value?.getEnabledEnemyTeam() || []
      const state = {
        battleCharacters: allyTeam,
        enemyParty: enemyTeam,
        currentTurn,
        rules: rules.value,
        battleLogs: battleLogManager.getSystemLogs(),
      }
      await persistentStorage.set(STORAGE_STORE.SNAPSHOTS, 'battleStateExport', state)
      battleLogManager.addSystemLog({ message: '战斗状态已导出' })
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      return false
    }
  }

  /**
   * 设置战斗动画播放速度
   * @param speed 速度倍率（1/2/3/5）
   * @returns boolean 操作是否成功
   * @description 调整战斗动画的播放速度，影响所有动画效果的持续时间
   */
  const setBattleSpeed = (speed: number) => {
    try {
      if (!battleService.value) throw new Error('战斗管理器未初始化')
      battleService.value.setBattleSpeed(speed)
      battleSpeed.value = speed
      battleLogManager.addSystemLog({ message: `战斗速度已调整为: ${speed}倍` })
      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg, err instanceof Error ? err.stack : null)
      return false
    }
  }

  /** ★ 切换快速战斗模式 */
  const toggleQuickMode = () => {
    if (!battleService.value) return
    quickMode.value = !quickMode.value
    battleService.value.setQuickMode(quickMode.value)
    battleLogManager.addSystemLog({
      message: quickMode.value ? '快速战斗已开启（跳过动画）' : '快速战斗已关闭',
    })
  }

  /** ★ 执行战斗数据生成 */
  const generateBattleData = async (mode: '1v1' | '2v2' | 'random' = 'random', format: 'txt' | 'html' = 'txt') => {
    if (!battleService.value) return
    if (generationProgress.isGenerating) return
    generationProgress.isGenerating = true
    generationProgress.current = 0
    generationProgress.percent = 0

    try {
      const { BattleDataGenerator } = await import('@/application/service/BattleDataGenerator')
      const generator = new BattleDataGenerator(container)
      _currentGenerator = generator
      await generator.generate({
        totalBattles: 50,
        mode,
        format,
        onProgress: (_progress: number, current: number, total: number) => {
          generationProgress.current = current
          generationProgress.total = total
          generationProgress.percent = Math.round((current / total) * 100)
        },
      })
      battleLogManager.addSystemLog({ message: `战斗数据生成完成（${mode}×50场），文件已下载` })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      battleLogManager.addDebugLog(`战斗数据生成失败: ${msg}`)
    } finally {
      generationProgress.isGenerating = false
      _currentGenerator = null
    }
  }

  /**
   * 销毁战斗管理器并清理所有资源
   * @description 移除所有事件监听器，重置状态，释放内存，防止内存泄漏
   * 通常在组件卸载或路由切换时调用
   */
  const destroy = () => {
    try {
      // ★ 取消正在执行的战斗数据生成
      if (_currentGenerator) {
        _currentGenerator.cancel()
        _currentGenerator = null
        generationProgress.isGenerating = false
      }

      if (!battleService.value) return
      cleanupEvents.forEach((key) => battleService.value!.off(key))
      cleanupEvents.length = 0
      projection?.clear()
      projection = null
      participants.clear()
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
      battleService.value = undefined
      console.log('战斗管理器事件监听器已清理')
    } catch (err) {
      console.error('清理战斗管理器事件监听器时出错:', err)
    }
  }

  /**
   * 解析单个战斗动作并转换为日志条目
   * @param action 战斗动作对象
   * @param battleState 当前战斗状态快照
   * @returns 解析结果（日志条目和是否需要显示）
   * @description 将原始战斗动作数据转换为格式化的日志条目，并处理去重逻辑
   */
  const parseBattleAction = async (
    action: BattleAction,
    battleState: BattleState,
  ): Promise<{ log: BattleLogEntry | null; shouldDisplay: boolean }> => {
    if (processedActionIds.value.has(action.id))
      return { log: null, shouldDisplay: false }
    processedActionIds.value.add(action.id)
    const sourceIsAlly =
      action.sourceId !== 'system'
        ? battleState.participants.get(action.sourceId)?.team ===
          ParticipantSide.ALLY
        : false
    const targetIsAlly =
      action.targetId && action.targetId !== 'system'
        ? battleState.participants.get(action.targetId)?.team ===
          ParticipantSide.ALLY
        : undefined
    const fullLog = battleActionToLogEntry(action, battleState.participants, {
      turnNumber: action.turn,
      sourceIsAlly,
      targetIsAlly,
    })
    return { log: fullLog, shouldDisplay: shouldDisplayLog(fullLog) }
  }

  /**
   * 同步战斗日志（批量处理所有动作）
   * @param battleState 当前战斗状态快照
   * @description 按时间戳排序所有动作，逐一解析并添加到日志管理器
   */
  const syncBattleLogs = async (battleState: BattleState) => {
    const sortedActions = [...battleState.actions].sort((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
      const turnA = a.turn || 0
      const turnB = b.turn || 0
      if (turnA !== turnB) return turnA - turnB
      return a.id.localeCompare(b.id)
    })
    for (const action of sortedActions) {
      const { log, shouldDisplay } = await parseBattleAction(
        action,
        battleState,
      )
      if (!shouldDisplay || !log) continue
      battleLogManager.addBattleLog({
        turn: log.turn ?? sortedActions.indexOf(action) + 1,
        message: log.segments?.map((s) => s.text).join('') ?? '',
        segments: log.segments,
        category: log.category ?? 'battle',
        source: log.source,
        target: log.target,
      })
    }
  }

  /**
   * 根据技能ID获取技能名称
   * @param skillId 技能唯一标识
   * @returns Promise<string> 技能名称（未找到则返回"未知技能"）
   */
  const getSkillName = async (skillId: string | undefined): Promise<string> => {
    if (!skillId) return ''
    const skill = GameDataProcessor.findSkillById(skillId)
    return skill?.name || '未知技能'
  }

  /**
   * 判断日志是否应该显示（基于当前过滤器配置）
   * @param log 日志条目
   * @returns boolean 是否符合显示条件
   * @description 根据日志类别和过滤器设置决定该日志是否需要在UI中展示
   */
  const shouldDisplayLog = (log: BattleLogEntry): boolean => {
    const category = log.category
    const logText = log.segments!.map((s) => s.text).join('')
    const isLogExists = false // 简化逻辑，实际可按需接入日志去重
    if (category === 'system' && !filters.system) return false
    if (
      category === 'action' &&
      log.source &&
      log.source !== '系统' &&
      !log.source.includes(ParticipantSide.ENEMY) &&
      !filters.action
    )
      return false
    if (
      category === 'action' &&
      log.source &&
      log.source.includes(ParticipantSide.ENEMY) &&
      !filters.action
    )
      return false
    if (!filters.battle && category === SkillStepType.DAMAGE) return false
    if (!filters.battle && category === SkillStepType.HEAL) return false
    if (!filters.battle && category === SkillStepType.STATUS) return false
    return true
  }

  /**
   * 选中指定角色（用于属性面板显示和操作目标选择）
   * @param characterId 角色唯一标识
   */
  const selectCharacter = (characterId: string) => {
    battleService.value!.selectCharacter(characterId)
    selectedCharacterId.value = characterId
    previewEntity.value = null // 选中真实参战角色时清除预览
  }

  /**
   * 预览角色库中的角色（转为 BattleEntity 存入预览，不加入队伍）
   * @param enemy 角色库中的敌人数据
   */
  const previewRosterCharacter = (enemy: Enemy) => {
    const entity = GameDataProcessor.enemyToParticipant(
      enemy,
      ParticipantSide.ENEMY,
    )
    // ponytail: 注册触发型被动技能到 PassiveSkillManager（预览时生效）
    const passiveSkillManager = container.resolve<any>('PassiveSkillManager')
    GameDataProcessor.registerParticipantPassives(entity, passiveSkillManager)
    previewEntity.value = entity
    selectedCharacterId.value = entity.id
  }

  /**
   * 设置角色启用/禁用状态
   * @param characterId 角色唯一标识
   * @param enabled 是否启用（false表示禁用该角色参与战斗）
   */
  const setCharacterEnabled = (characterId: string, enabled: boolean) => {
    battleService.value!.setCharacterEnabled(characterId, enabled)
  }
  // 🔹 气血周期清理（防止 SPA 路由切换导致内存泄漏）
  onScopeDispose(() => {
    destroy()
  })

  // 🔹 暴露给外部
  return {
    // ========== 状态属性（State） ==========
    rules, // 战斗规则配置
    currentActorId, // 当前行动者ID
    loading, // 加载状态
    error, // 错误状态
    autoPlayMode, // 自动播放模式
    animationState, // 动画效果状态
    currentBattleId, // 当前战斗ID
    turnOrder, // 回合行动顺序
    battleSpeed, // 战斗速度
    filters, // 日志过滤器
    processedActionIds, // 已处理动作ID集合
    battleService, // 战斗应用服务
    selectedCharacterId, // 选中角色ID
    previewEntity, // 角色库预览实体

    // ========== 业务数据（Data） ==========
    allyTeam, // 我方队伍
    enemyTeam, // 敌方队伍
    fullAllyTeam, // 完整我方队伍（含禁用）
    fullEnemyTeam, // 完整敌方队伍（含禁用）
    participants, // 参与者快照表（投影层数据）
    currentTurn, // 当前回合数
    maxTurns, // 最大回合数
    isBattleActive, // 战斗激活状态
    isPaused, // 暂停状态
    showDebug, // 显示调试信息状态
    quickMode, // ★ 快速战斗模式
    generationProgress, // ★ 战斗数据生成进度

    // ========== Computed Getters (用于模板访问) ==========
    getCurrentActorId: () => currentActorId.value,
    getIsBattleActive: () => isBattleActive.value,
    getAnimationState: () => animationState,
    getCurrentTurn: () => currentTurn.value,
    getEnabledAllyTeam: () => allyTeam.value,
    getEnabledEnemyTeam: () => enemyTeam.value,
    getTurnOrder: () => turnOrder.value,
    getBattleSpeed: () => battleSpeed.value,

    // ========== 同步方法（Sync） ==========
    syncTeams, // 同步队伍数据
    initProjection, // 初始化/刷新投影层快照

    // ========== 核心操作（Actions） ==========
    initializeBattleService, // 初始化战斗管理器
    setLoading, // 设置加载状态
    updateLoadingProgress, // 更新加载进度
    setError, // 设置错误状态
    clearError, // 清除错误状态
    clearState, // 重置所有状态
    setAutoPlayMode, // 设置自动播放
    setBattleActive, // 设置战斗激活状态
    clearBattleLogs, // 清空日志
    setAnimationState, // 设置动画状态
    clearAnimationState, // 主动清除动画状态
    getAnimationDuration: () => getActionBudget(battleSpeed.value), // 兼容旧接口名
    setShowDebug, // 设置显示调试信息状态

    // ========== 战斗流程控制 ==========
    startBattle, // 开始战斗
    endBattle, // 结束战斗
    resetBattle, // 重置战斗
    processSingleTurn, // 执行单回合
    toggleAutoPlay, // 切换自动播放
    togglePause, // 切换暂停

    // ========== 数据导入导出 ==========
    importState, // 导入状态
    exportState, // 导出状态

    // ========== 配置与清理 ==========
    setBattleSpeed, // 设置战斗速度
    destroy, // 销毁并清理资源

    // ========== 快速战斗 ==========
    toggleQuickMode, // 切换快速战斗模式
    generateBattleData, // 执行战斗数据生成

    // ========== 日志处理 ==========
    parseBattleAction, // 解析战斗动作
    syncBattleLogs, // 同步战斗日志
    getSkillName, // 获取技能名称
    shouldDisplayLog, // 判断是否显示日志
    addLog, // 添加系统日志
    updateRules, // 更新战斗规则

    // ========== 角色操作 ==========
    selectCharacter, // 选中角色
    previewRosterCharacter, // 预览角色库角色
    setCharacterEnabled, // 设置角色启用/禁用
  }
})
