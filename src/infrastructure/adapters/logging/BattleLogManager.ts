/**
 * 文件: BattleLogManager.ts
 * 创建日期: 2026-02-09
 * 功能: 统一日志管理器
 * 描述: 整合系统日志和战斗日志功能，提供统一的日志接口
 * 版本: 2.0.0
 *
 */

import type {
  BattleLogEntry,
  LogFilters,
  BattleLogManagerOptions,
  BattleLogCategory,
  BattleLogLevel,
  BattleLogMessageType,
  LogEntry,
  LogHandler,
  LogSegment,
} from '@/shared/types/battle-log'
import {
  LogLevel,
  LogLevelLabel,
  LogType,
  LogLevelClass,
  newLogSegment,
} from '@/shared/types/battle-log'
import { reactive } from 'vue'
import { Counter } from '@/shared/utils/Counter'
import type { Item } from '@/shared/types/Item'

/**
 * 统一的日志参数接口 - 所有日志方法都使用此接口
 */
export interface UnifiedLogParams {
  /** 日志消息（可选，与 segments 二选一） */
  message?: string
  /** 日志片段数组（推荐使用的结构化格式） */
  segments?: LogSegment[]
  /** 日志级别 */
  level?: LogLevel
  /** 日志来源 */
  source?: string
  /** 日志目标 */
  target?: string
  /** 操作类型 */
  action?: string
  /** 回合号 */
  turn?: number | string
  /** 日志类别 */
  category?: BattleLogCategory
  /** 日志详细类别 */
  detailCategory?: string
  /** 上下文数据 */
  context?: Record<string, unknown>
  /** 错误对象 */
  error?: Error
}


