/**
 * 文件: EventSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 事件系统
 * 描述: 提供统一的事件发布/订阅机制，支持同步和异步事件处理，事件优先级和过滤机制，事件生命周期管理，性能监控和调试支持
 * 版本: 1.0.0
 */

/**
 * 通用战斗框架 - 事件系统
 *
 * 功能：
 * 1. 提供统一的事件发布/订阅机制
 * 2. 支持同步和异步事件处理
 * 3. 事件优先级和过滤机制
 * 4. 事件生命周期管理
 * 5. 性能监控和调试支持
 */

import type { IEventSystem, EventListener } from './interfaces'
import { battleLogManager } from '@/utils/logging'
import { raf } from '@/utils/RAF'

/**
 * 事件监听器包装器
 */
interface EventListenerWrapper {
  listener: EventListener
  priority: number
  once: boolean
  async: boolean
}

/**
 * 事件数据
 */
interface EventData {
  event: string
  data?: any
  timestamp: number
  source?: string
}

/**
 * 事件系统实现
 */
export class EventSystem implements IEventSystem {
  private listeners: Map<string, EventListenerWrapper[]> = new Map()
  private eventHistory: EventData[] = []
  private maxHistorySize = 1000
  private logger = battleLogManager
  private isEnabled = true

  constructor() {
  }

  /**
   * 注册事件监听器
   */
  public on(
    event: string,
    listener: EventListener,
    options: { priority?: number; async?: boolean } = {},
  ): void {
    const { priority = 0, async = false } = options

    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }

    const wrapper: EventListenerWrapper = {
      listener,
      priority,
      once: false,
      async,
    }

    const eventListeners = this.listeners.get(event)!
    eventListeners.push(wrapper)

    // 按优先级排序
    eventListeners.sort((a, b) => b.priority - a.priority)

