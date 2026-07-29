/**
 * UI 事件端口 — 领域层向 UI 层发射通知的最小化接口
 *
 * 设计原则：
 * - 仅包含 emit，不包含 on/off（领域层不订阅 UI 事件）
 * - 与 IDomainEventBus（领域内部事件，含 on/off/emit）彻底分离
 * - 符合 ISP：领域层只需要发射能力，不需要订阅能力
 * - 符合 DIP：领域层定义接口，基础设施层提供实现
 */
export interface IUIEventPort {
  emit(event: string, payload?: unknown): void
}
