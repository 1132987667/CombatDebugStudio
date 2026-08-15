/**
 ** 文件: BattleManager.ts
 ** 创建日期: 2026-02-09
 ** 作者: CombatDebugStudio
 ** 功能: 战斗管理器
 ** 描述: 协调子管理器（AutoBattle、Intervention、Replay、State），提供统一的接口给 UI 层控制战斗流程
 **/
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStateManager } from '@/domain/battle/state/BattleStateManager'
import { AutoBattleManager } from '@/domain/battle/auto/AutoBattleManager'
import {
  ParticipantSide,
  BattleEntity,
  BATTLE_CONSTANTS,
  BattleStatus,
} from '@/domain/battle/type/types'
import { BattleEventCodes, type BattleEndedEventData } from '@/domain/battle/type/BattleEventType'
import type {
  BattleEvents,
  BattleEventName,
} from '@/domain/battle/type/BattleEventType'
import type { IUIEventPort } from '@/domain/port/IUIEventPort'
import type { Emitter } from 'mitt'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'

/**
 * 战斗管理器
 * 负责协调各个子管理器，提供统一的接口给UI组件
 */
export class BattleManager {
  /**
   * 构造函数
   * @param battleSystem 战斗系统实例
   * @param battleStateManager 战斗状态管理器实例
   * @param autoBattleManager 自动战斗管理器实例
   * @param battleReplayManager 战斗回放管理器实例
   */
  /** 已注册的事件处理器引用（用于 off 时精确移除） */
  private handlers = new Map<BattleEventName, Set<(...args: unknown[]) => void>>()
  /** 我方队伍编成（参战管理的真实数据源，独立于战斗运行时） */
  private allyTeam: BattleEntity[] = []
  /** 敌方队伍编成（参战管理的真实数据源，独立于战斗运行时） */
  private enemyTeam: BattleEntity[] = []

  /** 发送队伍变更事件 */
  private emitTeamChanged(): void {
    this.uiEventPort.emit(BattleEventCodes.TEAM_DATA_CHANGED, {
      allyTeam: this.getEnabledAllyTeam(),
      enemyTeam: this.getEnabledEnemyTeam(),
    })
  }

  constructor(
    private battleSystem: BattleSystem,
    private battleStateManager: BattleStateManager,
    private autoBattleManager: AutoBattleManager,
    private readonly uiEventPort: IUIEventPort,
    private readonly emitter: Emitter<BattleEvents>,
  ) {}

  /** 当前场景 ID */
  private currentSceneId?: string

  /** 阵型配置 */
  private allyFormation?: import('@/shared/types/formation').FormationConfig
  private enemyFormation?: import('@/shared/types/formation').FormationConfig

