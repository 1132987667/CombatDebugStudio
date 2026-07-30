import type { IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'

/**
 * ShieldEffect — 护盾原语
 *
 * 通过 BuffSystem 的护盾值管理接口实现。
 * - valueType='flat': 固定护盾值
 * - valueType='percent_max_hp': 基于最大生命值的百分比护盾
 *
 * onApply 将实际计算值存储到 _shieldAmount 变量，onRemove 从中读取回收，
 * 避免 Buff 存续期间 maxHealth 变化导致回收量不对称。
 *
 * 护盾值存储在 BuffSystem 的 shieldValues 中，随 Buff 移除而回收。
 */
export class ShieldEffect implements IAtomicEffect {
  readonly type: AtomicEffectType = 'shield'

  onApply(ctx: BuffContext, params: Record<string, unknown>): void {
    const value = params.value as number
    const valueType = (params.valueType as string) ?? 'flat'
    const buffSystem = ctx.getBuffSystem()
    if (!buffSystem) return

    let shieldAmount: number
    if (valueType === 'percent_max_hp') {
      const maxHp = ctx.getAttrVal('maxHealth')
      shieldAmount = Math.round(maxHp * value / 100)
    } else {
      shieldAmount = value
    }

    // 存储实际护盾值，供 onRemove 精确回收
    ctx.setVariable('_shieldAmount', shieldAmount)

    const current = buffSystem.getShieldValue(ctx.characterId)
    buffSystem.setShieldValue(ctx.characterId, current + shieldAmount)
  }

  onRemove(ctx: BuffContext, params: Record<string, unknown>): void {
    const buffSystem = ctx.getBuffSystem()
    if (!buffSystem) return

    // 从变量读取施加时的实际护盾值，而非重新计算
    const shieldAmount = ctx.getVariable<number>('_shieldAmount') ?? 0

    const current = buffSystem.getShieldValue(ctx.characterId)
    const deduction = Math.min(shieldAmount, current)
    buffSystem.setShieldValue(ctx.characterId, current - deduction)
  }

  getEffectLines(_ctx: BuffContext, params: Record<string, unknown>) {
    const value = params.value as number
    const type = params.valueType as string
    const suffix = type === 'percent_max_hp' ? '% 最大生命' : ' 点'
    return [{
      text: `获得 ${value}${suffix} 护盾`,
      kind: 'shield' as const,
    }]
  }
}
