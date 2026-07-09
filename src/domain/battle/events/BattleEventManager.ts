/**
 * 鎴樻枟浜嬩欢绠＄悊鍣? * 璐熻矗缁熶竴绠＄悊鎴樻枟鐩稿叧鐨勪簨浠惰闃呭拰鍒嗗彂
 */
import { eventBus } from '@/main'
import { BattleEventCodes } from '@/shared/types/battle-events'
import type {
  BattleLogEventData,
  BattleEndedEventData,
} from '@/shared/types/battle-events'
import { useBattleStore } from '@/presentation/stores/battleStore'
import type { BattleLogEntry } from '@/shared/types/battle-log'
import { BattleStateManager } from '@/domain/battle/state/BattleStateManager'
import type { IBattleSystem } from '@/domain/battle/entity/BattleInterfaces'
import { PARTICIPANT_SIDE } from '@/domain/battle/types'

/**
 * 战斗事件管理器
 * 负责监听和处理战斗事件
 */
export class BattleEventManager {
  private battleStore: ReturnType<typeof useBattleStore> | null = null
  private battleStateManager: BattleStateManager | null = null
  private battleSystem: IBattleSystem | null = null
  /** 是否正在监听事件 */
  private isListening = false
  /** 已绑定的事件处理函数 */
  private boundHandlers: Map<string, Function> = new Map()

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
    battleSystem: IBattleSystem,
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
    // 闃叉閲嶅璁㈤槄
    if (this.isListening) {
      console.warn('BattleEventManager:   ')
      return
    }

    // 璁㈤槄鎴樻枟鏃ュ織浜嬩欢
    const battleLogHandler = (data: any) => this.handleBattleLogEvent(data)
    eventBus.on(BattleEventCodes.BATTLE_LOG, battleLogHandler)
    this.boundHandlers.set(BattleEventCodes.BATTLE_LOG, battleLogHandler)

    // 璁㈤槄鎴樻枟缁撴潫浜嬩欢
    const battleEndHandler = (data: any) => this.handleBattleEndEvent(data)
    eventBus.on(BattleEventCodes.BATTLE_ENDED, battleEndHandler)
    this.boundHandlers.set(BattleEventCodes.BATTLE_ENDED, battleEndHandler)

    // Subscribe to turn start events
    const turnStartHandler = (data: any) => this.handleTurnStartEvent(data)
    eventBus.on(BattleEventCodes.TURN_START, turnStartHandler)
    this.boundHandlers.set(BattleEventCodes.TURN_START, turnStartHandler)

    // 璁㈤槄鍥炲悎缁撴潫浜嬩欢
    const turnEndHandler = (data: any) => this.handleTurnEndEvent(data)
    eventBus.on(BattleEventCodes.TURN_END, turnEndHandler)
    this.boundHandlers.set(BattleEventCodes.TURN_END, turnEndHandler)

