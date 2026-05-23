/**
 * 文件：GsapAnimationEngine.ts
 * 功能：GSAP 动画引擎适配层
 * 描述：将 GSAP 动画引擎适配到统一的 AnimationStrategy 接口
 */

import gsap from 'gsap'
import type { AnimationStrategy, AnimationContext, BaseAnimationStrategy } from './AnimationStrategy'

/**
 * GSAP 动画配置
 */
export interface GsapAnimationConfig extends AnimationContext {
  /** GSAP 缓动函数 */
  ease?: string | gsap.EaseFunction
  /** GSAP 插件 */
  plugins?: Record<string, any>
  /** GSAP 回调 */
  onStart?: () => void
  onUpdate?: () => void
  /** GSAP 动画目标 */
  targets?: gsap.TweenTarget | gsap.TweenTarget[]
  /** GSAP 动画变量 */
  vars?: gsap.TweenVars
}

/**
 * GSAP 动画策略基类
 * 提供 GSAP 动画的通用实现
 */
export abstract class BaseGsapStrategy extends BaseAnimationStrategy implements AnimationStrategy {
  protected config: GsapAnimationConfig
  protected timeline?: gsap.core.Timeline
  protected tweens: gsap.core.Tween[] = []

  constructor(context: GsapAnimationConfig) {
    super(context)
    this.config = context
  }

  abstract execute(): Promise<void>

  /**
   * 创建 GSAP Timeline
   */
  protected createTimeline(): gsap.core.Timeline {
    this.timeline = gsap.timeline({
      onComplete: () => {
        this.context.onComplete?.()
      },
      onError: (error: any) => {
        this.context.onError?.(new Error(error))
      },
    })
    return this.timeline
  }

  /**
   * 创建 GSAP Tween
   */
  protected createTween(
    target: gsap.TweenTarget,
    vars: gsap.TweenVars
  ): gsap.core.Tween {
    const scaledDuration = vars.duration
      ? this.getScaledDuration(vars.duration * 1000) / 1000
      : undefined

    const tweenVars = {
      ...vars,
      ...(scaledDuration !== undefined && { duration: scaledDuration }),
      ease: this.config.ease || vars.ease || 'power2.out',
      onComplete: () => {
        vars.onComplete?.()
      },
    }

    const tween = gsap.to(target, tweenVars)
    this.tweens.push(tween)
    return tween
  }

  /**
   * 停止所有动画
   */
  protected stopAll(): void {
    if (this.timeline) {
      this.timeline.kill()
      this.timeline = undefined
    }

    this.tweens.forEach((tween) => tween.kill())
    this.tweens = []
  }

  /**
   * 清理 DOM 元素
   */
  protected cleanupElement(element: HTMLElement | null): void {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element)
    }
  }
}

/**
 * 移动动画策略
 */
export class MoveStrategy extends BaseGsapStrategy {
  async execute(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const target = this.config.targets
        if (!target) {
          reject(new Error('MoveStrategy: No target specified'))
          return
        }

        const duration = this.getScaledDuration(
          this.config.duration || 500
        ) / 1000

        gsap.to(target, {
          ...this.config.vars,
          duration,
          ease: this.config.ease || 'power2.out',
          onComplete: () => {
            this.context.onComplete?.()
            resolve()
          },
          onError: (error: any) => {
            this.context.onError?.(new Error(error))
            reject(error)
          },
        })
      } catch (error) {
        reject(error)
      }
    })
  }
}

/**
 * 淡入淡出动画策略
 */
export class FadeStrategy extends BaseGsapStrategy {
  async execute(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const target = this.config.targets
        if (!target) {
          reject(new Error('FadeStrategy: No target specified'))
          return
        }

        const duration = this.getScaledDuration(
          this.config.duration || 300
        ) / 1000

        const toOpacity = this.config.params?.toOpacity ?? 0

        gsap.to(target, {
          opacity: toOpacity,
          duration,
          ease: this.config.ease || 'power2.out',
          onComplete: () => {
            this.context.onComplete?.()
            resolve()
          },
          onError: (error: any) => {
            this.context.onError?.(new Error(error))
            reject(error)
          },
        })
      } catch (error) {
        reject(error)
      }
    })
  }
}

/**
 * 缩放动画策略
 */
