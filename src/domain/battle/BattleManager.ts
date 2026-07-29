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
import { InterventionManager } from '@/domain/battle/intervention/InterventionManager'
import { BattleReplayManager } from '@/domain/battle/replay/BattleReplayManager'
import {
  ParticipantSide,
  BattleEntity,
  BATTLE_CONSTANTS,
  BattleStatus,
} from '@/domain/battle/type/types'
import { BattleEventCodes, type BattleEndedEventData } from '@/domain/battle/type/BattleEventType'
import type { BattleCommand } from '@/shared/types/battle-commands'
import type {
  BattleEvents,
  BattleEventName,
} from '@/domain/battle/type/BattleEventType'
import { eventBus } from '@/main'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

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
   * @param interventionManager 干预管理器实例
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
    eventBus.emit(BattleEventCodes.TEAM_DATA_CHANGED, {
      allyTeam: this.getEnabledAllyTeam(),
      enemyTeam: this.getEnabledEnemyTeam(),
    })
  }

  constructor(
    private battleSystem: BattleSystem,
    private battleStateManager: BattleStateManager,
    private autoBattleManager: AutoBattleManager,
    private interventionManager: InterventionManager,
    private battleReplayManager: BattleReplayManager,
  ) {}

  /** 当前场景 ID */
  private currentSceneId?: string

  /** 阵型配置 */
  private allyFormation?: import('@/shared/types/formation').FormationConfig
  private enemyFormation?: import('@/shared/types/formation').FormationConfig

  /** 设置当前场景 ID */
  setSceneId(sceneId?: string): void {
    this.currentSceneId = sceneId
  }

  /** 设置阵型配置 */
  setFormations(
    ally?: import('@/shared/types/formation').FormationConfig,
    enemy?: import('@/shared/types/formation').FormationConfig,
  ): void {
    this.allyFormation = ally
    this.enemyFormation = enemy
  }

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
    eventBus.emit(event, data)
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
    eventBus.on(event, callback)
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
      eventBus.off(event, callback)
    } else {
      for (const cb of set) {
        eventBus.off(event, cb)
      }
      this.handlers.delete(event)
    }
  }

  /** 清除所有已注册的监听器 */
  clearAllListeners(): void {
    for (const [event, set] of this.handlers) {
      for (const cb of set) {
        eventBus.off(event, cb)
      }
    }
    this.handlers.clear()
  }

  /**
   * 获取战斗系统实例
   */
  getBattleSystem(): BattleSystem {
    return this.battleSystem
  }

  /**
   * 统一参与者状态更新接口
   * 通过 BattleSystem 修改参与者属性，BattleSystem 为唯一数据源
   * Store 因共享对象引用自动感知变更
   */
  updateParticipantState(
    participantId: string,
    updates: Partial<BattleEntity>,
  ): void {
    const battleData = this.battleSystem.getBattleData()
    const participant = battleData?.participants.get(participantId)
    if (participant) {
      Object.assign(participant, updates)
    }
  }

  /**
   * 通过命令流处理回合（第三阶段）
   * 生成 BattleCommand[] 供 Store 执行，不直接修改状态
   * @returns BattleCommand[] 命令序列
   */
  async processTurnAsCommands(): Promise<BattleCommand[]> {
    if (!this.battleSystem) {
      return []
    }

    // ponytail: 先推进回合，再生成命令 — 消除 generateCommandsForTurn 的副作用
    this.battleSystem.advanceRound()
    const commands = this.battleSystem.generateCommandsForTurn()
    if (commands.length > 0) {
      this.syncBattleState()
    }
    return commands
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

  /**
   * 获取手动干预管理器
   */
  getInterventionManager() {
    return this.interventionManager
  }

  /**
   * 获取战斗回放管理器
   */
  getBattleReplayManager() {
    return this.battleReplayManager
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
      console.error('初始化队伍数据时出错:', error)
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

    // NOTE: 被动触发延迟到 initialize() 统一执行，避免与 initialize 中的 clearAll+重注册冲突
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
    return 999
  }

  /**
   * 更新角色状态
   * @param characterId - 角色 ID
   * @param updates - 更新数据
   */
  updateCharacterState(characterId: string, updates: Partial<BattleEntity>) {
    this.battleStateManager.updateCharacterManually(characterId, updates)
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
   * 获取队伍成员数量
   */
  getTeamCounts(): { ally: number; enemy: number } {
    const allyCount = this.allyTeam.filter((p) => p.enabled).length
    const enemyCount = this.enemyTeam.filter((p) => p.enabled).length

    return { ally: allyCount, enemy: enemyCount }
  }

  /**
   * 根据 ID 获取角色
   * @param characterId - 角色 ID
   * @returns BattleEntity 或 undefined
   */
  getCharacterById(characterId: string): BattleEntity | undefined {
    return (
      this.allyTeam.find((p) => p.id === characterId) ||
      this.enemyTeam.find((p) => p.id === characterId)
    )
  }

  /**
   * 批量更新角色状态
   * @param updates - 更新数组
   */
  updateMultipleCharacters(
    updates: Array<{ id: string; data: Partial<BattleEntity> }>,
  ) {
    updates.forEach(({ id, data }) => {
      this.updateCharacterState(id, data)
    })
  }

  /**
   * 批量设置角色启用状态
   */
  setMultipleCharactersEnabled(characterIds: string[], enabled: boolean) {
    characterIds.forEach((id) => {
      this.setCharacterEnabled(id, enabled)
    })
  }

  /**
   * 增加回合数
   */
  incrementTurn() {
    this.battleStateManager.incrementTurn()
  }

  /**
   * 更新回合数
   */
  updateTurn(turn: number) {
    this.battleStateManager.updateTurn(turn)
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
    console.log('BattleManager setBattleId', battleId)
    this.battleStateManager.setBattleId(battleId)
  }

  /**
   * 同步战斗状态
   */
  syncBattleState() {
    this.battleStateManager.syncBattleState()
  }

  /**
   * 同步战斗日志
   * @param battleState 战斗状态
   */
  async syncBattleLogs(battleState: unknown) {
    await LoggerProvider.logger.syncBattleLogs(battleState)
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
   * 开始战斗
   * 从 BattleData 获取启用的角色数据
   */
  async startBattle(): Promise<string | null> {
    if (!this.battleSystem) {
      throw new Error('战斗系统未初始化')
    }

    const allyTeam = this.getEnabledAllyTeam()
    const enemyTeam = this.getEnabledEnemyTeam()

    if (allyTeam.length === 0 || enemyTeam.length === 0) {
      LoggerProvider.logger.addDebugLog('队伍数据未初始化，请先添加角色到队伍')
      return null
    }

    // 为队伍成员分配位置序号（支持阵型槽位）
    this.assignSeatIndices(allyTeam, enemyTeam, this.allyFormation, this.enemyFormation)

    // 传递阵型配置到 BattleSystem
    this.battleSystem.setFormations(this.allyFormation, this.enemyFormation)

    // 直接使用 BattleEntity 数组（传入场景 ID）
    const battleState = this.battleSystem.initialize(allyTeam, enemyTeam, this.currentSceneId)
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
    // ⭐ 幂等性守卫：防止重复触发 endBattle
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
   * 执行单个回合
   */
  async executeSingleTurn() {
    await this.autoBattleManager.executeSingleTurn()
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

  /** ★ 设置快速战斗模式 */
  setQuickMode(enabled: boolean): void {
    this.battleSystem.setQuickMode(enabled)
  }

  /** ★ 获取快速战斗模式 */
  getQuickMode(): boolean {
    return this.battleSystem.getQuickMode()
  }

  /** ★ 重新生成战斗ID */
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
   * 获取当前战斗状态
   * @returns 战斗状态对象
   */
  getBattleState() {
    return this.battleSystem.getBattleState()
  }

  /**
   * 获取战斗ID
   * @returns 战斗ID
   */
  getBattleId(): string | null {
    return this.battleStateManager.getBattleId() ?? null
  }

  /**
   * 导出战斗记录
   * @returns 战斗记录JSON字符串
   */
  exportBattleRecord(): string {
    const battleState = this.getBattleState()
    return JSON.stringify(battleState, null, 2)
  }

  /**
   * 获取战斗统计信息
   * @returns 战斗统计对象
   */
  getBattleStats() {
    const battleState = this.getBattleState()
    if (!battleState) {
      return null
    }

    return {
      turn: this.getTurn(),
      participants: battleState.participants?.size || 0,
      autoBattle: this.battleSystem.getAutoBattle(),
      isPaused: this.isPaused(),
      battleSpeed: this.getBattleSpeed(),
    }
  }
}
