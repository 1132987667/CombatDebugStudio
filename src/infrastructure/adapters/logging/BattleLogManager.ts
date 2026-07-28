/**
 * 文件: BattleLogManager.ts
 * 创建日期: 2026-02-09
 * 功能: 统一日志管理器
 * 描述: 整合系统日志和战斗日志功能，提供统一的日志接口
 * 版本: 2.0.0
 *
 */

import type { IBattleLogManager } from '@/domain/port/IBattleLogManager'
import {
  BattleLogEntry,
  LogFilters,
  LogEntry,
  LogHandler,
  ParticipantMap,
  UnifiedLogParams,
  BattleLogParams,
  DebugLogParams,
} from '@/shared/types/battle-log'
import {
  LogLevel,
  LogLevelLabel,
  LogType,
  LogLevelClass,
  newLogSegment,
} from '@/shared/types/battle-log'
import { Counter } from '@/shared/utils/Counter'
import type { Item } from '@/shared/types/Item'

export class ConsoleLogHandler implements LogHandler {
  handle(entry: LogEntry): void {
    const index = entry.index
    const levelName = LogLevelLabel[entry.level ?? LogLevel.INFO]
    const contextStr = entry.context ? JSON.stringify(entry.context) : ''
    const errorStr = entry.error ? `\nError: ${entry.error.message}` : ''

    const text = entry.segments?.map(s => s.text).join('') || ''
    const logMessage = `[${index}] ${levelName}: ${text} ${contextStr}${errorStr}`

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(logMessage)
        break
      case LogLevel.WARN:
        console.warn(logMessage)
        break
      case LogLevel.INFO:
        console.info(logMessage)
        break
      case LogLevel.DEBUG:
        console.debug(logMessage)
        break
      case LogLevel.TRACE:
        console.trace(logMessage)
        break
    }
  }
}

/**
 * 统一日志管理器
 *
 */
export class BattleLogManager implements IBattleLogManager {
  /** 单例实例 */
  private static instance: BattleLogManager | null = null

  /** 战斗、系统、物品、动作和调试五种类别 */

  /** 战斗日志条目数组 */
  private battleLogs: BattleLogEntry[] = []
  /** 战斗日志最大数量 */
  private battleMaxLogs: number = 200

  /** 系统日志条目数组 */
  private systemLogs: LogEntry[] = []
  /** 系统日志最大数量，默认200条 */
  private maxSystemLogs: number = 200

  private itemLogs: LogEntry[] = []
  /** 物品日志最大数量，默认200条 */
  private maxItemLogs: number = 200

  private actionLogs: LogEntry[] = []
  /** 动作日志最大数量，默认200条 */
  private maxActionLogs: number = 200

  /** 调试日志条目数组 */
  private debugLogs: LogEntry[] = []
  /** 调试日志最大数量 */
  private maxDebugLogs: number = 1000

  /** 缓冲机制：开始缓冲 role='sub' 日志 */
  private _buffering = false
  /** 缓冲中的 sub 日志列表 */
  private _pendingSubLogs: BattleLogParams[] = []

  private indexCounter = new Counter()

  /** 是否启用自动清理 */
  private autoCleanup: boolean = true
  /** 日志过滤器配置 */
  private filters: LogFilters
  /** 当前调试日志级别，默认INFO */
  private level: LogLevel = LogLevel.DEBUG
  /** 日志处理器数组 */
  private handlers: LogHandler[] = []

  /** 参与者映射表（由 addPlayerLog 的调用方注入） */
  private participantMap: ParticipantMap = { get: () => undefined }

  /**
   * 获取单例实例
   */
  public static getInstance(): BattleLogManager {
    if (!BattleLogManager.instance) {
      BattleLogManager.instance = new BattleLogManager()
    }
    return BattleLogManager.instance
  }

  private constructor() {
    this.filters = {
      battle: true,
      system: true,
      item: true,
      action: true,
      debug: true,
    }

    // this.addHandler(new ConsoleLogHandler())
  }

