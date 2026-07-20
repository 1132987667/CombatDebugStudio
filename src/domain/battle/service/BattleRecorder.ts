/**
 * 文件: BattleRecorder.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗记录器
 * 描述: 负责记录战斗过程中的所有事件，支持回放和分析功能
 * 版本: 2.0.0 - 增强版：支持快照录制、随机种子、状态回退
 */

/** 单场战斗事件日志上限 */
const MAX_EVENT_LOG = 1000
/** 过期记录清理检查间隔（毫秒） */
const CLEANUP_INTERVAL = 60000

import {
  BattleState,
  BattleAction,
  ParticipantSide,
  BattleStateSnapshot,
  BattleRound,
  BattleResult,
  BattleEventType,
  ReplayBattleEvent,
} from '@/domain/battle/type/types'
import { BATTLE_REPLAY_VERSION } from '@/domain/battle/type/types'
import { LogLevel } from '@/shared/types/battle-log'
import { SeededRandom } from '@/shared/utils/SeededRandom'
import { calculateChecksum, generateReplayId } from '@/shared/utils/Checksum'
import { LogType, type BattleLogEntry } from '@/shared/types/battle-log'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { BattleSummaryGenerator } from '@/domain/battle/logs/BattleSummaryGenerator'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

/**
 * 战斗记录
 */
export interface RecordedBattle {
  battleId: string
  replayId: string
  version: string
  randomSeed: string
  startTime: number
  endTime?: number
  winner?: ParticipantSide
  events: ReplayBattleEvent[]
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
  /** 详细战斗记录（含伤害拆分） */
  combatRecords: CombatRecord[]
  result?: BattleResult
  /** 数据校验和 */
  checksum?: string
}

export class BattleRecorder {
  private recordings = new Map<string, RecordedBattle>()
  private maxRecordings = 10
  private cleanupScheduled = false
  private randomSeeds = new Map<string, string>()
  private currentTurnNumbers = new Map<string, number>()

  public generateRandomSeed(): string {
    return SeededRandom.generateSeed()
  }

