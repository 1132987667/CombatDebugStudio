import {
  ModifierType,
  ModifierSourceType,
  type ATTRIBUTE_CODE,
  type Modifier,
  type IModifierStack,
} from '@/domain/attribute/types'

/** 带版本号的缓存条目 */
interface CacheEntry<T> {
  version: number
  value: T
}

/**
 * 修饰符堆栈 —— 按属性存储修饰符，作为 ParticipantStats 的单一数据源
 *
 * 延迟计算 + 版本缓存：
 * - 数据层保持"声明式数据块"（每个 buff 实例对每个属性的修饰声明），增删变更时递增 version
 * - getModifiers() 是"延迟计算"——首次查询聚合结果并缓存，version 未变时直接返回缓存引用（O(1)）
 * - 战斗高频路径（BattleParticipantImpl.recalcAll → getModifiers(code)）在 Buff 无增删时
 *   不再随 Buff 数量线性扫描，仅变更（add/remove，低频）时重建。
 *
 * 返回的缓存数组为只读契约——调用方不得修改（BattleParticipantImpl 消费时均通过 map 重建新数组）。
 */
export class ModifierStack implements IModifierStack {
  private modifiers = new Map<string, Modifier[]>()

  /** 版本戳——任何增删变更时递增，getModifiers/getModifierCount 缓存据此失效 */
  private version = 0
  /** 全量修饰符缓存（getModifiers() 无参） */
  private cachedAll: CacheEntry<Modifier[]> | null = null
  /** 单属性修饰符缓存（getModifiers(code)） */
  private cachedByAttr = new Map<ATTRIBUTE_CODE, CacheEntry<Modifier[]>>()
  /** 修饰符计数缓存 */
  private cachedCount: CacheEntry<number> | null = null

  private invalidate(): void {
    this.version++
    this.cachedAll = null
    this.cachedByAttr.clear()
    this.cachedCount = null
  }

  public addModifier(
    buffInstanceId: string,
    attribute: ATTRIBUTE_CODE,
    value: number,
    type: ModifierType,
  ): void {
    const key = attribute
    if (!this.modifiers.has(key)) {
      this.modifiers.set(key, [])
    }
    const stack = this.modifiers.get(key)!
    stack.push({
      sourceKey: buffInstanceId,
      sourceType: ModifierSourceType.BUFF,
      attribute,
      value,
      type,
    })
    this.invalidate()
  }

  /**
   * 移除修饰符
   * @param buffInstanceId 来源实例 ID
   * @param attribute 可选——指定属性名时仅移除该属性下该 instance 的修饰符
   * @param type 可选——同时指定时仅移除该 instance + 属性 + 类型的修饰符（精确移除，供属性模板值比对重写）
   */
  public removeModifier(
    buffInstanceId: string,
    attribute?: ATTRIBUTE_CODE,
    type?: ModifierType,
  ): void {
    if (attribute) {
      const stack = this.modifiers.get(attribute)
      if (!stack) return
      const filtered = stack.filter(
        (m) =>
          m.sourceKey !== buffInstanceId ||
          (type !== undefined && m.type !== type),
      )
      if (filtered.length === 0) {
        this.modifiers.delete(attribute)
      } else {
        this.modifiers.set(attribute, filtered)
      }
      this.invalidate()
      return
    }
    let changed = false
    for (const [key, stack] of this.modifiers.entries()) {
      const filtered = stack.filter(
        (modifier) => modifier.sourceKey !== buffInstanceId,
      )
      if (filtered.length === 0) {
        this.modifiers.delete(key)
      } else {
        this.modifiers.set(key, filtered)
      }
      changed = true
    }
    if (changed) this.invalidate()
  }

  /**
   * 获取指定属性的修饰符列表
   * NOTE: 返回值为缓存引用，调用方按只读处理（BattleParticipantImpl 通过 map 重建新数组）。
   */
  public getModifiers(attribute?: ATTRIBUTE_CODE): Modifier[] {
    if (attribute) {
      const cached = this.cachedByAttr.get(attribute)
      if (cached && cached.version === this.version) return cached.value
      const stack = this.modifiers.get(attribute) || []
      this.cachedByAttr.set(attribute, { version: this.version, value: stack })
      return stack
    }
    if (this.cachedAll && this.cachedAll.version === this.version) {
      return this.cachedAll.value
    }
    const allModifiers: Modifier[] = []
    for (const stack of this.modifiers.values()) {
      allModifiers.push(...stack)
    }
    this.cachedAll = { version: this.version, value: allModifiers }
    return allModifiers
  }

  public clear(): void {
    this.modifiers.clear()
    this.invalidate()
  }

  public getModifierCount(): number {
    if (this.cachedCount && this.cachedCount.version === this.version) {
      return this.cachedCount.value
    }
    let count = 0
    for (const stack of this.modifiers.values()) {
      count += stack.length
    }
    this.cachedCount = { version: this.version, value: count }
    return count
  }
}
