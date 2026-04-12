/**
 * 文件: BattleRecorder.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗记录器
 * 描述: 负责记录战斗过程中的所有事件，支持回放和分析功能
 * 版本: 2.0.0 - 增强版：支持快照录制、随机种子、状态回退
 */

import type {
  BattleState,
  BattleEntity,
  BattleAction,
  ParticipantSide,
  BattleReplay,
  BattleStateSnapshot,
  ParticipantSnapshot,
  BuffInstanceSnapshot,
  BattleRound,
  BattleResult,
  BattleEventType,
  BattleEvent,
  ReplayBattleEvent,
  SnapshotIndexItem,
} from '@/types/battle'
import { BATTLE_REPLAY_VERSION } from '@/types/battle'
import { battleLogManager, LogLevel } from '@/utils/logging'
import { SeededRandom } from '@/utils/SeededRandom'
import { calculateChecksum, generateReplayId } from '@/utils/Checksum'

interface EnhancedRecordedBattle {
  battleId: string
  replayId: string
  version: string
  randomSeed: string
  startTime: number
  endTime?: number
  winner?: ParticipantSide
  events: BattleEvent[]
  initialState: {
    participants: Array<{
      id: string
      name: string
      type: ParticipantSide
      maxHealth: number
      currentHealth: number
      maxEnergy: number
      currentEnergy: number
    }>
  }
  initialSnapshot?: BattleStateSnapshot
  finalSnapshot?: BattleStateSnapshot
  rounds: BattleRound[]
  logs: BattleLogEntry[]
  result?: BattleResult
}

type RecordingData = RecordedBattle | EnhancedRecordedBattle

export class BattleRecorder {
  private recordings = new Map<string, EnhancedRecordedBattle>()
  private maxRecordings = 10
  private cleanupScheduled = false
  private randomSeeds = new Map<string, string>()
  private currentRoundNumbers = new Map<string, number>()

  public generateRandomSeed(): string {
    return SeededRandom.generateSeed()
  }

  public startRecording(
    battleId: string,
    initialState: {
      participants: Array<{
        id: string
        name: string
        type: ParticipantSide
        maxHealth: number
        currentHealth: number
        maxEnergy: number
        currentEnergy: number
      }>
    },
    randomSeed?: string,
  ) {
    const seed = randomSeed || this.generateRandomSeed()
    this.randomSeeds.set(battleId, seed)

    const recording: EnhancedRecordedBattle = {
      battleId,
      replayId: generateReplayId(),
      version: BATTLE_REPLAY_VERSION,
      randomSeed: seed,
      startTime: Date.now(),
      events: [],
      initialState,
      rounds: [],
      logs: [],
    }

    this.recordings.set(battleId, recording)
    this.currentRoundNumbers.set(battleId, 0)

    this.recordEvent(
      battleId,
      'battle_start',
      {
        timestamp: Date.now(),
        participants: initialState.participants,
      },
      0,
      0,
    )

    battleLogManager.addSystemLog(`开始记录战斗: ${battleId}`)

    this.scheduleCleanup()
  }

  public getRandomSeed(battleId: string): string | undefined {
    return this.randomSeeds.get(battleId)
  }

  public recordInitialSnapshot(
    battleId: string,
    snapshot: BattleStateSnapshot,
  ) {
    const recording = this.recordings.get(battleId)
    if (recording) {
      recording.initialSnapshot = snapshot
    }
  }

  public recordFinalSnapshot(battleId: string, snapshot: BattleStateSnapshot) {
    const recording = this.recordings.get(battleId)
    if (recording) {
      recording.finalSnapshot = snapshot
    }
  }

  public startRound(
    battleId: string,
    roundNumber: number,
    snapshot?: BattleStateSnapshot,
  ) {
    this.currentRoundNumbers.set(battleId, roundNumber)
    const recording = this.recordings.get(battleId)
    if (recording) {
      const round: BattleRound = {
        roundNumber,
        startSnapshot: snapshot,
        events: [],
      }
      recording.rounds.push(round)
    }

    this.recordEvent(
      battleId,
      'turn_start',
      {
        roundNumber,
        snapshot,
      },
      roundNumber,
      roundNumber,
    )
  }

  public endRound(battleId: string, snapshot?: BattleStateSnapshot) {
    const roundNumber = this.currentRoundNumbers.get(battleId) || 0
    const recording = this.recordings.get(battleId)
    if (recording && recording.rounds.length > 0) {
      const currentRound = recording.rounds[recording.rounds.length - 1]
      if (currentRound.roundNumber === roundNumber) {
        currentRound.endSnapshot = snapshot
      }
    }

    this.recordEvent(
      battleId,
      'turn_end',
      {
        roundNumber,
        snapshot,
      },
      roundNumber,
      roundNumber,
    )
  }

