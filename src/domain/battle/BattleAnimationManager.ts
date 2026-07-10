/**
 ** 文件: BattleAnimationManager.ts
 ** 创建日期: 2026-02-09
 ** 作者: CombatDebugStudio
 ** 功能: 战斗动画管理器
 ** 描述: 管理战斗动画队列的入队、播放、暂停与清除，协调 RAFTimer 驱动的时序播放
 **/
import type { AnimationData, AnimationQueueItem, AnimationType } from '@/domain/battle/type/BattleAnimationType'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import type { DamageCategory } from '@/domain/skill/types'
import { eventBus } from '@/main'
import type { RAFTimer } from '@/shared/utils/RAF'
import type { BattleEntity } from '@/domain/battle/type/types'

export class BattleAnimationManager {
  private animationQueue: AnimationQueueItem[] = []
  private isAnimationPlaying = false
  /** ⭐ 记录 waitForAnimation 中当前轮询间隔的 resolve，外部可强制中断 */
  private _interruptResolve: (() => void) | null = null

  constructor(
    private rafTimer: RAFTimer,
    private getParticipants: () => Map<string, BattleEntity> | undefined,
    private getAnimationDuration: () => number,
  ) {}

  wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.rafTimer.setTimeout(resolve, ms)
    })
  }

  async waitForAnimation(): Promise<void> {
    while (this.isAnimating()) {
      await new Promise<void>((resolve) => {
        // 保存 resolve 引用，使外部可强制中断本轮等待
        this._interruptResolve = resolve
        this.rafTimer.setTimeout(() => {
          if (this._interruptResolve === resolve) {
            this._interruptResolve = null
          }
          resolve()
        }, 100)
      })
    }
  }

  isAnimating(): boolean {
    return this.isAnimationPlaying
  }

  cleanupAnimationState(): void {
    this.animationQueue = []
    this.isAnimationPlaying = false
    // ⭐ 强制 resolve 当前轮询等待，让 waitForAnimation 立即检查 isAnimating 并退出
    if (this._interruptResolve) {
      this._interruptResolve()
      this._interruptResolve = null
    }
  }

  async triggerAnimationAndWait(
    animationType: AnimationType,
    data: AnimationData,
    duration: number = 0,
  ): Promise<void> {
    const actualDuration = duration > 0 ? duration : this.getAnimationDuration()

    return new Promise<void>((resolve) => {
      this.animationQueue.push({
        type: animationType,
        data,
        duration: actualDuration,
        resolve,
      })

      if (!this.isAnimationPlaying) {
        this.processAnimationQueue()
      }
    })
  }

  private async processAnimationQueue(): Promise<void> {
    if (this.animationQueue.length === 0) {
      this.isAnimationPlaying = false
      return
    }

    this.isAnimationPlaying = true
    const animation = this.animationQueue.shift()!

    const participants = this.getParticipants()
    if (animation.data && 'targetId' in animation.data) {
      const targetId = (animation.data as any).targetId
      const target = participants?.get(targetId)
      if (!target || !target.isAlive()) {
        // ponytail: 目标已死亡/不存在 — 仍发出事件让 UI 显示动画效果（伤害先应用后入队动画），但快速 resolve 避免队列卡死
        eventBus.emit(animation.type, animation.data)
        if (typeof animation.resolve === 'function') {
          animation.resolve()
        }
        this.processAnimationQueue()
        return
      }
    }

    eventBus.emit(animation.type, animation.data)

    const TIMEOUT_MS = Math.max(animation.duration + 2000, 5000)

    await new Promise<void>((resolve) => {
      let resolved = false

      const safeResolve = () => {
        if (resolved) return
        resolved = true
        clearTimeout(timeoutId)
        this.rafTimer.clear(timerId)
        if (typeof animation.resolve === 'function') {
          animation.resolve()
        }
        this.processAnimationQueue()
        resolve()
      }

      const timerId = this.rafTimer.setTimeout(() => {
        safeResolve()
      }, animation.duration)

      const timeoutId = setTimeout(() => {
        safeResolve()
      }, TIMEOUT_MS)
    })
  }

  async triggerSkillEffectAnimation(data: {
    sourceId: string
    targetId: string
    skillName: string
    effectType: string
    damageCategory: DamageCategory
  }): Promise<void> {
    const duration = Math.floor(this.getAnimationDuration() * 1.5)
    await this.triggerAnimationAndWait(BattleEventCodes.SKILL_EFFECT, data, duration)
  }

  async triggerDamageAnimationAndWait(data: {
    targetId: string
    damage: number
    damageCategory: DamageCategory
    isCritical: boolean
    isHeal: boolean
  }): Promise<void> {
    const baseDuration = this.getAnimationDuration()
    const duration = data.isCritical ? Math.floor(baseDuration * 1.5) : baseDuration
    await this.triggerAnimationAndWait(BattleEventCodes.DAMAGE_ANIMATION, data, duration)
  }

  async triggerMissAnimationAndWait(data: { targetId: string }): Promise<void> {
    await this.triggerAnimationAndWait(BattleEventCodes.MISS_ANIMATION, data, this.getAnimationDuration())
  }

  async triggerBuffEffectAndWait(data: {
    targetId: string
    buffName: string
    isPositive: boolean
  }): Promise<void> {
    await this.triggerAnimationAndWait(BattleEventCodes.BUFF_EFFECT, data, 800)
  }
}
