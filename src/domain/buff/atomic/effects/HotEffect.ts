import type { IAtomicEffect, AtomicEffectType } from '../types'
import type { BuffContext } from '@/domain/buff/BuffContext'

/**
 * HotEffect — 持续治疗/回能原语
 *
 * 每回合治疗目标或恢复能量。
 * - healType='flat': 固定值
 * - healType='percent': 百分比最大生命
 * - resource='health' 治疗生命，'energy' 恢复能量
 */
export class HotEffect implements IAtomicEffect {
  readonly type: AtomicEffectType = 'hot'

  onApply(_ctx: BuffContext, _params: Record<string, unknown>): void {
    // HOT 不在施加时生效
  }

  onRemove(_ctx: BuffContext, _params: Record<string, unknown>): void {
    // 无持久状态需要清理
  }

  onTick(ctx: BuffContext, params: Record<string, unknown>, _turn: number): void {
    const healType = params.healType as 'flat' | 'percent'
    const value = params.value as number
    const resource = (params.resource as string) ?? 'health'
    const buffSystem = ctx.getBuffSystem()
    if (!buffSystem) return

    if (resource === 'health') {
      if (healType === 'percent') {
        // 百分比治疗：通过负 damagePercent 实现
        buffSystem.requestDamage(ctx.characterId, 0, undefined, -Math.abs(value) / 100)
      } else {
        const stacks = ctx.getVariable<number>('_stacks') ?? 1
        buffSystem.requestHeal(ctx.characterId, value * stacks)
      }
    }
    // energy 类型的恢复暂未实现，预留扩展点
  }

  getEffectLines(_ctx: BuffContext, params: Record<string, unknown>) {
    const value = params.value as number
    const type = params.healType as string
    const resource = (params.resource as string) ?? 'health'
    const suffix = type === 'percent' ? '% 最大' : ' 点'
    const resourceLabel = resource === 'energy' ? '能量' : '生命'
    return [{
      text: `每回合恢复 ${value}${suffix} ${resourceLabel}`,
      kind: 'hot' as const,
    }]
  }
}
