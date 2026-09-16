/**
 * drop-sim.ts — 掉落组试算（纯计算，无引擎/UI 依赖）
 *
 * 职责：对 enemies 行的 drops（chance × 固定 quantity）与 money/exp 奖励区间做数值试算：
 * - 解析口径：单次期望 = chance × quantity；「打 n 次至少出一件」= 1-(1-chance)^n
 * - 模拟口径：按种子跑 N 次伯努利试验给出实测掉率，作为解析值的对照验证
 * 配置里 quantity 为固定值（非区间），方差恒为 0，不输出。
 */

import { SeededRandom } from '@/shared/utils/SeededRandom'
import type { EnemyDrop } from '@/shared/types/enemy'

/** 单条掉落的解析统计 */
export interface DropItemStats {
  itemId: string
  /** 配置掉率（0~1） */
  chance: number
  /** 单次掉落数量（固定值） */
  quantity: number
  /** 单次期望数量 = chance × quantity */
  expected: number
}

/** 奖励区间统计（战斗结算在 [min, max] 内随机取值，期望取中值） */
export interface RewardStats {
  min: number
  max: number
  expected: number
}

export interface DropSimReport {
  items: DropItemStats[]
  money?: RewardStats
  exp?: RewardStats
}

/** 模拟对照结果：N 次试验的实测掉率 */
export interface DropSimObservation {
  trials: number
  /** itemId → 实测掉率（hits/trials） */
  observedRates: Record<string, number>
  moneyObserved?: number
  expObserved?: number
}

/** 打 n 次至少出一件的概率（0~1） */
export function probAtLeastOne(chance: number, n: number): number {
  return 1 - Math.pow(1 - chance, n)
}

/** 解析统计：掉落组 + 奖励区间 */
export function analyzeDrops(drops: EnemyDrop[], money?: [number, number], exp?: [number, number]): DropSimReport {
  const items = drops.map((d) => ({
    itemId: d.itemId,
    chance: d.chance,
    quantity: d.quantity,
    expected: d.chance * d.quantity,
  }))
  const reward = (r?: [number, number]): RewardStats | undefined =>
    r && r.length === 2 ? { min: r[0], max: r[1], expected: (r[0] + r[1]) / 2 } : undefined
  return { items, money: reward(money), exp: reward(exp) }
}

function randInt(rng: SeededRandom, min: number, max: number): number {
  return min >= max ? min : rng.nextInt(min, max)
}

/** 蒙特卡洛对照：同配置跑 trials 次试验，输出实测掉率与奖励均值 */
export function simulateDrops(
  drops: EnemyDrop[],
  trials: number,
  seed?: string,
  money?: [number, number],
  exp?: [number, number],
): DropSimObservation {
  const rng = new SeededRandom(seed ?? SeededRandom.generateSeed())
  const hits: Record<string, number> = {}
  let moneySum = 0
  let expSum = 0
  for (let t = 0; t < trials; t++) {
    for (const d of drops) {
      if (rng.next() < d.chance) hits[d.itemId] = (hits[d.itemId] ?? 0) + 1
    }
    if (money) moneySum += randInt(rng, money[0], money[1])
    if (exp) expSum += randInt(rng, exp[0], exp[1])
  }
  const observedRates: Record<string, number> = {}
  for (const d of drops) observedRates[d.itemId] = (hits[d.itemId] ?? 0) / trials
  return {
    trials,
    observedRates,
    moneyObserved: money ? moneySum / trials : undefined,
    expObserved: exp ? expSum / trials : undefined,
  }
}

// ════ 掉落组聚合：连战多个敌人的总产出试算 ════
// 单敌试算（analyzeDrops）回答「这个怪掉什么」；聚合回答「一关打完总共收获什么」。
// 同一物品出现在多个敌人掉落表时不能把掉率相加（会超过 1），至少一件概率用复合概率 1-∏(1-ci)。

