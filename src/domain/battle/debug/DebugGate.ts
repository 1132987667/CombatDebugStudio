/**
 * 调试门控 — 按阶段暂停战斗循环，等待用户"下一步"指令
 *
 * 核心机制：
 * - enabled = false（默认）→ waitIfNeeded() 立即返回，零开销
 * - enabled = true  → waitIfNeeded() 创建一个 Promise，暂停 async 执行流
 *                      直到 UI 调用 nextStep() 才释放
 *
 * UI 层通过 eventBus 事件 'debug-pause' 感知暂停并展示覆盖层
 */
import { eventBus } from '@/main'

export class DebugGate {
  /** 调试模式开关 */
  enabled = false
  /** 当前暂停的阶段（null = 未暂停） */
  waitingPhase: string | null = null
  /** 等待中的 Promise resolve 函数 */
  private _resolve: (() => void) | null = null

  /**
   * 启用/禁用调试模式。
   * 禁用时自动释放任何正在等待的暂停，防止战斗卡死。
   */
  setEnabled(v: boolean): void {
    this.enabled = v
    if (!v) this.nextStep()
  }

  /**
   * 如果调试模式开启，在此阶段暂停战斗循环。
   * @param phase 阶段标识，如 'BATTLE_START' / 'TURN_START' / 'TURN_END' / 'BATTLE_END'
   */
  async waitIfNeeded(phase: string): Promise<void> {
    if (!this.enabled) return
    this.waitingPhase = phase
    eventBus.emit('debug-pause' as any, { phase })
    return new Promise((resolve) => {
      this._resolve = resolve
    })
  }

  /** UI 层调用：继续执行到下一个暂停点 */
  nextStep(): void {
    this.waitingPhase = null
    eventBus.emit('debug-pause-resume' as any, {})
    const resolve = this._resolve
    this._resolve = null
    resolve?.()
  }

  /** 是否正在等待用户操作 */
  isWaiting(): boolean {
    return this._resolve !== null
  }
}

/** 全局单例，domain 层和 UI 层共享同一实例 */
export const debugGate = new DebugGate()
