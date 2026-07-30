/**
 * 战斗事件管理器
 * 负责监听和处理战斗事件
 * 桥接领域事件和 Pinia Store（UI 状态）
 *
 * ponytail: 位于 infrastructure 层，因为此类本质上是事件→Store 的桥接器。
 */
import { UIEventBus } from '@/infrastructure/adapters/event/UIEventBus'
import { container } from '@/infrastructure/di/Container'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import type {
  BattleLogEventData,
  BattleEndedEventData,
} from '@/domain/battle/type/BattleEventType'
import { useBattleStore } from '@/presentation/stores/battleStore'
import { BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'
import { BattleStateManager } from '@/domain/battle/state/BattleStateManager'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { ParticipantSideName } from '@/domain/battle/type/types'
import { BattleSummaryGenerator } from '@/domain/battle/logs/BattleSummaryGenerator'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

/**
 * 战斗事件管理器
 * 负责监听和处理战斗事件
 */
export class BattleEventManager {
  private battleStore: ReturnType<typeof useBattleStore> | null = null
  private battleStateManager: BattleStateManager | null = null
  private battleSystem: BattleSystem | null = null
  /** 是否正在监听事件 */
  private isListening = false
  /** 已绑定的事件处理函数 */
  private boundHandlers: Map<string, Function> = new Map()
  /** 惰性获取 emitter（DI 容器初始化后方可用） */
  private get emitter(): ReturnType<UIEventBus['getEmitter']> {
    return container.resolve<UIEventBus>('UIEventBus').getEmitter()
  }

  /**
   * 获取战斗状态
   */
  private getBattleStore() {
    if (!this.battleStore) {
      this.battleStore = useBattleStore()
    }
    return this.battleStore!
  }

  /**
   * 设置战斗系统和状态管理器
   */
  setBattleSystem(
    battleSystem: BattleSystem,
    battleStateManager: BattleStateManager,
  ) {
    this.battleSystem = battleSystem
    this.battleStateManager = battleStateManager
  }

  /**
   * 是否正在监听事件
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
      console.warn('BattleEventManager: 已经处于监听状态')
      return
    }

    // 订阅战斗日志事件
    const battleLogHandler = (data: any) => this.handleBattleLogEvent(data)
    this.emitter.on(BattleEventCodes.BATTLE_LOG, battleLogHandler)
    this.boundHandlers.set(BattleEventCodes.BATTLE_LOG, battleLogHandler)

    // 订阅战斗结束事件
    const battleEndHandler = (data: any) => this.handleBattleEndEvent(data)
    this.emitter.on(BattleEventCodes.BATTLE_ENDED, battleEndHandler)
    this.boundHandlers.set(BattleEventCodes.BATTLE_ENDED, battleEndHandler)

    // 订阅回合开始事件
    const turnStartHandler = (data: any) => this.handleTurnStartEvent(data)
    this.emitter.on(BattleEventCodes.TURN_START, turnStartHandler)
    this.boundHandlers.set(BattleEventCodes.TURN_START, turnStartHandler)

    // 订阅回合结束事件
    const turnEndHandler = (data: any) => this.handleTurnEndEvent(data)
    this.emitter.on(BattleEventCodes.TURN_END, turnEndHandler)
    this.boundHandlers.set(BattleEventCodes.TURN_END, turnEndHandler)

    this.isListening = true
  }

  /**
   * 停止监听战斗事件
   */
  stopListening() {
    // 取消订阅所有战斗事件
    this.emitter.off(BattleEventCodes.BATTLE_LOG)
    this.emitter.off(BattleEventCodes.BATTLE_ENDED)
    this.emitter.off(BattleEventCodes.TURN_START)
    this.emitter.off(BattleEventCodes.TURN_END)

    // 清除回调引用
    this.boundHandlers.clear()
    this.isListening = false
  }

  /**
   * 处理战斗日志事件
   *
   * 架构说明：现代日志系统已全面采用结构化的 LogSegment[] 进行渲染。
   * 领域层生成的 log 对象已包含完整的语义化 segments（如 kind: 'skill' | 'heal'），
   * UI 层的 LogSeg.vue 会直接消费这些结构化数据，不再需要在此处使用正则表达式拼接 HTML 字符串。
   */
  private handleBattleLogEvent(data: BattleLogEventData) {
    try {
      if (data && data.log) {
        // 直接将结构化日志对象传递给日志管理器
        LoggerProvider.logger.addBattleLog(data.log)
      }
    } catch (error) {
      LoggerProvider.logger.addSystemLog({
        message: `处理战斗日志事件时出错: ${error}`,
        category: 'error',
      })
      console.error('处理战斗日志时出错:', error)
    }
  }

  /**
   * 处理战斗结束事件
   */
  private handleBattleEndEvent(data: BattleEndedEventData) {
    try {
      const store = this.getBattleStore()
      if (!store) return
      store.setBattleActive(false)
      store.setAutoPlayMode(false)

      if (data && data.winner) {
        const winnerLabel = ParticipantSideName[data.winner!]
        LoggerProvider.logger.addBattleLog({
          turn: store.getCurrentTurn?.() ?? 1,
          message: `战斗结束！胜利者：${winnerLabel}`,
          segments: [{ text: `战斗结束！胜利者：${winnerLabel}` }],
          category: BATTLE_LOG_CATEGORIES.STATUS,
          meta: { role: 'battle' },
        })

        // ponytail: 战报生成 — 不传参与者气血数据，仅有统计数据
        const summary = BattleSummaryGenerator.instance.onBattleEnd(data.winner)
        // 发射战报事件，供 UI 层 BattleSummaryDialog 捕获
        if (summary) {
          this.emitter.emit('battle-summary', summary)
        }
      }
    } catch (error) {
      console.error(`Error handling battle end: ${error}`)
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
      const store = this.getBattleStore()
      if (data && data.actorId && store) {
        store.currentActorId = data.actorId
      }
    } catch (error) {
      console.error('处理回合开始时出错:', error)
    }
  }

  /**
   * 处理回合结束事件
   */
  private handleTurnEndEvent(data: { battleId: string; turn: number }) {
    try {
      if (data) {
        LoggerProvider.logger.addBattleLog({
          turn: `回合${data.turn}`,
          message: `回合${data.turn}结束`,
        })
      }
    } catch (error) {
      console.error('处理回合结束时出错:', error)
    }
  }
}

// 导出单例实例
export const battleEventManager = new BattleEventManager()
