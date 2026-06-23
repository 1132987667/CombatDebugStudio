import type { BattleData, ParticipantSide } from '@/types/battle'
import { BattleStatus, RoundStatus, PARTICIPANT_SIDE } from '@/types/battle'
import { AUTO_BATTLE_CONFIG } from '@/types/battle'
import { BattleEventCodes } from '@/types/battle-events'
import type { BattleAction } from '@/types/battle'
import { LogLevel } from '@/types/battle-log'
import type { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import type { RAFTimer } from '@/shared/utils/RAF'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { eventBus } from '@/main'
import { convertToBattleState } from '@/domain/battle/aggregate/BattleState'

export class BattleLifecycleManager {
  private battleSpeed = 1
  private autoBattleTimerId?: symbol
  private autoBattleLoop?: () => Promise<void>

  constructor(
    private getBattleData: () => BattleData | undefined,
    private rafTimer: RAFTimer,
    private battleRecorder: BattleRecorder,
    private buffSystem: BuffSystem,
    private processTurnInternal: () => Promise<void>,
  ) {}

  async endBattle(winner: ParticipantSide): Promise<void> {
    const battle = this.getBattleData()
    if (!battle) return

    this.stopAutoBattle()
    this.cleanupTimers()

    battle.participants.forEach((participant) => {
      this.buffSystem.clearAllBuffs(participant.id)
      participant.buffs = []
    })

    battle.roundState = RoundStatus.NONE
    battle.battleState = BattleStatus.ENDED
    battle.winner = winner
    battle.endTime = Date.now()

    const endAction: BattleAction = {
      id: `end_${Date.now()}`,
      type: 'skill',
      sourceId: 'system',
      targetId: 'system',
      success: true,
      timestamp: Date.now(),
      turn: battle.currentRound || 1,
      effects: [{ type: 'status', description: `战斗结束！胜利者: ${winner === PARTICIPANT_SIDE.ALLY ? '角色方' : '敌方'}`, duration: 0 }],
    }

    battle.actions.push(endAction)
    this.battleRecorder.recordAction(battle.battleId, endAction, battle.currentRound || 1)
    this.battleRecorder.endRecording(battle.battleId, winner)
    this.battleRecorder.saveRecording(battle.battleId)

    battle.battleState = BattleStatus.ENDED
    eventBus.emit(BattleEventCodes.BATTLE_ENDED, { battleId: battle.battleId, winner })
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
      participant.currentHealth = participant.maxHealth
      participant.currentEnergy = 0
      this.buffSystem.clearAllBuffs(participant.id)
      participant.buffs = []
    })

    this.battleRecorder.clearRecording(battle.battleId)
  }

  startBattle(): void {
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
      }
    }

    const delay = this.getBattleDelay()
    const timerId = this.rafTimer.setTimeout(this.autoBattleLoop, delay)
    this.autoBattleTimerId = timerId
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

  getAutoBattle(): boolean {
    return this.getBattleData()?.autoBattle ?? false
  }

  getBattleSpeed(): number {
    return this.battleSpeed
  }

  setSpeed(speed: number): void {
    this.battleSpeed = speed
    const battle = this.getBattleData()
    if (battle) battle.battleSpeed = speed
  }

  isBattleInProgress(): boolean {
    return this.getBattleData()?.battleState === BattleStatus.ACTIVE
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
