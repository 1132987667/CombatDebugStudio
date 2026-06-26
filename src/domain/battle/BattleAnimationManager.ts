/**
 ** 文件: BattleAnimationManager.ts
 ** 创建日期: 2026-02-09
 ** 作者: CombatDebugStudio
 ** 功能: 战斗动画管理器
 ** 描述: 管理战斗动画队列的入队、播放、暂停与清除，协调 RAFTimer 驱动的时序播放
 **/
import type { AnimationQueueItem, AnimationType, AnimationData, BattleEntity } from '@/domain/battle/types'
import { BattleEventCodes } from '@/shared/types/battle-events'
import { eventBus } from '@/main'
import type { RAFTimer } from '@/shared/utils/RAF'

export class BattleAnimationManager {
  private animationQueue: AnimationQueueItem[] = []
  private isAnimationPlaying = false

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
      await this.wait(100)
    }
  }

  isAnimating(): boolean {
    return this.isAnimationPlaying
  }

  cleanupAnimationState(): void {
    this.animationQueue = []
    this.isAnimationPlaying = false
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
        this.rafTimer.clearTimeout(timerId)
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
    damageType: string
  }): Promise<void> {
    const duration = Math.floor(this.getAnimationDuration() * 1.5)
    await this.triggerAnimationAndWait(BattleEventCodes.SKILL_EFFECT, data, duration)
  }

  async triggerDamageAnimationAndWait(data: {
    targetId: string
    damage: number
    damageType: string
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