    this.logger.debug('Event listener registered', { event, priority, async })
  }

  /**
   * 取消事件监听器
   */
  public off(event: string, listener: EventListener): void {
    const eventListeners = this.listeners.get(event)
    if (!eventListeners) {
      return
    }

    const index = eventListeners.findIndex(
      (wrapper) => wrapper.listener === listener,
    )
    if (index !== -1) {
      eventListeners.splice(index, 1)
      this.logger.debug('Event listener removed', { event })
    }
  }

  /**
   * 触发事件
   */
  public emit(event: string, data?: any, source?: string): void {
    if (!this.isEnabled) {
      return
    }

    const eventData: EventData = {
      event,
      data,
      timestamp: Date.now(),
      source,
    }

    // 记录事件历史
    this.recordEvent(eventData)

    const eventListeners = this.listeners.get(event)
    if (!eventListeners || eventListeners.length === 0) {
      return
    }

    this.logger.debug('Event emitted', { event, data, source })

    // 执行监听器
    this.executeListeners(eventListeners, eventData)
  }

  /**
   * 一次性事件监听器
   */
  public once(
    event: string,
    listener: EventListener,
    options: { priority?: number; async?: boolean } = {},
  ): void {
    const { priority = 0, async = false } = options

    const onceListener: EventListener = (data?: any) => {
      // 先移除监听器
      this.off(event, onceListener)
      // 再执行原始监听器
      listener(data)
    }

    this.on(event, onceListener, { priority, async })
  }

  /**
   * 移除所有事件监听器
   */
  public removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event)
      this.logger.debug('All listeners removed for event', { event })
    } else {
      this.listeners.clear()
      this.logger.debug('All event listeners removed')
    }
  }

  /**
   * 获取事件监听器数量
   */
  public getListenerCount(event?: string): number {
    if (event) {
      return this.listeners.get(event)?.length || 0
    } else {
      let total = 0
      for (const listeners of this.listeners.values()) {
        total += listeners.length
      }
      return total
    }
  }

  /**
   * 检查事件是否有监听器
   */
  public hasListeners(event: string): boolean {
    return this.getListenerCount(event) > 0
  }

  /**
   * 获取事件历史
   */
  public getEventHistory(limit?: number): EventData[] {
    const history = [...this.eventHistory]
    if (limit && limit > 0) {
      return history.slice(-limit)
    }
    return history
  }

  /**
   * 清空事件历史
   */
  public clearEventHistory(): void {
    this.eventHistory = []
    this.logger.debug('Event history cleared')
  }

  /**
   * 启用/禁用事件系统
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    this.logger.debug('Event system ' + (enabled ? 'enabled' : 'disabled'))
  }

  /**
   * 批量注册事件监听器
   */
  public registerEventMap(
    eventMap: Record<string, EventListener | EventListener[]>,
  ): void {
    for (const [event, listenerOrListeners] of Object.entries(eventMap)) {
      const listeners = Array.isArray(listenerOrListeners)
        ? listenerOrListeners
        : [listenerOrListeners]

      for (const listener of listeners) {
        this.on(event, listener)
      }
    }

    this.logger.debug('Event map registered', {
      eventCount: Object.keys(eventMap).length,
    })
  }

  /**
   * 等待特定事件
   */
  public waitForEvent(event: string, timeout?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = timeout
        ? raf.setTimeout(() => {
            this.off(event, eventListener)
            reject(new Error(`Event ${event} timeout after ${timeout}ms`))
          }, timeout)
        : undefined

      const eventListener: EventListener = (data?: any) => {
        if (timer) raf.clearTimeout(timer)
        this.off(event, eventListener)
        resolve(data)
      }

      this.on(event, eventListener)
    })
  }

  /**
   * 触发事件并等待所有监听器完成
   */
  public async emitAsync(
    event: string,
    data?: any,
    source?: string,
  ): Promise<void> {
    if (!this.isEnabled) {
      return
    }

    const eventData: EventData = {
      event,
      data,
      timestamp: Date.now(),
      source,
    }

    this.recordEvent(eventData)

    const eventListeners = this.listeners.get(event)
    if (!eventListeners || eventListeners.length === 0) {
      return
    }

    this.logger.debug('Async event emitted', { event, data, source })

    // 执行异步监听器
    await this.executeAsyncListeners(eventListeners, eventData)
  }

  /**
   * 获取事件统计信息
   */
  public getEventStats(): EventStats {
    const stats: EventStats = {
      totalEvents: this.eventHistory.length,
      activeListeners: this.getListenerCount(),
      eventsByType: {},
      lastEventTime:
        this.eventHistory.length > 0
          ? this.eventHistory[this.eventHistory.length - 1].timestamp
          : 0,
    }

    for (const eventData of this.eventHistory) {
      stats.eventsByType[eventData.event] =
        (stats.eventsByType[eventData.event] || 0) + 1
    }

    return stats
  }

  /**
   * 执行事件监听器
   */
  private executeListeners(
    listeners: EventListenerWrapper[],
    eventData: EventData,
  ): void {
    const syncListeners = listeners.filter((wrapper) => !wrapper.async)
    const asyncListeners = listeners.filter((wrapper) => wrapper.async)

    // 先执行同步监听器
    for (const wrapper of syncListeners) {
      try {
        wrapper.listener(eventData.data)
      } catch (error) {
        this.logger.error('Event listener error', {
          event: eventData.event,
          error: error.message,
        })
      }
    }

    // 异步监听器在后台执行
    if (asyncListeners.length > 0) {
      this.executeAsyncListeners(asyncListeners, eventData).catch((error) => {
        this.logger.error('Async event listener error', {
          event: eventData.event,
          error: error.message,
        })
      })
    }
  }

  /**
   * 执行异步事件监听器
   */
  private async executeAsyncListeners(
    listeners: EventListenerWrapper[],
    eventData: EventData,
  ): Promise<void> {
    for (const wrapper of listeners) {
      try {
        if (wrapper.async) {
          await wrapper.listener(eventData.data)
        } else {
          wrapper.listener(eventData.data)
        }
      } catch (error) {
        this.logger.error('Async event listener error', {
          event: eventData.event,
          error: error.message,
        })
      }
    }
  }

  /**
   * 记录事件历史
   */
  private recordEvent(eventData: EventData): void {
    this.eventHistory.push(eventData)

    // 限制历史记录大小
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize)
    }
  }
}

/**
 * 事件统计信息
 */
export interface EventStats {
  totalEvents: number
  activeListeners: number
  eventsByType: Record<string, number>
  lastEventTime: number
}

/**
 * 预定义事件类型
 */
export const FrameworkEvents = {
  // 框架事件
  FRAMEWORK_INITIALIZED: 'framework:initialized',
  FRAMEWORK_DESTROYED: 'framework:destroyed',
  FRAMEWORK_ERROR: 'framework:error',

  // 配置事件
  CONFIG_CHANGED: 'config:changed',
  CONFIG_LOADED: 'config:loaded',

  // 战斗事件
  BATTLE_STARTED: 'battle:started',
  BATTLE_ENDED: 'battle:ended',
  TURN_STARTED: 'turn:started',
  TURN_ENDED: 'turn:ended',
  ACTION_EXECUTED: 'action:executed',

  // 参与者事件
  PARTICIPANT_JOINED: 'participant:joined',
  PARTICIPANT_LEFT: 'participant:left',
  PARTICIPANT_DIED: 'participant:died',

  // 技能事件
  SKILL_USED: 'skill:used',
  SKILL_MISSED: 'skill:missed',
  SKILL_CRITICAL: 'skill:critical',

  // 状态效果事件
  EFFECT_APPLIED: 'effect:applied',
  EFFECT_REMOVED: 'effect:removed',
  EFFECT_EXPIRED: 'effect:expired',

  // 性能事件
  PERFORMANCE_METRIC: 'performance:metric',
  RESOURCE_WARNING: 'resource:warning',
} as const
