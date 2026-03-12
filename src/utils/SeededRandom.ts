/**
 * 文件: SeededRandom.ts
 * 创建日期: 2026-03-12
 * 作者: CombatDebugStudio
 * 功能: 带种子的确定性随机数生成器
 * 描述: 用于战斗回放的确定性随机数生成，确保回放结果与原始战斗完全一致
 */

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
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff
    return this.seed / 0x7fffffff
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

  public static generateSeed(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36)
  }
}
