/**
 * @deprecated Import from '@/infrastructure/adapters/event/TriggerEventBus' instead.
 * This file will become a pure re-export shim in Phase 7.
 */

/**
 * 文件: TriggerEventBus.ts
 * 创建日期: 2026-04-10
 * 作者: CombatDebugStudio
 * 功能: 战斗触发器事件总线
 * 描述: 提供轻量级的类型安全事件分发机制，用于战斗触发器系统
 * 版本: 1.0.0
 */

import type { TriggerPhase, TriggerEventContext } from '@/types/buff'

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
 */
export class TriggerEventBus {
  /** 监听器映射：阶段 -> 监听器集合 */
  private listeners: Map<TriggerPhase, Set<ListenerItem>> = new Map()
  /** 监听器ID计数器 */
  private listenerIdCounter: number = 0
  /** 调试模式标志 */
  private _debugMode: boolean = false

  /**
   * 注册事件监听器
   * @param phase 触发阶段
   * @param callback 回调函数
   * @param buffInstanceId Buff实例ID（可选，用于批量移除）
   * @returns 监听器ID，用于取消注册
   */
  public on(
    phase: TriggerPhase,
    callback: TriggerEventListener,
    buffInstanceId?: string,
  ): string {
    const id = `trigger_listener_${++this.listenerIdCounter}`
    if (!this.listeners.has(phase)) {
      this.listeners.set(phase, new Set())
    }
    this.listeners.get(phase)!.add({ id, callback, buffInstanceId })

    if (this._debugMode) {
      console.log(`[TriggerEventBus] 注册监听器: ${phase} -> ${id}`)
    }

    return id
  }

  /**
   * 取消注册监听器
   * @param phase 触发阶段
   * @param listenerId 监听器ID
   * @returns 是否成功移除
   */
  public off(phase: TriggerPhase, listenerId: string): boolean {
    const set = this.listeners.get(phase)
    if (!set) return false

    for (const item of set) {
      if (item.id === listenerId) {
        set.delete(item)
        if (this._debugMode) {
          console.log(`[TriggerEventBus] 移除监听器: ${phase} -> ${listenerId}`)
        }
        return true
      }
    }
    return false
  }

  /**
   * 移除指定Buff实例的所有监听器
   * @param buffInstanceId Buff实例ID
   * @returns 移除的监听器数量
   */
  public offByBuffInstance(buffInstanceId: string): number {
    let removedCount = 0
    this.listeners.forEach((set) => {
      const toRemove: ListenerItem[] = []
      for (const item of set) {
        if (item.buffInstanceId === buffInstanceId) {
          toRemove.push(item)
        }
      }
      for (const item of toRemove) {
        set.delete(item)
        removedCount++
      }
    })

    if (this._debugMode && removedCount > 0) {
      console.log(`[TriggerEventBus] 移除Buff实例 ${buffInstanceId} 的 ${removedCount} 个监听器`)
    }

    return removedCount
  }

  /**
   * 触发事件
   * @param phase 触发阶段
   * @param context 事件上下文
   */
  public emit(phase: TriggerPhase, context: TriggerEventContext): void {
    const set = this.listeners.get(phase)
    if (!set || set.size === 0) return

    // 复制一份再遍历，防止回调中修改集合
    const listeners = Array.from(set)

    if (this._debugMode) {
      console.log(`[TriggerEventBus] 触发事件: ${phase}`, context)
    }

    for (const { callback } of listeners) {
      try {
        callback(context)
      } catch (error) {
        console.error(`[TriggerEventBus] 事件 ${phase} 监听器执行出错:`, error)
      }
    }
  }

  /**
   * 检查指定阶段是否有监听器
   * @param phase 触发阶段
   * @returns 是否有监听器
   */
  public hasListeners(phase: TriggerPhase): boolean {
    const set = this.listeners.get(phase)
    return set !== undefined && set.size > 0
  }

  /**
   * 获取指定阶段的监听器数量
   * @param phase 触发阶段
   * @returns 监听器数量
   */
  public getListenerCount(phase: TriggerPhase): number {
    return this.listeners.get(phase)?.size ?? 0
  }

  /**
   * 获取所有监听器总数
   * @returns 监听器总数
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
   * @returns 是否处于调试模式
   */
  public isDebugMode(): boolean {
    return this._debugMode
  }
}

/** 全局触发器事件总线实例 */
export const triggerEventBus = new TriggerEventBus()
