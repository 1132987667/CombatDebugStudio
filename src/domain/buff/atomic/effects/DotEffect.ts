import { type IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'

/**
 * DotEffect — 持续伤害原语
 *
 * 每回合对目标造成伤害。
 * - damageType='flat': 固定值伤害 × 层数
 * - damageType='percent': 百分比最大生命伤害（通过 requestDamage 的 damagePercent 参数）
 */
export class DotEffect implements IAtomicEffect {
  readonly type: AtomicEffectType = AtomicEffectType.DOT

  onApply(_ctx: BuffContext, _params: Record<string, unknown>): void {
    // DOT 不在施加时生效，在 onTick 中每回合触发
  }

  onRemove(_ctx: BuffContext, _params: Record<string, unknown>): void {
    // 无持久状态需要清理
  }

  onTick(ctx: BuffContext, params: Record<string, unknown>, _turn: number): void {
    const damageType = params.damageType as 'flat' | 'percent'
    const value = params.value as number
    const buffSystem = ctx.getBuffSystem()
    if (!buffSystem) return

    if (damageType === 'percent') {
      buffSystem.requestDamage(ctx.characterId, 0, undefined, value / 100)
    } else {
      const stacks = ctx.getVariable<number>('_stacks') ?? 1
      buffSystem.requestDamage(ctx.characterId, value * stacks)
    }
  }

  getEffectLines(_ctx: BuffContext, params: Record<string, unknown>) {
    const value = params.value as number
    const type = params.damageType as string
    const suffix = type === 'percent' ? '% 最大生命' : ' 点'
    return [{
      text: `每回合失去 ${value}${suffix} 生命`,
      kind: AtomicEffectType.DOT,
    }]
  }
}