  /**
   * 添加日志处理器
   */
  addHandler(handler: LogHandler): void {
    this.handlers.push(handler)
  }

  /**
   * 移除日志处理器
   */
  removeHandler(handler: LogHandler): void {
    const index = this.handlers.indexOf(handler)
    if (index !== -1) {
      this.handlers.splice(index, 1)
    }
  }

  /**
   * 添加【系统】类型日志
   * @param params 统一日志参数
   */
  addSystemLog(params: UnifiedLogParams): void {
    const { message = '', segments = [], level = LogLevel.INFO } = params

    const logEntry: LogEntry = {
      index: this.indexCounter.next(),
      level,
      type: LogType.SYSTEM,
    }
    if (segments.length > 0) {
      logEntry.segments = segments
    } else {
      logEntry.segments = [newLogSegment(message, LogLevelClass[level])]
    }

    this.systemLogs.push(logEntry)
    if (this.autoCleanup && this.systemLogs.length > this.maxSystemLogs) {
      this.systemLogs.shift()
    }
    this.emitLogUpdate()
  }

  /**
   * 添加【物品】类型日志
   * @param params 统一日志参数
   */
  addItemLog(params: UnifiedLogParams): void {
    const { segments = [] } = params

    const logEntry: LogEntry = {
      index: this.indexCounter.next(),
      type: LogType.ITEM,
      segments,
    }
    this.itemLogs.push(logEntry)
    if (this.autoCleanup && this.itemLogs.length > this.maxItemLogs) {
      this.itemLogs.shift()
    }
    this.emitLogUpdate()
  }

  /**
   * 添加【动作】类型日志
   * @param params 统一日志参数
   */
  addActionLog(params: UnifiedLogParams): void {
    const {
      source = '',
      target = '',
      action = '',
      message = '',
      segments = [],
      level = LogLevel.INFO,
      category = 'action',
    } = params

    const logEntry: LogEntry = {
      index: this.indexCounter.next(),
      type: LogType.ACTION,
      level,
      source,
      target,
      action,
      category,
      segments: segments.length > 0 ? segments : [{ text: message }],
    }
    this.actionLogs.push(logEntry)
    if (this.autoCleanup && this.actionLogs.length > this.maxActionLogs) {
      this.actionLogs.shift()
    }
    this.emitLogUpdate()
  }

  /**
   * 记录【调试】类型日志
   * @param message 日志消息
   * @param options 可选参数（级别、上下文、错误）
   */
  addDebugLog(message: string, options: DebugLogParams = {}): void {
    const { level = LogLevel.INFO, context, error } = options

    const entry: LogEntry = {
      index: this.indexCounter.next(),
      type: LogType.DEBUG,
      level,
      context: context ?? undefined,
      source: undefined,
      error: error,
      segments: [{ text: message }],
      action: undefined,
    }

    this.debugLogs.push(entry)
    if (this.debugLogs.length > this.maxDebugLogs) {
      this.debugLogs = this.debugLogs.slice(-this.maxDebugLogs)
    }

    for (const handler of this.handlers) {
      try {
        handler.handle(entry)
      } catch {
        console.error('Logger handler error:', handler)
      }
    }
  }

  /**
   * 添加【战斗】类型日志
   * @param params 战斗日志参数（turn 必填）
   */
  addBattleLog(params: BattleLogParams): void {
    const { message = '', segments = [], level = LogLevel.INFO, turn, source, target, action, category, context, error, meta } = params

    const logEntry: BattleLogEntry = {
      index: this.indexCounter.next(),
      type: LogType.BATTLE,
      turn,
      message,
      segments: segments.length > 0 ? segments : [{ text: message }],
    }
    if (level !== LogLevel.INFO) logEntry.level = level
    if (source) logEntry.source = source
    if (target) logEntry.target = target
    if (action) logEntry.action = action
    if (category) logEntry.category = category
    if (context) logEntry.context = context
    if (error) logEntry.error = error
    if (meta) logEntry.meta = meta

    this.battleLogs.push(logEntry)
    if (this.autoCleanup && this.battleLogs.length > this.battleMaxLogs) {
      this.battleLogs.shift()
    }
    this.emitLogUpdate()
  }

