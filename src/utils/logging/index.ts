/**
 * 战斗日志系统 - 统一导出入口
 *
 * 提供统一的日志接口，包括：
 * - BattleLogManager: 战斗日志管理器
 * - BattleLogFormatter: 战斗日志格式化工具
 * - SimpleLogger: 轻量级日志记录器
 * - FrameworkLogger: 框架级日志记录器
 *
 * @module logging
 */

// 重新导出类型定义
export type {
  BattleLogEntry,
  LogFilters,
  BattleLogManagerOptions,
  LogFormatOptions,
  HTMLFormatOptions,
  BattleLogLevel,
  ActionType,
  LogLevel,
  LogEntry,
  LogHandler,
} from '@/types/battle-log'

// 导出 SimpleLoggerConfig 接口
export type { SimpleLoggerConfig } from './BattleLogManager'

// 导出 BattleLogManager 和相关功能
export {
  BattleLogManager,
  createBattleLogManager,
  battleLogManager,
} from './BattleLogManager'

// 导出 BattleLogFormatter 命名空间
export { BattleLogFormatter } from './BattleLogManager'

// 导出简单日志记录器
export { SimpleLogger, logger, type SimpleLogLevel } from './BattleLogManager'

// 导出框架日志记录器
export {
  FrameworkLogger,
  ConsoleLogHandler,
  FileLogHandler,
} from './BattleLogManager'

// 向后兼容导出
// 注意：原 logger.ts 和 Logger.ts 已合并，此处提供兼容层
export {
  /**
   * @deprecated 请使用 SimpleLogger
   */
  SimpleLogger as Logger,
  /**
   * @deprecated 请使用 logger (SimpleLogger实例)
   */
  logger as legacyLogger,
} from './BattleLogManager'
