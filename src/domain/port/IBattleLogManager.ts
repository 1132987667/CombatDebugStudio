import type { UnifiedLogParams, BattleLogParams, DebugLogParams, LogEntry, LogFilters } from '@/shared/types/battle-log'

/**
 * 战斗日志管理器端口接口
 *
 * 领域层通过此端口记录战斗日志，基础设施层提供具体实现。
 * 替代领域层对 battleLogManager 基础设施单例的直接依赖。
 */
export interface IBattleLogManager {
  /**
   * 添加调试日志
   * @param message 日志文本
   * @param options 可选参数（如日志级别）
   */
  addDebugLog(message: string, options?: DebugLogParams): void

  /**
   * 添加系统日志
   * @param params 日志参数
   */
  addSystemLog(params: UnifiedLogParams): void

  /**
   * 添加战斗日志
   * @param params 日志参数（turn 必填）
   */
  addBattleLog(params: BattleLogParams): void

  /**
   * 添加行为日志
   * @param params 日志参数
   */
  addActionLog(params: UnifiedLogParams): void

  /**
   * 添加物品日志
   * @param params 日志参数
   */
  addItemLog(params: UnifiedLogParams): void

  /** 清除所有日志 */
  clearLogs(): void

  /**
   * 获取系统日志
   * @returns 系统日志条目列表
   */
  getSystemLogs(): LogEntry[]

  /**
   * 获取调试日志
   * @returns 调试日志条目列表
   */
  getDebugLogs(): LogEntry[]

  /**
   * 获取所有日志（按 index 排序）
   */
  getAllLogs(): LogEntry[]

  /**
   * 获取过滤后的日志
   */
  getFilteredLogs(): LogEntry[]

  /**
   * 获取当前过滤器配置
   */
  getFilters(): LogFilters

  /**
   * 更新过滤器配置
   * @param newFilters 部分过滤器配置
   */
  updateFilters(newFilters: Partial<LogFilters>): void

  /**
   * 添加日志更新监听器
   * @param callback 监听回调
   */
  addListener(callback: (logs: LogEntry[]) => void): void

  /**
   * 移除日志更新监听器
   * @param callback 要移除的回调
   */
  removeListener(callback: (logs: LogEntry[]) => void): void

  /**
   * 启用/禁用战斗日志自动清理
   * @param enabled 是否启用自动清理
   */
  setAutoCleanup(enabled: boolean): void

  /**
   * 静音/恢复日志更新通知（批量生成期间抑制 UI 全量重渲染，结束后置 false 并补发一次）
   * @param muted true = 抑制通知，false = 恢复并补发
   */
  setMuted(muted: boolean): void

  /**
   * 同步战斗日志到存储
   * @param battleState 可选战斗状态快照
   */
  syncBattleLogs(battleState?: unknown): void | Promise<void>

  /**
   * 开始缓冲 role='sub' 的日志（BEFORE_ATTACK 前调用）
   */
  beginBufferSubLogs(): void

  /**
   * 将缓冲的 sub 日志全部发射（action 日志之后调用）
   */
  flushBufferedSubLogs(): void

  /**
   * 导出日志为 JSON 字符串
   */
  exportLogs(): string

  /**
   * 从 JSON 字符串导入日志
   * @param logsData JSON 格式的日志数据
   */
  importLogs(logsData: string): void
}
