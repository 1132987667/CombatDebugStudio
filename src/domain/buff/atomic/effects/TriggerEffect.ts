import { IAtomicEffect, AtomicEffectType } from '@/domain/buff/atomic/types'
import type { BuffContext } from '@/domain/buff/BuffContext'

/**
 * TriggerEffect — 条件触发原语
 *
 * 桥接到现有 TriggerEventBus 系统。
 * 通过 BuffSystem.registerTriggersForInstance 注册配置 triggers。
 * 
 * 这里不做重复注册——triggers 数组仍然由 BuffSystem 的现有逻辑处理。
 * 此原语用作 facets 派生和 UI 显示。
 */
export class TriggerEffect implements IAtomicEffect {
  readonly type: AtomicEffectType = AtomicEffectType.TRIGGER

  onApply(_ctx: BuffContext, _params: Record<string, unknown>): void {
    // 触发器注册由 BuffSystem.addBuff 中的 registerTriggersForInstance 处理
  }

  onRemove(_ctx: BuffContext, _params: Record<string, unknown>): void {
    // 触发器注销由 BuffSystem.removeBuff 中的 unregisterTriggersForInstance 处理
  }

  getEffectLines(_ctx: BuffContext, params: Record<string, unknown>) {
    const scriptId = params.scriptId as string | undefined
    if (scriptId) {
      return [{ text: `触发效果: ${scriptId}`, kind: AtomicEffectType.TRIGGER }]
    }
    return [{ text: '条件触发', kind: AtomicEffectType.TRIGGER }]
  }
}
