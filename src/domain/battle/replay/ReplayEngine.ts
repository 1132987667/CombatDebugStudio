/**
 * 文件: ReplayEngine.ts
 * 创建日期: 2026-03-12
 * 作者: CombatDebugStudio
 * 功能: 战斗回放引擎
 * 描述: 支持确定性回放、状态恢复、时间跳转的回放引擎核心类
 */

import type {
  BattleReplay,
  BattleStateSnapshot,
  ParticipantSnapshot,
  BuffInstanceSnapshot,
  BattleEventType,
  BattleEvent,
  SnapshotIndexItem,
  BattleEntity,
  ParticipantSide,
} from '@/domain/battle/types'
import { battleLogManager } from '@/infrastructure/adapters/logging'
import { SeededRandom } from '@/shared/utils/SeededRandom'

export type ReplayStateCallback = (state: ReplayState) => void
export type ReplayEventCallback = (event: ReplayEvent) => void

export interface ReplayState {
  currentIndex: number
  totalEvents: number
  currentSnapshot: BattleStateSnapshot | null
  isPlaying: boolean
  isPaused: boolean
  speed: number
  turn: number
  roundNumber: number
}

export interface ReplayEvent {
  index: number
  type: BattleEventType
  timestamp: number
  data: any
}

export class ReplayEngine {
  private replayData: BattleReplay | null = null
  private random: SeededRandom | null = null
  private currentIndex = 0
  private isPlaying = false
  private isPaused = false
  private speed = 1
  private currentState: BattleStateSnapshot | null = null
  private snapshots: BattleStateSnapshot[] = []
  private snapshotIndex: SnapshotIndexItem[] = []
  private stateCallbacks: ReplayStateCallback[] = []
  private eventCallbacks: ReplayEventCallback[] = []
  private playTimer: symbol | null = null

  getState(): ReplayState {
    return {
      currentIndex: this.currentIndex,
      totalEvents: this.replayData?.events?.length || 0,
      currentSnapshot: this.currentState,
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      speed: this.speed,
      turn: this.currentState?.turn || 0,
      roundNumber: this.currentState?.roundIndex || 0,
    }
  }

  loadReplay(replayData: BattleReplay): boolean {
    try {
      if (!replayData || !replayData.initialState) {
        this.battleLogManager.addSystemLog('无效的回放数据')
        return false
      }

      this.replayData = replayData
      this.random = new SeededRandom(replayData.randomSeed)
      this.currentIndex = 0
      this.isPlaying = false
      this.isPaused = false

      this.buildSnapshotIndex()
      this.currentState = this.applySnapshot(replayData.initialState)

      this.battleLogManager.addSystemLog(`已加载回放: ${replayData.replayId}`)
      this.emitStateUpdate()

      return true
    } catch (error) {
      this.battleLogManager.addSystemLog('加载回放失败: ' + error)
      return false
    }
  }

  private buildSnapshotIndex() {
    this.snapshotIndex = []
    this.snapshots = []

    if (!this.replayData) return

    if (this.replayData.initialState) {
      this.snapshots.push(this.replayData.initialState)
      this.snapshotIndex.push({
        snapshotIndex: 0,
        eventIndex: -1,
        turn: 0,
        roundNumber: 0,
        timestamp: this.replayData.startTime,
      })
    }

    if (this.replayData.rounds) {
      this.replayData.rounds.forEach((round, roundIdx) => {
        if (round.startSnapshot) {
          const snapshotIdx = this.snapshots.length
          this.snapshots.push(round.startSnapshot)
          const eventIdx = round.events.length > 0 ? 0 : -1
          this.snapshotIndex.push({
            snapshotIndex: snapshotIdx,
            eventIndex: eventIdx,
            turn: round.startSnapshot.turn,
            roundNumber: round.roundNumber,
            timestamp: round.startSnapshot.timestamp,
          })
        }
      })
    }

    if (this.replayData.finalState) {
      const snapshotIdx = this.snapshots.length
      this.snapshots.push(this.replayData.finalState)
      const lastEventIdx = (this.replayData.events?.length || 1) - 1
      this.snapshotIndex.push({
        snapshotIndex: snapshotIdx,
        eventIndex: lastEventIdx,
        turn: this.replayData.finalState.turn,
        roundNumber: this.replayData.finalState.roundIndex,
        timestamp: this.replayData.finalState.timestamp,
      })
    }
  }

