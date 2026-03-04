import type { IBattleSystem } from '@/core/battle/interfaces'
import { BattleStateManager } from '@/core/battle/state/BattleStateManager'
import { battleLogManager } from '@/utils/logging'
import { AutoBattleManager } from '@/core/battle/auto/AutoBattleManager'
import { InterventionManager } from '@/core/battle/intervention/InterventionManager'
import { BattleReplayManager } from '@/core/battle/replay/BattleReplayManager'
import type { UIBattleCharacter } from '@/types'
import { GameDataProcessor } from '@/utils/GameDataProcessor'
import type { BattleEventName, BattleEvents } from '@/types/battle-events'
import {
  PARTICIPANT_SIDE,
  BattleParticipant,
  BattleSystemEvent,
} from '@/types/battle'
import { BattleParticipantImpl } from '@/core/battle/BattleParticipantImpl'
import type {
  BattleEventName,
  BattleEventCallback,
  BattleEndedEventData,
} from '@/types/battle-events'
import { LocalStorage } from '@/utils/storage'
import { eventBus } from '@/main'
import { useCharacterStore } from '@/stores/characterStore'

/**
 * 战斗管理器
 * 负责协调各个子管理器，提供统一的接口给UI组件
 */
export class BattleManager {
  private battleLogManager = battleLogManager
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
   * 获取战斗日志管理器
   */
  getBattleLogManager() {
    return this.battleLogManager
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
      if (allyTeam.length === 0 && enemyTeam.length === 0) {
        throw new Error('至少需要一个角色或敌人参战')
      }
      // 从 characterStore 获取队伍数据初始化
      this.battleStateManager.initializeTeams()

      // 使用工厂方法转换队伍
      const allyParticipants = allyTeam.map((char, index) => {
        if (!char) {
          throw new Error(`我方队伍中第${index + 1}个角色数据无效`)
        }
        return BattleParticipantImpl.fromUICharacter(char, true, index)
      })

      const enemyParticipants = enemyTeam.map((char, index) => {
        if (!char) {
          throw new Error(`敌方队伍中第${index + 1}个角色数据无效`)
        }
        return BattleParticipantImpl.fromUICharacter(char, false, index)
      })

      // 合并所有参与者
      const allParticipants = [
        ...allyParticipants,
        ...enemyParticipants,
      ] as BattleParticipant[]

      // 验证参与者数据
      if (allParticipants.length === 0) {
        throw new Error('没有有效的参与者数据')
      }

      // 创建战斗状态
      const battleState = this.battleSystem.initialize(allParticipants)
      const battleId = battleState.battleId
      this.setBattleId(battleId)

      return {
        battleId,
      }
    } catch (error) {
      console.error('初始化队伍数据时出错:', error)
      throw error
    }
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
    await this.battleLogManager.syncBattleLogs(battleState)
  }

  /**
   * 加载技能配置
   * @param skillsData 技能配置数据
   */
  loadSkillConfigs(skillsData: any) {
    // 这里可以添加技能配置加载逻辑
    // 例如：this.battleSystem.loadSkills(skillsData);
  }

  /**
   * 开始战斗
   * 从 characterStore 获取启用的角色数据
   */
  async startBattle(): Promise<string | null> {
    if (!this.battleSystem) {
      throw new Error('战斗系统未初始化')
    }

    const characterStore = useCharacterStore()
    const enabledAllyTeam = Array.from(characterStore.allyTeam.values()).filter(
      (c) => c.enabled,
    )
    const enabledEnemyTeam = Array.from(
      characterStore.enemyTeam.values(),
    ).filter((e) => e.enabled)

    if (enabledAllyTeam.length === 0 || enabledEnemyTeam.length === 0) {
      this.battleLogManager.addErrorLog('队伍数据未初始化，请先添加角色到队伍')
      return null
    }

    // 建立映射关系（从 characterStore 获取队伍数据）
    this.battleStateManager.initializeTeams()

    // 转换为战斗参与者
    const allyParticipants = enabledAllyTeam.map((char, index) => {
      return BattleParticipantImpl.fromUICharacter(char, true, index)
    })
    const enemyParticipants = enabledEnemyTeam.map((char, index) => {
      return BattleParticipantImpl.fromUICharacter(char, false, index)
    })
    const allParticipants: BattleParticipantImpl[] = [
      ...allyParticipants,
      ...enemyParticipants,
    ]
    const battleState = this.battleSystem.initialize(allParticipants)
    this.battleStateManager.setBattleId(battleState.battleId)
    this.autoBattleManager.setBattleId(battleState.battleId)
    this.battleLogManager.clearLogs()
    this.battleLogManager.addSystemLog('战斗已创建')
    this.syncBattleState()

    return battleState.battleId
  }

  /**
   * 开始自动战斗
   * @param battleId 战斗ID
   */
  startAutoBattle(battleId: string) {
    return this.autoBattleManager.startAutoBattle(battleId)
  }

  /**
   * 停止自动战斗
   * @param battleId 战斗ID
   */
  stopAutoBattle(battleId: string) {
    return this.autoBattleManager.stopAutoBattle(battleId)
  }

  /**
   * 结束战斗
   * @param winner 获胜方
   */
  endBattle(winner: any) {
    const battleId = this.battleStateManager.getBattleId()?.value
    if (battleId) {
      this.autoBattleManager.stopAutoBattle(battleId)
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
    this.battleLogManager.clearLogs()
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
   * 切换自动战斗状态
   */
  async toggleAutoPlay() {
    await this.autoBattleManager.toggleAutoPlay()
  }

  /**
   * 切换暂停状态
   */
  togglePause() {
    this.autoBattleManager.togglePause()
  }

  /**
   * 设置战斗速度
   * @param speed 速度倍率
   */
  setBattleSpeed(speed: number) {
    this.autoBattleManager.setSpeed(speed)
  }

  /**
   * 选择角色
   * @param charId 角色ID
   */
  selectCharacter(charId: string) {
    this.interventionManager.selectCharacter(charId)
  }

  /**
   * 开始回放
   * @param recording 回放记录
   */
  startReplay(recording: any) {
    this.battleReplayManager.startReplay(recording)
  }

  /**
   * 暂停回放
   */
  pauseReplay() {
    this.battleReplayManager.pauseReplay()
  }

  /**
   * 继续回放
   */
  resumeReplay() {
    this.battleReplayManager.resumeReplay()
  }

  /**
   * 停止回放
   */
  stopReplay() {
    this.battleReplayManager.stopReplay()
  }

  /**
   * 设置回放速度
   * @param speed 速度倍率
   */
  setReplaySpeed(speed: number) {
    this.battleReplayManager.setReplaySpeed(speed)
  }

  /**
   * 获取战斗数据
   * 用于UI组件获取战斗状态信息
   */
  getBattleData() {
    return {
      isPaused: this.autoBattleManager.getIsPaused() || false,
      isAutoPlaying: this.autoBattleManager.getIsAutoPlaying() || false,
      currentTurn: this.battleStateManager.getCurrentTurn()?.value || 1,
      maxTurns: 999, // 默认最大回合数
      battleSpeed: this.autoBattleManager.getBattleSpeed() || 1,
      battleId: this.battleStateManager.getBattleId()?.value || null,
    }
  }

  /**
   * 获取保存的战斗记录列表
   */
  getSavedBattleRecordingsList() {
    // 从localStorage获取保存的战斗记录列表
    return LocalStorage.get<string[]>('battle_recordings_list', [])
  }

  /**
   * 加载战斗记录
   * @param key 记录键名
   */
  loadBattleRecording(key: string) {
    // 从localStorage加载战斗记录
    return LocalStorage.get(key)
  }

  /**
   * 保存战斗记录
   * @param battleId 战斗ID
   * @param name 记录名称
   */
  saveBattleRecording(battleId: string) {
    // 生成记录键名
    const saveKey = `battle_recording_${battleId}`

    // 这里可以添加保存战斗记录的逻辑
    // 例如：从战斗系统获取当前战斗状态并保存

    // 更新保存的记录列表
    const savedList = this.getSavedBattleRecordingsList()
    if (!savedList.includes(saveKey)) {
      savedList.push(saveKey)
      LocalStorage.set('battle_recordings_list', savedList)
    }

    return saveKey
  }

  /**
   * 删除战斗记录
   * @param key 记录键名
   */
  deleteBattleRecording(key: string) {
    // 从localStorage删除战斗记录
    const removeResult = LocalStorage.remove(key)

    // 更新保存的记录列表
    const savedList = this.getSavedBattleRecordingsList()
    const updatedList = savedList.filter((item: string) => item !== key)
    LocalStorage.set('battle_recordings_list', updatedList)

    return removeResult
  }
}
