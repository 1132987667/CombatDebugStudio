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
import { dealDotDamage, healPercentMaxHp, healLowestHpAlly, healAllAllies } from '@/domain/buff/triggers/index'
import type { TriggerExecutionContext } from '@/domain/buff/BuffSystem'
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

  it('dealDotDamage：percent 传 damagePercent 参数位 + origin=dot（修复参数错位）', () => {
    const calls: unknown[][] = []
    const buffSystem = { requestDamage: (...args: unknown[]) => calls.push(args) }
    const ctx = {
      targetId: 'e1',
      params: { percent: 0.1 },
      buffSystem,
    } as unknown as TriggerExecutionContext
    dealDotDamage(ctx)
    // 修复前：['e1', 0, 0.1]（percent 落入 rawDamage 位，BattleSystem 回调不命中任何分支）
    // 修复后：percent 落入 damagePercent 位，origin='dot' 使伤害补发 dot 事件
    expect(calls[0]).toEqual(['e1', 0, undefined, 0.1, 'dot'])
  })

  it('healPercentMaxHp：负值传 damagePercent 参数位（修复参数错位，原为静默 no-op）', () => {
    const calls: unknown[][] = []
    const buffSystem = { requestDamage: (...args: unknown[]) => calls.push(args) }
    const ctx = {
      targetId: 'a1',
      params: { percent: 0.05 },
      buffSystem,
    } as unknown as TriggerExecutionContext
    healPercentMaxHp(ctx)
    // 修复前：['a1', 0, -0.05]（负数落入 rawDamage 位且 damage=0，回调三分支全不命中）
    // 修复后：负值落入 damagePercent 位 → BattleSystem 负百分比分支按最大气血百分比治疗
    expect(calls[0]).toEqual(['a1', 0, undefined, -0.05])
  })

  it('healLowestHpAlly：治疗本队血量最低队友（负 damagePercent 位）', () => {
    const calls: unknown[][] = []
    const buffSystem = { requestDamage: (...args: unknown[]) => calls.push(args) }
    const participants = new Map([
      ['a1', { id: 'a1', team: 'ally', isAlive: () => true, getAttribute: () => 500 }],
      ['a2', { id: 'a2', team: 'ally', isAlive: () => true, getAttribute: () => 100 }],
      ['e1', { id: 'e1', team: 'enemy', isAlive: () => true, getAttribute: () => 1 }],
    ])
    const ctx = {
      targetId: 'a1',
      sourceId: 'a1',
      params: { percentMaxHp: 0.08 },
      buffSystem,
      battleData: { participants },
    } as unknown as TriggerExecutionContext
    healLowestHpAlly(ctx)
    expect(calls).toHaveLength(1)
    // e1 血量更低但属敌方，不得入选
    expect(calls[0]).toEqual(['a2', 0, undefined, -0.08])
  })

  it('healAllAllies：治疗全队每个存活队友（负 damagePercent 位）', () => {
    const calls: unknown[][] = []
    const buffSystem = { requestDamage: (...args: unknown[]) => calls.push(args) }
    const participants = new Map([
      ['a1', { id: 'a1', team: 'ally', isAlive: () => true, getAttribute: () => 500 }],
      ['a2', { id: 'a2', team: 'ally', isAlive: () => true, getAttribute: () => 300 }],
      ['dead', { id: 'dead', team: 'ally', isAlive: () => false, getAttribute: () => 0 }],
    ])
    const ctx = {
      targetId: 'a1',
      sourceId: 'a1',
      params: { percentMaxHp: 0.03 },
      buffSystem,
      battleData: { participants },
    } as unknown as TriggerExecutionContext
    healAllAllies(ctx)
    expect(calls.map((c) => c[0])).toEqual(['a1', 'a2'])
    expect(calls[0]).toEqual(['a1', 0, undefined, -0.03])
    expect(calls[1]).toEqual(['a2', 0, undefined, -0.03])
  })
})
