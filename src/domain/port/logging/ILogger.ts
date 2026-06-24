/**
 * 日志端口接口
 *
 * 领域层通过此接口声明日志需求，不依赖基础设施层的具体实现。
 * 基础设施层提供适配器实现此接口（如 LoggerAdapter）。
 */
export interface ILogger {
  /** 调试日志 */
  debug(message: string, context?: Record<string, unknown>): void
  /** 信息日志 */
  info(message: string, context?: Record<string, unknown>): void
  /** 警告日志 */
  warn(message: string, context?: Record<string, unknown>): void
  /** 错误日志 */
  error(message: string, error?: Error, context?: Record<string, unknown>): void
}
