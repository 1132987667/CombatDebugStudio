/**
 * seeded-rng 测试 — 配置生成侧确定性随机源（§5.6）
 *
 * 覆盖：
 * - 确定性：同种子（number / string）两次抽样序列逐位一致；不同种子序列不同
 * - 边界：next ∈ [0,1)、int 闭区间全覆盖且不越界、单点区间恒定值
 * - pick：空数组抛错、单元素恒返回、大样本全覆盖
 * - weighted：零权重项永不出现、大样本频率比收敛（大数定律）、全零退化等概率、空候选抛错
 * - rngFn：函数式签名与结构化接口消耗同一实例、序列一致
 *
 * 运行: npx vitest run tests/unit/seeded-rng.test.ts
 */
import { describe, it, expect } from 'vitest'
import { createRng, rngFn } from '@/shared/utils/seeded-rng'

function sample(fn: () => number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(fn())
  return out
}

describe('createRng 确定性', () => {
  it('同 number 种子两次抽样序列逐位一致', () => {
    const a = createRng(42)
    const b = createRng(42)
    const sa = sample(() => a.next(), 1000)
    const sb = sample(() => b.next(), 1000)
    expect(sa).toEqual(sb)
  })

  it('同 string 种子同样确定性', () => {
    const a = createRng('fengshen-gen')
    const b = createRng('fengshen-gen')
    expect(sample(() => a.int(0, 999), 100)).toEqual(sample(() => b.int(0, 999), 100))
  })

  it('不同种子序列不同', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(sample(() => a.next(), 100)).not.toEqual(sample(() => b.next(), 100))
  })

  it('next() 始终落在 [0, 1)', () => {
    const rng = createRng(7)
    for (const v of sample(() => rng.next(), 5000)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('int 边界', () => {
  it('int(1, 5) 采样只出现 1~5 且全覆盖', () => {
    const rng = createRng(11)
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(1, 5)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(5)
      expect(Number.isInteger(v)).toBe(true)
      seen.add(v)
    }
    expect(seen.size).toBe(5)
  })

  it('单点区间 int(3, 3) 恒为 3', () => {
    const rng = createRng(13)
    expect(sample(() => rng.int(3, 3), 50).every((v) => v === 3)).toBe(true)
  })
})

describe('pick', () => {
  it('空数组抛错', () => {
    const rng = createRng(1)
    expect(() => rng.pick([])).toThrow()
  })

  it('单元素数组恒返回该元素', () => {
    const rng = createRng(2)
    expect(rng.pick(['only'])).toBe('only')
  })

  it('大样本覆盖全部候选', () => {
    const rng = createRng(3)
    const seen = new Set(sample(() => rng.pick(['a', 'b', 'c', 'd']), 400))
    expect(seen.size).toBe(4)
  })
})

describe('weighted', () => {
  it('空候选抛错', () => {
    const rng = createRng(1)
    expect(() => rng.weighted([])).toThrow()
  })

  it('零权重项永不出现', () => {
    const rng = createRng(5)
    const items = [
      { item: 'never', weight: 0 },
      { item: 'always', weight: 10 },
    ]
    for (let i = 0; i < 1000; i++) {
      expect(rng.weighted(items)).toBe('always')
    }
  })

  it('大样本频率比收敛到权重比（1:3，容差 ±5%）', () => {
    const rng = createRng(9)
    const items = [
      { item: 'a' as const, weight: 1 },
      { item: 'b' as const, weight: 3 },
    ]
    let a = 0
    const n = 10000
    for (let i = 0; i < n; i++) if (rng.weighted(items) === 'a') a++
    const ratioA = a / n
    expect(ratioA).toBeGreaterThan(0.20)
    expect(ratioA).toBeLessThan(0.30)
  })

  it('全零权重退化为等概率', () => {
    const rng = createRng(21)
    const items = [
      { item: 'x' as const, weight: 0 },
      { item: 'y' as const, weight: 0 },
    ]
    const seen = new Set(sample(() => rng.weighted(items), 200))
    expect(seen.size).toBe(2)
  })
})

describe('rngFn 函数式适配', () => {
  it('与结构化接口消耗同一实例：序列一致', () => {
    const a = createRng(77)
    const b = createRng(77)
    const fn = rngFn(a)
    expect(sample(fn, 100)).toEqual(sample(() => b.next(), 100))
  })
})
