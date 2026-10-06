/**
 * 文件: SeededRandom.ts
 * 创建日期: 2026-03-12
 * 作者: CombatDebugStudio
 * 功能: 带种子的确定性随机数生成器
 * 描述: 用于战斗回放的确定性随机数生成，确保回放结果与原始战斗完全一致
 */

/**
 * 从可选随机源取 [0,1) 随机数；未注入时回退全局 Math.random
 * NOTE: DamageCalculator / PassiveSkillManager / BuffSystem 共用此回退逻辑
 */
export function nextRandom(rng?: SeededRandom): number {
  return rng ? rng.next() : Math.random()
}

export class SeededRandom {
  private seed: number

  constructor(seed: string | number) {
    if (typeof seed === 'string') {
      this.seed = this.hashString(seed)
    } else {
      this.seed = seed
    }
  }

  private hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash)
  }

  public next(): number {
    // mulberry32（纯 32 位整数运算，与 seeded-rng.ts 同算法）。
    // 旧 LCG `seed * 1103515245 + 12345` 乘积超 double 安全整数（2^53），
    // 按位与取低位前精度已丢失，概率判定系统性偏差（期望 25% 实测 16%）。
    // 确定性契约不变：同 seed 序列可复现、restoreSeed 回退语义不受影响；
    // 但序列与旧算法不同——已存战报是记录播放不受影响，仅"旧 seed 重模拟"结果会变。
    this.seed = (this.seed + 0x6d2b79f5) | 0
    let t = this.seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  public nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min
  }

  public nextBoolean(probability: number = 0.5): boolean {
    return this.next() < probability
  }

  public nextItem<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)]
  }

  public shuffle<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i)
      const temp = result[i]
      result[i] = result[j]
      result[j] = temp
    }
    return result
  }

  public getSeed(): number {
    return this.seed
  }

  /** 将内部状态回退到先前导出的种子值（战斗单步回退用；复用同一实例，持有引用的消费方无需重新注入） */
  public restoreSeed(seed: number): void {
    this.seed = seed
  }

  public static generateSeed(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
  }
}
