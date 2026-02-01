import type { Modifier, ModifierType, AttributeType } from '@/types/modifier'

export class ModifierStack {
  private modifiers = new Map<string, Modifier[]>()

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
}