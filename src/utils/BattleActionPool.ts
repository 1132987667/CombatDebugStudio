/**
 * 文件: BattleActionPool.ts
 * 功能: BattleAction 对象池
 * 描述: 为 BattleAction 提供对象池，减少 GC 压力
 */

import { ObjectPool } from '@/utils/object-pool'
import type { BattleAction, BattleEffect } from '@/types/battle'

const MAX_POOL_SIZE = 500

class BattleActionPoolClass {
  private pool: ObjectPool<BattleAction>

  constructor() {
    this.pool = new ObjectPool<BattleAction>({
      maxSize: MAX_POOL_SIZE,
      create: () => this.createAction(),
      reset: (action) => this.resetAction(action),
      validate: (action) => {
        return action.id === '' && action.effects.length === 0
      }
    })
  }

  private createAction(): BattleAction {
    return {
      id: '',
      type: 'status',
      sourceId: '',
      targetId: '',
      success: false,
      timestamp: 0,
      effects: []
    }
  }

  private resetAction(action: BattleAction): void {
    action.id = ''
    action.type = 'status'
    action.sourceId = ''
    action.targetId = ''
    action.skillId = undefined
    action.itemId = undefined
    action.buffId = undefined
    action.damage = undefined
    action.heal = undefined
    action.success = false
    action.timestamp = 0
    action.turn = undefined
    // 清空 effects 数组
    action.effects.length = 0
  }

  public borrow(): BattleAction {
    const action = this.pool.borrow()
    this.resetAction(action)
    return action
  }

  public return(action: BattleAction): void {
    this.resetAction(action)
    this.pool.return(action)
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

export const BattleActionPool = new BattleActionPoolClass()
