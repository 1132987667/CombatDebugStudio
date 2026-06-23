import { ATTRIBUTE_CODE, type AttributeValue, type IModifierProvider, getAttributeMeta, getAttributeDefaultValue } from '@/types/attribute'
import type { BattleEntity } from '@/types/battle'

export class ParticipantStats {
  readonly attributes = new Map<ATTRIBUTE_CODE, AttributeValue>()

  private _modifierProvider: IModifierProvider | null = null

  setModifierProvider(provider: IModifierProvider | null): void {
    this._modifierProvider = provider
    this.markAllDirty()
  }

  initAttribute(code: ATTRIBUTE_CODE, baseValue: number, isPercentage: boolean): void {
    this.attributes.set(code, {
      value: baseValue,
      base: baseValue,
      modifiers: [],
      isPercentage,
      dirty: true,
    })
  }

  initAttributes(attributeValues: Record<string, { value: number } | undefined>): void {
    for (const code of Object.values(ATTRIBUTE_CODE)) {
      const meta = getAttributeMeta(code)
      const av = attributeValues[code]
      const baseValue = av?.value ?? getAttributeDefaultValue(code)
      this.initAttribute(code, baseValue, meta?.isPercentage ?? false)
    }
    this.markAllDirty()
  }

  getAttributeValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
    this.recalcAttribute(attr)
    return this.attributes.get(attr)
  }

  getAttribute(attr: ATTRIBUTE_CODE): number {
    const result = this.getAttributeValue(attr)
    return result?.value ?? 0
  }

  getAttrValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
    return this.attributes.get(attr)
  }

  getAttributeBase(attr: ATTRIBUTE_CODE): number {
    return this.attributes.get(attr)?.base ?? 0
  }

  setAttributeBase(attr: ATTRIBUTE_CODE, value: number): void {
    const attrData = this.attributes.get(attr)
    if (attrData) {
      attrData.base = value
      attrData.dirty = true
    }
  }

  setAttributeValue(attr: ATTRIBUTE_CODE, value: number): void {
    const attrData = this.attributes.get(attr)
    if (attrData) {
      attrData.value = value
      attrData.dirty = false
    }
  }

  markDirty(attr: ATTRIBUTE_CODE): void {
    const attrData = this.attributes.get(attr)
    if (attrData) attrData.dirty = true
  }

  markAllDirty(): void {
    for (const attrData of this.attributes.values()) {
      attrData.dirty = true
    }
  }

  recalculateAll(): void {
    for (const code of Object.values(ATTRIBUTE_CODE)) {
      this.recalcAttribute(code)
    }
  }

  private recalcAttribute(attr: ATTRIBUTE_CODE): void {
    const attrData = this.attributes.get(attr)
    if (!attrData || !attrData.dirty) return

    let value = attrData.base
    let additive = 0
    let percentMultiplier = 1
    let independentMultiplier = 1
    let finalMultiplier = 1
    let modifiers: any[] = attrData.modifiers

    if (this._modifierProvider) {
      const stack = this._modifierProvider.getModifierStack?.(attr, attrData.base)
      modifiers = stack?.modifiers ?? []
      value = this._modifierProvider.calculate?.(attr, attrData.base) ?? attrData.base
    } else {
      for (const mod of modifiers) {
        const mValue = typeof mod.value === 'function' ? mod.value({}) : mod.value
        switch (mod.type) {
          case 'ADDITIVE': additive += mValue; break
          case 'PERCENTAGE': percentMultiplier += mValue; break
          case 'MULTIPLICATIVE': independentMultiplier *= (1 + mValue); break
          case 'FINAL': finalMultiplier *= (1 + mValue); break
        }
      }
      value = ((attrData.base + additive) * percentMultiplier * independentMultiplier) * finalMultiplier
    }

    attrData.modifiers = modifiers
    attrData.value = Math.floor(value * 100) / 100
    attrData.dirty = false
  }

  getAllBaseAttributes(): Record<string, number> {
    const result: Record<string, number> = {}
    for (const [code, attrData] of this.attributes) {
      result[code] = attrData.base
    }
    return result
  }
}
