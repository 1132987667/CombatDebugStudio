/**
 * 文件: TriggerEventBus.ts
 * 创建日期: 2026-04-10
 * 作者: CombatDebugStudio
 * 功能: 战斗触发器事件总线
 * 描述: 提供轻量级的类型安全事件分发机制，用于战斗触发器系统
 * 版本: 2.0.0 — 实现 IDomainEventBus 端口接口
 */

import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import type { BattleTriggerPhase } from '@/domain/battle/type/types'
import type { TriggerEventContext } from '@/domain/battle/type/types'

/**
 * 事件监听器类型
 */
export type TriggerEventListener = (context: TriggerEventContext) => void

/**
 * 监听器项接口
 */
interface ListenerItem {
  /** 监听器唯一ID */
  id: string
  /** 监听器回调函数 */
  callback: TriggerEventListener
  /** 监听器所属的Buff实例ID（用于批量移除） */
  buffInstanceId?: string
}

/**
 * 触发器事件总线
 * 提供轻量级的类型安全事件分发机制
 * 专门用于战斗触发器系统，与全局 eventBus 分离
 *
 * 实现 IDomainEventBus 端口接口，作为领域层唯一事件总线。
 * 保留 typed emit/on 重载（BattleTriggerPhase × TriggerEventContext）
 * 以满足 Buff 触发器的类型安全需求，同时通过泛型接口与其他领域代码互通。
 */
export class TriggerEventBus implements IDomainEventBus {
  /** 监听器映射：阶段 -> 监听器集合 */
  private listeners: Map<string, Set<ListenerItem>> = new Map()
  /** 监听器ID计数器 */
  private listenerIdCounter: number = 0
  /** 调试模式标志 */
  private _debugMode: boolean = false

  /**
   * 注册事件监听器
   * @param phase 触发阶段
   * @param callback 回调函数
   * @param listenerId Buff实例ID（可选，用于批量移除）
   */
  /** typed 重载：Buff 触发器专用（BattleTriggerPhase × TriggerEventContext） */
  public on(
    phase: BattleTriggerPhase,
    callback: TriggerEventListener,
    listenerId?: string,
  ): void
  /** 泛型实现：IDomainEventBus 端口契约 */
  public on(
    phase: string,
    callback: (...args: any[]) => void,
    listenerId?: string,
  ): void {
    const id = listenerId ?? `trigger_listener_${++this.listenerIdCounter}`
    if (!this.listeners.has(phase)) {
      this.listeners.set(phase, new Set())
    }
    this.listeners.get(phase)!.add({
      id,
      callback: callback as TriggerEventListener,
      buffInstanceId: listenerId,
    })

    if (this._debugMode) {
      console.log(`[TriggerEventBus] 注册监听器: ${phase} -> ${id}`)
    }
  }

  /**
   * 按处理器引用取消订阅
   * @param event 事件名称
   * @param handler 此前注册的处理器
   */
  public off(event: string, handler: (...args: unknown[]) => void): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const item of set) {
      if (item.callback === handler) {
        set.delete(item)
        if (this._debugMode) {
          console.log(`[TriggerEventBus] 移除监听器: ${event}`)
        }
        return
      }
    }
  }

  /**
   * 移除指定 listenerId 的所有监听器
   * @param listenerId Buff实例ID
   * @returns 移除的监听器数量
   */
  public offByListenerId(listenerId: string): number {
    let removedCount = 0
    this.listeners.forEach((set) => {
      const toRemove: ListenerItem[] = []
      for (const item of set) {
        if (item.buffInstanceId === listenerId || item.id === listenerId) {
          toRemove.push(item)
        }
      }
      for (const item of toRemove) {
        set.delete(item)
        removedCount++
      }
    })

    if (this._debugMode && removedCount > 0) {
      console.log(`[TriggerEventBus] 移除监听器 ${listenerId} 的 ${removedCount} 个监听器`)
    }

    return removedCount
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param context 事件上下文
   */
  /** typed 重载：Buff 触发器专用（BattleTriggerPhase × TriggerEventContext） */
  public emit(phase: BattleTriggerPhase, context: TriggerEventContext): void
  /** 泛型实现：IDomainEventBus 端口契约 */
  public emit(event: string, context?: unknown): void {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return

    const listeners = Array.from(set)

    if (this._debugMode) {
      console.log(`[TriggerEventBus] 触发事件: ${event}`, context)
    }

    for (const { callback } of listeners) {
      try {
        callback(context as TriggerEventContext)
      } catch (error) {
        console.error(`[TriggerEventBus] 事件 ${event} 监听器执行出错:`, error)
      }
    }
  }

  /**
   * 检查指定阶段是否有监听器
   * @param phase 触发阶段
   */
  public hasListeners(phase: string): boolean {
    const set = this.listeners.get(phase)
    return set !== undefined && set.size > 0
  }

  /**
   * 获取指定阶段的监听器数量
   * @param phase 触发阶段
   */
  public getListenerCount(phase: string): number {
    return this.listeners.get(phase)?.size ?? 0
  }

  /**
   * 获取所有监听器总数
   */
  public getTotalListenerCount(): number {
    let total = 0
    this.listeners.forEach((set) => {
      total += set.size
    })
    return total
  }

  /**
   * 清除所有监听器（用于战斗结束重置）
   */
  public clear(): void {
    this.listeners.clear()
    if (this._debugMode) {
      console.log('[TriggerEventBus] 清除所有监听器')
    }
  }

  /**
   * 设置调试模式
   * @param enabled 是否启用
   */
  public setDebugMode(enabled: boolean): void {
    this._debugMode = enabled
  }

  /**
   * 检查是否处于调试模式
   */
  public isDebugMode(): boolean {
    return this._debugMode
  }
}

/** 全局触发器事件总线实例 */
export const triggerEventBus = new TriggerEventBus()
