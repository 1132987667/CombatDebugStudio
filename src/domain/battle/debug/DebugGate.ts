/**
 * 调试门控 — 阶段暂停调试
 *
 * 开启后，每次经过阶段断点（BATTLE_START / TURN_START / TURN_END / BATTLE_END）
 * 暂停战斗循环，发射 'debug-pause' 事件，等待 UI 调用 nextStep() 后继续。
 *
 * UI 层通过 eventBus 事件 'debug-pause' 感知暂停并展示浮动面板。
 */
import { eventBus } from '@/main'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'

export class DebugGate {
  /** 调试模式开关 */
  enabled = false
  /** 当前暂停的阶段（null = 未暂停） */
  waitingPhase: string | null = null
  /** 等待中的 Promise resolve 函数 */
  private _resolve: (() => void) | null = null

  setEnabled(v: boolean): void {
    this.enabled = v
    eventBus.emit(BattleEventCodes.DEBUG_TOGGLE, { enabled: v })
    if (!v) this.nextStep()
  }

  /** 暂停战斗循环，等待 UI 点击"下一步" */
  async waitIfNeeded(phase: string): Promise<void> {
    if (!this.enabled) return
    this.waitingPhase = phase
    eventBus.emit(BattleEventCodes.DEBUG_PAUSE, { phase })
    return new Promise((resolve) => {
      this._resolve = resolve
    })
  }

  /** UI 层调用：继续执行到下一个暂停点 */
  nextStep(): void {
    this.waitingPhase = null
    const resolve = this._resolve
    this._resolve = null
    resolve?.()
    // NOTE: 必须通知 UI 清除"暂停中"状态，否则 debugPhase 只进不出
    eventBus.emit(BattleEventCodes.DEBUG_PAUSE_RESUME)
  }

  /** 是否正在等待用户操作 */
  isWaiting(): boolean {
    return this._resolve !== null
  }
}

/** 全局单例，domain 层和 UI 层共享同一实例 */
export const debugGate = new DebugGate()
