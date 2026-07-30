import type { IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ModifierType } from '@/domain/attribute/types'

/**
 * ModifierEffect — 属性修正原语
 *
 * 将 JSON 中的 attributes 字段（如 {"attack": "+10%", "defense": "-5%"}）
 * 解析为 ModifierStack 上的修饰符。
 * perStack=true 时，修饰符值 × 当前层数。
 */
export class ModifierEffect implements IAtomicEffect {
  readonly type: AtomicEffectType = 'modifier'

  onApply(ctx: BuffContext, params: Record<string, unknown>): void {
    const attributes = params.attributes as Record<string, string> | undefined
    if (!attributes) return
    const perStack = (params.perStack as boolean) ?? true
    const stacks = (ctx.getVariable<number>('_stacks') ?? 1)

    for (const [attr, valueStr] of Object.entries(attributes)) {
      const { value, type } = this.parseValue(valueStr)
      const finalValue = perStack ? value * stacks : value
      ctx.addModifier(attr, finalValue, type)
    }
  }

  onRemove(ctx: BuffContext, _params: Record<string, unknown>): void {
    ctx.removeModifiers()
  }

  onStackChange(ctx: BuffContext, params: Record<string, unknown>, newStacks: number): void {
    ctx.removeModifiers()
    const attributes = params.attributes as Record<string, string> | undefined
    if (!attributes) return
    const perStack = (params.perStack as boolean) ?? true

    for (const [attr, valueStr] of Object.entries(attributes)) {
      const { value, type } = this.parseValue(valueStr)
      const finalValue = perStack ? value * newStacks : value
      ctx.addModifier(attr, finalValue, type)
    }
  }

  getEffectLines(ctx: BuffContext, params: Record<string, unknown>) {
    const attributes = params.attributes as Record<string, string> | undefined
    if (!attributes) return []
    const stacks = ctx.getVariable<number>('_stacks') ?? 1
    return Object.entries(attributes).map(([attr, val]) => ({
      text: `${attr} ${val}${(params.perStack ?? true) && stacks > 1 ? ` ×${stacks}` : ''}`,
      kind: 'modifier' as const,
    }))
  }

  private parseValue(valueStr: string): { value: number; type: ModifierType } {
    const trimmed = valueStr.trim()
    const isPercent = trimmed.includes('%')
    const num = parseFloat(trimmed.replace('%', ''))
    if (isNaN(num)) return { value: 0, type: ModifierType.ADDITIVE }
    if (isPercent) return { value: num, type: ModifierType.PERCENTAGE }
    if (Math.abs(num) < 1) return { value: num * 100, type: ModifierType.PERCENTAGE }
    return { value: num, type: ModifierType.ADDITIVE }
  }
}
