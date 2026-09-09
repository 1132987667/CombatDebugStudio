/**
 * seeded-rng.ts — 配置生成侧确定性随机源（封神榜数值体系扩展 §5.6）
 *
 * 只服务「配置生成」域（装备批量生成 / 掉落模拟）：结果可复现、bug 可回放、
 * 验收断言可写固定种子。战斗内随机不在本文件范围——引擎已有 seed → battleData.rng
 * 机制（seeded-battle-determinism.test.ts 锁定），两域不强行统一。
 *
 * NOTE: 算法用 mulberry32（纯 32 位整数运算），不复用引擎 SeededRandom——其 LCG 的
 *       `seed * 1103515245` 乘积约 2^71，超出 JS 浮点安全整数（2^53）后低位精度丢失，
 *       实测 weighted 抽样频率存在系统性偏差（10000 样本期望 25% 实测 16%）。
 *       战斗域不动它（回放契约锁定）；配置生成域对分布质量有验收要求，故另起炉灶。
 */

/** 配置生成随机源：结构化接口（int/pick/weighted 覆盖生成器全部抽样形态） */
export interface Rng {
  /** [0, 1) 均匀随机 */
  next(): number
  /** [min, max] 闭区间整数 */
  int(min: number, max: number): number
  /** 等概率取一（空数组抛错——调用方应先保证候选池非空） */
  pick<T>(arr: ReadonlyArray<T>): T
  /** 按权重取一（权重 ≤0 的项永不出现；全零退化等概率） */
  weighted<T>(items: ReadonlyArray<{ item: T; weight: number }>): T
}

/** 字符串种子 → 32 位哈希（djb2 变体，同串同值即可，无密码学要求） */
function hashSeed(str: string): number {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  return h >>> 0
}

export function createRng(seed: number | string): Rng {
  let s = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number): number => Math.floor(next() * (max - min + 1)) + min
  return {
    next,
    int,
    pick: <T>(arr: ReadonlyArray<T>): T => {
      if (!arr.length) throw new Error('Rng.pick: 候选数组为空')
      return arr[int(0, arr.length - 1)]
    },
    weighted: <T>(items: ReadonlyArray<{ item: T; weight: number }>): T => {
      if (!items.length) throw new Error('Rng.weighted: 候选为空')
      const weights = items.map((it) => Math.max(0, it.weight))
      const total = weights.reduce((s, w) => s + w, 0)
      if (total <= 0) return items[int(0, items.length - 1)].item
      let roll = next() * total
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i]
        if (roll < 0) return items[i].item
      }
      return items[items.length - 1].item
    },
  }
}

/** 适配 gear-generate 等纯函数的函数式随机源签名（() => number） */
export function rngFn(rng: Rng): () => number {
  return () => rng.next()
}