  private findNearestSnapshot(targetIndex: number): { snapshot: BattleStateSnapshot; eventIndex: number } {
    let bestSnapshot = this.snapshots[0]
    let bestEventIndex = -1

    for (let i = this.snapshotIndex.length - 1; i >= 0; i--) {
      if (this.snapshotIndex[i].eventIndex <= targetIndex) {
        bestSnapshot = this.snapshots[this.snapshotIndex[i].snapshotIndex]
        bestEventIndex = this.snapshotIndex[i].eventIndex
        break
      }
    }

    return { snapshot: bestSnapshot, eventIndex: bestEventIndex }
  }

  seekToEvent(index: number): boolean {
    if (!this.replayData || !this.replayData.events) {
      return false
    }

    const targetIndex = Math.max(0, Math.min(index, this.replayData.events.length - 1))

    const { snapshot, eventIndex } = this.findNearestSnapshot(targetIndex)
    this.currentState = this.applySnapshot(snapshot)

    for (let i = eventIndex + 1; i <= targetIndex; i++) {
      this.applyEvent(this.replayData.events[i])
    }

    this.currentIndex = targetIndex
    this.emitStateUpdate()
    return true
  }

  seekToTurn(turn: number): boolean {
    if (!this.replayData || !this.replayData.events) {
      return false
    }

    let targetIndex = 0
    for (let i = 0; i < this.replayData.events.length; i++) {
      if (this.replayData.events[i].turn >= turn) {
        targetIndex = i
        break
      }
      targetIndex = i
    }

    return this.seekToEvent(targetIndex)
  }

  seekToRound(roundNumber: number): boolean {
    if (!this.replayData || !this.replayData.events) {
      return false
    }

    let targetIndex = 0
    for (let i = 0; i < this.replayData.events.length; i++) {
      if (this.replayData.events[i].roundNumber >= roundNumber) {
        targetIndex = i
        break
      }
      targetIndex = i
    }

    return this.seekToEvent(targetIndex)
  }

  seekToTime(timestamp: number): boolean {
    if (!this.replayData || !this.replayData.events) {
      return false
    }

    let targetIndex = 0
    for (let i = 0; i < this.replayData.events.length; i++) {
      if (this.replayData.events[i].timestamp >= timestamp) {
        targetIndex = i
        break
      }
      targetIndex = i
    }

    return this.seekToEvent(targetIndex)
  }

  stepForward(): boolean {
    if (!this.replayData || !this.replayData.events) {
      return false
    }

    if (this.currentIndex >= this.replayData.events.length - 1) {
      return false
    }

    this.currentIndex++
    this.applyEvent(this.replayData.events[this.currentIndex])
    this.emitStateUpdate()
    return true
  }

  stepBackward(): boolean {
    if (!this.replayData || !this.replayData.events) {
      return false
    }

    if (this.currentIndex <= 0) {
      return false
    }

    const { snapshot, eventIndex } = this.findNearestSnapshot(this.currentIndex - 1)
    this.currentState = this.applySnapshot(snapshot)

    for (let i = eventIndex + 1; i < this.currentIndex; i++) {
      this.applyEvent(this.replayData.events[i])
    }

    this.currentIndex--
    this.emitStateUpdate()
    return true
  }

  play(): void {
    if (!this.replayData || this.isPlaying) {
      return
    }

    this.isPlaying = true
    this.isPaused = false
    this.emitStateUpdate()
    this.playNextEvent()
  }

  pause(): void {
    this.isPaused = true
    this.emitStateUpdate()
  }

