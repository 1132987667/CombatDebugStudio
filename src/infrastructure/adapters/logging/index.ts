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
 * - BattleLogFormatter: 战斗日志格式化工具
 * - ConsoleLogHandler: 控制台日志处理器
 *
 * @module logging
 */

// 重新导出类型定义
export type {
  BattleLogEntry,
  LogFilters,
  BattleLogManagerOptions,
  BattleLogLevel,
  ActionType,
  LogEntry,
  LogHandler,
} from '@/types/battle-log'

export { LogLevel } from '@/types/battle-log'

// 导出 BattleLogManager 和相关功能
export {
  BattleLogManager,
  battleLogManager,
} from '@/infrastructure/adapters/logging/BattleLogManager'

// 导出 BattleLogFormatter 命名空间
export { BattleLogFormatter } from './BattleLogFormatter'

// 导出日志处理器
export { ConsoleLogHandler } from '@/infrastructure/adapters/logging/BattleLogManager'

// 结构化处理器 (JSON/CSV)
export { JsonLogHandler, CsvLogHandler } from './StructuredLogHandlers'

// 采样机制
export { LogSampler, PresetSamplingConfigs } from './LogSampling'
export type { SamplingConfig, SamplingStrategy, SamplingStats } from './LogSampling'

// 上下文追踪
export { LogContextManager, createReactiveContextManager, defaultContextManager } from './LogContext'
export type { LogContext, ContextManagerConfig } from './LogContext'

// 异步写入和环形缓冲区
export { AsyncLogWriter, RingBuffer } from './AsyncLogWriter'
export type { AsyncWriterConfig } from './AsyncLogWriter'

// 远程日志服务
export { RemoteLogHandler } from './RemoteLogHandler'
export type { RemoteLogConfig } from './RemoteLogHandler'
