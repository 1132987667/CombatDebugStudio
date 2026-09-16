/**
 * drop-sim 掉落试算测试
 *
 * 验证封神榜「掉落试算」的数值契约：
 * 1. 解析期望 = chance × quantity；奖励区间期望取中值
 * 2. 「打 n 次至少出一件」边界：必掉(1)恒为 1、不掉(0)恒为 0、50% 打 1 次为 0.5
 * 3. 大样本模拟实测掉率收敛到配置值（±3%，10 万次试验）
 * 4. 同种子模拟结果确定
 *
 * 运行: npx vitest run tests/unit/drop-sim.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  aggregateDropSet,
  analyzeDrops,
  probAtLeastOne,
  simulateDropSet,
  simulateDrops,
} from '@/domain/fengshen/drop-sim'
import type { EnemyDrop } from '@/shared/types/enemy'

const drops: EnemyDrop[] = [
  { itemId: 'mat_001', quantity: 2, chance: 0.5 },
  { itemId: 'mat_002', quantity: 1, chance: 0.1 },
  { itemId: 'mat_003', quantity: 3, chance: 1 },
]

describe('drop-sim 掉落试算', () => {
  it('解析统计：期望 = chance × quantity；奖励区间期望取中值', () => {
    const report = analyzeDrops(drops, [10, 30], [5, 15])
    expect(report.items[0].expected).toBe(1) // 0.5 × 2
    expect(report.items[1].expected).toBe(0.1)
    expect(report.items[2].expected).toBe(3) // 必掉 ×3
    expect(report.money).toEqual({ min: 10, max: 30, expected: 20 })
    expect(report.exp).toEqual({ min: 5, max: 15, expected: 10 })
  })

  it('「至少一件」概率边界：必掉恒 1、不掉恒 0、单次 50% 为 0.5', () => {
    expect(probAtLeastOne(1, 1)).toBe(1)
    expect(probAtLeastOne(1, 100)).toBe(1)
    expect(probAtLeastOne(0, 100)).toBe(0)
    expect(probAtLeastOne(0.5, 1)).toBeCloseTo(0.5)
    // 10% 掉率打 50 次，几乎必出（> 99%）
    expect(probAtLeastOne(0.1, 50)).toBeGreaterThan(0.99)
  })

  it('大样本模拟实测掉率收敛到配置值（±3%）', () => {
    const obs = simulateDrops(drops, 100000, 'converge-seed', [10, 30], [5, 15])
    expect(obs.observedRates['mat_001']).toBeGreaterThan(0.47)
    expect(obs.observedRates['mat_001']).toBeLessThan(0.53)
    expect(obs.observedRates['mat_002']).toBeGreaterThan(0.07)
    expect(obs.observedRates['mat_002']).toBeLessThan(0.13)
    expect(obs.observedRates['mat_003']).toBe(1)
    expect(obs.moneyObserved).toBeCloseTo(20, 0)
    expect(obs.expObserved).toBeCloseTo(10, 0)
  })

  it('同种子模拟结果确定', () => {
    const a = simulateDrops(drops, 500, 'seed-x')
    const b = simulateDrops(drops, 500, 'seed-x')
    expect(a.observedRates).toEqual(b.observedRates)
    expect(a.moneyObserved).toBe(b.moneyObserved)
  })
})

describe('drop-sim 掉落组聚合（连战多敌）', () => {
  // 敌 A 与敌 B 都掉 mat_001（0.5/0.5 → 复合至少一件 0.75，期望 1.0 + 0.2 = 1.2？见断言）
  const setA = { drops: [{ itemId: 'mat_001', quantity: 2, chance: 0.5 } as EnemyDrop], money: [10, 30] as [number, number] }
  const setB = { drops: [{ itemId: 'mat_001', quantity: 1, chance: 0.2 } as EnemyDrop, { itemId: 'mat_002', quantity: 1, chance: 1 } as EnemyDrop], exp: [5, 15] as [number, number] }

  it('同 itemId 跨敌合并：至少一件用复合概率（0.5、0.2 → 0.6），期望相加', () => {
    const report = aggregateDropSet([setA, setB])
    const m1 = report.items.find((i) => i.itemId === 'mat_001')!
    expect(m1.sources).toBe(2)
    expect(m1.atLeastOne).toBeCloseTo(1 - 0.5 * 0.8) // 0.6，不是 0.7
    expect(m1.expectedTotal).toBeCloseTo(0.5 * 2 + 0.2 * 1) // 1.2
    const m2 = report.items.find((i) => i.itemId === 'mat_002')!
    expect(m2.sources).toBe(1)
    expect(m2.atLeastOne).toBe(1)
  })

  it('奖励区间逐敌求和；单敌缺失的奖励类型不出现在报告中', () => {
    const report = aggregateDropSet([setA, setB])
    expect(report.money).toEqual({ min: 10, max: 30, expected: 20 })
    expect(report.exp).toEqual({ min: 5, max: 15, expected: 10 })
  })

  it('空输入返回空报告', () => {
    const report = aggregateDropSet([])
    expect(report.items).toEqual([])
    expect(report.money).toBeUndefined()
    expect(report.exp).toBeUndefined()
  })

  it('模拟对照：实测至少一件率收敛到复合概率（±3%），同种子确定', () => {
    const obs = simulateDropSet([setA, setB], 100000, 'agg-seed')
    expect(obs.observedAtLeastOne['mat_001']).toBeGreaterThan(0.57)
    expect(obs.observedAtLeastOne['mat_001']).toBeLessThan(0.63)
    expect(obs.observedAtLeastOne['mat_002']).toBe(1)
    expect(obs.moneyObserved).toBeCloseTo(20, 0)
    expect(obs.expObserved).toBeCloseTo(10, 0)
    const again = simulateDropSet([setA, setB], 100000, 'agg-seed')
    expect(again.observedAtLeastOne).toEqual(obs.observedAtLeastOne)
  })
})
