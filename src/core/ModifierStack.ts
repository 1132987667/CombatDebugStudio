import type { Modifier, ModifierType, AttributeType } from '@/types/modifier'

/**
 * 修饰符堆栈类
 * 负责管理属性修饰符的添加、移除、计算等操作
 * 支持不同类型的修饰符：加法（ADDITIVE）、乘法（MULTIPLICATIVE）、百分比（PERCENTAGE）
 */
export class ModifierStack {
  /** 修饰符映射，以属性名称为键，值为修饰符数组 */
  private modifiers = new Map<string, Modifier[]>()

  /**
   * 添加修饰符
   * @param buffInstanceId Buff实例ID
   * @param attribute 属性名称
   * @param value 修饰值
   * @param type 修饰类型：ADDITIVE（加法）、MULTIPLICATIVE（乘法）、PERCENTAGE（百分比）
   */
  public addModifier(
    buffInstanceId: string,
    attribute: AttributeType,
    value: number,
    type: ModifierType
  ): void {
    const key = attribute
    if (!this.modifiers.has(key)) {
      this.modifiers.set(key, [])
    }

    const stack = this.modifiers.get(key)!
    stack.push({
      buffInstanceId,
      attribute,
      value,
      type
    })
  }

  /**
   * 移除修饰符
   * @param buffInstanceId Buff实例ID
   */
  public removeModifier(buffInstanceId: string): void {
    for (const [key, stack] of this.modifiers.entries()) {
      const filtered = stack.filter(
        (modifier) => modifier.buffInstanceId !== buffInstanceId
      )
      if (filtered.length === 0) {
        this.modifiers.delete(key)
      } else {
        this.modifiers.set(key, filtered)
      }
    }
  }

  /**
   * 计算属性值
   * @param attribute 属性名称
   * @param baseValue 基础属性值
   * @returns 计算后的属性值
   */
  public calculate(attribute: AttributeType, baseValue: number): number {
    const modifiers = this.modifiers.get(attribute)
    if (!modifiers || modifiers.length === 0) {
      return baseValue
    }

    let result = baseValue
    let additiveSum = 0
    let multiplicativeSum = 1

    for (const modifier of modifiers) {
      switch (modifier.type) {
        case 'ADDITIVE':
          additiveSum += modifier.value
          break
        case 'MULTIPLICATIVE':
          multiplicativeSum *= (1 + modifier.value)
          break
        case 'PERCENTAGE':
          additiveSum += baseValue * modifier.value
          break
        default:
          break
      }
    }

    result += additiveSum
    result *= multiplicativeSum

    return result
  }

  /**
   * 获取修饰符列表
   * @param attribute 属性名称（可选），不指定则返回所有修饰符
   * @returns 修饰符数组
   */
  public getModifiers(attribute?: AttributeType): Modifier[] {
    if (attribute) {
      return this.modifiers.get(attribute) || []
    }

    const allModifiers: Modifier[] = []
    for (const stack of this.modifiers.values()) {
      allModifiers.push(...stack)
    }
    return allModifiers
  }

  /**
   * 清空所有修饰符
   */
  public clear(): void {
    this.modifiers.clear()
  }

  /**
   * 获取修饰符数量
   * @returns 修饰符总数
   */
  public getModifierCount(): number {
    let count = 0
    for (const stack of this.modifiers.values()) {
      count += stack.length
    }
    return count
  }
}