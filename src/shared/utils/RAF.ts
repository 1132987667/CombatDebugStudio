/**
 * 文件: RAF.ts
 * 创建日期: 2026-02-09
 * 功能: 高性能定时器
 * 描述: 基于 requestAnimationFrame 的高性能定时器实现
 * 版本: 1.0.0
 */

type TimerType = 'timeout' | 'interval'
type TimerCallback = () => void | Promise<void>

interface Timer {
  id: symbol
  type: TimerType
  callback: TimerCallback
  interval: number
  lastRunTime: number // 上次理论运行时间（用于补偿）
  paused: boolean
  pausedAt: number | null
}

export class RAFTimer {
  private readonly timers: Map<symbol, Timer> = new Map()
  private rafId: number | null = null
  private isRunning: boolean = false

  constructor() {
    // 使用箭头函数绑定 loop，避免在 startLoop 中反复 bind
    this.loop = this.loop.bind(this)
  }

  /**
   * 启动循环
   */
  private startLoop(): void {
    if (!this.isRunning && this.timers.size > 0) {
      this.isRunning = true
      this.rafId = requestAnimationFrame(this.loop)
    }
  }

  /**
   * 高性能主循环
   * 移除 async 关键字，防止阻塞帧更新
   */
  private loop(now: number): void {
    if (this.timers.size === 0) {
      this.stop()
      return
    }

    // 使用迭代器减少内存开销
    for (const [id, timer] of this.timers) {
      if (timer.paused) continue

      const elapsed = now - timer.lastRunTime

      if (elapsed >= timer.interval) {
        // 执行回调：使用 try-catch 包裹，并支持异步但不阻塞循环
        this.executeCallback(timer)

        if (timer.type === 'timeout') {
          this.clear(id)
        } else {
          // 补偿算法：防止时间偏移累积
          // 如果是关键动画，建议使用 timer.lastRunTime += timer.interval
          // 如果是普通定时器，建议使用 now 以防极端卡顿时连续触发
          timer.lastRunTime = now - (elapsed % timer.interval)
        }
      }
    }

    if (this.isRunning && this.timers.size > 0) {
      this.rafId = requestAnimationFrame(this.loop)
    } else {
      this.stop()
    }
  }

  private executeCallback(timer: Timer): void {
    try {
      const result = timer.callback()
      // 如果是异步函数，静默处理其 catch，不影响主循环
      if (result instanceof Promise) {
        result.catch((err) =>
          console.error('[RAFTimer] Async Callback Error:', err),
        )
      }
    } catch (error) {
      console.error('[RAFTimer] Callback Error:', error)
    }
  }

  private stop(): void {
    this.isRunning = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  private createTimer(
    type: TimerType,
    callback: TimerCallback,
    interval: number,
  ): symbol {
    const id = Symbol(`raf_${type}`)
    const now = performance.now()

    this.timers.set(id, {
      id,
      type,
      callback,
      interval,
      lastRunTime: now,
      paused: false,
      pausedAt: null,
    })

    this.startLoop()
    return id
  }

  setTimeout(callback: TimerCallback, delay: number): symbol {
    return this.createTimer('timeout', callback, delay)
  }

  setInterval(callback: TimerCallback, interval: number): symbol {
    return this.createTimer('interval', callback, interval)
  }

  clear(timerId: symbol): boolean {
    const deleted = this.timers.delete(timerId)
    if (this.timers.size === 0) {
      this.stop()
    }
    return deleted
  }

  pause(timerId: symbol): boolean {
    const timer = this.timers.get(timerId)
    if (!timer || timer.paused) return false

    timer.paused = true
    timer.pausedAt = performance.now()
    return true
  }

  resume(timerId: symbol): boolean {
    const timer = this.timers.get(timerId)
    if (!timer || !timer.paused || timer.pausedAt === null) return false

    // 补偿暂停时长，确保恢复后逻辑时间线正确
    const pauseDuration = performance.now() - timer.pausedAt
    timer.lastRunTime += pauseDuration

    timer.paused = false
    timer.pausedAt = null

    this.startLoop()
    return true
  }

  destroy(): void {
    this.stop()
    this.timers.clear()
  }
}

export const raf = new RAFTimer()
