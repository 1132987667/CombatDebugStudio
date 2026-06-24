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
import { BattleStateManager } from '@/domain/battle/state/BattleStateManager'
import type { IBattleSystem } from '@/domain/battle/entity/BattleInterfaces'
import { PARTICIPANT_SIDE } from '@/domain/battle/types'

/**
 * 鎴樻枟浜嬩欢绠＄悊鍣ㄧ被
 * 璐熻矗缁熶竴绠＄悊鎴樻枟鐩稿叧鐨勪簨浠惰闃呭拰鍒嗗彂
 */
export class BattleEventManager {
  private battleStore = null
  private battleStateManager: BattleStateManager | null = null
  private battleSystem: IBattleSystem | null = null
  /** 鏍囪鏄惁姝ｅ湪鐩戝惉 */
  private isListening = false
  /** 淇濆瓨浜嬩欢鍥炶皟寮曠敤锛岀敤浜庡幓閲嶅垽鏂?*/
  private boundHandlers: Map<string, Function> = new Map()

  /**
   * 鑾峰彇鎴樻枟store锛堟噿鍔犺浇锛岃В鍐砅inia鏈垵濮嬪寲闂锛?   */
  private getBattleStore() {
    if (!this.battleStore) {
      this.battleStore = useBattleStore()
    }
    return this.battleStore
  }

  /**
   * 璁剧疆鎴樻枟绯荤粺寮曠敤锛堢敱澶栭儴娉ㄥ叆锛?   */
  setBattleSystem(
    battleSystem: IBattleSystem,
    battleStateManager: BattleStateManager,
  ) {
    this.battleSystem = battleSystem
    this.battleStateManager = battleStateManager
  }

  /**
   * 妫€鏌ユ槸鍚︽鍦ㄧ洃鍚?   */
  public isCurrentlyListening(): boolean {
    return this.isListening
  }

  /**
   * 寮€濮嬬洃鍚垬鏂椾簨浠?   */
  startListening() {
    // 闃叉閲嶅璁㈤槄
    if (this.isListening) {
      console.warn('BattleEventManager: 宸插湪鐩戝惉涓紝璺宠繃閲嶅璁㈤槄')
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
   * 鍋滄鐩戝惉鎴樻枟浜嬩欢
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
   * 澶勭悊鎴樻枟鏃ュ織浜嬩欢
   */
  private handleBattleLogEvent(data: BattleLogEventData) {
    try {
      if (data && data.log) {
        const log = data.log
        // 濡傛灉娌℃湁 htmlResult锛屽皾璇曠敓鎴?HTML 鏍煎紡
        if (!log.htmlResult && log.result) {
          let htmlResult = log.result

          // 鍒ゆ柇鏉ユ簮鍜岀洰鏍囨槸鍚︽槸鏁屾柟
          const sourceIsAlly =
            !log.source.includes('鏁屾柟') && log.source !== '绯荤粺'
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
          if (htmlResult.includes('normal_attack')) {
            htmlResult = htmlResult.replace(
              /normal_attack/g,
              '<span class="normal-attack">normal_attack</span>',
            )
          }

          // Add skill name highlighting (match [skill name] pattern)
          htmlResult = htmlResult.replace(
            /\[([^\]]+)\]/g,
            (match, skillName) => {
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

        this.getBattleStore().addBattleLog(log)
      }
    } catch (error) {
      this.getBattleStore().addErrorLog(`澶勭悊鎴樻枟鏃ュ織浜嬩欢鏃跺嚭閿? ${error}`)
    }
  }

  /**
   * 澶勭悊鎴樻枟缁撴潫浜嬩欢
   */
  private handleBattleEndEvent(data: BattleEndedEventData) {
    try {
      this.getBattleStore().setBattleActive(false)
      this.getBattleStore().setAutoPlayMode(false)
      // 璁板綍鎴樻枟缁撴潫鏃ュ織
      if (data && data.winner) {
        this.getBattleStore().addBattleLog({
          turn: '鎴樻枟缁撴潫',
          source: '绯荤粺',
          action: '瀹ｅ竷',
          target: '',
          result: `鎴樻枟缁撴潫锛佽儨鍒╄€? ${data.winner === 'ALLY' ? '鎴戞柟' : '鏁屾柟'}`,
          level: 'system',
        })
      }
    } catch (error) {
      this.getBattleStore().addErrorLog(`澶勭悊鎴樻枟缁撴潫浜嬩欢鏃跺嚭閿? ${error}`)
    }
  }

  /**
   * 澶勭悊鍥炲悎寮€濮嬩簨浠?   */
  private handleTurnStartEvent(data: {
    battleId: string
    turn: number
    actorId: string
  }) {
    try {
      if (data && data.actorId) {
        this.getBattleStore().setCurrentActorId(data.actorId)
        // Record turn start log
        this.getBattleStore().addBattleLog({
          turn: `turn_${data.turn}`,
          source: 'system',
          action: 'start',
          target: '',
          result: `Turn ${data.turn} start, actor: ${data.actorId}`,
          level: 'system',
        })
      }
    } catch (error) {
      this.getBattleStore().addErrorLog(`Error handling turn start: ${error}`)
    }
  }

  /**
   * 澶勭悊鍥炲悎缁撴潫浜嬩欢
   */
  private handleTurnEndEvent(data: { battleId: string; turn: number }) {
    try {
      if (data) {
        // 鍥炲悎缁撴潫澶勭悊
        this.getBattleStore().addBattleLog({
          turn: `鍥炲悎${data.turn}`,
          source: '绯荤粺',
          action: '缁撴潫',
          target: '',
          result: `鍥炲悎${data.turn}缁撴潫`,
          level: 'system',
        })
      }
    } catch (error) {
      this.getBattleStore().addErrorLog(`澶勭悊鍥炲悎缁撴潫浜嬩欢鏃跺嚭閿? ${error}`)
    }
  }
}

// 瀵煎嚭鍗曚緥瀹炰緥
export const battleEventManager = new BattleEventManager()
