/**
 ** 文件: BattleAnimationManager.ts
 ** 创建日期: 2026-02-09
 ** 作者: CombatDebugStudio
 ** 功能: 战斗动画管理器
 ** 描述: 管理战斗动画队列的入队、播放、暂停与清除，协调 RAFTimer 驱动的时序播放
 **
 ** 改造（2026-07-26）：固定行动预算模型
 ** - 依赖从 getAnimationDuration（反向 bug）改为 getBattleSpeed
 ** - 新增阶段化方法：triggerFlightPhaseAndWait / triggerImpactPhaseAndWait / triggerMissImpactAndWait / triggerDirectImpactAndWait
 ** - 删除旧的方法：triggerSkillEffectAnimation / triggerDamageAnimationAndWait / triggerMissAnimationAndWait
 ** - resolve 时发射 ANIMATION_COMPLETE 事件，供 UI 层竞态安全地清除动画状态
 **/
import type { AnimationData, AnimationQueueItem, AnimationType } from '@/domain/battle/type/BattleAnimationType'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'
import type { DamageCategory } from '@/domain/skill/types'
import type { IUIEventPort } from '@/domain/port/IUIEventPort'
import type { RAFTimer } from '@/shared/utils/RAF'
import type { BattleEntity } from '@/domain/battle/type/types'
import { BATTLE_ANIMATION_TIMING, getActionBudget, phaseAt } from '@/shared/constants/animation-timing'
import type {
  SkillEffectEventData,
  DamageEventData,
  MissEventData,
} from '@/domain/battle/type/BattleEventType'

export class BattleAnimationManager {
  private animationQueue: AnimationQueueItem[] = []
  private isAnimationPlaying = false
  /** ⭐ 记录 waitForAnimation 中当前轮询间隔的 resolve，外部可强制中断 */
  private _interruptResolve: (() => void) | null = null

  constructor(
    private rafTimer: RAFTimer,
    private getParticipants: () => Map<string, BattleEntity> | undefined,
    private getBattleSpeed: () => number,   // 改：传速度，不传（反向的）时长
    private getQuickMode: () => boolean = () => false,
    private getHeadless: () => boolean = () => false,  // ★ 新增：无头模式回调
    private readonly uiEventPort: IUIEventPort,
  ) {}

  /** ★ 是否跳过动画（快速模式 || 无头模式） */
  private get shouldSkipAnimation(): boolean {
    return this.getQuickMode() || this.getHeadless()
  }

  /** 当前速度下的单行动总预算 T */
  private get budget(): number {
    if (this.shouldSkipAnimation) return 0
    return getActionBudget(this.getBattleSpeed())
  }

  wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.rafTimer.setTimeout(resolve, ms)
    })
  }

  async waitForAnimation(): Promise<void> {
    if (this.shouldSkipAnimation) return
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
    if (this.shouldSkipAnimation) return

    const actualDuration = duration > 0 ? duration : this.budget

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
      const targetId = animation.data.targetId
      const target = participants?.get(targetId)
      if (!target || !target.isAlive()) {
        // ponytail: 目标已死亡/不存在 — 仍发出事件让 UI 显示动画效果（伤害先应用后入队动画），但快速 resolve 避免队列卡死
        this.uiEventPort.emit(animation.type, animation.data)
        if (typeof animation.resolve === 'function') {
          animation.resolve()
        }
        this.processAnimationQueue()
        return
      }
    }

    this.uiEventPort.emit(animation.type, animation.data)

    const TIMEOUT_MS = Math.max(animation.duration + 2000, 5000)

    await new Promise<void>((resolve) => {
      let resolved = false

      const safeResolve = () => {
        if (resolved) return
        resolved = true
        clearTimeout(timeoutId)
        this.rafTimer.clear(timerId)
        // 发射动画完成事件，供 UI 层竞态安全地清除动画状态
        this.uiEventPort.emit(BattleEventCodes.ANIMATION_COMPLETE, { type: animation.type })
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

  // ============ 阶段化方法（固定预算模型） ============

  /**
   * 飞行阶段（0 → 50%T）：蓄力 + 技能名/光弹飞行，终点即命中瞬间
   */
  async triggerFlightPhaseAndWait(data: SkillEffectEventData): Promise<void> {
    const duration = phaseAt(BATTLE_ANIMATION_TIMING.PHASES.impact, this.getBattleSpeed())
    await this.triggerAnimationAndWait(BattleEventCodes.SKILL_EFFECT, data, duration)
  }

  /**
   * 命中阶段（50% → 100%T）：伤害数字 + 命中爆发
   */
  async triggerImpactPhaseAndWait(data: DamageEventData): Promise<void> {
    const duration = this.budget - phaseAt(BATTLE_ANIMATION_TIMING.PHASES.impact, this.getBattleSpeed())
    await this.triggerAnimationAndWait(BattleEventCodes.DAMAGE_ANIMATION, data, duration)
  }

  /**
   * 闪避命中阶段（50% → 100%T）
   */
  async triggerMissImpactAndWait(data: MissEventData): Promise<void> {
    const duration = this.budget - phaseAt(BATTLE_ANIMATION_TIMING.PHASES.impact, this.getBattleSpeed())
    await this.triggerAnimationAndWait(BattleEventCodes.MISS_ANIMATION, data, duration)
  }

  /**
   * 轻量命中阶段（无飞行，完整 T）：治疗/护盾等非投射类行动
   */
  async triggerDirectImpactAndWait(data: DamageEventData): Promise<void> {
    await this.triggerAnimationAndWait(BattleEventCodes.DAMAGE_ANIMATION, data, this.budget)
  }

  /** Buff 特效（保留原样 — 不属于行动预算，独立触发） */
  async triggerBuffEffectAndWait(data: {
    targetId: string
    buffName: string
    isPositive: boolean
  }): Promise<void> {
    await this.triggerAnimationAndWait(BattleEventCodes.BUFF_EFFECT, data, 800)
  }
}
