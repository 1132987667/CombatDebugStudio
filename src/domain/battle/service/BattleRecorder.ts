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

import type { IPersistentStorage } from '@/domain/port/IPersistentStorage'
import { STORAGE_STORE } from '@/domain/port/IPersistentStorage'
import {
  BattleState,
  BattleAction,
  ParticipantSide,
  ParticipantSideName,
  BattleStateSnapshot,
  BattleRound,
  BattleResult,
  BattleEventType,
  ReplayBattleEvent,
} from '@/domain/battle/type/types'
import { BATTLE_REPLAY_VERSION } from '@/domain/battle/type/types'
import { LogLevel } from '@/shared/types/battle-log'
import { SeededRandom } from '@/shared/utils/SeededRandom'
import { calculateChecksum, generateReplayId, verifyChecksum } from '@/shared/utils/Checksum'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import type { TraceLogEntry } from '@/shared/types/trace-log'
import { BattleSummaryGenerator } from '@/domain/battle/logs/BattleSummaryGenerator'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { EffectType } from '@/domain/skill/types'
import {
  BATTLE_LOG_CATEGORIES,
  type BattleLogCategory,
} from '@/shared/types/battle-log'

/**
 * 战斗记录
 * 一场战斗的完整录制数据：包含初始状态、事件序列、回合快照、日志、
 * 详细伤害拆分及校验信息，用于回放与分析。
 */
export interface RecordedBattle {
  /** 战斗实例 ID */
  battleId: string
  /** 回放 ID（用于定位单次录制） */
  replayId: string
  /** 录制格式版本号 */
  version: string
  /** 随机种子（用于确定性回放） */
  randomSeed: string
  /** 战斗开始时间戳（ms） */
  startTime: number
  /** 战斗结束时间戳（ms） */
  endTime?: number
  /** 获胜方阵营 */
  winner?: ParticipantSide
  /** 战斗事件序列（按发生顺序） */
  events: ReplayBattleEvent[]
  /** 初始状态：参与者的基础属性快照 */
  initialState: {
    participants: Array<{
      /** 参与者 ID */
      id: string
      /** 参与者名称 */
      name: string
      /** 阵营 */
      team: ParticipantSide
      /** 最大气血值 */
      maxHealth: number
      /** 当前气血值 */
      currentHealth: number
      /** 最大能量值 */
      maxEnergy: number
      /** 当前能量值 */
      currentEnergy: number
    }>
  }
  /** 回合记录列表 */
  rounds: BattleRound[]
  /** 详细战斗记录（含伤害拆分） */
  combatRecords: CombatRecord[]
  /** 树状调试日志（阶段二：TraceLogCollector 的导出数据） */
  traceLogs?: TraceLogEntry[]
  /** 战斗结果 */
  result?: BattleResult
  /** 数据校验和 */
  checksum?: string
  /** 持久化后的存储键名（用于删除时精确匹配） */
  saveKey?: string
  /** 复活事件列表（用于回放分析） */
  reviveEvents?: Array<{
    turn: number
    revivedId: string
    sourceId: string
    hpAfterRevive: number
  }>
}

/**
 * 战斗记录器
 * 负责战斗过程的录制、存储与回放数据管理：包括事件序列、随机种子、回合快照、
 * 战斗日志及详细伤害拆分记录。支持多场战斗并发录制，并通过 maxRecordings 上限
 * 与定时清理机制防止内存无限增长。
 */
export class BattleRecorder {
  /** 持久化存储后端 */
  private storage: IPersistentStorage

  /** 战斗记录存储（key = battleId） */
  private recordings = new Map<string, RecordedBattle>()
  /** 最大保存录制数量，超出时按最早开始时间淘汰 */
  private maxRecordings = 50
  /** 是否已调度过期清理任务，避免重复触发 */
  private cleanupScheduled = false
  /** 各场战斗的随机种子（key = battleId），用于确定性回放 */
  private randomSeeds = new Map<string, string>()
  /** 各场战斗的当前回合数（key = battleId），用于记录回合边界 */
  private currentTurnNumbers = new Map<string, number>()

  constructor(storage?: IPersistentStorage) {
    this.storage = storage ?? this.createNoopStorage()
  }

  /** 空操作存储后端（无 storage 注入时降级使用） */
  private createNoopStorage(): IPersistentStorage {
    return {
      backend: 'indexeddb' as const,
      set: async () => true,
      get: async () => null,
      remove: async () => true,
      keys: async () => [],
      clear: async () => true,
      getStats: async () => null,
    }
  }

  /** 延迟初始化存储（供 DI 容器在构造后注入，替换 noop） */
  setStorage(storage: IPersistentStorage): void {
    this.storage = storage
  }

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

