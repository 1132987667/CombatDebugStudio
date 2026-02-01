import { logger } from '@/utils/logger'

export class BuffErrorBoundary {
  public static wrap<T>(fn: () => T): T | null {
    try {
      return fn()
    } catch (error) {
      BuffErrorBoundary.handleError(error)
      return null
    }
  }

  public static wrapAsync<T>(fn: () => Promise<T>): Promise<T | null> {
    return fn().catch((error) => {
      BuffErrorBoundary.handleError(error)
      return null
    })
  }

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