/**
 * percent/flat DOT·HOT 原语层数缩放测试（P2-3）
 *
 * 契约：flat 与 percent 路径的 value 均随层数（_stacks）缩放，Dot 与 Hot 语义一致。
 * - DotEffect percent  → requestDamage(damagePercent = value% × stacks)
 * - DotEffect flat     → requestDamage(damage = value × stacks)
 * - HotEffect percent  → requestDamage(damagePercent = -(value% × stacks))
 * - HotEffect flat     → requestHeal(amount = value × stacks)
 */
import { describe, it, expect } from 'vitest'
import { DotEffect } from '@/domain/buff/atomic/effects/DotEffect'
import { HotEffect } from '@/domain/buff/atomic/effects/HotEffect'
import type { BuffContext } from '@/domain/buff/BuffContext'

function makeCtx(stacks: number) {
  const damageCalls: unknown[][] = []
  const healCalls: unknown[][] = []
  const buffSystem = {
    requestDamage: (...args: unknown[]) => damageCalls.push(args),
    requestHeal: (...args: unknown[]) => healCalls.push(args),
  }
  const ctx = {
    characterId: 'char_1',
    getVariable: (key: string) => (key === '_stacks' ? stacks : undefined),
    getBuffSystem: () => buffSystem,
  }
  return { ctx: ctx as unknown as BuffContext, damageCalls, healCalls }
}

describe('DOT/HOT 层数缩放（P2-3）', () => {
  it('DotEffect percent：5% × 3 层 = 15%', () => {
    const { ctx, damageCalls } = makeCtx(3)
    new DotEffect().onTick(ctx, { damageType: 'percent', value: 5 }, 1)
    expect(damageCalls[0][1]).toBe(0)
    expect(damageCalls[0][3]).toBeCloseTo(0.15)
  })

  it('DotEffect flat：10 × 3 层 = 30', () => {
    const { ctx, damageCalls } = makeCtx(3)
    new DotEffect().onTick(ctx, { damageType: 'flat', value: 10 }, 1)
    expect(damageCalls[0][1]).toBe(30)
  })

  it('HotEffect percent health：-(8% × 3 层) = -24%', () => {
    const { ctx, damageCalls } = makeCtx(3)
    new HotEffect().onTick(ctx, { healType: 'percent', value: 8, resource: 'health' }, 1)
    expect(damageCalls[0][1]).toBe(0)
    expect(damageCalls[0][3]).toBeCloseTo(-0.24)
  })

  it('HotEffect flat health：50 × 2 层 = 100', () => {
    const { ctx, healCalls } = makeCtx(2)
    new HotEffect().onTick(ctx, { healType: 'flat', value: 50, resource: 'health' }, 1)
    expect(healCalls[0][1]).toBe(100)
  })
})
