import { type IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'
import { ModifierTemplate } from '@/domain/skill/types'
/**
 * AuraEffect — 光环原语
 *
 * 为目标角色（self/allies/enemies）施加修饰符。
 * self 目标的光环在 BuffSystem.applyBuffAuraModifiers 中处理，
 * allies/enemies 由 BattleSystem 在初始化时分发。
 * 
 * 注意：所有角色的光环修饰符都用该 Buff 实例的 instanceId 作为 sourceKey，
 * 移除时通过 ctx.removeModifiers() 清理全部。
 */
export class AuraEffect implements IAtomicEffect {
  readonly type: AtomicEffectType = AtomicEffectType.AURA

  onApply(ctx: BuffContext, params: Record<string, unknown>): void {
    const targetSelector = params.targetSelector as string | undefined
    // self 目标的光环由 addBuff 阶段处理（applyBuffAuraModifiers）
    // 这里作为标记和方法扩展点
    if (targetSelector === 'self') {
      this.applySelfAura(ctx, params)
    }
    // allies/enemies 由 BattleSystem 统一分发，此处不重复处理
  }

  onRemove(_ctx: BuffContext, _params: Record<string, unknown>): void {
    // NOTE: 修饰符清理由 BuffSystem.removeBuff 的 modifierStack.removeModifier(instanceId) 统一处理
    // 此处不再重复调用 ctx.removeModifiers()
  }

  private applySelfAura(ctx: BuffContext, params: Record<string, unknown>): void {
    const modifiers = params.modifiers as ModifierTemplate[] | undefined
    if (!modifiers) return

    for (const mod of modifiers) {
      // aura 的 PERCENTAGE value 由配置显式声明（百分数，如 15 表示 15%），无需运行时换算
      ctx.addModifier(mod.targetAttribute, mod.value, mod.type)
    }
  }

  getEffectLines(_ctx: BuffContext, params: Record<string, unknown>) {
    const targetSelector = params.targetSelector as string
    const targetLabel = targetSelector === 'self' ? '自身' : targetSelector === 'allies' ? '队友' : '敌人'
    return [{
      text: `光环: 影响${targetLabel}`,
      kind: AtomicEffectType.AURA,
    }]
  }
}
