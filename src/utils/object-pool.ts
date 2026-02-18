/**
 * 文件: object-pool.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 对象池管理器
 * 描述: 提供对象池模式实现，用于复用对象，减少垃圾回收压力，提高性能
 * 版本: 1.0.0
 */

import { battleLogManager } from '@/utils/logging'

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
        battleLogManager.addSystemBattleLog('Object pool validation failed, creating new instance', 'status')
        return this.options.create()
      }
      this.borrowedCount++
      return obj
    }

    if (this.borrowedCount >= this.options.maxSize) {
      battleLogManager.addSystemBattleLog('Object pool max size reached, creating new instance', 'status')
    }

    this.borrowedCount++
    return this.options.create()
  }

  public return(obj: T): void {
    if (this.pool.length >= this.options.maxSize) {
      battleLogManager.addSystemBattleLog('Object pool full, discarding instance', 'status')
      return
    }

    try {
      this.options.reset(obj)
      this.pool.push(obj)
      this.borrowedCount = Math.max(0, this.borrowedCount - 1)
    } catch (error) {
      battleLogManager.addErrorLog('Failed to reset object in pool')
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
    battleLogManager.addSystemBattleLog('Object pool cleared')
  }

  public prewarm(count: number): void {
    for (let i = 0; i < count && this.pool.length < this.options.maxSize; i++) {
      this.pool.push(this.options.create())
    }
    battleLogManager.addSystemBattleLog(`Object pool prewarmed with ${count} instances`)
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
