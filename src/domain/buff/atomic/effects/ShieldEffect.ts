import type { IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'

/**
 * ShieldEffect — 护盾原语
 *
 * 通过 BuffSystem 的护盾值管理接口实现。
 * - valueType='flat': 固定护盾值
 * - valueType='percent_max_hp': 基于最大生命值的百分比护盾（依赖
 *   BuffContext.getCharacter() 的实现——当前返回 undefined 因此值为 0）
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
      // HACK: BuffContext.getCharacter() 尚未实现，此时值为 0；
      // 待 getCharacter 接入后自动生效，无需修改此文件
      const maxHp = ctx.getAttributeValue('maxHealth')
      shieldAmount = Math.round(maxHp * value / 100)
    } else {
      shieldAmount = value
    }

    const current = buffSystem.getShieldValue(ctx.characterId)
    buffSystem.setShieldValue(ctx.characterId, current + shieldAmount)
  }

  onRemove(ctx: BuffContext, params: Record<string, unknown>): void {
    const value = params.value as number
    const valueType = (params.valueType as string) ?? 'flat'
    const buffSystem = ctx.getBuffSystem()
    if (!buffSystem) return

    let shieldAmount: number
    if (valueType === 'percent_max_hp') {
      const maxHp = ctx.getAttributeValue('maxHealth')
      shieldAmount = Math.round(maxHp * value / 100)
    } else {
      shieldAmount = value
    }

    const current = buffSystem.getShieldValue(ctx.characterId)
    buffSystem.setShieldValue(ctx.characterId, Math.max(0, current - shieldAmount))
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
