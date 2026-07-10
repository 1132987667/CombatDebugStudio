import { battleLogManager } from '@/infrastructure/adapters/logging'
import { LogLevel } from '@/shared/types/battle-log'

export enum BuffErrorType {
  CONFIG_ERROR = 'config_error',
  RUNTIME_ERROR = 'runtime_error',
  DEPENDENCY_ERROR = 'dependency_error',
  UNKNOWN_ERROR = 'unknown_error',
}

export interface BuffError {
  type: BuffErrorType
  message: string
  stack?: string
  buffId?: string
  scriptPath?: string
}

export class BuffErrorBoundary {
  public static wrap<T>(
    fn: () => T,
    options?: { buffId?: string; scriptPath?: string },
  ): T | null {
    try {
      return fn()
    } catch (error) {
      BuffErrorBoundary.handleError(error, options)
      return null
    }
  }

  public static wrapAsync<T>(
    fn: () => Promise<T>,
    options?: { buffId?: string; scriptPath?: string },
  ): Promise<T | null> {
    return fn().catch((error) => {
      BuffErrorBoundary.handleError(error, options)
      return null
    })
  }

  private static handleError(
    error: unknown,
    options?: { buffId?: string; scriptPath?: string },
  ): void {
    const buffError = BuffErrorBoundary.parseError(error, options)
    switch (buffError.type) {
      case BuffErrorType.CONFIG_ERROR:
        battleLogManager.addDebugLog(`Buff config error${options?.buffId ? ` (${options.buffId})` : ''}: ${buffError.message}`)
        break
      case BuffErrorType.RUNTIME_ERROR:
        battleLogManager.addDebugLog(`Buff runtime error${options?.buffId ? ` (${options.buffId})` : ''}: ${buffError.message}`)
        break
      case BuffErrorType.DEPENDENCY_ERROR:
        battleLogManager.addDebugLog(`Buff dependency error${options?.buffId ? ` (${options.buffId})` : ''}: ${buffError.message}`)
        break
      default:
        battleLogManager.addDebugLog(`Unknown buff error${options?.buffId ? ` (${options.buffId})` : ''}: ${buffError.message}`)
        break
    }
    if (buffError.stack) battleLogManager.addDebugLog(`Buff error stack: ${buffError.stack}`)
  }

  private static parseError(
    error: unknown,
    options?: { buffId?: string; scriptPath?: string },
  ): BuffError {
    let type = BuffErrorType.UNKNOWN_ERROR
    let message = 'Unknown error'
    let stack: string | undefined
    if (error instanceof Error) {
      message = error.message
      stack = error.stack
      if (message.includes('config') || message.includes('Config')) type = BuffErrorType.CONFIG_ERROR
      else if (message.includes('dependency') || message.includes('import') || message.includes('require')) type = BuffErrorType.DEPENDENCY_ERROR
      else type = BuffErrorType.RUNTIME_ERROR
    } else if (typeof error === 'string') {
      message = error
      type = BuffErrorType.RUNTIME_ERROR
    }
    return { type, message, stack, buffId: options?.buffId, scriptPath: options?.scriptPath }
  }

  public static executeWithRetry<T>(
    fn: () => T,
    maxRetries: number = 3,
    options?: { buffId?: string; scriptPath?: string },
  ): T | null {
    let retries = 0
    while (retries < maxRetries) {
      try { return fn() } catch (error) {
        retries++
        if (retries >= maxRetries) { BuffErrorBoundary.handleError(error, options); return null }
        getLogger().info(`Retrying buff script execution (${retries}/${maxRetries})`)
      }
    }
    return null
  }

  public static createConfigError(message: string, options?: { buffId?: string; scriptPath?: string }): Error {
    const error = new Error(`[CONFIG_ERROR] ${message}`)
    ;(error as any).buffId = options?.buffId
    ;(error as any).scriptPath = options?.scriptPath
    return error
  }

  public static createRuntimeError(message: string, options?: { buffId?: string; scriptPath?: string }): Error {
    const error = new Error(`[RUNTIME_ERROR] ${message}`)
    ;(error as any).buffId = options?.buffId
    ;(error as any).scriptPath = options?.scriptPath
    return error
  }

  public static createDependencyError(message: string, options?: { buffId?: string; scriptPath?: string }): Error {
    const error = new Error(`[DEPENDENCY_ERROR] ${message}`)
    ;(error as any).buffId = options?.buffId
    ;(error as any).scriptPath = options?.scriptPath
    return error
  }
}
