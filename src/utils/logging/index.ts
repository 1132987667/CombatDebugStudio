/**
 * 文件: index.ts (logging模块)
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 统一日志系统导出入口
 * 描述: 提供统一的日志接口，BattleLogManager 作为唯一日志管理器
 * 版本: 2.0.0
 */

/**
 * 统一日志系统 - 导出入口
 *
 * 提供统一的日志接口：
 * - BattleLogManager: 统一日志管理器（融合系统日志和战斗日志）
 * - BattleLogFormatter: 战斗日志格式化工具
 * - ConsoleLogHandler: 控制台日志处理器
 * - FileLogHandler: 文件日志处理器
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

// 导出 BattleLogManager 和相关功能
export {
  BattleLogManager,
  battleLogManager,
} from './BattleLogManager'

// 导出 BattleLogManager 类型
export type { BattleLogManager } from './BattleLogManager'

// 导出 BattleLogFormatter 命名空间
export { BattleLogFormatter } from './BattleLogManager'

// 导出日志处理器
export {
  ConsoleLogHandler,
  FileLogHandler,
} from './BattleLogManager'
