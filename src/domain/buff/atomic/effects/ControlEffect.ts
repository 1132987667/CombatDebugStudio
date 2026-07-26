import type { IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ControlType } from '@/domain/buff/types'

const CONTROL_NAMES: Record<string, string> = {
  [ControlType.STUN]: '眩晕',
  [ControlType.SILENCE]: '沉默',
  [ControlType.FREEZE]: '冰冻',
  [ControlType.SLEEP]: '睡眠',
  [ControlType.BIND]: '束缚',
}

/**
 * ControlEffect — 控制原语
 *
 * 控制状态由 BuffSystem.getHighestPriorityControlEffect 统一查询，
 * 此处不额外设置运行时状态——config.controlType 已在解析时写入 BuffConfig。
 * 
 * onApply/onRemove 为空操作，控制效果的生命周期由 Buff 自身的 duration
 * 和 stackRule 管理。
 */
export class ControlEffect implements IAtomicEffect {
  readonly type: AtomicEffectType = 'control'

  onApply(_ctx: BuffContext, _params: Record<string, unknown>): void {
    // 控制状态由 BuffSystem.getHighestPriorityControlEffect 统一查询
    // config.controlType 已在 BuffConfigResolver 解析时写入
  }

  onRemove(_ctx: BuffContext, _params: Record<string, unknown>): void {
    // 控制效果随 Buff 移除而自然消失
  }

  getEffectLines(_ctx: BuffContext, params: Record<string, unknown>) {
    const controlType = params.controlType as string
    const name = CONTROL_NAMES[controlType] ?? controlType
    return [{
      text: `无法行动（${name}）`,
      kind: 'control' as const,
    }]
  }
}
