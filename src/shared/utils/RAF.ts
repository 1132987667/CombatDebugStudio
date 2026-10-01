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
  /** 页面不可见时的兜底驱动句柄（rAF 在后台标签完全停转，战斗挂机会整体冻结） */
  private fallbackTimerId: ReturnType<typeof setTimeout> | null = null
  /** rAF 失约看门狗（嵌入式 webview/节能模式隐藏页面时 document.hidden 不变、
   *  无 visibilitychange 事件，但 rAF 静默停转——只能靠时间兜底发现） */
  private watchdogId: ReturnType<typeof setInterval> | null = null
  private lastLoopAt: number = 0
  private visibilityHandler: (() => void) | null = null
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
      this.startDrive()
      this.startWatchdog()
    }
  }

  /** 按可见性选择驱动方式：前台 rAF（帧对齐），后台 setTimeout 兜底（被浏览器节流但持续推进） */
  private startDrive(): void {
    if (this.fallbackTimerId !== null) return
    if (typeof document !== 'undefined' && document.hidden) {
      this.startFallbackDrive()
      return
    }
    this.rafId = requestAnimationFrame(this.loop)
    this.ensureVisibilityListener()
  }

  private startFallbackDrive(): void {
    if (this.fallbackTimerId !== null) return
    this.fallbackTimerId = setTimeout(() => {
      this.fallbackTimerId = null
      this.loop(performance.now())
    }, 250)
  }

  /** 看门狗：rAF 驱动失约 >1s（帧不再来）时切换到 setTimeout 兜底驱动 */
  private startWatchdog(): void {
    // NOTE: lastLoopAt 刷新须在复用守卫之前——stop 后未经 clear 直接重启（未来调用方）
    //       会复用旧 watchdog，过期 lastLoopAt 会误判 rAF 失约切一次 fallback
    this.lastLoopAt = performance.now()
    if (this.watchdogId !== null || typeof setInterval === 'undefined') return
    this.watchdogId = setInterval(() => {
      if (!this.isRunning || this.timers.size === 0) return
      if (this.fallbackTimerId !== null) return
      if (performance.now() - this.lastLoopAt < 1000) return
      // rAF 已失约且无事件通知（hidden 未变）——强制切兜底
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId)
        this.rafId = null
      }
      this.startFallbackDrive()
    }, 500)
  }

  /** 可见性切换时在两种驱动间迁移（幂等） */
  private ensureVisibilityListener(): void {
    if (typeof document === 'undefined' || this.visibilityHandler) return
    this.visibilityHandler = () => {
      if (document.hidden) {
        if (this.rafId !== null) {
          cancelAnimationFrame(this.rafId)
          this.rafId = null
        }
        if (this.isRunning) this.startFallbackDrive()
      } else {
        if (this.fallbackTimerId !== null) {
          clearTimeout(this.fallbackTimerId)
          this.fallbackTimerId = null
        }
        if (this.isRunning && this.rafId === null) {
          this.rafId = requestAnimationFrame(this.loop)
        }
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  /**
   * 高性能主循环
   * 移除 async 关键字，防止阻塞帧更新
   */
  private loop(now: number): void {
    this.lastLoopAt = now
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
      // NOTE: rAF 回调执行期间 rafId 仍持有旧句柄（尚未消费完），不能以 rafId===null
      //       判断是否续接——rAF 在此续排下一帧；fallback tick 走到此处时句柄已被
      //       回调入口清掉，直接续排 fallback（无事件证明 rAF 已恢复，切回会退化成
      //       「失约 1s → 兜底一拍」的节奏，由 visibilitychange hidden=false 正常切回）
      if (this.fallbackTimerId !== null) {
        // 双保险（实际不可达：回调入口已置 null）
      } else if (this.rafId !== null) {
        this.rafId = requestAnimationFrame(this.loop)
      } else {
        this.startFallbackDrive()
      }
    } else {
      this.stop()
    }
  }

  private executeCallback(timer: Timer): void {
    try {
      const result = timer.callback()
      // 如果是异步函数，静默处理其 catch，不影响主循环
      if (result instanceof Promise) {
        result.catch((err) => console.error('[RAFTimer] 异步回调错误:', err))
      }
    } catch (error) {
      console.error('[RAFTimer] 回调函数执行错误:', error)
    }
  }

  private stop(): void {
    this.isRunning = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.fallbackTimerId !== null) {
      clearTimeout(this.fallbackTimerId)
      this.fallbackTimerId = null
    }
  }

  private clearWatchdog(): void {
    if (this.watchdogId !== null) {
      clearInterval(this.watchdogId)
      this.watchdogId = null
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
      this.clearWatchdog()
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
    this.clearWatchdog()
    this.timers.clear()
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
  }
}

export const raf = new RAFTimer()