  // ==================== 缓冲机制 ====================

  /**
   * 开始缓冲 role='sub' 的日志（BEFORE_ATTACK 前调用）
   */
  beginBufferSubLogs(): void {
    this._buffering = true
    this._pendingSubLogs = []
  }

  /**
   * 将缓冲的 sub 日志全部发射（action 日志之后调用）
   */
  flushBufferedSubLogs(): void {
    this._buffering = false
    const pending = this._pendingSubLogs
    this._pendingSubLogs = []
    for (const params of pending) {
      this.addBattleLog(params)
    }
  }

  // ==================== 添加便捷日志功能 ====================

  // 格式:

  // 获得单个：获得了 [物品名称] x[数量]

  // 获得批量：获得了 [物品名称] x[数量]、[物品名称] x[数量] 等 [总数量] 件物品

  // 失去单个：失去了 [物品名称] x[数量]

  // 失去批量：失去了 [物品名称] x[数量]、[物品名称] x[数量] 等 [总数量] 件物品

  addGainItemLog(items: Item[]) {
    const segments = [{ text: '获得了:' }]
    items.forEach((item, index) => {
      segments.push({ text: `${item.name} x${item.quantity}` })
      if (index < items.length - 1) {
        segments.push({ text: '、' })
      }
    })
    this.addItemLog({ segments })
  }

  addLossItemLog(items: Item[]) {
    const segments = [{ text: '失去了:' }]
    items.forEach((item, index) => {
      segments.push({ text: `${item.name} x${item.quantity}` })
      if (index < items.length - 1) {
        segments.push({ text: '、' })
      }
    })
    this.addItemLog({ segments })
  }

  /**
   * 添加回合开始日志
   */
  addTurnStartLog(turn: number): void {
    this.addBattleLog({
      turn,
      message: `第${turn}回合开始`,
      segments: [{ text: `第${turn}回合开始` }],
    })
  }

  /**
   * 添加回合结束日志
   */
  addTurnEndLog(turn: number): void {
    this.addBattleLog({
      turn,
      message: `第${turn}回合结束`,
      segments: [{ text: `第${turn}回合结束` }],
    })
  }

  /**
   * 获取调试日志
   */
  getDebugLogs(): LogEntry[] {
    return this.debugLogs
  }

  /**
   * 获取系统日志
   */
  getSystemLogs(): LogEntry[] {
    return this.systemLogs
  }

  /**
   * 获取所有战斗日志
   */
  getAllLogs(): LogEntry[] {
    const array = [
      ...this.battleLogs,
      ...this.actionLogs,
      ...this.systemLogs,
      ...this.itemLogs,
    ]
    return array.sort((a, b) => a.index - b.index)
  }

  /**
   * 获取过滤后的战斗日志
   */
  getFilteredLogs(): LogEntry[] {
    return this.getAllLogs().filter((log) => this.shouldDisplayLog(log))
  }

  /**
   * 搜索战斗日志
   */
  searchBattleLogs(keyword: string): BattleLogEntry[] {
    const lowerKeyword = keyword.toLowerCase()
    return this.battleLogs.filter(
      (log) =>
        (log.source ?? '').toLowerCase().includes(lowerKeyword) ||
        (log.target ?? '').toLowerCase().includes(lowerKeyword),
    )
  }

  /**
   * 清除战斗日志
   */
  clearLogs(): void {
    this.battleLogs = []
    this.emitLogUpdate()
  }

  /**
   * 导出战斗日志
   */
  exportLogs(): string {
    return JSON.stringify(this.battleLogs, null, 2)
  }

  /**
   * 导入战斗日志
   */
  importLogs(logsData: string): void {
    try {
      const importedLogs = JSON.parse(logsData) as BattleLogEntry[]
      this.battleLogs = importedLogs
      this.emitLogUpdate()
    } catch (error) {
      this.addDebugLog(`导入日志失败: ${error}`)
    }
  }