  /**
   * 开始记录战斗事件
   */
  public startRecording(
    battleId: string,
    initialState: {
      participants: Array<BattleEntity>
    },
    randomSeed?: string,
  ) {
    const seed = randomSeed || this.generateRandomSeed()
    this.randomSeeds.set(battleId, seed)

    const recording: RecordedBattle = {
      battleId,
      replayId: generateReplayId(),
      version: BATTLE_REPLAY_VERSION,
      randomSeed: seed,
      startTime: Date.now(),
      events: [],
      initialState,
      rounds: [],
      logs: [],
      combatRecords: [],
    }

    this.recordings.set(battleId, recording)
    this.currentTurnNumbers.set(battleId, 0)

    this.recordEvent(
      battleId,
      BattleEventType.BATTLE_START,
      {
        timestamp: Date.now(),
        participants: initialState.participants,
      },
      0,
      0,
    )

    LoggerProvider.logger.addSystemLog({
      level: LogLevel.INFO,
      message: `开始记录战斗: ${battleId}`,
    })

    // ponytail: 战报累加器初始化
    BattleSummaryGenerator.instance.startBattle(battleId)

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
    this.currentTurnNumbers.set(battleId, roundNumber)
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
      BattleEventType.TURN_START,
      {
        roundNumber,
        snapshot,
      },
      roundNumber,
      roundNumber,
    )
  }

  public endRound(battleId: string, snapshot?: BattleStateSnapshot) {
    const roundNumber = this.currentTurnNumbers.get(battleId) || 0
    const recording = this.recordings.get(battleId)
    if (recording && recording.rounds.length > 0) {
      const currentTurn = recording.rounds[recording.rounds.length - 1]
      if (currentTurn.roundNumber === roundNumber) {
        currentTurn.endSnapshot = snapshot
      }
    }

    this.recordEvent(
      battleId,
      BattleEventType.TURN_END,
      {
        roundNumber,
        snapshot,
      },
      roundNumber,
      roundNumber,
    )
  }

  public recordAction(battleId: string, action: BattleAction, turn: number) {
    const roundNumber = this.currentTurnNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      BattleEventType.ACTION,
      {
        action,
        turn,
      },
      turn,
      roundNumber,
    )

    const recording = this.recordings.get(battleId)
    if (recording && recording.rounds.length > 0) {
      const currentTurn = recording.rounds[recording.rounds.length - 1]
      currentTurn.events.push({
        eventId: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: BattleEventType.ACTION,
        timestamp: Date.now(),
        turn,
        roundNumber,
        data: { action, turn },
      })
    }
  }

  /**
   * 记录详细战斗记录（含伤害拆分）
   */
  public recordCombatRecord(battleId: string, record: CombatRecord): void {
    const recording = this.recordings.get(battleId)
    if (recording) {
      recording.combatRecords.push(record)
    }
    // ponytail: 战报数据累积
    BattleSummaryGenerator.instance.onAction(record)
  }

  public recordBuffAdd(
    battleId: string,
    targetId: string,
    buffId: string,
    instanceId: string,
    turn: number,
  ) {
    const roundNumber = this.currentTurnNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      BattleEventType.BUFF_ADD,
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
    const roundNumber = this.currentTurnNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      BattleEventType.BUFF_REMOVE,
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
    const roundNumber = this.currentTurnNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      BattleEventType.BUFF_UPDATE,
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
    const roundNumber = this.currentTurnNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      BattleEventType.STATE_CHANGE,
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
    const roundNumber = this.currentTurnNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      BattleEventType.TURN_START,
      {
        turn,
        participantId,
      },
      turn,
      roundNumber,
    )
  }

  public recordTurnEnd(battleId: string, turn: number) {
    const roundNumber = this.currentTurnNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      BattleEventType.TURN_END,
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

    const roundNumber = this.currentTurnNumbers.get(battleId) || 0
    this.recordEvent(
      battleId,
      BattleEventType.BATTLE_END,
      {
        timestamp: Date.now(),
        winner,
      },
      roundNumber,
      roundNumber,
    )

    const winnerLabel = winner === 'ally' ? '角色方' : '敌方'
    const durationSec = Math.floor(duration / 1000)
    const durationText = durationSec >= 60
      ? `${Math.floor(durationSec / 60)} 分 ${durationSec % 60} 秒`
      : `${durationSec} 秒`

    LoggerProvider.logger.addSystemLog({
      message: `战斗结束 — ${winnerLabel} 获胜，用时 ${durationText}`,
      segments: [
        {
          text: `战斗结束 — ${winnerLabel} 获胜，用时 ${durationText}`,
        },
      ],
    })
  }

  public getRecording(battleId: string): RecordedBattle | undefined {
    return this.recordings.get(battleId)
  }

  public getAllRecordings(): RecordedBattle[] {
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
    // ponytail: localStorage 约 5MB 限额，超出时跳过保存不阻塞战斗
    try {
      localStorage.setItem(saveKey, JSON.stringify(saveData))
    } catch (e) {
      LoggerProvider.logger.addDebugLog(`保存战斗记录失败: 存储空间不足`, { context: { saveKey, error: e } })
      return saveKey
    }

    const recordingsList = this.getSavedRecordingsList()
    if (!recordingsList.includes(saveKey)) {
      recordingsList.push(saveKey)
      localStorage.setItem(
        'battle_recordings_list',
        JSON.stringify(recordingsList),
      )
    }

    LoggerProvider.logger.addDebugLog(`保存战斗记录: ${battleId}`, {
      context: { saveKey, checksum: checksumValue },
    })

    return saveKey
  }

  public loadRecording(saveKey: string): RecordedBattle | null {
    const savedData = localStorage.getItem(saveKey)
    if (!savedData) {
      return null
    }

    try {
      const recording = JSON.parse(savedData) as RecordedBattle

      if (recording.checksum) {
        const { checksum, ...dataWithoutChecksum } = recording
        const calculatedChecksum = calculateChecksum(dataWithoutChecksum)
        if (calculatedChecksum !== checksum) {
          LoggerProvider.logger.addDebugLog(
            '战斗记录校验失败:',
            { level: LogLevel.ERROR },
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
      LoggerProvider.logger.addDebugLog(
        '加载战斗记录失败:',
        { level: LogLevel.ERROR },
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
    } catch (error) {
      console.error('验证战斗记录时出错:', error)
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

    LoggerProvider.logger.addDebugLog(`删除战斗记录: ${saveKey}`)
    return true
  }

  private recordEvent(
    battleId: string,
    type: ReplayBattleEvent['type'],
    data: any,
    turn: number,
    roundNumber: number,
  ) {
    const recording = this.recordings.get(battleId)
    if (!recording) {
      return
    }

    const event: ReplayBattleEvent = {
      eventId: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      turn,
      roundNumber,
      data,
    }

    recording.events.push(event)

    recording.logs.push(Object.assign(
      {
        index: recording.logs.length,
        type: LogType.BATTLE,
        turn,
        message: this.generateLogMessage(type, data),
      } satisfies BattleLogEntry,
      { eventId: event.eventId, timestamp: event.timestamp, roundNumber, details: data },
    ))

    if (recording.events.length > MAX_EVENT_LOG) {
      recording.events = recording.events.slice(-MAX_EVENT_LOG)
    }
  }

  private generateLogMessage(type: string, data: any): string {
    switch (type) {
      case BattleEventType.BATTLE_START:
        return '战斗开始'
      case BattleEventType.BATTLE_END:
        return `战斗结束，胜利方: ${data.winner}`
      case BattleEventType.TURN_START:
        return `回合 ${data.roundNumber || data.turn} 开始`
      case BattleEventType.TURN_END:
        return `回合 ${data.roundNumber || data.turn} 结束`
      case BattleEventType.ACTION:
        return `${data.action?.sourceId} 执行了 ${data.action?.type} 动作`
      case BattleEventType.BUFF_ADD:
        return `为目标 ${data.targetId} 添加了 Buff: ${data.buffId}`
      case BattleEventType.BUFF_REMOVE:
        return `从目标 ${data.targetId} 移除了 Buff: ${data.instanceId}`
      case BattleEventType.BUFF_UPDATE:
        return `更新了目标 ${data.targetId} 的 Buff: ${data.instanceId}`
      default:
        return `事件: ${type}`
    }
  }

  public clearRecordings() {
    this.recordings.clear()
    this.randomSeeds.clear()
    this.currentTurnNumbers.clear()
    LoggerProvider.logger.addDebugLog('清空所有战斗记录')
  }

  public clearRecording(battleId: string): void {
    if (this.recordings.has(battleId)) {
      this.recordings.delete(battleId)
      this.randomSeeds.delete(battleId)
      this.currentTurnNumbers.delete(battleId)
      LoggerProvider.logger.addDebugLog(`清理战斗记录: ${battleId}`)
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
    }, CLEANUP_INTERVAL)
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
      this.currentTurnNumbers.delete(battleId)
      LoggerProvider.logger.addDebugLog(`清理过期战斗记录: ${battleId}`)
    }
  }
}