/** 聚合输入：一个敌人的掉落与奖励（与 enemies 行的 drops/money/exp 同构） */
export interface DropSetSource {
  drops: EnemyDrop[]
  money?: [number, number]
  exp?: [number, number]
}

export interface DropSetItemStats {
  itemId: string
  /** 掉落表含该物品的敌人数 */
  sources: number
  /** 连战全部敌人后至少出一件的概率 = 1-∏(1-ci) */
  atLeastOne: number
  /** 连战全部敌人的期望总件数 = Σ ci×qi */
  expectedTotal: number
}

export interface DropSetReport {
  items: DropSetItemStats[]
  /** 奖励逐敌独立 roll，区间与期望直接求和 */
  money?: RewardStats
  exp?: RewardStats
}

export interface DropSetObservation {
  trials: number
  /** itemId → 实测「至少出一件」的轮次占比（同轮多件只计 1） */
  observedAtLeastOne: Record<string, number>
  moneyObserved?: number
  expObserved?: number
}

/** 解析口径聚合：同 itemId 跨敌人合并（至少一件用复合概率，期望直接相加） */
export function aggregateDropSet(sources: DropSetSource[]): DropSetReport {
  const byItem = new Map<string, { sources: number; miss: number; expected: number }>()
  let moneyMin = 0
  let moneyMax = 0
  let expMin = 0
  let expMax = 0
  let hasMoney = false
  let hasExp = false
  for (const s of sources) {
    for (const d of s.drops) {
      const agg = byItem.get(d.itemId) ?? { sources: 0, miss: 1, expected: 0 }
      agg.sources++
      agg.miss *= 1 - d.chance
      agg.expected += d.chance * d.quantity
      byItem.set(d.itemId, agg)
    }
    if (s.money) {
      hasMoney = true
      moneyMin += s.money[0]
      moneyMax += s.money[1]
    }
    if (s.exp) {
      hasExp = true
      expMin += s.exp[0]
      expMax += s.exp[1]
    }
  }
  const items = [...byItem.entries()].map(([itemId, a]) => ({
    itemId,
    sources: a.sources,
    atLeastOne: 1 - a.miss,
    expectedTotal: a.expected,
  }))
  const reward = (min: number, max: number, has: boolean): RewardStats | undefined =>
    has ? { min, max, expected: (min + max) / 2 } : undefined
  return { items, money: reward(moneyMin, moneyMax, hasMoney), exp: reward(expMin, expMax, hasExp) }
}

/** 蒙特卡洛对照：每轮连战全部敌人各 roll 一次，统计「至少出一件」的轮次占比 */
export function simulateDropSet(sources: DropSetSource[], trials: number, seed?: string): DropSetObservation {
  const rng = new SeededRandom(seed ?? SeededRandom.generateSeed())
  const hitRounds: Record<string, number> = {}
  let moneySum = 0
  let expSum = 0
  let hasMoney = false
  let hasExp = false
  for (let t = 0; t < trials; t++) {
    const roundHits = new Set<string>()
    for (const s of sources) {
      for (const d of s.drops) {
        if (rng.next() < d.chance) roundHits.add(d.itemId)
      }
      if (s.money) {
        hasMoney = true
        moneySum += randInt(rng, s.money[0], s.money[1])
      }
      if (s.exp) {
        hasExp = true
        expSum += randInt(rng, s.exp[0], s.exp[1])
      }
    }
    for (const id of roundHits) hitRounds[id] = (hitRounds[id] ?? 0) + 1
  }
  const observedAtLeastOne: Record<string, number> = {}
  for (const [itemId, rounds] of Object.entries(hitRounds)) observedAtLeastOne[itemId] = rounds / trials
  return {
    trials,
    observedAtLeastOne,
    moneyObserved: hasMoney ? moneySum / trials : undefined,
    expObserved: hasExp ? expSum / trials : undefined,
  }
}
