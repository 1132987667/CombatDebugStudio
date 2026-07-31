/**
 * 文件: index.ts (logging模块)
 * 创建日期: 2026-02-09
 * 功能: 统一日志系统导出入口
 * 描述: 提供统一的日志接口，BattleLogManager 作为唯一日志管理器
 * 版本: 2.0.0
 */

/**
 * 统一日志系统 - 导出入口
 *
 * 提供统一的日志接口：
 * - BattleLogManager: 统一日志管理器（融合系统日志和战斗日志）
 * - ConsoleLogHandler: 控制台日志处理器
 *
 * @module logging
 */

// 重新导出类型定义
export type {
  BattleLogEntry,
  LogFilters,
  BattleLogManagerOptions,
  LogEntry,
  LogHandler,
  LogSegment,
} from '@/shared/types/battle-log'

export type { DebugLogParams } from '@/shared/types/battle-log'

export { LogLevel, LogType, BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'

// 导出 BattleLogManager 和相关功能
export {
  BattleLogManager,
  battleLogManager,
} from '@/infrastructure/adapters/logging/BattleLogManager'

// 导出日志处理器
export { ConsoleLogHandler } from '@/infrastructure/adapters/logging/BattleLogManager'

