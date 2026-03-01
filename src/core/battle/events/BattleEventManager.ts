/**
 * 战斗事件管理器
 * 负责统一管理战斗相关的事件订阅和分发
 */
import { eventBus } from '@/main'
import { BattleSystemEvent } from '@/types/battle'
import type {
  BattleLogEventData,
  BattleStateUpdateEventData,
  BattleEndedEventData,
} from '@/types/battle-events'
import { useBattleStore } from '@/stores/battleStore'
import { useBattleLogStore } from '@/stores/battleLogStore'
import { BattleStateManager } from '@/core/battle/state/BattleStateManager'
import type { IBattleSystem } from '@/core/battle/interfaces'

/**
 * 战斗事件管理器类
 * 负责统一管理战斗相关的事件订阅和分发
 */
export class BattleEventManager {
  private battleStore = null
  private battleStateManager: BattleStateManager | null = null
  private battleSystem: IBattleSystem | null = null
  /** 标记是否正在监听 */
  private isListening = false
  /** 保存事件回调引用，用于去重判断 */
  private boundHandlers: Map<string, Function> = new Map()

  /**
   * 获取战斗store（懒加载，解决Pinia未初始化问题）
   */
  private getBattleStore() {
    if (!this.battleStore) {
      this.battleStore = useBattleStore()
    }
    return this.battleStore
  }

  /**
   * 获取战斗日志store（懒加载，解决Pinia未初始化问题）
   */
  private getBattleLogStore() {
    return useBattleLogStore()
  }

  /**
   * 设置战斗系统引用（由外部注入）
   */
  setBattleSystem(
    battleSystem: IBattleSystem,
    battleStateManager: BattleStateManager,
  ) {
    this.battleSystem = battleSystem
    this.battleStateManager = battleStateManager
  }

  /**
   * 检查是否正在监听
   */
  public isCurrentlyListening(): boolean {
    return this.isListening
  }

  /**
   * 开始监听战斗事件
   */
  startListening() {
    // 防止重复订阅
    if (this.isListening) {
      console.warn('BattleEventManager: 已在监听中，跳过重复订阅')
      return
    }

    // 订阅战斗日志事件
    const battleLogHandler = (data: any) => this.handleBattleLogEvent(data)
    eventBus.on(BattleSystemEvent.BATTLE_LOG, battleLogHandler)
    this.boundHandlers.set(BattleSystemEvent.BATTLE_LOG, battleLogHandler)

    // 订阅战斗状态更新事件
    const stateUpdateHandler = (data: any) =>
      this.handleBattleStateUpdateEvent(data)
    eventBus.on(BattleSystemEvent.BATTLE_STATE_UPDATE, stateUpdateHandler)
    this.boundHandlers.set(
      BattleSystemEvent.BATTLE_STATE_UPDATE,
      stateUpdateHandler,
    )

    // 订阅战斗结束事件
    const battleEndHandler = (data: any) => this.handleBattleEndEvent(data)
    eventBus.on(BattleSystemEvent.BATTLE_END, battleEndHandler)
    this.boundHandlers.set(BattleSystemEvent.BATTLE_END, battleEndHandler)

    // 订阅回合开始事件
    const turnStartHandler = (data: any) => this.handleTurnStartEvent(data)
    eventBus.on(BattleSystemEvent.TURN_START, turnStartHandler)
    this.boundHandlers.set(BattleSystemEvent.TURN_START, turnStartHandler)

    // 订阅回合结束事件
    const turnEndHandler = (data: any) => this.handleTurnEndEvent(data)
    eventBus.on(BattleSystemEvent.TURN_END, turnEndHandler)
    this.boundHandlers.set(BattleSystemEvent.TURN_END, turnEndHandler)

    this.isListening = true
  }

  /**
   * 停止监听战斗事件
   */
  stopListening() {
    // 取消订阅所有战斗事件
    eventBus.off(BattleSystemEvent.BATTLE_LOG)
    eventBus.off(BattleSystemEvent.BATTLE_STATE_UPDATE)
    eventBus.off(BattleSystemEvent.BATTLE_END)
    eventBus.off(BattleSystemEvent.TURN_START)
    eventBus.off(BattleSystemEvent.TURN_END)

    // 清除回调引用
    this.boundHandlers.clear()
    this.isListening = false
  }

  /**
   * 处理战斗日志事件
   */
  private handleBattleLogEvent(data: BattleLogEventData) {
    try {
      if (data && data.log) {
        this.getBattleStore().addBattleLog(data.log)
      }
    } catch (error) {
      const battleLogStore = useBattleLogStore()
      battleLogStore.addErrorLog(`处理战斗日志事件时出错: ${error}`)
    }
  }

  /**
   * 处理战斗状态更新事件
   */
  private handleBattleStateUpdateEvent(data: BattleStateUpdateEventData) {
    try {
      if (data) {
        this.getBattleStore().currentBattleId = data.battleId
        this.getBattleStore().turnOrder = data.turnOrder || []
        // 同步战斗状态到UI
        this.getBattleStore().setBattleActive(true)

        // 通过 BattleStateManager 同步角色状态
        if (this.battleStateManager && this.battleSystem) {
          // 设置战斗ID并同步状态
          this.battleStateManager.setBattleId(data.battleId)
          this.battleStateManager.syncBattleState()
        }
      }
    } catch (error) {
      const battleLogStore = useBattleLogStore()
      battleLogStore.addErrorLog(`处理战斗状态更新事件时出错: ${error}`)
    }
  }

  /**
   * 处理战斗结束事件
   */
  private handleBattleEndEvent(data: BattleEndedEventData) {
    try {
      this.getBattleStore().setBattleActive(false)
      this.getBattleStore().setAutoPlayMode(false)
      // 记录战斗结束日志
      if (data && data.winner) {
        this.getBattleStore().addBattleLog({
          turn: '战斗结束',
          source: '系统',
          action: '宣布',
          target: '',
          result: `战斗结束！胜利者: ${data.winner === 'ALLY' ? '我方' : '敌方'}`,
          level: 'system',
        })
      }
    } catch (error) {
      const battleLogStore = useBattleLogStore()
      battleLogStore.addErrorLog(`处理战斗结束事件时出错: ${error}`)
    }
  }

  /**
   * 处理回合开始事件
   */
  private handleTurnStartEvent(data: {
    battleId: string
    turn: number
    actorId: string
  }) {
    try {
      if (data && data.actorId) {
        this.getBattleStore().setCurrentActorId(data.actorId)
        // 记录回合开始日志
        this.getBattleStore().addBattleLog({
          turn: `回合${data.turn}`,
          source: '系统',
          action: '开始',
          target: '',
          result: `回合${data.turn}开始，当前行动者: ${data.actorId}`,
          level: 'system',
        })
      }
    } catch (error) {
      const battleLogStore = useBattleLogStore()
      battleLogStore.addErrorLog(`处理回合开始事件时出错: ${error}`)
    }
  }

  /**
   * 处理回合结束事件
   */
  private handleTurnEndEvent(data: { battleId: string; turn: number }) {
    try {
      if (data) {
        // 回合结束处理
        this.getBattleStore().addBattleLog({
          turn: `回合${data.turn}`,
          source: '系统',
          action: '结束',
          target: '',
          result: `回合${data.turn}结束`,
          level: 'system',
        })
      }
    } catch (error) {
      const battleLogStore = useBattleLogStore()
      battleLogStore.addErrorLog(`处理回合结束事件时出错: ${error}`)
    }
  }
}

// 导出单例实例
export const battleEventManager = new BattleEventManager()
