/**
 * 日志适配器
 *
 * 实现 domain/port/logging/ILogger 接口，
 * 将标准日志调用委托给 BattleLogManager。
 */

import type { ILogger } from '@/domain/port/logging'
import { battleLogManager } from './BattleLogManager'
import { LogLevel } from '@/shared/types/battle-log'

export class LoggerAdapter implements ILogger {
  debug(message: string, context?: Record<string, unknown>): void {
    battleLogManager.addDebugLog(message, context ?? {})
  }

  info(message: string, context?: Record<string, unknown>): void {
    battleLogManager.addDebugLog(message, LogLevel.INFO)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    battleLogManager.addDebugLog(message, LogLevel.WARN)
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    battleLogManager.addDebugLog(message, LogLevel.ERROR)
  }
}
