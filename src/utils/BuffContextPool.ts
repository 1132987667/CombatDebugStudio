/**
 * 文件: BuffContextPool.ts
 * 功能: BuffContext 对象池
 * 描述: 为 BuffContext 提供对象池，减少 GC 压力
 */

import { ObjectPool } from '@/utils/object-pool'
import { BuffContext } from '@/core/BuffContext'
import type { BuffConfig } from '@/types/buff'

const MAX_POOL_SIZE = 200

class BuffContextPoolClass {
  private pool: ObjectPool<BuffContext>

  constructor() {
    this.pool = new ObjectPool<BuffContext>({
      maxSize: MAX_POOL_SIZE,
      create: () => new BuffContext(),
      reset: (context) => context.reset(),
      validate: (context) => {
        return (
          context.characterId === '' &&
          context.instanceId === '' &&
          context.variables.size === 0
        )
      }
    })
  }

  public borrow(characterId: string, instanceId: string, config: BuffConfig, buffSystem?: any): BuffContext {
    const context = this.pool.borrow()
    context.initialize(characterId, instanceId, config, buffSystem)
    return context
  }

  public return(context: BuffContext): void {
    this.pool.return(context)
  }

  public getPoolSize(): number {
    return this.pool.getPoolSize()
  }

  public getBorrowedCount(): number {
    return this.pool.getBorrowedCount()
  }

  public prewarm(count: number): void {
    this.pool.prewarm(count)
  }
}

export const BuffContextPool = new BuffContextPoolClass()
