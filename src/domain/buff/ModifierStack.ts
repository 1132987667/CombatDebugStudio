import { ModifierType, ModifierSourceType, type ATTRIBUTE_CODE, type Modifier, type IModifierStack } from '@/domain/attribute/types'

/**
 * 修饰符堆栈 —— 按属性存储修饰符，作为 ParticipantStats 的单一数据源
 * ponytail: 直接用 Modifier 类型存储（sourceKey = buffInstanceId, sourceType = BUFF），
 *           消除 LocalModifier 与 Modifier 之间的桥接拷贝。
 */
export class ModifierStack implements IModifierStack {
  private modifiers = new Map<string, Modifier[]>()

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
  }

  public removeModifier(buffInstanceId: string): void {
    for (const [key, stack] of this.modifiers.entries()) {
      const filtered = stack.filter(
        (modifier) => modifier.sourceKey !== buffInstanceId,
      )
      if (filtered.length === 0) {
        this.modifiers.delete(key)
      } else {
        this.modifiers.set(key, filtered)
      }
    }
  }

  /**
   * 获取指定属性的修饰符列表
   * ponytail: 返回 Modifier[] 而非 LocalModifier[]，消除桥接类型转换
   */
  public getModifiers(attribute?: ATTRIBUTE_CODE): Modifier[] {
    if (attribute) return this.modifiers.get(attribute) || []
    const allModifiers: Modifier[] = []
    for (const stack of this.modifiers.values()) {
      allModifiers.push(...stack)
    }
    return allModifiers
  }

  public clear(): void {
    this.modifiers.clear()
  }

  public getModifierCount(): number {
    let count = 0
    for (const stack of this.modifiers.values()) {
      count += stack.length
    }
    return count
  }

  /**
   * 计算属性最终值
   * ponytail: 未被调用（ParticipantStats 自行计算），保留接口契约
   */
  public calculate(attribute: ATTRIBUTE_CODE, baseValue: number): number {
    const mods = this.modifiers.get(attribute)
    if (!mods || mods.length === 0) return baseValue
    let result = baseValue
    let additiveSum = 0
    let multiplicativeSum = 1
    for (const modifier of mods) {
      switch (modifier.type) {
        case ModifierType.ADDITIVE: additiveSum += modifier.value; break
        case ModifierType.MULTIPLICATIVE: multiplicativeSum *= 1 + modifier.value; break
        case ModifierType.PERCENTAGE: additiveSum += baseValue * modifier.value; break
      }
    }
    result += additiveSum
    result *= multiplicativeSum
    return result
  }
}