  public recordAction(battleId: string, action: BattleAction, turn: number) {
    const roundNumber = this.currentRoundNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      'action',
      {
        action,
        turn,
      },
      turn,
      roundNumber,
    )

    const recording = this.recordings.get(battleId)
    if (recording && recording.rounds.length > 0) {
      const currentRound = recording.rounds[recording.rounds.length - 1]
      currentRound.events.push({
        eventId: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'action',
        timestamp: Date.now(),
        turn,
        roundNumber,
        data: { action, turn },
      })
    }
  }

  public recordBuffAdd(
    battleId: string,
    targetId: string,
    buffId: string,
    instanceId: string,
    turn: number,
  ) {
    const roundNumber = this.currentRoundNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      'buff_add',
      {
        targetId,
        buffId,
        instanceId,
        turn,
      },
      turn,
      roundNumber,
    )
  }

  public recordBuffRemove(
    battleId: string,
    targetId: string,
    instanceId: string,
    turn: number,
  ) {
    const roundNumber = this.currentRoundNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      'buff_remove',
      {
        targetId,
        instanceId,
        turn,
      },
      turn,
      roundNumber,
    )
  }

  public recordBuffUpdate(
    battleId: string,
    targetId: string,
    instanceId: string,
    remainingTurns: number,
    stacks: number,
    turn: number,
  ) {
    const roundNumber = this.currentRoundNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      'buff_update',
      {
        targetId,
        instanceId,
        remainingTurns,
        stacks,
        turn,
      },
      turn,
      roundNumber,
    )
  }

  public recordStateChange(
    battleId: string,
    state: Partial<BattleState>,
    turn: number,
  ) {
    const roundNumber = this.currentRoundNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      'state_change',
      {
        state,
        turn,
      },
      turn,
      roundNumber,
    )
  }

  public recordTurnStart(
    battleId: string,
    turn: number,
    participantId: string,
  ) {
    const roundNumber = this.currentRoundNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      'turn_start',
      {
        turn,
        participantId,
      },
      turn,
      roundNumber,
    )
  }

  public recordTurnEnd(battleId: string, turn: number) {
    const roundNumber = this.currentRoundNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      'turn_end',
      {
        turn,
      },
      turn,
      roundNumber,
    )
  }

  public endRecording(
    battleId: string,
    winner?: ParticipantSide,
    result?: BattleResult,
  ) {
    const recording = this.recordings.get(battleId)
    if (!recording) {
      return
    }

    const duration = Date.now() - recording.startTime
    recording.endTime = Date.now()
    recording.winner = winner

    if (result) {
      recording.result = {
        ...result,
        duration,
      }
    }

    const roundNumber = this.currentRoundNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      'battle_end',
      {
        timestamp: Date.now(),
        winner,
      },
      roundNumber,
      roundNumber,
    )

    battleLogManager.addSystemLog(`结束记录战斗: ${battleId}`, {
      segments: [
        {
          text: `战斗结束，${winner}获胜，耗时 ${duration}ms`,
        },
      ],
    })
  }

  public getRecording(battleId: string): EnhancedRecordedBattle | undefined {
    return this.recordings.get(battleId)
  }

  public getAllRecordings(): EnhancedRecordedBattle[] {
    return Array.from(this.recordings.values())
  }

  public saveRecording(battleId: string, name?: string): string | null {
    const recording = this.recordings.get(battleId)
    if (!recording) {
      return null
    }

    const { checksum, ...dataWithoutChecksum } = recording
    const dataToSave = {
      ...dataWithoutChecksum,
      savedAt: Date.now(),
      name: name || `战斗记录_${new Date().toLocaleString()}`,
    }

    const checksumValue = calculateChecksum(dataToSave)
    const saveData = {
      ...dataToSave,
      checksum: checksumValue,
    }

    const saveKey = `battle_recording_${battleId}_${Date.now()}`
    localStorage.setItem(saveKey, JSON.stringify(saveData))

    const recordingsList = this.getSavedRecordingsList()
    if (!recordingsList.includes(saveKey)) {
      recordingsList.push(saveKey)
      localStorage.setItem(
        'battle_recordings_list',
        JSON.stringify(recordingsList),
      )
    }

    battleLogManager.addDebugLog(`保存战斗记录: ${battleId}`, {
      saveKey,
      checksum: checksumValue,
    })

    return saveKey
  }

  public loadRecording(saveKey: string): EnhancedRecordedBattle | null {
    const savedData = localStorage.getItem(saveKey)
    if (!savedData) {
      return null
    }

    try {
      const recording = JSON.parse(savedData) as EnhancedRecordedBattle

      if (recording.checksum) {
        const { checksum, ...dataWithoutChecksum } = recording
        const calculatedChecksum = calculateChecksum(dataWithoutChecksum)
        if (calculatedChecksum !== checksum) {
          battleLogManager.addDebugLog(
            '战斗记录校验失败:',
            LogLevel.ERROR,
            null,
            '',
            { saveKey },
          )
          return null
        }
      }

      this.recordings.set(recording.battleId, recording)
      if (recording.randomSeed) {
        this.randomSeeds.set(recording.battleId, recording.randomSeed)
      }
      return recording
    } catch (error) {
      battleLogManager.addDebugLog(
        '加载战斗记录失败:',
        LogLevel.ERROR,
        null,
        '',
        error,
      )
      return null
    }
  }

  public validateRecording(saveKey: string): boolean {
    const savedData = localStorage.getItem(saveKey)
    if (!savedData) {
      return false
    }

    try {
      const recording = JSON.parse(savedData)
      if (!recording.checksum) {
        return true
      }

      const { checksum, ...dataWithoutChecksum } = recording
      const calculatedChecksum = calculateChecksum(dataWithoutChecksum)
      return calculatedChecksum === checksum
    } catch {
      return false
    }
  }

  public getSavedRecordingsList(): string[] {
    const listData = localStorage.getItem('battle_recordings_list')
    if (!listData) {
      return []
    }

    try {
      return JSON.parse(listData)
    } catch {
      return []
    }
  }

  public deleteRecording(saveKey: string): boolean {
    localStorage.removeItem(saveKey)

    const recordingsList = this.getSavedRecordingsList()
    const updatedList = recordingsList.filter((key) => key !== saveKey)
    localStorage.setItem('battle_recordings_list', JSON.stringify(updatedList))

    battleLogManager.addDebugLog(`删除战斗记录: ${saveKey}`)
    return true
  }

  private recordEvent(
    battleId: string,
    type: BattleEvent['type'],
    data: any,
    turn: number,
    roundNumber: number,
  ) {
    const recording = this.recordings.get(battleId)
    if (!recording) {
      return
    }

    const event: BattleEvent = {
      eventId: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      turn,
      roundNumber,
      data,
    }

    recording.events.push(event)

    recording.logs.push({
      eventId: event.eventId,
      type: type as BattleEventType,
      timestamp: event.timestamp,
      turn,
      roundNumber,
      message: this.generateLogMessage(type, data),
      details: data,
    })

    if (recording.events.length > 1000) {
      recording.events = recording.events.slice(-1000)
    }
  }

  private generateLogMessage(type: string, data: any): string {
    switch (type) {
      case 'battle_start':
        return '战斗开始'
      case 'battle_end':
        return `战斗结束，胜利方: ${data.winner}`
      case 'turn_start':
        return `回合 ${data.roundNumber || data.turn} 开始`
      case 'turn_end':
        return `回合 ${data.roundNumber || data.turn} 结束`
      case 'action':
        return `${data.action?.sourceId} 执行了 ${data.action?.type} 动作`
      case 'buff_add':
        return `为目标 ${data.targetId} 添加了 Buff: ${data.buffId}`
      case 'buff_remove':
        return `从目标 ${data.targetId} 移除了 Buff: ${data.instanceId}`
      case 'buff_update':
        return `更新了目标 ${data.targetId} 的 Buff: ${data.instanceId}`
      default:
        return `事件: ${type}`
    }
  }

  public clearRecordings() {
    this.recordings.clear()
    this.randomSeeds.clear()
    this.currentRoundNumbers.clear()
    battleLogManager.addDebugLog('清空所有战斗记录')
  }

  public clearRecording(battleId: string): void {
    if (this.recordings.has(battleId)) {
      this.recordings.delete(battleId)
      this.randomSeeds.delete(battleId)
      this.currentRoundNumbers.delete(battleId)
      battleLogManager.addDebugLog(`清理战斗记录: ${battleId}`)
    }
  }

  private scheduleCleanup(): void {
    if (this.cleanupScheduled) {
      return
    }

    this.cleanupScheduled = true

    setTimeout(() => {
      this.cleanupOldRecordings()
      this.cleanupScheduled = false
    }, 60000)
  }

  private cleanupOldRecordings(): void {
    if (this.recordings.size <= this.maxRecordings) {
      return
    }

    const sortedRecordings = Array.from(this.recordings.entries()).sort(
      (a, b) => a[1].startTime - b[1].startTime,
    )

    const toDeleteCount = this.recordings.size - this.maxRecordings
    for (let i = 0; i < toDeleteCount; i++) {
      const [battleId] = sortedRecordings[i]
      this.recordings.delete(battleId)
      this.randomSeeds.delete(battleId)
      this.currentRoundNumbers.delete(battleId)
      battleLogManager.addDebugLog(`清理过期战斗记录: ${battleId}`)
    }
  }
}
