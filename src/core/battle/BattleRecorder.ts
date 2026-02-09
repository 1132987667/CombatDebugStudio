/**
 * 文件: BattleRecorder.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗记录器
 * 描述: 负责记录战斗过程中的所有事件，支持回放和分析功能
 * 版本: 1.0.0
 */

import type {
  BattleState,
  BattleParticipant,
  BattleAction,
  ParticipantSide,
} from '@/types/battle'
import { logger } from '@/utils/logging'

interface BattleEvent {
  eventId: string
  type:
    | 'action'
    | 'state_change'
    | 'turn_start'
    | 'turn_end'
    | 'battle_start'
    | 'battle_end'
  timestamp: number
  turn: number
  data: any
}

interface RecordedBattle {
  battleId: string
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
}

export class BattleRecorder {
  private recordings = new Map<string, RecordedBattle>()
  private battleLogger = logger

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
  ) {
    const recording: RecordedBattle = {
      battleId,
      startTime: Date.now(),
      events: [],
      initialState,
    }

    this.recordings.set(battleId, recording)

    // 记录战斗开始事件
    this.recordEvent(battleId, 'battle_start', {
      timestamp: Date.now(),
      participants: initialState.participants,
    })

    this.battleLogger.info(`开始记录战斗: ${battleId}`, {
      participantCount: initialState.participants.length,
    })
  }

  public recordAction(battleId: string, action: BattleAction, turn: number) {
    this.recordEvent(battleId, 'action', {
      action,
      turn,
    })
  }

  public recordStateChange(
    battleId: string,
    state: Partial<BattleState>,
    turn: number,
  ) {
    this.recordEvent(battleId, 'state_change', {
      state,
      turn,
    })
  }

  public recordTurnStart(
    battleId: string,
    turn: number,
    participantId: string,
  ) {
    this.recordEvent(battleId, 'turn_start', {
      turn,
      participantId,
    })
  }

  public recordTurnEnd(battleId: string, turn: number) {
    this.recordEvent(battleId, 'turn_end', {
      turn,
    })
  }

  public endRecording(battleId: string, winner?: ParticipantSide) {
    const recording = this.recordings.get(battleId)
    if (!recording) {
      return
    }

    recording.endTime = Date.now()
    recording.winner = winner

    // 记录战斗结束事件
    this.recordEvent(battleId, 'battle_end', {
      timestamp: Date.now(),
      winner,
    })

    this.battleLogger.info(`结束记录战斗: ${battleId}`, {
      winner,
      eventCount: recording.events.length,
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

    const saveData = {
      ...recording,
      savedAt: Date.now(),
      name: name || `战斗记录_${new Date().toLocaleString()}`,
    }

    const saveKey = `battle_recording_${battleId}`
    localStorage.setItem(saveKey, JSON.stringify(saveData))

    // 保存到记录列表
    const recordingsList = this.getSavedRecordingsList()
    if (!recordingsList.includes(saveKey)) {
      recordingsList.push(saveKey)
      localStorage.setItem(
        'battle_recordings_list',
        JSON.stringify(recordingsList),
      )
    }

    this.battleLogger.info(`保存战斗记录: ${battleId}`, {
      saveKey,
    })

    return saveKey
  }

  public loadRecording(saveKey: string): RecordedBattle | null {
    const savedData = localStorage.getItem(saveKey)
    if (!savedData) {
      return null
    }

    try {
      const recording = JSON.parse(savedData)
      this.recordings.set(recording.battleId, recording)
      return recording
    } catch (error) {
      this.battleLogger.error('加载战斗记录失败:', error)
      return null
    }
  }

  public getSavedRecordingsList(): string[] {
    const listData = localStorage.getItem('battle_recordings_list')
    if (!listData) {
      return []
    }

    try {
      return JSON.parse(listData)
    } catch (error) {
      return []
    }
  }

  public deleteRecording(saveKey: string): boolean {
    localStorage.removeItem(saveKey)

    // 从记录列表中移除
    const recordingsList = this.getSavedRecordingsList()
    const updatedList = recordingsList.filter((key) => key !== saveKey)
    localStorage.setItem('battle_recordings_list', JSON.stringify(updatedList))

    this.battleLogger.info(`删除战斗记录: ${saveKey}`)
    return true
  }

  private recordEvent(battleId: string, type: BattleEvent['type'], data: any) {
    const recording = this.recordings.get(battleId)
    if (!recording) {
      return
    }

    const event: BattleEvent = {
      eventId: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      turn: data.turn || 0,
      data,
    }

    recording.events.push(event)

    // 限制事件数量，防止内存溢出
    if (recording.events.length > 1000) {
      recording.events = recording.events.slice(-1000)
    }
  }

  public clearRecordings() {
    this.recordings.clear()
    this.battleLogger.info('清空所有战斗记录')
  }
}