  /**
   * 获取过滤器配置
   */
  getFilters(): LogFilters {
    return { ...this.filters }
  }

  /**
   * 更新过滤器配置
   */
  updateFilters(newFilters: Partial<LogFilters>): void {
    this.filters = { ...this.filters, ...newFilters }
    this.emitLogUpdate()
  }

  /**
   * 启用/禁用战斗日志自动清理
   */
  setAutoCleanup(enabled: boolean): void {
    this.autoCleanup = enabled
  }

  /**
   * 判断日志是否应该显示
   */
  private shouldDisplayLog(log: LogEntry): boolean {
    switch (log.type) {
      case 'battle':
        return this.filters.battle !== false
      case 'system':
        return this.filters.system !== false
      case 'item':
        return this.filters.item !== false
      case 'action':
        return this.filters.action !== false
      case 'debug':
        return this.filters.debug !== false
      default:
        return true
    }
  }

  // ==================== 监听器功能 ====================

  private listeners: Set<(logs: LogEntry[]) => void> = new Set()

  /**
   * 添加日志更新监听器
   */
  addListener(callback: (logs: LogEntry[]) => void): void {
    this.listeners.add(callback)
    callback(this.getFilteredLogs())
  }

  /**
   * 移除日志更新监听器
   */
  removeListener(callback: (logs: LogEntry[]) => void): void {
    this.listeners.delete(callback)
  }

  /**
   * 触发日志更新通知
   */
  private emitLogUpdate(): void {
    if (this.listeners.size === 0) {
      return
    }
    const filteredLogs = this.getFilteredLogs()
    this.listeners.forEach((callback) => {
      try {
        callback(filteredLogs)
      } catch (error) {
        console.error('Log listener error:', error)
      }
    })
  }

  /**
   * 同步战斗日志
   * @param battleState 战斗状态
   */
  async syncBattleLogs(battleState?: unknown): Promise<void> {
    if (!battleState || typeof battleState !== 'object') return
    const state = battleState as Record<string, unknown>
    const actions = state.actions as Array<Record<string, unknown>> | undefined
    if (!actions) return

    const sortedActions = [...actions].sort((a, b) => {
      const tsA = (a.timestamp as number) ?? 0
      const tsB = (b.timestamp as number) ?? 0
      if (tsA !== tsB) return tsA - tsB
      const turnA = (a.turn as number) ?? 0
      const turnB = (b.turn as number) ?? 0
      if (turnA !== turnB) return turnA - turnB
      return String(a.id ?? '').localeCompare(String(b.id ?? ''))
    })

    for (const action of sortedActions) {
      const actionType = String(action.type || 'attack')
      const sourceId = String(action.sourceId || '')
      const targetId = String(action.targetId || '')
      const damage = Number(action.damage || 0)
      const heal = Number(action.heal || 0)
      const effects = (action.effects || []) as Array<Record<string, unknown>>

      let logMessage = ''
      if (actionType === 'skill' && action.skillId) {
        logMessage = `使用技能 ${String(action.skillId)}`
      } else if (actionType === 'attack') {
        logMessage = '发起攻击'
      }

      if (damage > 0) {
        this.addActionLog({
          source: sourceId,
          action: '攻击',
          target: targetId,
          message: `造成 ${damage} 伤害`,
          level: LogLevel.INFO,
        })
      }

      if (heal > 0) {
        this.addActionLog({
          source: sourceId,
          action: '治疗',
          target: targetId,
          message: `恢复 ${heal} 气血`,
          level: LogLevel.INFO,
        })
      }

      for (const effect of effects) {
        if (effect.type === 'status' && effect.description) {
          this.addSystemLog({
            message: String(effect.description),
            level: LogLevel.INFO,
          })
        }
      }
    }
  }
}

/**
 * 默认日志管理器单例实例
 */
export const battleLogManager = BattleLogManager.getInstance()
