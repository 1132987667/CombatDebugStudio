/**
 * 日志端口模块
 *
 * 领域层通过此模块获取 ILogger 实例，不直接依赖基础设施层。
 * 
 * 使用方式：
 *   在 bootstrap 阶段（main.ts / Container.ts）调用 setLogger() 注入实现。
 *   领域层代码通过 getLogger() 获取实例进行日志记录。
 */

import type { ILogger } from './ILogger'

export type { ILogger }

let _logger: ILogger | null = null

/**
 * 获取当前日志实例
 * 在 bootstrap 未完成时返回空操作 fallback，避免 null 检查
 */
export function getLogger(): ILogger {
  if (!_logger) {
    // ponytail: fallback 为空操作，确保 bootstrap 前调用不会抛错
    return noopLogger
  }
  return _logger
}

/**
 * 注入日志实例（由基础设施层在 bootstrap 阶段调用）
 */
export function setLogger(logger: ILogger): void {
  _logger = logger
}

/** 空操作 fallback */
const noopLogger: ILogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
