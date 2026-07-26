/**
 * 领域事件总线端口接口
 *
 * 领域层通过此端口发布和订阅领域事件，基础设施层提供具体实现。
 * 替代领域层对 eventBus（mitt）和 TriggerEventBus 的直接依赖。
 *
 * 支持两种反注册模式：
 * - off(event, handler)：按处理器引用卸载（mitt 风格，推荐用于临时监听）
 * - offByListenerId(listenerId)：按监听器 ID 批量卸载（TriggerEventBus 风格，用于 Buff 气血周期清理）
 */
export interface IDomainEventBus {
  /**
   * 发布领域事件
   * @param event 事件名称
   * @param payload 事件负载
   */
  emit(event: string, payload?: unknown): void

  /**
   * 订阅领域事件
   * @param event 事件名称
   * @param handler 事件处理器
   * @param listenerId 可选，监听器分组 ID（用于 offByListenerId 批量清理，如 Buff 实例 ID）
   */
  on(
    event: string,
    handler: (...args: unknown[]) => void,
    listenerId?: string,
  ): void

  /**
   * 按处理器引用取消订阅
   * @param event 事件名称
   * @param handler 此前注册的事件处理器
   */
  off(event: string, handler: (...args: unknown[]) => void): void

  /**
   * 按 listenerId 批量取消订阅
   * 用于 Buff 移除时统一反注册所有关联监听器
   * @param listenerId 监听器分组 ID
   */
  offByListenerId(listenerId: string): void
}
