import { logger } from './logger'

interface ObjectPoolOptions<T> {
  maxSize: number
  create: () => T
  reset: (obj: T) => void
  validate?: (obj: T) => boolean
}

export class ObjectPool<T> {
  private pool: T[] = []
  private options: ObjectPoolOptions<T>
  private borrowedCount = 0

  constructor(options: ObjectPoolOptions<T>) {
    this.options = options
  }

  public borrow(): T {
    if (this.pool.length > 0) {
      const obj = this.pool.pop()!
      if (this.options.validate && !this.options.validate(obj)) {
        logger.warn('Object pool validation failed, creating new instance')
        return this.options.create()
      }
      this.borrowedCount++
      return obj
    }

    if (this.borrowedCount >= this.options.maxSize) {
      logger.warn('Object pool max size reached, creating new instance')
    }

    this.borrowedCount++
    return this.options.create()
  }

  public return(obj: T): void {
    if (this.pool.length >= this.options.maxSize) {
      logger.debug('Object pool full, discarding instance')
      return
    }

    try {
      this.options.reset(obj)
      this.pool.push(obj)
      this.borrowedCount = Math.max(0, this.borrowedCount - 1)
    } catch (error) {
      logger.error('Failed to reset object in pool:', error)
    }
  }

  public getPoolSize(): number {
    return this.pool.length
  }

  public getBorrowedCount(): number {
    return this.borrowedCount
  }

  public clear(): void {
    this.pool = []
    this.borrowedCount = 0
    logger.info('Object pool cleared')
  }

  public prewarm(count: number): void {
    for (let i = 0; i < count && this.pool.length < this.options.maxSize; i++) {
      this.pool.push(this.options.create())
    }
    logger.info(`Object pool prewarmed with ${count} instances`)
  }
}

// 预定义的对象池实例
export const createBuffContextPool = () => {
  return new ObjectPool({
    maxSize: 100,
    create: () => {
      // 注意：这里只是占位，实际的 BuffContext 创建需要具体参数
      // 实际使用时，需要在 borrow 后进行初始化
      return {} as any
    },
    reset: (context) => {
      // 重置 BuffContext 的状态
      if (context.variables) {
        context.variables.clear()
      }
    }
  })
}
