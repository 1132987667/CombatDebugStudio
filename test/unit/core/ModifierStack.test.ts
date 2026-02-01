import { describe, it, expect, beforeEach } from 'vitest'
import { ModifierStack } from '@/core/ModifierStack'

describe('ModifierStack', () => {
  let modifierStack: ModifierStack

  beforeEach(() => {
    modifierStack = new ModifierStack()
  })

  it('should add a modifier to the stack', () => {
    const buffInstanceId = 'test_buff_instance'
    const attribute = 'ATK'
    const value = 50
    const type = 'ADDITIVE'

    modifierStack.addModifier(buffInstanceId, attribute, value, type)
    const modifiers = modifierStack.getModifiers(attribute)

    expect(modifiers.length).toBe(1)
    expect(modifiers[0].buffInstanceId).toBe(buffInstanceId)
    expect(modifiers[0].attribute).toBe(attribute)
    expect(modifiers[0].value).toBe(value)
    expect(modifiers[0].type).toBe(type)
  })

  it('should remove modifiers for a buff instance', () => {
    const buffInstanceId = 'test_buff_instance'
    const attribute1 = 'ATK'
    const attribute2 = 'DEF'

    modifierStack.addModifier(buffInstanceId, attribute1, 50, 'ADDITIVE')
    modifierStack.addModifier(buffInstanceId, attribute2, 30, 'ADDITIVE')

    modifierStack.removeModifier(buffInstanceId)

    const atkModifiers = modifierStack.getModifiers(attribute1)
    const defModifiers = modifierStack.getModifiers(attribute2)

    expect(atkModifiers.length).toBe(0)
    expect(defModifiers.length).toBe(0)
  })

  it('should calculate final value with additive modifiers', () => {
    const buffInstanceId1 = 'buff1'
    const buffInstanceId2 = 'buff2'

    modifierStack.addModifier(buffInstanceId1, 'ATK', 50, 'ADDITIVE')
    modifierStack.addModifier(buffInstanceId2, 'ATK', 30, 'ADDITIVE')

    const baseValue = 100
    const finalValue = modifierStack.calculate('ATK', baseValue)

    expect(finalValue).toBe(baseValue + 50 + 30)
  })

  it('should calculate final value with multiplicative modifiers', () => {
    const buffInstanceId1 = 'buff1'
    const buffInstanceId2 = 'buff2'

    modifierStack.addModifier(buffInstanceId1, 'ATK', 0.2, 'MULTIPLICATIVE') // 20% increase
    modifierStack.addModifier(buffInstanceId2, 'ATK', 0.1, 'MULTIPLICATIVE') // 10% increase

    const baseValue = 100
    const finalValue = modifierStack.calculate('ATK', baseValue)

    expect(finalValue).toBe(baseValue * 1.2 * 1.1)
  })

  it('should calculate final value with percentage modifiers', () => {
    const buffInstanceId = 'buff1'

    modifierStack.addModifier(buffInstanceId, 'ATK', 0.3, 'PERCENTAGE') // 30% of base value

    const baseValue = 100
    const finalValue = modifierStack.calculate('ATK', baseValue)

    expect(finalValue).toBe(baseValue + (baseValue * 0.3))
  })

  it('should calculate final value with mixed modifier types', () => {
    const buffInstanceId1 = 'buff1'
    const buffInstanceId2 = 'buff2'
    const buffInstanceId3 = 'buff3'

    modifierStack.addModifier(buffInstanceId1, 'ATK', 50, 'ADDITIVE')
    modifierStack.addModifier(buffInstanceId2, 'ATK', 0.2, 'MULTIPLICATIVE')
    modifierStack.addModifier(buffInstanceId3, 'ATK', 0.1, 'PERCENTAGE')

    const baseValue = 100
    const finalValue = modifierStack.calculate('ATK', baseValue)

    // 计算顺序：先加固定值和百分比值，再乘乘法值
    const additiveSum = 50 + (baseValue * 0.1)
    const expected = (baseValue + additiveSum) * 1.2
    expect(finalValue).toBe(expected)
  })

  it('should return base value when no modifiers exist', () => {
    const baseValue = 100
    const finalValue = modifierStack.calculate('ATK', baseValue)

    expect(finalValue).toBe(baseValue)
  })

  it('should get all modifiers for all attributes', () => {
    const buffInstanceId = 'test_buff'

    modifierStack.addModifier(buffInstanceId, 'ATK', 50, 'ADDITIVE')
    modifierStack.addModifier(buffInstanceId, 'DEF', 30, 'ADDITIVE')
    modifierStack.addModifier(buffInstanceId, 'SPD', 0.2, 'MULTIPLICATIVE')

    const allModifiers = modifierStack.getModifiers()

    expect(allModifiers.length).toBe(3)
    expect(allModifiers.some(m => m.attribute === 'ATK')).toBe(true)
    expect(allModifiers.some(m => m.attribute === 'DEF')).toBe(true)
    expect(allModifiers.some(m => m.attribute === 'SPD')).toBe(true)
  })

  it('should clear all modifiers', () => {
    const buffInstanceId = 'test_buff'

    modifierStack.addModifier(buffInstanceId, 'ATK', 50, 'ADDITIVE')
    modifierStack.addModifier(buffInstanceId, 'DEF', 30, 'ADDITIVE')

    modifierStack.clear()

    const allModifiers = modifierStack.getModifiers()
    expect(allModifiers.length).toBe(0)
  })

  it('should get modifier count', () => {
    const buffInstanceId = 'test_buff'

    modifierStack.addModifier(buffInstanceId, 'ATK', 50, 'ADDITIVE')
    modifierStack.addModifier(buffInstanceId, 'DEF', 30, 'ADDITIVE')

    const count = modifierStack.getModifierCount()
    expect(count).toBe(2)
  })
})