  /** 记录树状调试日志（由 TraceLogCollector 在战斗结束时导出） */
  public recordTraceLogs(battleId: string, entries: TraceLogEntry[]): void {
    const recording = this.recordings.get(battleId)
    if (recording) {
      recording.traceLogs = entries
    }
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

    const winnerLabel = winner ? ParticipantSideName[winner] : '未知'
    const durationSec = Math.floor(duration / 1000)
    const durationText =
      durationSec >= 60
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

  public async saveRecording(battleId: string, name?: string): Promise<string | null> {
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
    try {
      await this.storage.set(STORAGE_STORE.RECORDINGS, saveKey, saveData)
    } catch (e) {
      LoggerProvider.logger.addDebugLog(`保存战斗记录失败: 存储异常`, {
        context: { saveKey, error: e },
      })
      return saveKey
    }

    // 在内存记录中保存持久化键名（供删除和清理使用）
    recording.saveKey = saveKey

    LoggerProvider.logger.addDebugLog(`保存战斗记录: ${battleId}`, {
      context: { saveKey, checksum: checksumValue },
    })

    return saveKey
  }

  public async loadRecording(saveKey: string): Promise<RecordedBattle | null> {
    // NOTE: 所有回放数据迁移/兼容性代码应放在此处，而非 ReplayEngine.loadReplay。
    //       RecordedBattle（含 combatRecords/traceLogs）是录制数据，由 BattleRecorder 管理；
    //       BattleReplay（含 events/rounds）是回放数据，由 ReplayEngine 管理。
    const savedData = await this.storage.get<RecordedBattle>(STORAGE_STORE.RECORDINGS, saveKey)
    if (!savedData) {
      return null
    }

    try {
      const recording = savedData

      // ★ 旧数据一次性迁移：补充缺失字段
      for (const record of recording.combatRecords ?? []) {
        if (record.actionOrder === undefined) record.actionOrder = 0
        if (record.overkill === undefined) record.overkill = 0
      }

      if (recording.checksum) {
        const { checksum, ...dataWithoutChecksum } = recording
        if (!verifyChecksum(dataWithoutChecksum, checksum)) {
          LoggerProvider.logger.addDebugLog('战斗记录校验失败:', {
            level: LogLevel.ERROR,
          })
          return null
        }
      }

      this.recordings.set(recording.battleId, recording)
      if (recording.randomSeed) {
        this.randomSeeds.set(recording.battleId, recording.randomSeed)
      }
      return recording
    } catch (error) {
      LoggerProvider.logger.addDebugLog('加载战斗记录失败:', {
        level: LogLevel.ERROR,
      })
      return null
    }
  }


  public async getSavedRecordingsList(): Promise<string[]> {
    try {
      return await this.storage.keys(STORAGE_STORE.RECORDINGS)
    } catch {
      return []
    }
  }

  public async deleteRecording(saveKey: string): Promise<boolean> {
    await this.storage.remove(STORAGE_STORE.RECORDINGS, saveKey)

    LoggerProvider.logger.addDebugLog(`删除战斗记录: ${saveKey}`)
    return true
  }

  /**
   * 按 battleId 删除持久化战斗记录（匹配 saveKey 前缀，支持 BatteReplay.vue 调用）
   */
  public async deleteRecordingByBattleId(battleId: string): Promise<boolean> {
    const keys = await this.storage.keys(STORAGE_STORE.RECORDINGS)
    const matching = keys.filter(k => k.startsWith(`battle_recording_${battleId}`))
    let deleted = 0
    for (const k of matching) {
      await this.storage.remove(STORAGE_STORE.RECORDINGS, k)
      deleted++
    }
    if (deleted > 0) {
      LoggerProvider.logger.addDebugLog(`删除战斗记录 battleId=${battleId}: 共 ${deleted} 条`)
    }
    return deleted > 0
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
      // 录制时写入显式语义标注：日志类别与事件重要性，回放/渲染层直接读取
      data: {
        ...data,
        category: this.deriveCategory(type, data),
        severity: this.deriveSeverity(type, data),
      },
    }

    recording.events.push(event)

    if (recording.events.length > MAX_EVENT_LOG) {
      recording.events = recording.events.slice(-MAX_EVENT_LOG)
    }
  }

  /**
   * 日志类别：基于显式动作类型（BattleAction.type）与效果类型（BattleEffect.type）判定，
   * 不做 damage/heal 数值猜测。
   */
  private deriveCategory(
    type: ReplayBattleEvent['type'],
    data: Record<string, any>,
  ): BattleLogCategory {
    if (type !== BattleEventType.ACTION) return BATTLE_LOG_CATEGORIES.STATUS
    const action = data?.action
    if (!action) return BATTLE_LOG_CATEGORIES.STATUS
    const effectTypes: string[] =
      action.effects?.map((e: { type: string }) => e.type) ?? []
    if (
      effectTypes.includes(EffectType.HEAL) &&
      !effectTypes.includes(EffectType.DAMAGE)
    ) {
      return BATTLE_LOG_CATEGORIES.HEAL
    }
    if (effectTypes.includes(EffectType.DAMAGE)) {
      return BATTLE_LOG_CATEGORIES.DAMAGE
    }
    return BATTLE_LOG_CATEGORIES.STATUS
  }

  /**
   * 事件重要性：基于显式事件/动作类型判定，无魔法阈值。
   * 战斗开始/结束 → high；状态变更 → medium；技能动作 → medium；其余 → low。
   */
  private deriveSeverity(
    type: ReplayBattleEvent['type'],
    data: Record<string, any>,
  ): 'high' | 'medium' | 'low' {
    if (
      type === BattleEventType.BATTLE_START ||
      type === BattleEventType.BATTLE_END
    ) {
      return 'high'
    }
    if (type === BattleEventType.STATE_CHANGE) return 'medium'
    if (type === BattleEventType.ACTION && data?.action?.type === 'skill') {
      return 'medium'
    }
    return 'low'
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
      const [battleId, recording] = sortedRecordings[i]
      this.recordings.delete(battleId)
      this.randomSeeds.delete(battleId)
      this.currentTurnNumbers.delete(battleId)
      // ★ 同步清理持久化记录
      if (recording.saveKey) {
        this.storage.remove(STORAGE_STORE.RECORDINGS, recording.saveKey)
          .catch((e) => LoggerProvider.logger.addDebugLog(`清理持久化记录失败: ${recording.saveKey}`, { error: e }))
      }
      LoggerProvider.logger.addDebugLog(`清理过期战斗记录: ${battleId}`)
    }
  }
}
