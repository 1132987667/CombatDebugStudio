/**
 * 战斗资源生命周期管理 Hook
 * 提供统一的定时器、事件监听器等资源的管理和清理功能
 */

import { onUnmounted } from 'vue'

export interface TimerResource {
  id: symbol
  type: 'timeout' | 'interval'
  clear: () => void
}

export interface LifecycleOptions {
  /** 是否在组件卸载时自动清理 */
  autoCleanup?: boolean
  /** 调试模式 */
  debug?: boolean
}

const activeTimers = new Map<symbol, TimerResource>()

function generateTimerId(): symbol {
  return Symbol(`timer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`)
}

export function useBattleLifecycle(options: LifecycleOptions = {}) {
  const { autoCleanup = true, debug = false } = options
  const timers = new Set<symbol>()
  const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>()

  function log(message: string, ...args: unknown[]) {
    if (debug) {
      console.log(`[BattleLifecycle] ${message}`, ...args)
    }
  }

  function registerTimeout(callback: () => void, delay: number): symbol {
    const id = generateTimerId()
    const timerId = window.setTimeout(() => {
      timers.delete(id)
      activeTimers.delete(id)
      callback()
    }, delay)

    const resource: TimerResource = {
      id,
      type: 'timeout',
      clear: () => {
        window.clearTimeout(timerId)
        timers.delete(id)
        activeTimers.delete(id)
        log('Timeout cleared', id)
      },
    }

    timers.add(id)
    activeTimers.set(id, resource)
    log('Timeout registered', id, delay)
    return id
  }

  function registerInterval(callback: () => void, interval: number): symbol {
    const id = generateTimerId()
    const timerId = window.setInterval(() => {
      callback()
    }, interval)

    const resource: TimerResource = {
      id,
      type: 'interval',
      clear: () => {
        window.clearInterval(timerId)
        timers.delete(id)
        activeTimers.delete(id)
        log('Interval cleared', id)
      },
    }

    timers.add(id)
    activeTimers.set(id, resource)
    log('Interval registered', id, interval)
    return id
  }

  function clearTimer(id: symbol): boolean {
    const resource = activeTimers.get(id)
    if (resource) {
      resource.clear()
      return true
    }
    return false
  }

  function clearAllTimers(): void {
    log('Clearing all timers', timers.size)
    timers.forEach((id) => {
      const resource = activeTimers.get(id)
      if (resource) {
        resource.clear()
      }
    })
    timers.clear()
  }

/* eslint-disable @typescript-eslint/no-explicit-any */
  function registerEventListener(
    target: EventTarget,
    event: string,
    handler: (...args: unknown[]) => void
  ): void {
    target.addEventListener(event, handler as any)

    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set())
    }
    eventListeners.get(event)!.add(handler)

    log('Event listener registered', event)
  }

  function removeEventListener(
    target: EventTarget,
    event: string,
    handler: (...args: unknown[]) => void
  ): void {
    target.removeEventListener(event, handler as any)

    const handlers = eventListeners.get(event)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        eventListeners.delete(event)
      }
    }

    log('Event listener removed', event)
  }

  function removeAllEventListeners(): void {
    eventListeners.forEach((handlers, event) => {
      handlers.forEach((_handler) => {
        console.warn(`[BattleLifecycle] Event listener not fully removed: ${event}`)
      })
    })
    eventListeners.clear()
  }

  function cleanup(): void {
    log('Running cleanup')
    clearAllTimers()
    removeAllEventListeners()
  }

  if (autoCleanup) {
    onUnmounted(() => {
      cleanup()
    })
  }

  return {
    timers,
    registerTimeout,
    registerInterval,
    clearTimer,
    clearAllTimers,
    registerEventListener,
    removeEventListener,
    cleanup,
  }
}

/**
 * 快速创建 RAF 定时器
 * 返回清理函数
 */
export function useRafTimer() {
  const timers = new Map<symbol, number>()
  let rafId = 0

  function setTimeout(callback: () => void, delay: number): symbol {
    const id = Symbol(`raf_${++rafId}`)
    let startTime = performance.now()

    function tick(currentTime: number) {
      if (currentTime - startTime >= delay) {
        timers.delete(id)
        callback()
      } else {
        requestAnimationFrame(tick)
      }
    }

    const rafRequestId = requestAnimationFrame(tick)
    timers.set(id, rafRequestId)
    return id
  }

  function setInterval(callback: () => void, interval: number): symbol {
    const id = Symbol(`raf_${++rafId}`)
    let lastTime = performance.now()

    function tick(currentTime: number) {
      if (currentTime - lastTime >= interval) {
        lastTime = currentTime
        callback()
      }
      const rafRequestId = requestAnimationFrame(tick)
      timers.set(id, rafRequestId)
    }

    const rafRequestId = requestAnimationFrame(tick)
    timers.set(id, rafRequestId)
    return id
  }

  function clearTimeout(id: symbol): void {
    const rafRequestId = timers.get(id)
    if (rafRequestId !== undefined) {
      cancelAnimationFrame(rafRequestId)
      timers.delete(id)
    }
  }

  function clearInterval(id: symbol): void {
    clearTimeout(id)
  }

  function clearAll(): void {
    timers.forEach((rafRequestId) => {
      cancelAnimationFrame(rafRequestId)
    })
    timers.clear()
  }

  return {
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    clearAll,
  }
}
