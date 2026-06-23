/**
 * @deprecated 请使用 '@/infrastructure/adapters/logging' 替代。此文件将在 Phase 8 中删除。
 */
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

export {
  BattleLogManager,
  battleLogManager,
} from '@/infrastructure/adapters/logging/BattleLogManager'

export { BattleLogFormatter } from '@/infrastructure/adapters/logging/BattleLogFormatter'

export { ConsoleLogHandler } from '@/infrastructure/adapters/logging/BattleLogManager'

export { JsonLogHandler, CsvLogHandler } from '@/infrastructure/adapters/logging/StructuredLogHandlers'

export { LogSampler, PresetSamplingConfigs } from '@/infrastructure/adapters/logging/LogSampling'
export type { SamplingConfig, SamplingStrategy, SamplingStats } from '@/infrastructure/adapters/logging/LogSampling'

export { LogContextManager, createReactiveContextManager, defaultContextManager } from '@/infrastructure/adapters/logging/LogContext'
export type { LogContext, ContextManagerConfig } from '@/infrastructure/adapters/logging/LogContext'

export { AsyncLogWriter, RingBuffer } from '@/infrastructure/adapters/logging/AsyncLogWriter'
export type { AsyncWriterConfig } from '@/infrastructure/adapters/logging/AsyncLogWriter'

export { RemoteLogHandler } from '@/infrastructure/adapters/logging/RemoteLogHandler'
export type { RemoteLogConfig } from '@/infrastructure/adapters/logging/RemoteLogHandler'
