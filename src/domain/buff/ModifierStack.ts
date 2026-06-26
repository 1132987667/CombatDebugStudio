import  { ModifierType, type ATTRIBUTE_CODE } from '@/domain/attribute/types'// ponytail: Modifier type from @/domain/attribute/types lacks buffInstanceId; extend locally

interface LocalModifier {
  buffInstanceId: string
  attribute: ATTRIBUTE_CODE
  value: number
  type: ModifierType
}

export class ModifierStack {
  private modifiers = new Map<string, LocalModifier[]>()
  private cache = new Map<string, number>()

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
    stack.push({ buffInstanceId, attribute, value, type })
    this.cache.delete(key)
  }

  public removeModifier(buffInstanceId: string): void {
    for (const [key, stack] of this.modifiers.entries()) {
      const filtered = stack.filter(
        (modifier) => modifier.buffInstanceId !== buffInstanceId,
      )
      if (filtered.length === 0) {
        this.modifiers.delete(key)
      } else {
        this.modifiers.set(key, filtered)
      }
    }
    this.cache.clear()
  }

  public calculate(attribute: ATTRIBUTE_CODE, baseValue: number): number {
    const modifiers = this.modifiers.get(attribute)
    const modifierCount = modifiers?.length ?? 0
    const cacheKey = `${attribute}_${baseValue}_${modifierCount}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    if (!modifiers || modifiers.length === 0) {
      return baseValue
    }
    let result = baseValue
    let additiveSum = 0
    let multiplicativeSum = 1
    for (const modifier of modifiers) {
      switch (modifier.type) {
        case ModifierType.ADDITIVE: additiveSum += modifier.value; break
        case ModifierType.MULTIPLICATIVE: multiplicativeSum *= 1 + modifier.value; break
        case ModifierType.PERCENTAGE: additiveSum += baseValue * modifier.value; break
      }
    }
    result += additiveSum
    result *= multiplicativeSum
    this.cache.set(cacheKey, result)
    return result
  }

  public getModifiers(attribute?: ATTRIBUTE_CODE): LocalModifier[] {
    if (attribute) return this.modifiers.get(attribute) || []
    const allModifiers: LocalModifier[] = []
    for (const stack of this.modifiers.values()) {
      allModifiers.push(...stack)
    }
    return allModifiers
  }

  public clear(): void {
    this.modifiers.clear()
    this.cache.clear()
  }

  public getModifierCount(): number {
    let count = 0
    for (const stack of this.modifiers.values()) {
      count += stack.length
    }
    return count
  }
}