  /**
   * 获取当前回合数
   * @returns 当前回合数（从1开始）
   */
  getTurn(): number {
    return this.battleSystem.getRound()
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param data 事件数据
   */
  private emit<T extends BattleEventName>(event: T, data: BattleEvents[T]) {
    this.uiEventPort.emit(event as string, data)
  }

  /**
   * 订阅事件
   * @param event 事件名称
   * @param callback 回调函数
   */
  on<T extends BattleEventName>(
    event: T,
    callback: (data: BattleEvents[T]) => void,
  ) {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(callback as (...args: unknown[]) => void)
    this.emitter.on(event, callback)
  }

  /**
   * 取消订阅事件
   * @param event 事件名称
   */
  off<T extends BattleEventName>(
    event: T,
    callback?: (data: BattleEvents[T]) => void,
  ) {
    const set = this.handlers.get(event)
    if (!set) return
    if (callback) {
      set.delete(callback as (...args: unknown[]) => void)
      this.emitter.off(event, callback)
    } else {
      for (const cb of set) {
        this.emitter.off(event, cb)
      }
      this.handlers.delete(event)
    }
  }

  /**
   * 获取战斗系统实例
   */
  getBattleSystem(): BattleSystem {
    return this.battleSystem
  }

  /**
   * 获取战斗状态管理器
   */
  getBattleStateManager() {
    return this.battleStateManager
  }

  /**
   * 获取自动战斗管理器
   */
  getAutoBattleManager() {
    return this.autoBattleManager
  }

  validateTeams(allyTeam: BattleEntity[], enemyTeam: BattleEntity[]) {
    // 验证队伍数据
    if (!allyTeam || !enemyTeam) {
      throw new Error('队伍数据不能为空')
    }

    // 验证参与者数据
    if (allyTeam.length === 0 && enemyTeam.length === 0) {
      throw new Error('没有有效的参与者数据')
    }
  }

  /**
   * 为队伍成员分配位置序号（seatIndex）
   * 若有阵型配置则按槽位分配，否则按数组顺序分配
   */
  private assignSeatIndices(
    allyTeam: BattleEntity[],
    enemyTeam: BattleEntity[],
    allyFormation?: import('@/shared/types/formation').FormationConfig,
    enemyFormation?: import('@/shared/types/formation').FormationConfig,
  ): void {
    if (allyFormation) {
      allyTeam.forEach((p, i) => {
        const slot = allyFormation.slots[i]
        p.seatIndex = slot ? slot.index : i
      })
    } else {
      allyTeam.forEach((p, i) => {
        p.seatIndex = i
      })
    }
    if (enemyFormation) {
      enemyTeam.forEach((p, i) => {
        const slot = enemyFormation.slots[i]
        p.seatIndex = slot ? slot.index : i
      })
    } else {
      enemyTeam.forEach((p, i) => {
        p.seatIndex = i
      })
    }
  }

  /**
   * 初始化队伍数据
   * @param allyTeam 我方队伍（BattleEntity 数组）
   * @param enemyTeam 敌方队伍（BattleEntity 数组）
   */
  initializeTeams(allyTeam: BattleEntity[], enemyTeam: BattleEntity[]) {
    try {
      this.validateTeams(allyTeam, enemyTeam)

      // 为队伍成员分配位置序号
      this.assignSeatIndices(allyTeam, enemyTeam)

      // 保存队伍编成到内部数据源
      this.allyTeam = [...allyTeam]
      this.enemyTeam = [...enemyTeam]

      // 将参与者写入 battleData，使 UI 预览可用（不触发完整的战斗初始化日志）
      const battleData = this.battleSystem.getBattleData()
      if (!battleData) throw new Error('战斗数据未初始化')
      const participants = new Map<string, BattleEntity>()
      allyTeam.forEach((p) => participants.set(p.id, p))
      enemyTeam.forEach((p) => participants.set(p.id, p))
      battleData.participants = participants
      this.setBattleId(battleData.battleId)

      this.syncBattleState()
      this.emitTeamChanged()
      return { battleId: battleData.battleId }
    } catch (error) {
      LoggerProvider.logger.addDebugLog(`初始化队伍数据时出错: ${String(error)}`, {
        level: LogLevel.ERROR,
      })
      throw error
    }
  }

  /**
   * 获取我方队伍（BattleEntity 实例）
   * @returns 我方参与者数组
   */
  getAllyTeam(): BattleEntity[] {
    return [...this.allyTeam]
  }

  /**
   * 获取敌方队伍（BattleEntity 实例）
   * @returns 敌方参与者数组
   */
  getEnemyTeam(): BattleEntity[] {
    return [...this.enemyTeam]
  }

  /**
   * 获取启用的我方队伍
   * 直接在过滤阶段排除禁用角色，减少不必要的转换操作
   */
  getEnabledAllyTeam(): BattleEntity[] {
    return this.allyTeam.filter((c) => c.enabled)
  }

  /**
   * 获取启用的敌方队伍
   * 直接在过滤阶段排除禁用角色，减少不必要的转换操作
   */
  getEnabledEnemyTeam(): BattleEntity[] {
    return this.enemyTeam.filter((c) => c.enabled)
  }

  /**
   * 获取所有参与者（BattleEntity 实例）
   */
  getAllParticipants(): BattleEntity[] {
    return [...this.allyTeam, ...this.enemyTeam]
  }

  /**
   * 选择角色
   */
  selectCharacter(characterId: string) {
    this.battleStateManager.selectCharacter(characterId)
  }

  /**
   * 获取选中的角色ID
   */
  getSelectedCharacterId(): string | null {
    return this.battleStateManager.getSelectedCharacterId()
  }

  /**
   * 获取选中的角色（BattleEntity 实例）
   */
  getSelectedCharacter(): BattleEntity | null {
    const selectedId = this.getSelectedCharacterId()
    if (!selectedId) return null
    const allParticipants = this.getAllParticipants()
    return allParticipants.find((p) => p.id === selectedId) || null
  }

  /**
   * 设置角色启用状态
   */
  setCharacterEnabled(characterId: string, enabled: boolean) {
    const participant = this.findParticipant(characterId)
    if (participant) {
      participant.enabled = enabled
      this.emitTeamChanged()
    }
  }

  /**
   * 移动角色位置
   */
  moveCharacter(characterId: string, direction: number) {
    const team = this.allyTeam.find((p) => p.id === characterId)
      ? this.allyTeam
      : this.enemyTeam
    const enabledChars = team.filter((c) => c.enabled)
    const currentIndex = enabledChars.findIndex((c) => c.id === characterId)
    if (currentIndex < 0) return
    const newIndex = currentIndex + direction
    if (newIndex < 0 || newIndex >= enabledChars.length) return

    const targetChar = enabledChars[newIndex]
    const currentChar = enabledChars[currentIndex]
    const idx1 = team.indexOf(currentChar)
    const idx2 = team.indexOf(targetChar)
    ;[team[idx1], team[idx2]] = [team[idx2], team[idx1]]

    this.emitTeamChanged()
  }

  /**
   * 清空所有参与者
   */
  clearParticipants() {
    this.allyTeam = []
    this.enemyTeam = []
    this.battleSystem.resetBattle()
    this.battleStateManager.resetState()
    this.emitTeamChanged()
  }

  /**
   * 添加角色到队伍
   * @param character - 角色数据（BattleEntity）
   * @param side - 队伍类型
   */
  addCharacterToTeam(character: BattleEntity, side: ParticipantSide) {
    if (side === ParticipantSide.ALLY) {
      character.seatIndex = this.allyTeam.length
      this.allyTeam.push(character)
    } else {
      character.seatIndex = this.enemyTeam.length
      this.enemyTeam.push(character)
    }

    // 同步到 BattleSystem.participants Map
    const battleData = this.battleSystem.getBattleData()
    if (battleData?.participants) {
      battleData.participants.set(character.id, character)
    }

    // NOTE: 战斗进行中动态添加角色时，initialize() 不会再次执行（被动注册 + BATTLE_START
    //       触发只发生在 startBattle），必须立即注册并触发该角色的被动。
    //       编成阶段（战斗未开始）添加仍由 startBattle → initialize() 统一处理，
    //       避免与 initialize 中的 clearAll+重注册冲突。
    if (this.battleStateManager.getIsBattleActive()) {
      this.battleSystem.triggerPassiveSkillsForCharacter(character)
    }
    this.emitTeamChanged()
  }

  /**
   * 从队伍移除角色
   */
  removeCharacter(characterId: string) {
    const idxAlly = this.allyTeam.findIndex((p) => p.id === characterId)
    if (idxAlly >= 0) {
      this.allyTeam.splice(idxAlly, 1)
      // 同步从 BattleSystem.participants 移除
      const battleData = this.battleSystem.getBattleData()
      if (battleData?.participants) {
        battleData.participants.delete(characterId)
      }
      this.emitTeamChanged()
      return
    }
    const idxEnemy = this.enemyTeam.findIndex((p) => p.id === characterId)
    if (idxEnemy >= 0) {
      this.enemyTeam.splice(idxEnemy, 1)
      // 同步从 BattleSystem.participants 移除
      const battleData = this.battleSystem.getBattleData()
      if (battleData?.participants) {
        battleData.participants.delete(characterId)
      }
      this.emitTeamChanged()
    }
  }

  /**
   * 获取当前回合数
   */
  getCurrentTurn(): number {
    return this.battleStateManager.getCurrentTurn()
  }

  /**
   * 获取最大回合数
   */
  getMaxTurns(): number {
    return this.battleSystem.getBattleData()?.maxTurns ?? BATTLE_CONSTANTS.DEFAULT_MAX_TURNS
  }

  /**
   * 重置角色状态到初始值
   */
  resetCharacterStates() {
    ;[...this.allyTeam, ...this.enemyTeam].forEach((participant) => {
      participant.currentHealth = participant.maxHealth
      participant.currentEnergy = BATTLE_CONSTANTS.DEFAULT_INITIAL_ENERGY
    })

    this.emitTeamChanged()
  }

  /**
   * 查找参与者
   */
  private findParticipant(characterId: string): BattleEntity | undefined {
    return (
      this.allyTeam.find((p) => p.id === characterId) ||
      this.enemyTeam.find((p) => p.id === characterId)
    )
  }

  /**
   * 设置战斗 ID
   * @param battleId 战斗 ID
   */
  setBattleId(battleId: string) {
    this.battleStateManager.setBattleId(battleId)
  }

  /**
   * 同步战斗状态
   */
  syncBattleState() {
    this.battleStateManager.syncBattleState()
  }

  /**
   * 加载技能配置
   */
  loadSkillConfigs() {
    if (this.battleSystem) {
      this.battleSystem.loadSkillConfigs(GameDataProcessor.getSkillsData())
    }
  }

  /**
   * 设置阵型配置（presentation 层从 lineup.formationId 解析后写入；
   * startBattle 时用于座位分配 + 传递 BattleSystem 应用阵型 Buff）。
   * 传 undefined 表示该侧不启用阵型。
   */
  setFormations(
    allyFormation?: import('@/shared/types/formation').FormationConfig,
    enemyFormation?: import('@/shared/types/formation').FormationConfig,
  ): void {
    this.allyFormation = allyFormation
    this.enemyFormation = enemyFormation
  }

  /**
   * 开始战斗
   * 从 BattleData 获取启用的角色数据
   */
  async startBattle(seed?: string): Promise<string | null> {
    if (!this.battleSystem) {
      throw new Error('战斗系统未初始化')
    }

    const allyTeam = this.getEnabledAllyTeam()
    const enemyTeam = this.getEnabledEnemyTeam()

    if (allyTeam.length === 0 || enemyTeam.length === 0) {
      LoggerProvider.logger.addDebugLog('队伍数据未初始化，请先添加角色到队伍', { level: LogLevel.WARN })
      return null
    }

    // 为队伍成员分配位置序号（支持阵型槽位）
    this.assignSeatIndices(allyTeam, enemyTeam, this.allyFormation, this.enemyFormation)

    // 传递阵型配置到 BattleSystem
    this.battleSystem.setFormations(this.allyFormation, this.enemyFormation)

    // 直接使用 BattleEntity 数组（传入场景 ID；seed 可选，确定性复现用）
    const battleState = this.battleSystem.initialize(allyTeam, enemyTeam, this.currentSceneId, seed)
    this.battleSystem.setBattleState(BattleStatus.ACTIVE)
    this.battleStateManager.setBattleId(battleState.battleId)
    this.syncBattleState()
    this.emitTeamChanged()

    // 自动开始战斗
    if (this.battleSystem.getAutoBattle()) {
      await this.autoBattleManager.startAutoBattle(battleState.battleId)
    }
    return battleState.battleId
  }

  /**
   * 开始自动战斗
   * 统一通过 AutoBattleManager 启动，确保日志和状态同步
   */
  async startAutoBattle(): Promise<boolean> {
    const battleId = this.battleStateManager.getBattleId()
    if (!battleId) {
      LoggerProvider.logger.addSystemLog({ message: '请先创建战斗' })
      return false
    }
    return this.autoBattleManager.startAutoBattle(battleId)
  }

  /**
   * 获取自动战斗状态
   */
  getAutoBattle(): boolean {
    return this.battleSystem.getAutoBattle()
  }

  /**
   * 停止自动战斗
   * 统一通过 AutoBattleManager 停止，确保日志和状态同步
   */
  stopAutoBattle(): boolean {
    return this.autoBattleManager.stopAutoBattle()
  }

  /**
   * 结束战斗
   * @param winner 获胜方
   */
  endBattle(winner: string) {
    //  幂等性守卫：防止重复触发 endBattle
    const battleData = this.battleSystem.getBattleData()
    if (
      battleData?.battleState === BattleStatus.ENDED ||
      battleData?.battleState === BattleStatus.SETTLEMENT
    ) {
      return
    }

    const battleId = this.battleStateManager.getBattleId()
    if (battleId) {
      this.autoBattleManager.stopAutoBattle()
    }
    // 手动结束路径补齐 trace 收尾（battle_end 事件 + traceEvents 落盘），
    // 与自然结束（BattleSystem.endBattle）共用，保证实时战报从录制派生时有数据
    this.battleSystem.finalizeBattleTrace(winner as ParticipantSide)
    // 触发战斗结束事件
    const eventData: BattleEndedEventData = { winner: winner as ParticipantSide }
    this.emit(BattleEventCodes.BATTLE_ENDED, eventData)
    this.emitTeamChanged()
  }

  /**
   * 重置战斗
   */
  resetBattle() {
    this.battleSystem.resetBattle()
    this.battleStateManager.resetState()
    this.autoBattleManager.resetState()
    LoggerProvider.logger.clearLogs()
    this.emitTeamChanged()
  }

  /**
   * 处理单个回合
   */
  async processSingleTurn() {
    await this.autoBattleManager.executeSingleTurn()
    // ponytail: 每回合结束后通知 store 同步队伍数据，触发 Vue 响应式更新 气血/能量
    this.emitTeamChanged()
  }

  /**
   * 手动干预：让指定参战者立即对指定目标执行一次指定行动（技能或普攻）
   * @returns 失败原因字符串；成功返回 null
   */
  async executeManualAction(
    participantId: string,
    skillId: string | null,
    targetId: string,
  ): Promise<string | null> {
    const error = await this.battleSystem.executeManualAction(participantId, skillId, targetId)
    if (error === null) this.emitTeamChanged()
    return error
  }

  /**
   * 设置战斗速度
   * @param speed 速度倍率
   */
  setBattleSpeed(speed: number) {
    this.battleSystem.setSpeed(speed)
  }

  /**
   * 获取战斗速度
   * @returns 当前战斗速度
   */
  getBattleSpeed(): number {
    return this.battleSystem.getBattleSpeed()
  }

  /**  设置快速战斗模式 */
  setQuickMode(enabled: boolean): void {
    this.battleSystem.setQuickMode(enabled)
  }

  /**  获取快速战斗模式 */
  getQuickMode(): boolean {
    return this.battleSystem.getQuickMode()
  }

  /**  重新生成战斗ID */
  regenerateBattleId(): void {
    this.battleSystem.regenerateBattleId()
  }

  /**
   * 切换暂停状态
   */
  togglePause() {
    this.battleSystem.togglePause()
  }

  /**
   * 获取暂停状态
   * @returns 是否暂停
   */
  isPaused(): boolean {
    return this.battleSystem.getIsPaused()
  }

  /**
   * 获取战斗是否活跃
   */
  getIsBattleActive(): boolean {
    return this.battleStateManager.getIsBattleActive()
  }

  /**
   * 获取战斗ID
   * @returns 战斗ID
   */
  getBattleId(): string | null {
    return this.battleStateManager.getBattleId() ?? null
  }
}
