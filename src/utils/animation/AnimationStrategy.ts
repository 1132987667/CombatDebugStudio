/**
 * 文件：AnimationStrategy.ts
 * 功能：动画策略接口 - 定义动画执行的统一契约
 * 描述：所有具体动画实现都需要实现此接口，实现策略模式
 */

export interface AnimationContext {
  /** 动画唯一标识 */
  id: string
  /** 动画时长（毫秒） */
  duration?: number
  /** 动画速度倍率 */
  speedMultiplier?: number
  /** 动画参数 */
  params?: Record<string, any>
  /** DOM 元素引用 */
  element?: HTMLElement | null
  /** 回调函数 */
  onComplete?: () => void
  onError?: (error: Error) => void
  onCancel?: () => void
}

/**
 * 动画策略接口
 * 所有具体动画实现都需要实现此接口
 */
export interface AnimationStrategy {
  /**
   * 执行动画
   */
  execute(): Promise<void>

  /**
   * 动画完成回调（可选）
   */
  onComplete?: () => void

  /**
   * 动画错误回调（可选）
   */
  onError?: (error: Error) => void

  /**
   * 动画取消回调（可选）
   */
  onCancel?: () => void
}

/**
 * 基础动画策略 - 提供通用实现
 */
export abstract class BaseAnimationStrategy implements AnimationStrategy {
  protected context: AnimationContext

  constructor(context: AnimationContext) {
    this.context = context
  }

  abstract execute(): Promise<void>

  onComplete?: () => void
  onError?: (error: Error) => void
  onCancel?: () => void

  /**
   * 获取缩放后的时长
   */
  protected getScaledDuration(baseDuration: number): number {
    const multiplier = this.context.speedMultiplier ?? 1
    return baseDuration / multiplier
  }

  /**
   * 等待指定时间
   */
  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * 空动画策略 - 用于测试或占位
 */
export class NoopAnimationStrategy extends BaseAnimationStrategy {
  async execute(): Promise<void> {
    // 空操作
    await Promise.resolve()
  }
}
