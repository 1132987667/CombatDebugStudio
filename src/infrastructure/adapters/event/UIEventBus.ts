import mitt, { type Emitter } from 'mitt'
import type { BattleEvents } from '@/domain/battle/type/BattleEventType'
import type { IUIEventPort } from '@/domain/port/IUIEventPort'

/**
 * UI 事件总线 — IUIEventPort 的实现
 *
 * 职责：
 * - 实现 IUIEventPort（emit only），供领域层通过 DI 注入使用
 * - 暴露 getEmitter() 返回 mitt Emitter，供 UI 层（Vue/Pinia）订阅
 * - 生命周期与应用一致（全局单例），无需按战斗清理
 */
export class UIEventBus implements IUIEventPort {
  private emitter: Emitter<BattleEvents>

  constructor() {
    this.emitter = mitt<BattleEvents>()
  }

  emit(event: string, payload?: unknown): void {
    // NOTE: IUIEventPort 契约接受 string 事件名；mitt 的泛型映射要求 payload 与事件码逐一对应，
    // string → keyof 的宽度差只能经断言弥合，运行时正确性由事件码约定保证
    this.emitter.emit(event as keyof BattleEvents, payload as any)
  }

  /** 供 UI 层（Vue/Pinia）订阅事件 */
  getEmitter(): Emitter<BattleEvents> {
    return this.emitter
  }
}
