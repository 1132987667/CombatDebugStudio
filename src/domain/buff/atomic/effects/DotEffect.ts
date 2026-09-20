import { type IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'

/**
 * DotEffect — 持续伤害原语
 *
 * 每回合对目标造成伤害。
 * - damageType='flat': 固定值伤害 × 层数
 * - damageType='percent': 百分比最大生命伤害（通过 requestDamage 的 damagePercent 参数）
 * - damageType='attack_percent': 施加者攻击百分比伤害（施加时快照 _source_attack，法宝灼烧用）
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
    const damageType = params.damageType as 'flat' | 'percent' | 'attack_percent'
    const value = params.value as number
    const buffSystem = ctx.getBuffSystem()
    if (!buffSystem) return

    const stacks = ctx.getVariable<number>('_stacks') ?? 1
    if (damageType === 'percent') {
      // 百分比伤害随层数缩放（−3 层 = 3 倍百分比），与 flat 模式的 value × stacks 语义一致
      buffSystem.requestDamage(ctx.characterId, 0, undefined, (value / 100) * stacks, 'dot')
    } else if (damageType === 'attack_percent') {
      const sourceAttack = ctx.getVariable<number>('_source_attack') ?? 0
      buffSystem.requestDamage(
        ctx.characterId,
        Math.round(sourceAttack * (value / 100) * stacks),
        undefined,
        undefined,
        'dot',
      )
    } else {
      buffSystem.requestDamage(ctx.characterId, value * stacks, undefined, undefined, 'dot')
    }
  }

  getEffectLines(_ctx: BuffContext, params: Record<string, unknown>) {
    const value = params.value as number
    const type = params.damageType as string
    const suffix =
      type === 'percent' ? '% 最大生命' : type === 'attack_percent' ? '% 施加者攻击' : ' 点'
    return [{
      text: `每回合失去 ${value}${suffix} 生命`,
      kind: AtomicEffectType.DOT,
    }]
  }
}
