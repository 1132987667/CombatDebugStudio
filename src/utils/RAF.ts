type TimerType = 'timeout' | 'interval'
type TimerCallback = () => void

interface Timer {
  id: symbol
  type: TimerType
  callback: TimerCallback
  interval: number
  startTime: number
  lastRunTime: number
  paused: boolean
  pausedAt: number | null
}

export class RAFTimer {
  private timers: Map<symbol, Timer>
  private rafId: number | null
  private isRunning: boolean

  constructor() {
    this.timers = new Map()
    this.rafId = null
    this.isRunning = false
    this.startLoop = this.startLoop.bind(this)
  }

  /**
   * 启动主循环
   */
  private startLoop(): void {
    if (!this.isRunning && this.timers.size > 0) {
      this.isRunning = true
      this.loop()
    }
  }

  /**
   * 主动画帧循环
   */
  private loop = async (): Promise<void> => {
    const now = performance.now()
    // 遍历所有定时器
    for (const timer of this.timers.values()) {
      if (timer.paused) continue

      const elapsed = now - timer.lastRunTime

      if (elapsed >= timer.interval) {
        try {
          // 处理异步回调函数
          await Promise.resolve(timer.callback())
        } catch (error) {
          console.error('Timer callback error:', error)
        }

        timer.lastRunTime = now

        // 单次定时器执行后移除
        if (timer.type === 'timeout') {
          this.clear(timer.id)
        }
      }
    }

    // 如果还有定时器，继续循环
    if (this.timers.size > 0) {
      this.rafId = requestAnimationFrame(this.loop)
    } else {
      this.isRunning = false
      this.rafId = null
    }
  }

  /**
   * 创建定时器
   */
  private createTimer(
    type: TimerType,
    callback: TimerCallback,
    interval: number,
  ): symbol {
    const id = Symbol(`raf-${type}`)

    this.timers.set(id, {
      id,
      type,
      callback,
      interval,
      startTime: performance.now(),
      lastRunTime: performance.now(),
      paused: false,
      pausedAt: null,
    })

    this.startLoop()
    return id
  }

  /**
   * 设置延时定时器
   */
  setTimeout(callback: TimerCallback, interval: number): symbol {
    return this.createTimer('timeout', callback, interval)
  }

  /**
   * 设置间隔定时器
   */
  setInterval(callback: TimerCallback, interval: number): symbol {
    return this.createTimer('interval', callback, interval)
  }

  /**
   * 清除定时器
   */
  clear(timerId: symbol): boolean {
    const existed = this.timers.delete(timerId)

    // 如果没有定时器了，停止循环
    if (this.timers.size === 0 && this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
      this.isRunning = false
    }

    return existed
  }

  clearTimeout(timerId: symbol): boolean {
    return this.clear(timerId)
  }

  clearInterval(timerId: symbol): boolean {
    return this.clear(timerId)
  }

  /**
   * 暂停定时器
   */
  pause(timerId: symbol): boolean {
    const timer = this.timers.get(timerId)
    if (!timer || timer.paused) return false

    timer.paused = true
    timer.pausedAt = performance.now()
    return true
  }

  /**
   * 恢复定时器
   */
  resume(timerId: symbol): boolean {
    const timer = this.timers.get(timerId)
    if (!timer || !timer.paused) return false

    // 调整最后运行时间，补偿暂停期间的时间
    const pauseDuration = performance.now() - (timer.pausedAt || 0)
    timer.lastRunTime += pauseDuration
    timer.paused = false
    timer.pausedAt = null

    this.startLoop()
    return true
  }

  /**
   * 重置定时器
   */
  reset(timerId: symbol): boolean {
    const timer = this.timers.get(timerId)
    if (!timer) return false

    timer.lastRunTime = performance.now()
    timer.startTime = performance.now()
    timer.paused = false
    timer.pausedAt = null

    this.startLoop()
    return true
  }

  /**
   * 调整定时器间隔
   */
  setIntervalTime(timerId: symbol, newInterval: number): boolean {
    const timer = this.timers.get(timerId)
    if (!timer) return false

    timer.interval = newInterval
    timer.lastRunTime = performance.now()
    return true
  }

  /**
   * 获取剩余时间（仅对timeout有效）
   */
  getRemainingTime(timerId: symbol): number | null {
    const timer = this.timers.get(timerId)
    if (!timer || timer.type !== 'timeout') return null

    const elapsed = performance.now() - timer.startTime
    return Math.max(0, timer.interval - elapsed)
  }

  /**
   * 销毁所有定时器
   */
  destroy(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.timers.clear()
    this.isRunning = false
  }

  /**
   * 获取活跃定时器数量
   */
  getActiveCount(): number {
    return this.timers.size
  }
}

// 提供全局实例（可选）
export const raf = new RAFTimer()

// const timer = new RAFTimer()

// // 设置定时器
// const timeoutId = timer.setTimeout(() => {
//   console.log('Timeout executed')
// }, 1000)

// const intervalId = timer.setInterval(() => {
//   console.log('Interval executed')
// }, 500)

// // 暂停定时器
// timer.pause(intervalId)

// // 恢复定时器
// setTimeout(() => {
//   timer.resume(intervalId)
// }, 2000)

// // 查询剩余时间
// const remaining = timer.getRemainingTime(timeoutId)

// // 清理
// timer.clearTimeout(timeoutId)
// timer.clearInterval(intervalId)
