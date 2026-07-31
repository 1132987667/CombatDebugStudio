import { type IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { AttributeValueConfig } from '@/shared/types/buffs-json'

/**
 * ModifierEffect — 属性修正原语
 *
 * 将 JSON 中的 attributes 字段（如 {"attack": { value: 20, type: "PERCENTAGE" }}）
 * 解析为 ModifierStack 上的修饰符。
 * perStack=true 时，修饰符值 × 当前层数。
 * 值格式由配置显式声明（{ value, type }），此处不做任何格式猜测。
 */
export class ModifierEffect implements IAtomicEffect {
  readonly type: AtomicEffectType = AtomicEffectType.MODIFIER

  onApply(ctx: BuffContext, params: Record<string, unknown>): void {
    const attributes = params.attributes as
      | Record<string, AttributeValueConfig>
      | undefined
    if (!attributes) return
    const perStack = (params.perStack as boolean) ?? true
    const stacks = (ctx.getVariable<number>('_stacks') ?? 1)

    for (const [attr, cfg] of Object.entries(attributes)) {
      const finalValue = perStack ? cfg.value * stacks : cfg.value
      ctx.addModifier(attr as ATTRIBUTE_CODE, finalValue, cfg.type)
    }
  }

  onRemove(ctx: BuffContext, _params: Record<string, unknown>): void {
    ctx.removeModifiers()
  }

  onStackChange(ctx: BuffContext, params: Record<string, unknown>, newStacks: number): void {
    ctx.removeModifiers()
    const attributes = params.attributes as
      | Record<string, AttributeValueConfig>
      | undefined
    if (!attributes) return
    const perStack = (params.perStack as boolean) ?? true

    for (const [attr, cfg] of Object.entries(attributes)) {
      const finalValue = perStack ? cfg.value * newStacks : cfg.value
      ctx.addModifier(attr as ATTRIBUTE_CODE, finalValue, cfg.type)
    }
  }

  getEffectLines(ctx: BuffContext, params: Record<string, unknown>) {
    const attributes = params.attributes as
      | Record<string, AttributeValueConfig>
      | undefined
    if (!attributes) return []
    const stacks = ctx.getVariable<number>('_stacks') ?? 1
    return Object.entries(attributes).map(([attr, cfg]) => ({
      text: `${attr} ${cfg.type === 'PERCENTAGE' ? `${cfg.value}%` : cfg.value}${(params.perStack ?? true) && stacks > 1 ? ` ×${stacks}` : ''}`,
      kind: AtomicEffectType.MODIFIER,
    }))
  }
}