export class ConsoleLogHandler implements LogHandler {
  handle(entry: LogEntry): void {
    const index = entry.index
    const levelName = LogLevelLabel[entry.level ?? LogLevel.INFO]
    const contextStr = entry.context ? JSON.stringify(entry.context) : ''
    const errorStr = entry.error ? `\nError: ${entry.error.message}` : ''

    const logMessage = `[${index}] ${levelName}: ${entry.message || ''} ${contextStr}${errorStr}`

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
export class BattleLogManager {
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
  private maxDebugLogs: number = 500

  private indexCounter = new Counter()

  /** 是否启用自动清理 */
  private autoCleanup: boolean = true
  /** 日志过滤器配置 */
  private filters: LogFilters
  /** 当前调试日志级别，默认INFO */
  private level: LogLevel = LogLevel.DEBUG
  /** 日志处理器数组 */
  private handlers: LogHandler[] = []

  /**
   * 获取单例实例
   */
  public static getInstance(
    options?: BattleLogManagerOptions,
  ): BattleLogManager {
    if (!BattleLogManager.instance) {
      BattleLogManager.instance = new BattleLogManager(options)
    }
    return BattleLogManager.instance
  }

  private constructor(options: BattleLogManagerOptions = {}) {
    this.battleMaxLogs = options.battleMaxLogs ?? 200
    this.maxSystemLogs = options.maxSystemLogs ?? 200
    this.maxItemLogs = options.maxItemLogs ?? 200
    this.maxActionLogs = options.maxActionLogs ?? 200
    this.maxDebugLogs = options.maxDebugLogs ?? 500
    this.autoCleanup = options.autoCleanup ?? true
    this.level = options.level ?? LogLevel.DEBUG

    this.filters = {
      battle: true,
      system: true,
      item: true,
      action: true,
      debug: true,
      ...options.filters,
    }

    if (options.handlers) {
      options.handlers.forEach((handler) => this.addHandler(handler))
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
   * 内部日志记录方法
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
    source?: string,
    segments?: LogSegment[],
  ): void {
    if (level > this.level) {
      return
    }

    const entry: LogEntry = {
      index: this.indexCounter.next(),
      type: LogType.SYSTEM,
      level,
      message,
      context,
      source,
      error,
      segments: segments || [],
    }

    this.systemLogs.push(entry)
    if (this.systemLogs.length > this.maxSystemLogs) {
      this.systemLogs = this.systemLogs.slice(-this.maxSystemLogs)
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
   * 获取系统日志
   */
  getSystemLogs(): LogEntry[] {
    return [...this.systemLogs]
  }

  /**
   * 获取调试日志
   */
  getDebugLogs(): LogEntry[] {
    return [...this.debugLogs]
  }

  /**
   * 清除系统日志
   */
  clearSystemLogs(): void {
    this.systemLogs = []
  }

  /**
   * 清除调试日志
   */
  clearDebugLogs(): void {
    this.debugLogs = []
  }

  // ==================== 添加日志功能 ====================

  /**
   * 添加【战斗】类型日志
   * @param params 统一日志参数
   */
  addBattleLog(params: UnifiedLogParams & { turn: number | string }): void {
    const {
      turn,
      message = '',
      segments = [],
      category = 'battle',
      detailCategory,
      level = LogLevel.INFO,
    } = params

    const logEntry: BattleLogEntry = {
      index: this.indexCounter.next(),
      type: LogType.BATTLE,
      turn,
      message,
      category,
      detailCategory,
      segments: segments.length > 0 ? segments : [{ text: message }],
      level,
      action: undefined,
    }

    this.battleLogs.unshift(logEntry)

    if (this.autoCleanup && this.battleLogs.length > this.battleMaxLogs) {
      this.battleLogs.pop()
    }

    this.emitLogUpdate()
  }

  recordBattleLog(battleLog: BattleLogEntry): void {
    this.battleLogs.unshift(battleLog)

    if (this.autoCleanup && this.battleLogs.length > this.battleMaxLogs) {
      this.battleLogs.pop()
    }

    this.emitLogUpdate()
  }

  /**
   * 添加【系统】类型日志
   * @param params 统一日志参数
   */
  addSystemLog(params: UnifiedLogParams): void {
    const {
      message = '',
      segments = [],
      level = LogLevel.INFO,
    } = params

    const logEntry: LogEntry = {
      index: this.indexCounter.next(),
      message,
      level,
      type: LogType.SYSTEM,
    }
    if (segments.length > 0) {
      logEntry.segments = segments
    } else {
      logEntry.segments = [newLogSegment(message, LogLevelClass[level])]
    }

    this.systemLogs.unshift(logEntry)
    if (this.autoCleanup && this.systemLogs.length > this.maxSystemLogs) {
      this.systemLogs.pop()
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
    this.itemLogs.unshift(logEntry)
    if (this.autoCleanup && this.itemLogs.length > this.maxItemLogs) {
      this.itemLogs.pop()
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
      message: message || (segments.length > 0 ? segments.map(s => s.text).join('') : ''),
      source,
      target,
      action,
      category,
      segments: segments.length > 0 ? segments : [{ text: message }],
    }
    this.actionLogs.unshift(logEntry)
    if (this.autoCleanup && this.actionLogs.length > this.maxActionLogs) {
      this.actionLogs.pop()
    }
    this.emitLogUpdate()
  }

  /**
   * 记录【调试】类型日志
   * @param message 日志消息
   * @param contextOrLevelOrError 上下文对象、日志级别（数字或字符串）或错误对象
   * @param error 错误对象
   */
  addDebugLog(
    message: string,
    contextOrLevelOrError?: Record<string, unknown> | LogLevel | string | Error,
    error?: Error,
  ): void {
    let context: Record<string, unknown> | null = null
    let level: LogLevel = LogLevel.INFO
    let finalError: Error | undefined = undefined

    if (!contextOrLevelOrError) {
      // 只有消息
    } else if (contextOrLevelOrError instanceof Error) {
      // 第二个参数是 Error 对象
      finalError = contextOrLevelOrError
    } else if (typeof contextOrLevelOrError === 'number') {
      // 第二个参数是数字日志级别
      level = contextOrLevelOrError
    } else if (typeof contextOrLevelOrError === 'string') {
      // 第二个参数是字符串日志级别
      level = this.parseLogLevel(contextOrLevelOrError)
    } else if (typeof contextOrLevelOrError === 'object') {
      // 第二个参数是上下文对象
      context = contextOrLevelOrError
    }

    const entry: LogEntry = {
      index: this.indexCounter.next(),
      type: LogType.DEBUG,
      level,
      message,
      context,
      source: null,
      error: finalError || error,
      segments: [],
      action: undefined,
    }

    this.debugLogs.push(entry)
    if (this.debugLogs.length > this.maxSystemLogs) {
      this.debugLogs = this.debugLogs.slice(-this.maxSystemLogs)
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
   * 解析字符串日志级别为 LogLevel 枚举
   */
  private parseLogLevel(levelStr: string): LogLevel {
    const levelMap: Record<string, LogLevel> = {
      error: LogLevel.ERROR,
      warn: LogLevel.WARN,
      warning: LogLevel.WARN,
      info: LogLevel.INFO,
      debug: LogLevel.DEBUG,
      trace: LogLevel.TRACE,
    }
    return levelMap[levelStr.toLowerCase()] || LogLevel.INFO
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
      segments: [{ text: `第${turn}回合开始` }]
    })
  }

  /**
   * 添加回合结束日志
   */
  addTurnEndLog(turn: number): void {
    this.addBattleLog({ 
      turn, 
      message: `第${turn}回合结束`,
      segments: [{ text: `第${turn}回合结束` }]
    })
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
    return array.sort((a, b) => b.index - a.index)
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
        log.source.toLowerCase().includes(lowerKeyword) ||
        log.target.toLowerCase().includes(lowerKeyword),
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
   * 判断日志是否应该显示
   */
  private shouldDisplayLog(log: LogEntry): boolean {
    const type = log.type || 'battle'
    switch (type) {
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
  async syncBattleLogs(battleState: any): Promise<void> {
    if (!battleState || !battleState.actions) {
      return
    }

    const sortedActions = [...battleState.actions].sort((a: any, b: any) => {
      if (a.timestamp !== b.timestamp) {
        return a.timestamp - b.timestamp
      }
      const turnA = a.turn || 0
      const turnB = b.turn || 0
      if (turnA !== turnB) {
        return turnA - turnB
      }
      return a.id.localeCompare(b.id)
    })

    for (const action of sortedActions) {
      const actionType = action.type || 'attack'
      const sourceId = action.sourceId || ''
      const targetId = action.targetId || ''
      const damage = action.damage || 0
      const heal = action.heal || 0
      const effects = action.effects || []

      let logMessage = ''
      if (actionType === 'skill' && action.skillId) {
        logMessage = `使用技能 ${action.skillId}`
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
          message: `恢复 ${heal} 生命值`,
          level: LogLevel.INFO,
        })
      }

      for (const effect of effects) {
        if (effect.type === 'status' && effect.description) {
          this.addSystemLog({ 
            message: effect.description, 
            level: LogLevel.INFO 
          })
        }
      }
    }
  }

  /**
   * 添加系统战斗日志（已废弃，请使用 addSystemLog）
   * @deprecated 使用 addSystemLog 代替
   */
  addSystemBattleLog(message: string, level: string = 'info'): void {
    this.addSystemLog({ message, level: this.parseLogLevel(level) })
  }
}

/**
 * 默认日志管理器单例实例
 */
export const battleLogManager = reactive(BattleLogManager.getInstance({}))
