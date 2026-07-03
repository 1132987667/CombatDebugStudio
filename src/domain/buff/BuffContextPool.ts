import { ObjectPool } from '@/shared/utils/object-pool'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffContext } from '@/domain/buff/BuffContext'
import type { BuffConfig } from '@/domain/buff/types'

const MAX_POOL_SIZE = 200

class BuffContextPoolClass {
  private pool: ObjectPool<BuffContext>

  constructor() {
    this.pool = new ObjectPool<BuffContext>({
      maxSize: MAX_POOL_SIZE,
      create: () => new BuffContext(),
      reset: (context) => context.reset(),
      validate: (context) => context.characterId === '' && context.instanceId === '' && context.variables.size === 0,
    })
  }

  public borrow(characterId: string, instanceId: string, config: BuffConfig, buffSystem?: BuffSystem): BuffContext {
    const context = this.pool.borrow()
    context.initialize(characterId, instanceId, config, buffSystem)
    return context
  }

  public return(context: BuffContext): void {
    this.pool.return(context)
  }

  public getPoolSize(): number { return this.pool.getPoolSize() }
  public getBorrowedCount(): number { return this.pool.getBorrowedCount() }
  public prewarm(count: number): void { this.pool.prewarm(count) }
}

export const BuffContextPool = new BuffContextPoolClass()
