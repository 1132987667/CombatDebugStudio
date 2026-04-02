import type { IBattleSystem } from '@/core/battle/interfaces'
import { BattleStateManager } from '@/core/battle/state/BattleStateManager'
import { battleLogManager } from '@/utils/logging'
import { AutoBattleManager } from '@/core/battle/auto/AutoBattleManager'
import { InterventionManager } from '@/core/battle/intervention/InterventionManager'
import { BattleReplayManager } from '@/core/battle/replay/BattleReplayManager'
import type { UIBattleCharacter } from '@/types'
import {
  PARTICIPANT_SIDE,
  BattleParticipant,
  BattleSystemEvent,
} from '@/types/battle'
import { BattleParticipantImpl } from '@/core/battle/BattleParticipantImpl'
import type {
  BattleEvents,
  BattleEventName,
  BattleEventCallback,
  BattleEndedEventData,
} from '@/types/battle-events'
import { LocalStorage } from '@/utils/storage'
import { eventBus } from '@/main'
import { GameDataProcessor } from '@/utils/GameDataProcessor'
import skillsData from '@configs/skills/skills.json'

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
  constructor(
    private battleSystem: IBattleSystem,
    private battleStateManager: BattleStateManager,
    private autoBattleManager: AutoBattleManager,
    private interventionManager: InterventionManager,
    private battleReplayManager: BattleReplayManager,
  ) {}

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
  on<T extends BattleEventName>(event: T, callback: (data: T) => void) {
    eventBus.on(event, callback)
  }

  /**
   * 取消订阅事件
   * @param event 事件名称
   */
  off<T extends BattleEventName>(event: T) {
    eventBus.off(event)
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

  /**
   * 初始化队伍数据
   * @param allyTeam 我方队伍
   * @param enemyTeam 敌方队伍
   */
  initializeTeams(
    allyTeam: UIBattleCharacter[],
    enemyTeam: UIBattleCharacter[],
  ) {
    try {
      // 验证队伍数据
      if (!allyTeam || !enemyTeam) {
        throw new Error('队伍数据不能为空')
      }

      // 使用工厂方法转换队伍
      const allyParticipants = allyTeam.map((char, index) => {
        return BattleParticipantImpl.fromUICharacter(char, true, index)
      })

      const enemyParticipants = enemyTeam.map((char, index) => {
        return BattleParticipantImpl.fromUICharacter(char, false, index)
      })

      // 验证参与者数据
      if (allyParticipants.length === 0 && enemyParticipants.length === 0) {
        throw new Error('没有有效的参与者数据')
      }

      // 初始化队伍映射关系
      this.battleStateManager.initializeTeams(allyTeam, enemyTeam)

      // 创建战斗状态
      const battleState = this.battleSystem.initialize(
        allyParticipants as BattleParticipant[],
        enemyParticipants as BattleParticipant[],
      )
      const battleId = battleState.battleId
      this.setBattleId(battleId)

      return { battleId }
    } catch (error) {
      console.error('初始化队伍数据时出错:', error)
      throw error
    }
  }

  /**
   * 获取我方队伍（响应式）
   */
  getAllyTeam(): UIBattleCharacter[] {
    const battleState = this.battleSystem.getBattleState()
    if (!battleState) {
      return []
    }
    return Array.from(battleState.participants.values())
      .filter((p) => p.type === PARTICIPANT_SIDE.ALLY)
      .map((p) => this.participantToUICharacter(p))
  }

  /**
   * 获取敌方队伍（响应式）
   */
  getEnemyTeam(): UIBattleCharacter[] {
    const battleState = this.battleSystem.getBattleState()
    if (!battleState) {
      return []
    }
    return Array.from(battleState.participants.values())
      .filter((p) => p.type === PARTICIPANT_SIDE.ENEMY)
      .map((p) => this.participantToUICharacter(p))
  }

  /**
   * 获取启用的我方队伍
   * 直接在过滤阶段排除禁用角色，减少不必要的转换操作
   */
  getEnabledAllyTeam(): UIBattleCharacter[] {
    const allyTeam = this.getAllyTeam()
    return allyTeam.filter((c) => c.enabled)
  }

  /**
   * 获取启用的敌方队伍
   * 直接在过滤阶段排除禁用角色，减少不必要的转换操作
   */
  getEnabledEnemyTeam(): UIBattleCharacter[] {
    const enemyTeam = this.getEnemyTeam()
    return enemyTeam.filter((c) => c.enabled)
  }

  /**
   * 获取所有参与者
   */
  getAllParticipants(): UIBattleCharacter[] {
    const battleState = this.battleSystem.getBattleState()
    if (!battleState) {
      return []
    }
    return Array.from(battleState.participants.values()).map((p) =>
      this.participantToUICharacter(p),
    )
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
   * 获取选中的角色
   */
  getSelectedCharacter(): UIBattleCharacter | null {
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
      this.syncBattleState()
      eventBus.emit('teamDataChanged', {
        allyTeam: this.getAllyTeam(),
        enemyTeam: this.getEnemyTeam(),
      })
    }
  }

  /**
   * 移动角色位置
   */
  moveCharacter(characterId: string, direction: number) {
    const team = this.findParticipantTeam(characterId)
    if (!team) return

    const teamArray = Array.from(team.values())
    const enabledChars = teamArray.filter((c) => c.enabled)
    const currentIndex = enabledChars.findIndex((c) => c.id === characterId)

    if (currentIndex < 0) return

    const newIndex = currentIndex + direction
    if (newIndex < 0 || newIndex >= enabledChars.length) return

    // 交换位置
    const targetChar = enabledChars[newIndex]
    const currentChar = enabledChars[currentIndex]

    const idx1 = teamArray.indexOf(currentChar)
    const idx2 = teamArray.indexOf(targetChar)
    ;[teamArray[idx1], teamArray[idx2]] = [teamArray[idx2], teamArray[idx1]]

    this.syncBattleState()
    eventBus.emit('teamDataChanged', {
      allyTeam: this.getAllyTeam(),
      enemyTeam: this.getEnemyTeam(),
    })
  }

  /**
   * 清空所有参与者
   */
  clearParticipants() {
    this.battleSystem.resetBattle()
    this.battleStateManager.resetState()
    eventBus.emit('teamDataChanged', {
      allyTeam: [],
      enemyTeam: [],
    })
  }

  /**
   * 添加角色到队伍
   */
  addCharacterToTeam(character: UIBattleCharacter, side: PARTICIPANT_SIDE) {
    const participant = BattleParticipantImpl.fromUICharacter(
      character,
      side === PARTICIPANT_SIDE.ALLY,
      0,
    )
    const battleState = this.battleSystem.getBattleState()
    if (battleState) {
      battleState.participants.set(participant.id, participant)
      this.syncBattleState()
      eventBus.emit('teamDataChanged', {
        allyTeam: this.getAllyTeam(),
        enemyTeam: this.getEnemyTeam(),
      })
    }
  }

  /**
   * 从队伍移除角色
   */
  removeCharacter(characterId: string) {
    const battleState = this.battleSystem.getBattleState()
    if (battleState) {
      battleState.participants.delete(characterId)
      this.syncBattleState()
      eventBus.emit('teamDataChanged', {
        allyTeam: this.getAllyTeam(),
        enemyTeam: this.getEnemyTeam(),
      })
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
   */
  updateCharacterState(
    characterId: string,
    updates: Partial<UIBattleCharacter>,
  ) {
    this.battleStateManager.updateCharacterManually(characterId, updates)
  }

  /**
   * 重置角色状态到初始值
   */
  resetCharacterStates() {
    const battleState = this.battleSystem.getBattleState()
    if (!battleState) return

    battleState.participants.forEach((participant) => {
      participant.currentHp = participant.maxHp
      participant.currentEnergy = 25
    })

    this.syncBattleState()
    eventBus.emit('teamDataChanged', {
      allyTeam: this.getAllyTeam(),
      enemyTeam: this.getEnemyTeam(),
    })
  }

  /**
   * 获取队伍成员数量
   */
  getTeamCounts(): { ally: number; enemy: number } {
    const battleState = this.battleSystem.getBattleState()
    if (!battleState) {
      return { ally: 0, enemy: 0 }
    }

    const allyCount = Array.from(battleState.participants.values()).filter(
      (p) => p.type === PARTICIPANT_SIDE.ALLY && p.enabled,
    ).length
    const enemyCount = Array.from(battleState.participants.values()).filter(
      (p) => p.type === PARTICIPANT_SIDE.ENEMY && p.enabled,
    ).length

    return { ally: allyCount, enemy: enemyCount }
  }

  /**
   * 根据ID获取角色
   */
  getCharacterById(characterId: string): UIBattleCharacter | undefined {
    const allParticipants = this.getAllParticipants()
    return allParticipants.find((p) => p.id === characterId)
  }

  /**
   * 批量更新角色状态
   */
  updateMultipleCharacters(
    updates: Array<{ id: string; data: Partial<UIBattleCharacter> }>,
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
   * 减少回合数
   */
  decrementTurn() {
    this.battleStateManager.decrementTurn()
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
  private findParticipant(characterId: string): BattleParticipant | undefined {
    const battleState = this.battleSystem.getBattleState()
    if (!battleState) return undefined
    return battleState.participants.get(characterId)
  }

  /**
   * 查找参与者所在队伍
   */
  private findParticipantTeam(
    characterId: string,
  ): Map<string, BattleParticipant> | undefined {
    const battleState = this.battleSystem.getBattleState()
    if (!battleState) return undefined

    const participant = battleState.participants.get(characterId)
    if (!participant) return undefined

    const team =
      participant.type === PARTICIPANT_SIDE.ALLY
        ? new Map(
            Array.from(battleState.participants.entries()).filter(
              ([_, p]) => p.type === PARTICIPANT_SIDE.ALLY,
            ),
          )
        : new Map(
            Array.from(battleState.participants.entries()).filter(
              ([_, p]) => p.type === PARTICIPANT_SIDE.ENEMY,
            ),
          )

    return team
  }

  /**
   * 参与者转换为UI角色
   */
  private participantToUICharacter(
    participant: BattleParticipant,
  ): UIBattleCharacter {
    return GameDataProcessor.participantToUIBattleCharacter(participant)
  }

  /**
   * 设置战斗ID
   * @param battleId 战斗ID
   */
  setBattleId(battleId: string) {
    console.log('BattleManager setBattleId', battleId)
    this.battleStateManager.setBattleId(battleId)
    this.autoBattleManager.setBattleId(battleId)
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
  async syncBattleLogs(battleState: any) {
    await battleLogManager.syncBattleLogs(battleState)
  }

  /**
   * 加载技能配置
   */
  loadSkillConfigs() {
    if (this.battleSystem) {
      this.battleSystem.loadSkillConfigs(skillsData)
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
      battleLogManager.addDebugLog('队伍数据未初始化，请先添加角色到队伍')
      return null
    }

    // 转换为战斗参与者
    const allyParticipants = allyTeam.map((char, index) => {
      return BattleParticipantImpl.fromUICharacter(char, true, index)
    })
    const enemyParticipants = enemyTeam.map((char, index) => {
      return BattleParticipantImpl.fromUICharacter(char, false, index)
    })
    const battleState = this.battleSystem.initialize(
      allyParticipants,
      enemyParticipants,
    )
    this.battleStateManager.setBattleId(battleState.battleId)
    this.autoBattleManager.setBattleId(battleState.battleId)
    battleLogManager.clearLogs()
    battleLogManager.addSystemLog('战斗已创建')
    this.syncBattleState()

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
    const battleId = this.battleStateManager.getBattleId()?.value
    if (!battleId) {
      battleLogManager.addSystemLog('请先创建战斗')
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
  endBattle(winner: any) {
    const battleId = this.battleStateManager.getBattleId()?.value
    if (battleId) {
      this.autoBattleManager.stopAutoBattle()
    }
    // 触发战斗结束事件
    const eventData: any = { winner }
    this.emit(BattleSystemEvent.BATTLE_END, eventData)
  }

  /**
   * 重置战斗
   */
  resetBattle() {
    this.battleStateManager.resetState()
    this.autoBattleManager.resetState()
    battleLogManager.clearLogs()
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
    return this.battleStateManager.getBattleId()?.value ?? null
  }

  /**
   * 保存战斗状态
   */
  saveBattleState(): boolean {
    try {
      const battleState = this.getBattleState()
      if (!battleState) {
        return false
      }
      LocalStorage.set('battleState', battleState)
      return true
    } catch (error) {
      console.error('保存战斗状态时出错:', error)
      return false
    }
  }

  /**
   * 加载战斗状态
   */
  loadBattleState(): any | null {
    try {
      const battleState = LocalStorage.get('battleState')
      if (battleState) {
        this.battleSystem.restoreBattleState(battleState)
        this.syncBattleState()
        return battleState
      }
      return null
    } catch (error) {
      console.error('加载战斗状态时出错:', error)
      return null
    }
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
      participants: battleState.participants?.length || 0,
      autoBattle: this.battleSystem.getAutoBattle(),
      isPaused: this.isPaused(),
      battleSpeed: this.getBattleSpeed(),
    }
  }
}