export class ScaleStrategy extends BaseGsapStrategy {
  async execute(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const target = this.config.targets
        if (!target) {
          reject(new Error('ScaleStrategy: No target specified'))
          return
        }

        const duration = this.getScaledDuration(
          this.config.duration || 300
        ) / 1000

        const scale = this.config.params?.scale ?? 1

        gsap.to(target, {
          scale,
          duration,
          ease: this.config.ease || 'power2.out',
          onComplete: () => {
            this.context.onComplete?.()
            resolve()
          },
          onError: (error: any) => {
            this.context.onError?.(new Error(error))
            reject(error)
          },
        })
      } catch (error) {
        reject(error)
      }
    })
  }
}

/**
 * 摇晃动画策略
 */
export class ShakeStrategy extends BaseGsapStrategy {
  async execute(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const target = this.config.targets
        if (!target) {
          reject(new Error('ShakeStrategy: No target specified'))
          return
        }

        const intensity = this.config.params?.intensity || 'medium'
        const intensityMap = {
          light: { distance: 3, times: 3 },
          medium: { distance: 5, times: 5 },
          heavy: { distance: 8, times: 7 },
        }

        const { distance, times } = intensityMap[intensity as keyof typeof intensityMap]
        const duration = this.getScaledDuration(50) / 1000

        gsap.to(target, {
          x: `+=${distance}`,
          duration,
          repeat: times * 2 - 1,
          yoyo: true,
          ease: 'power1.inOut',
          onComplete: () => {
            this.context.onComplete?.()
            resolve()
          },
          onError: (error: any) => {
            this.context.onError?.(new Error(error))
            reject(error)
          },
        })
      } catch (error) {
        reject(error)
      }
    })
  }
}

/**
 * 浮动文字动画策略
 */
export class FloatingTextStrategy extends BaseGsapStrategy {
  private textElement?: HTMLElement

  async execute(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const parent = this.config.element
        const text = this.config.params?.text || ''
        
        if (!parent) {
          reject(new Error('FloatingTextStrategy: No parent element specified'))
          return
        }

        // 创建浮动文字元素
        this.textElement = document.createElement('div')
        this.textElement.className = 'floating-text'
        this.textElement.textContent = text
        this.textElement.style.cssText = `
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          font-size: ${this.config.params?.fontSize || '18px'};
          font-weight: bold;
          color: ${this.config.params?.color || '#fff'};
          text-shadow: 0 0 10px ${this.config.params?.color || '#fff'};
          pointer-events: none;
          z-index: 100;
        `

        parent.style.position = 'relative'
        parent.appendChild(this.textElement)

        const timeline = this.createTimeline()
        const moveDuration = this.getScaledDuration(
          this.config.duration || 400
        ) / 1000
        const fadeDuration = this.getScaledDuration(
          this.config.params?.fadeDuration || 300
        ) / 1000

        timeline
          .set(this.textElement, { opacity: 1, scale: 1, y: 0 })
          .to(this.textElement, {
            y: -40,
            scale: 0.8,
            duration: moveDuration,
            ease: 'power2.out',
          })
          .to(this.textElement, {
            opacity: 0,
            scale: 0.3,
            duration: fadeDuration,
            ease: 'power2.in',
            onComplete: () => {
              this.cleanupElement(this.textElement!)
              this.context.onComplete?.()
              resolve()
            },
          })
      } catch (error) {
        this.cleanupElement(this.textElement || null)
        reject(error)
      }
    })
  }
}

/**
 * 组合动画策略 - 按顺序执行多个动画
 */
export class SequenceStrategy extends BaseGsapStrategy {
  private strategies: AnimationStrategy[] = []

  addStrategy(strategy: AnimationStrategy): SequenceStrategy {
    this.strategies.push(strategy)
    return this
  }

  async execute(): Promise<void> {
    try {
      for (const strategy of this.strategies) {
        await strategy.execute()
      }
      this.context.onComplete?.()
    } catch (error) {
      this.context.onError?.(error as Error)
      throw error
    }
  }
}

/**
 * 并行动画策略 - 同时执行多个动画
 */
export class ParallelStrategy extends BaseGsapStrategy {
  private strategies: AnimationStrategy[] = []

  addStrategy(strategy: AnimationStrategy): ParallelStrategy {
    this.strategies.push(strategy)
    return this
  }

  async execute(): Promise<void> {
    try {
      await Promise.all(this.strategies.map((s) => s.execute()))
      this.context.onComplete?.()
    } catch (error) {
      this.context.onError?.(error as Error)
      throw error
    }
  }
}
