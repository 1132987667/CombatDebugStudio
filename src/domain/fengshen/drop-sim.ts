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