    this.isListening = true
  }

  /**
   * 停止监听战斗事件
   */
  stopListening() {
    // Unsubscribe all battle events
    eventBus.off(BattleEventCodes.BATTLE_LOG)
    eventBus.off(BattleEventCodes.BATTLE_ENDED)
    eventBus.off(BattleEventCodes.TURN_START)
    eventBus.off(BattleEventCodes.TURN_END)

    // 娓呴櫎鍥炶皟寮曠敤
    this.boundHandlers.clear()
    this.isListening = false
  }

  /**
   * 处理战斗日志事件
   */
  private handleBattleLogEvent(data: BattleLogEventData) {
    try {
      if (data && data.log) {
        const log = data.log as BattleLogEntry & { htmlResult?: string; result?: string }
        // 濡傛灉娌℃湁 htmlResult锛屽皾璇曠敓鎴?HTML 鏍煎紡
        if (!log.htmlResult && log.result) {
          let htmlResult = log.result

          // 鍒ゆ柇鏉ユ簮鍜岀洰鏍囨槸鍚︽槸鏁屾柟
          const sourceIsAlly =
            log.source != null && !log.source.includes('鏁屾柟') && log.source !== '绯荤粺'
          const targetIsAlly =
            log.target &&
            !log.target.includes('鏁屾柟') &&
            log.target !== '绯荤粺' &&
            log.target !== '鎺у埗'

          // 鏇挎崲瑙掕壊鍚嶇О棰滆壊
          if (log.source && log.source !== '绯荤粺') {
            const sourceClass = sourceIsAlly ? 'source-ally' : 'source-enemy'
            htmlResult = htmlResult.replace(
              log.source,
              `<span class="${sourceClass}">${log.source}</span>`,
            )
          }
          if (log.target && log.target !== '鎺у埗') {
            const targetClass = targetIsAlly ? 'source-ally' : 'source-enemy'
            htmlResult = htmlResult.replace(
              log.target,
              `<span class="${targetClass}">${log.target}</span>`,
            )
          }

          // Add normal attack highlighting
          if (htmlResult.includes('normal')) {
            htmlResult = htmlResult.replace(
              /normal/g,
              '<span class="normal-attack">normal</span>',
            )
          }

          // Add skill name highlighting (match [skill name] pattern)
          htmlResult = htmlResult.replace(
            /\[([^\]]+)\]/g,
            (match: string, skillName: string) => {
              const isHeal =
                skillName.includes('heal') || skillName.includes('recover')
              const isDebuff =
                skillName.includes('poison') || skillName.includes('weak')
              if (isHeal)
                return `<span class="skill-heal">[${skillName}]</span>`
              if (isDebuff)
                return `<span class="skill-debuff">[${skillName}]</span>`
              return `<span class="skill-attack">[${skillName}]</span>`
            },
          )

          // Add damage number highlighting
          htmlResult = htmlResult.replace(
            /(\d+)(?=\s*(?:physical|magic|dot)?\s*damage)/gi,
            '<span class="damage-value">$1</span>',
          )

          // Add crit highlighting
          if (htmlResult.includes('CRIT')) {
            htmlResult = htmlResult.replace(
              /CRIT/gi,
              '<span class="crit-value">CRIT</span>',
            )
          }

          // Add evade highlighting
          if (htmlResult.includes('EVADE')) {
            htmlResult = htmlResult.replace(
              /EVADE/gi,
              '<span class="evade">EVADE</span>',
            )
          }

          // Add block highlighting
          if (htmlResult.includes('BLOCK')) {
            htmlResult = htmlResult.replace(
              /BLOCK/gi,
              '<span class="block">BLOCK</span>',
            )
          }

          log.htmlResult = htmlResult
        }

        ;(this.getBattleStore() as any).addBattleLog(log)
      }
    } catch (error) {
      ;(this.getBattleStore() as any).addErrorLog(`澶勭悊鎴樻枟鏃ュ織浜嬩欢鏃跺嚭閿? ${error}`)
      console.error('处理战斗日志时出错:', error)
    }
  }

    /**
     * 处理战斗结束事件
   */
  private handleBattleEndEvent(data: BattleEndedEventData) {
    try {
      ;(this.getBattleStore() as any).setBattleActive(false)
      ;(this.getBattleStore() as any).setAutoPlayMode(false)
      // 记录战斗结束日志
      if (data && data.winner) {
        ;(this.getBattleStore() as any).addBattleLog({
          turn: '战斗结束',
          source: 'system',
          action: 'end',
          target: '',
          result: `? ${data.winner === PARTICIPANT_SIDE.ALLY ? '鎴戞柟' : '鏁屾柟'}`,
          level: 'system',
        })
      }
    } catch (error) {
      ;(this.getBattleStore() as any).addErrorLog(`Error handling battle end: ${error}`)
      console.error('处理战斗结束时出错:', error)
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
        ;(this.getBattleStore() as any).setCurrentActorId(data.actorId)
        // Record turn start log
        ;(this.getBattleStore() as any).addBattleLog({
          turn: `turn_${data.turn}`,
          source: 'system',
          action: 'start',
          target: '',
          result: `Turn ${data.turn} start, actor: ${data.actorId}`,
          level: 'system',
        })
      }
    } catch (error) {
      ;(this.getBattleStore() as any).addErrorLog(`Error handling turn start: ${error}`)
      console.error('处理回合开始时出错:', error)
    }
  }

  /**
   * 澶勭悊鍥炲悎缁撴潫浜嬩欢
   */
  private handleTurnEndEvent(data: { battleId: string; turn: number }) {
    try {
      if (data) {
        // 鍥炲悎缁撴潫澶勭悊
        ;(this.getBattleStore() as any).addBattleLog({
          turn: `鍥炲悎${data.turn}`,
          source: '绯荤粺',
          action: '缁撴潫',
          target: '',
          result: `鍥炲悎${data.turn}缁撴潫`,
          level: 'system',
        })
      }
    } catch (error) {
      ;(this.getBattleStore() as any).addErrorLog(`Error handling turn end: ${error}`)
      console.error('处理回合结束时出错:', error)
    }
  }

}

// 瀵煎嚭鍗曚緥瀹炰緥
export const battleEventManager = new BattleEventManager()
