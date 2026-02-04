import { logger } from '@/utils/logger'

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
   * @returns 函数执行结果，出错则返回null
   */
  public static wrap<T>(fn: () => T): T | null {
    try {
      return fn()
    } catch (error) {
      BuffErrorBoundary.handleError(error)
      return null
    }
  }

  /**
   * 异步错误捕获和处理
   * @param fn 要执行的异步函数
   * @returns 函数执行结果的Promise，出错则返回null
   */
  public static wrapAsync<T>(fn: () => Promise<T>): Promise<T | null> {
    return fn().catch((error) => {
      BuffErrorBoundary.handleError(error)
      return null
    })
  }

  /**
   * 错误处理
   * @param error 错误对象
   */
  private static handleError(error: unknown): void {
    if (error instanceof Error) {
      logger.error('Buff script error:', {
        message: error.message,
        stack: error.stack
      })
    } else {
      logger.error('Unknown buff script error:', error)
    }
  }

  /**
   * 带重试机制的函数执行
   * @param fn 要执行的函数
   * @param maxRetries 最大重试次数，默认3次
   * @returns 函数执行结果，多次尝试后仍然出错则返回null
   */
  public static executeWithRetry<T>(
    fn: () => T,
    maxRetries: number = 3
  ): T | null {
    let retries = 0

    while (retries < maxRetries) {
      try {
        return fn()
      } catch (error) {
        retries++
        if (retries >= maxRetries) {
          BuffErrorBoundary.handleError(error)
          return null
        }
        logger.warn(`Retrying buff script execution (${retries}/${maxRetries})`)
      }
    }

    return null
  }
}