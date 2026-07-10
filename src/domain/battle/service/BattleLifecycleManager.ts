import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { debugGate } from '@/domain/battle/debug/DebugGate'
import type { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import type { BattleData, ParticipantSide } from '@/domain/battle/type/types'
import { AUTO_BATTLE_CONFIG, BattleActionHelper, BattleStatus, PARTICIPANT_SIDE, RoundStatus } from '@/domain/battle/type/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { eventBus } from '@/main'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import type { RAFTimer } from '@/shared/utils/RAF'

import type { BattleAnimationManager } from '@/domain/battle/BattleAnimationManager'

export class BattleLifecycleManager {
  private autoBattleTimerId?: symbol
  private autoBattleLoop?: () => Promise<void>

  constructor(
    private getBattleData: () => BattleData | undefined,
    private rafTimer: RAFTimer,
    private battleRecorder: BattleRecorder,
    private buffSystem: BuffSystem,
    private processTurnInternal: () => Promise<void>,
    private animationManager: BattleAnimationManager,
  ) {}

  async endBattle(winner: ParticipantSide): Promise<void> {
    const battle = this.getBattleData()
    if (!battle) return

    // ⭐ 幂等性守卫：防止重复触发 endBattle
    if (
      battle.battleState === BattleStatus.ENDED ||
      battle.battleState === BattleStatus.SETTLEMENT
    ) {
      return
    }

    this.stopAutoBattle()
    this.cleanupTimers()

    battle.participants.forEach((participant) => {
      this.buffSystem.clearAllBuffs(participant.id)
    })

    battle.roundState = RoundStatus.NONE
    battle.battleState = BattleStatus.ENDED
    battle.winner = winner
    battle.endTime = Date.now()

    // ⭐ 强制中断所有正在等待的动画，让 processTurnInternal 立即退出
    this.animationManager.cleanupAnimationState()

    const endAction = BattleActionHelper.createSkill({
      sourceId: 'system',
      targetId: 'system',
      skillId: '',
      turn: battle.currentRound || 1,
      effects: [{ type: 'status', description: `战斗结束！胜利者: ${winner === PARTICIPANT_SIDE.ALLY ? '角色方' : '敌方'}`, duration: 0 }],
    })

    battle.actions.push(endAction)
    this.battleRecorder.recordAction(battle.battleId, endAction, battle.currentRound || 1)
    this.battleRecorder.endRecording(battle.battleId, winner)
    this.battleRecorder.saveRecording(battle.battleId)

    battle.battleState = BattleStatus.ENDED
    eventBus.emit(BattleEventCodes.BATTLE_ENDED, { battleId: battle.battleId, winner })

    // ponytail: 调试模式 — 战斗结束事件已派发后暂停
    await debugGate.waitIfNeeded('BATTLE_END')
  }

  resetBattle(): void {
    const battle = this.getBattleData()
    if (!battle) return

    this.stopAutoBattle()
    this.cleanupTimers()

    battle.winner = undefined
    battle.endTime = undefined
    battle.turnOrder = []
    battle.currentTurn = 0
    battle.battleState = BattleStatus.CREATED
    battle.roundState = RoundStatus.NONE
    battle.actions = []

    battle.participants.forEach((participant) => {
      participant.setAttribute(ATTRIBUTE_CODE.currentHealth, participant.getAttribute(ATTRIBUTE_CODE.maxHealth))
      participant.setAttribute(ATTRIBUTE_CODE.currentEnergy, 0)
      this.buffSystem.clearAllBuffs(participant.id)
    })

    this.battleRecorder.clearRecording(battle.battleId)
  }

  startAutoBattleLoop(): void {
    const battle = this.getBattleData()
    if (!battle) return

    battle.autoBattle = true
    battle.battleState = BattleStatus.ACTIVE

    this.autoBattleLoop = async () => {
      if (this.getIsPaused()) return

      const current = this.getBattleData()
      if (!current?.autoBattle || current.battleState !== BattleStatus.ACTIVE) return

      try {
        await this.processTurnInternal()

        const after = this.getBattleData()
        if (after?.battleState === BattleStatus.ENDED || after?.battleState === BattleStatus.PAUSED) {
          this.stopAutoBattle()
          return
        }

        if (!this.getIsPaused()) {
          const delay = this.getBattleDelay()
          const timerId = this.rafTimer.setTimeout(this.autoBattleLoop!, delay)
          this.autoBattleTimerId = timerId
        }
      } catch (error) {
        this.stopAutoBattle()
        console.error('自动战斗循环出错:', error)
      }
    }

    const delay = this.getBattleDelay()
    this.autoBattleTimerId = this.rafTimer.setTimeout(this.autoBattleLoop, delay)
  }

  stopAutoBattle(): void {
    const battle = this.getBattleData()
    if (!battle) return

    battle.autoBattle = false
    battle.battleState = BattleStatus.PAUSED
    this.autoBattleLoop = undefined

    if (this.autoBattleTimerId) {
      this.rafTimer.clear(this.autoBattleTimerId)
      this.autoBattleTimerId = undefined
    }
  }

  togglePause(): void {
    const battle = this.getBattleData()
    if (!battle) return

    battle.battleState = battle.battleState === BattleStatus.PAUSED ? BattleStatus.ACTIVE : BattleStatus.PAUSED

    if (this.getIsPaused()) {
      this.pause()
    } else {
      this.resume()
    }
  }

  getIsPaused(): boolean {
    return this.getBattleData()?.battleState === BattleStatus.PAUSED
  }

  private pause(): void {
    if (this.autoBattleTimerId) {
      this.rafTimer.clear(this.autoBattleTimerId)
      this.autoBattleTimerId = undefined
    }
  }

  private resume(): void {
    const battle = this.getBattleData()
    if (battle?.autoBattle && battle.battleState === BattleStatus.ACTIVE && this.autoBattleLoop) {
      const delay = this.getBattleDelay()
      const timerId = this.rafTimer.setTimeout(this.autoBattleLoop, delay)
      this.autoBattleTimerId = timerId
    }
  }

  private cleanupTimers(): void {
    if (this.autoBattleTimerId) {
      this.rafTimer.clear(this.autoBattleTimerId)
      this.autoBattleTimerId = undefined
    }
  }

  private getBattleDelay(): number {
    const battle = this.getBattleData()
    if (!battle) return AUTO_BATTLE_CONFIG.DEFAULT_DELAY
    return AUTO_BATTLE_CONFIG.DELAYS[battle.battleSpeed] ?? AUTO_BATTLE_CONFIG.DEFAULT_DELAY
  }
}
