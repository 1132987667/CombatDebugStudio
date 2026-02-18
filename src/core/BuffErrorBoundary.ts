/**
 * 文件: BuffErrorBoundary.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: Buff错误边界类
 * 描述: 负责捕获和处理Buff脚本执行过程中的错误，防止单个Buff脚本的错误影响整个系统的运行
 * 版本: 1.0.0
 */

import { battleLogManager } from '@/utils/logging'

/**
 * 错误类型枚举
 */
export enum BuffErrorType {
  /** 配置错误 */
  CONFIG_ERROR = 'config_error',
  /** 运行时错误 */
  RUNTIME_ERROR = 'runtime_error',
  /** 依赖错误 */
  DEPENDENCY_ERROR = 'dependency_error',
  /** 未知错误 */
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Buff错误接口
 */
export interface BuffError {
  /** 错误类型 */
  type: BuffErrorType
  /** 错误消息 */
  message: string
  /** 错误堆栈 */
  stack?: string
  /** 相关Buff ID */
  buffId?: string
  /** 相关脚本路径 */
  scriptPath?: string
}

/**
 * Buff错误边界类
 * 负责捕获和处理Buff脚本执行过程中的错误
 * 防止单个Buff脚本的错误影响整个系统的运行
 * 提供同步和异步错误处理，以及带重试机制的执行方法
 */
export class BuffErrorBoundary {
  /**
   * 同步错误捕获和处理
   * @param fn 要执行的函数
   * @param options 选项
   * @returns 函数执行结果，出错则返回null
   */
  public static wrap<T>(
    fn: () => T,
    options?: { buffId?: string; scriptPath?: string }
  ): T | null {
    try {
      return fn()
    } catch (error) {
      BuffErrorBoundary.handleError(error, options)
      return null
    }
  }

  /**
   * 异步错误捕获和处理
   * @param fn 要执行的异步函数
   * @param options 选项
   * @returns 函数执行结果的Promise，出错则返回null
   */
  public static wrapAsync<T>(
    fn: () => Promise<T>,
    options?: { buffId?: string; scriptPath?: string }
  ): Promise<T | null> {
    return fn().catch((error) => {
      BuffErrorBoundary.handleError(error, options)
      return null
    })
  }

  /**
   * 错误处理
   * @param error 错误对象
   * @param options 选项
   */
  private static handleError(
    error: unknown,
    options?: { buffId?: string; scriptPath?: string }
  ): void {
    const buffError = BuffErrorBoundary.parseError(error, options)
    
    // 根据错误类型记录不同级别的日志
    switch (buffError.type) {
      case BuffErrorType.CONFIG_ERROR:
        battleLogManager.addErrorLog(`Buff config error${options?.buffId ? ` (${options.buffId})` : ''}: ${buffError.message}`)
        break
      case BuffErrorType.RUNTIME_ERROR:
        battleLogManager.addErrorLog(`Buff runtime error${options?.buffId ? ` (${options.buffId})` : ''}: ${buffError.message}`)
        break
      case BuffErrorType.DEPENDENCY_ERROR:
        battleLogManager.addWarningLog(`Buff dependency error${options?.buffId ? ` (${options.buffId})` : ''}: ${buffError.message}`)
        break
      default:
        battleLogManager.addErrorLog(`Unknown buff error${options?.buffId ? ` (${options.buffId})` : ''}: ${buffError.message}`)
        break
    }
    
    // 记录详细的错误信息（如堆栈）
    if (buffError.stack) {
      battleLogManager.addDebugLog(`Buff error stack: ${buffError.stack}`)
    }
  }

  /**
   * 解析错误对象
   * @param error 错误对象
   * @param options 选项
   * @returns 解析后的Buff错误对象
   */
  private static parseError(
    error: unknown,
    options?: { buffId?: string; scriptPath?: string }
  ): BuffError {
    let type = BuffErrorType.UNKNOWN_ERROR
    let message = 'Unknown error'
    let stack: string | undefined

    if (error instanceof Error) {
      message = error.message
      stack = error.stack

      // 根据错误消息判断错误类型
      if (message.includes('config') || message.includes('Config')) {
        type = BuffErrorType.CONFIG_ERROR
      } else if (message.includes('dependency') || message.includes('import') || message.includes('require')) {
        type = BuffErrorType.DEPENDENCY_ERROR
      } else {
        type = BuffErrorType.RUNTIME_ERROR
      }
    } else if (typeof error === 'string') {
      message = error
      type = BuffErrorType.RUNTIME_ERROR
    }

    return {
      type,
      message,
      stack,
      buffId: options?.buffId,
      scriptPath: options?.scriptPath
    }
  }

  /**
   * 带重试机制的函数执行
   * @param fn 要执行的函数
   * @param maxRetries 最大重试次数，默认3次
   * @param options 选项
   * @returns 函数执行结果，多次尝试后仍然出错则返回null
   */
  public static executeWithRetry<T>(
    fn: () => T,
    maxRetries: number = 3,
    options?: { buffId?: string; scriptPath?: string }
  ): T | null {
    let retries = 0

    while (retries < maxRetries) {
      try {
        return fn()
      } catch (error) {
        retries++
        if (retries >= maxRetries) {
          BuffErrorBoundary.handleError(error, options)
          return null
        }
        battleLogManager.addSystemBattleLog(`Retrying buff script execution (${retries}/${maxRetries})`, 'status')
      }
    }

    return null
  }

  /**
   * 创建配置错误
   * @param message 错误消息
   * @param options 选项
   * @returns 错误对象
   */
  public static createConfigError(
    message: string,
    options?: { buffId?: string; scriptPath?: string }
  ): Error {
    const error = new Error(`[CONFIG_ERROR] ${message}`)
    ;(error as any).buffId = options?.buffId
    ;(error as any).scriptPath = options?.scriptPath
    return error
  }

  /**
   * 创建运行时错误
   * @param message 错误消息
   * @param options 选项
   * @returns 错误对象
   */
  public static createRuntimeError(
    message: string,
    options?: { buffId?: string; scriptPath?: string }
  ): Error {
    const error = new Error(`[RUNTIME_ERROR] ${message}`)
    ;(error as any).buffId = options?.buffId
    ;(error as any).scriptPath = options?.scriptPath
    return error
  }

  /**
   * 创建依赖错误
   * @param message 错误消息
   * @param options 选项
   * @returns 错误对象
   */
  public static createDependencyError(
    message: string,
    options?: { buffId?: string; scriptPath?: string }
  ): Error {
    const error = new Error(`[DEPENDENCY_ERROR] ${message}`)
    ;(error as any).buffId = options?.buffId
    ;(error as any).scriptPath = options?.scriptPath
    return error
  }
}