  resume(): void {
    if (this.isPlaying && this.isPaused) {
      this.isPaused = false
      this.emitStateUpdate()
      this.playNextEvent()
    }
  }

  stop(): void {
    this.isPlaying = false
    this.isPaused = false
    this.currentIndex = 0

    if (this.replayData?.initialState) {
      this.currentState = this.applySnapshot(this.replayData.initialState)
    }

    this.emitStateUpdate()
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.25, Math.min(4, speed))
    this.emitStateUpdate()
  }

  getSpeed(): number {
    return this.speed
  }

  isPlayingState(): boolean {
    return this.isPlaying
  }

  isPausedState(): boolean {
    return this.isPaused
  }

  getCurrentIndex(): number {
    return this.currentIndex
  }

  getTotalEvents(): number {
    return this.replayData?.events?.length || 0
  }

  getCurrentSnapshot(): BattleStateSnapshot | null {
    return this.currentState
  }

  getRandom(): SeededRandom | null {
    return this.random
  }

  getEvent(index: number): any {
    if (!this.replayData || !this.replayData.events) {
      return null
    }
    return this.replayData.events[index]
  }

  getEvents(): any[] {
    return this.replayData?.events || []
  }

  onStateChange(callback: ReplayStateCallback): () => void {
    this.stateCallbacks.push(callback)
    return () => {
      const idx = this.stateCallbacks.indexOf(callback)
      if (idx >= 0) {
        this.stateCallbacks.splice(idx, 1)
      }
    }
  }

  onEvent(callback: ReplayEventCallback): () => void {
    this.eventCallbacks.push(callback)
    return () => {
      const idx = this.eventCallbacks.indexOf(callback)
      if (idx >= 0) {
        this.eventCallbacks.splice(idx, 1)
      }
    }
  }

  private applySnapshot(snapshot: BattleStateSnapshot): BattleStateSnapshot {
    return {
      timestamp: snapshot.timestamp,
      turn: snapshot.turn,
      roundIndex: snapshot.roundIndex,
      currentActorId: snapshot.currentActorId,
      participants: snapshot.participants.map(p => this.cloneParticipant(p)),
    }
  }

  private cloneParticipant(p: ParticipantSnapshot): ParticipantSnapshot {
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      team: p.team,
      hp: p.hp,
      maxHp: p.maxHp,
      energy: p.energy,
      maxEnergy: p.maxEnergy,
      buffs: p.buffs.map(b => ({ ...b })),
      skillCooldowns: { ...p.skillCooldowns },
      statusEffects: p.statusEffects.map(s => ({ ...s })),
      attributes: { ...p.attributes },
    }
  }

  private applyEvent(event: any): void {
    if (!this.currentState) return

    switch (event.type) {
      case 'action':
        this.applyActionEvent(event)
        break
      case 'buff_add':
        this.applyBuffAddEvent(event)
        break
      case 'buff_remove':
        this.applyBuffRemoveEvent(event)
        break
      case 'buff_update':
        this.applyBuffUpdateEvent(event)
        break
      case 'turn_start':
        this.currentState.turn = event.turn
        this.currentState.roundIndex = event.roundNumber
        this.currentState.currentActorId = event.data?.participantId
        break
      case 'turn_end':
        break
      case 'battle_start':
        this.currentState.turn = 0
        this.currentState.roundIndex = 0
        break
      case 'battle_end':
        break
      case 'state_change':
        this.applyStateChangeEvent(event)
        break
    }

    this.emitEvent({
      index: this.currentIndex,
      type: event.type as BattleEventType,
      timestamp: event.timestamp,
      data: event.data,
    })
  }

  private applyActionEvent(event: any): void {
    if (!this.currentState) return

    const action = event.data?.action
    if (!action) return

    const target = this.currentState.participants.find(p => p.id === action.targetId)
    if (target) {
      if (action.damage) {
        target.hp = Math.max(0, target.hp - action.damage)
      }
      if (action.heal) {
        target.hp = Math.min(target.maxHp, target.hp + action.heal)
      }
    }

    const source = this.currentState.participants.find(p => p.id === action.sourceId)
    if (source && action.type === 'skill') {
      const skillId = action.skillId
      if (skillId && source.skillCooldowns) {
        const cooldown = this.getSkillCooldown(skillId)
        source.skillCooldowns[skillId] = cooldown
      }
    }
  }

  private getSkillCooldown(skillId: string): number {
    const skillCooldowns: Record<string, number> = {
      'skill_1': 3,
      'skill_2': 4,
      'skill_3': 5,
      'ultimate': 6,
    }
    return skillCooldowns[skillId] || 3
  }

  private applyBuffAddEvent(event: any): void {
    if (!this.currentState) return

    const { targetId, buffId, instanceId } = event.data
    const target = this.currentState.participants.find(p => p.id === targetId)
    if (target) {
      target.buffs.push({
        buffId,
        instanceId,
        remainingTurns: event.data.duration || 3,
        stacks: 1,
        sourceId: event.data.sourceId || '',
      })
    }
  }

  private applyBuffRemoveEvent(event: any): void {
    if (!this.currentState) return

    const { targetId, instanceId } = event.data
    const target = this.currentState.participants.find(p => p.id === targetId)
    if (target) {
      target.buffs = target.buffs.filter(b => b.instanceId !== instanceId)
    }
  }

  private applyBuffUpdateEvent(event: any): void {
    if (!this.currentState) return

    const { targetId, instanceId, remainingTurns, stacks } = event.data
    const target = this.currentState.participants.find(p => p.id === targetId)
    if (target) {
      const buff = target.buffs.find(b => b.instanceId === instanceId)
      if (buff) {
        if (remainingTurns !== undefined) buff.remainingTurns = remainingTurns
        if (stacks !== undefined) buff.stacks = stacks
      }
    }
  }

  private applyStateChangeEvent(event: any): void {
    if (!this.currentState) return

    const stateChanges = event.data?.state
    if (!stateChanges) return

    if (stateChanges.turn !== undefined) {
      this.currentState.turn = stateChanges.turn
    }
    if (stateChanges.roundIndex !== undefined) {
      this.currentState.roundIndex = stateChanges.roundIndex
    }
  }

  private playNextEvent(): void {
    if (!this.isPlaying || this.isPaused) {
      return
    }

    if (!this.replayData || !this.replayData.events) {
      return
    }

    if (this.currentIndex >= this.replayData.events.length) {
      this.handleReplayEnd()
      return
    }

    const event = this.replayData.events[this.currentIndex]
    this.applyEvent(event)

    this.currentIndex++
    this.emitStateUpdate()

    const delay = this.calculateEventDelay(event)

    import('@/shared/utils/RAF').then(({ raf }) => {
      this.playTimer = raf.setTimeout(() => {
        this.playNextEvent()
      }, delay)
    })
  }

  private calculateEventDelay(event: any): number {
    const baseDelay = 500
    const typeDelay: Record<string, number> = {
      action: 800,
      buff_add: 200,
      buff_remove: 200,
      buff_update: 100,
      turn_start: 300,
      turn_end: 200,
      battle_start: 500,
      battle_end: 500,
    }

    const type = event.type || 'action'
    const delay = typeDelay[type] || baseDelay
    return delay / this.speed
  }

  private handleReplayEnd(): void {
    this.isPlaying = false
    this.isPaused = false
    this.emitStateUpdate()
    this.battleLogManager.addSystemLog('回放已结束')
  }

  private emitStateUpdate(): void {
    const state = this.getState()
    this.stateCallbacks.forEach(cb => cb(state))
  }

  private emitEvent(event: ReplayEvent): void {
    this.eventCallbacks.forEach(cb => cb(event))
  }

  private battleLogManager = {
    addSystemLog: (msg: string) => console.log('[ReplayEngine]', msg),
    error: (msg: string, err: any) => console.error('[ReplayEngine]', msg, err),
  }
}
