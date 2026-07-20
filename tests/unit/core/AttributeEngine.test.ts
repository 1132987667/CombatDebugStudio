import { describe, it, expect } from 'vitest'
import { calculateFinalValue, ModifierType } from '@/domain/attribute/types'
import { AttributeEngine } from '@/domain/attribute/AttributeEngine'
import type { Modifier } from '@/domain/attribute/types'

function makeMod(overrides: Partial<Modifier> & { value: number; type: ModifierType }): Modifier {
  return {
    sourceKey: overrides.sourceKey ?? 'test',
    sourceType: overrides.sourceType ?? 'buff' as const,
    attribute: overrides.attribute ?? 'attack' as any,
    description: overrides.description,
    ...overrides,
  }
}

describe('AttributeEngine', () => {
  describe('calculateFinalValue', () => {
    it('should return base value when no modifiers', () => {
      const result = calculateFinalValue(100, [])
      expect(result.value).toBe(100)
      expect(result.breakdown.base).toBe(100)
      expect(result.breakdown.additive).toBe(0)
    })

    it('should apply ADDITIVE modifiers', () => {
      const modifiers: Modifier[] = [
        makeMod({ sourceKey: 'buff_1', type: ModifierType.ADDITIVE, value: 50 }),
      ]
      const result = calculateFinalValue(100, modifiers)
      expect(result.value).toBe(150)
    })

    it('should apply multiple ADDITIVE modifiers', () => {
      const modifiers: Modifier[] = [
        makeMod({ sourceKey: 'm1', type: ModifierType.ADDITIVE, value: 30 }),
        makeMod({ sourceKey: 'm2', type: ModifierType.ADDITIVE, value: 20 }),
      ]
      const result = calculateFinalValue(100, modifiers)
      expect(result.value).toBe(150)
    })

    it('should apply PERCENTAGE modifiers', () => {
      const modifiers: Modifier[] = [
        makeMod({ sourceKey: 'p1', type: ModifierType.PERCENTAGE, value: 0.2 }),
      ]
      const result = calculateFinalValue(100, modifiers)
      expect(result.value).toBe(120)
    })

    it('should apply ADDITIVE before PERCENTAGE', () => {
      const modifiers: Modifier[] = [
        makeMod({ sourceKey: 'm1', type: ModifierType.ADDITIVE, value: 50 }),
        makeMod({ sourceKey: 'p1', type: ModifierType.PERCENTAGE, value: 0.1 }),
      ]
      const result = calculateFinalValue(100, modifiers)
      expect(result.value).toBe(160)
    })

    it('should apply MULTIPLICATIVE modifiers', () => {
      const modifiers: Modifier[] = [
        makeMod({ sourceKey: 'm1', type: ModifierType.MULTIPLICATIVE, value: 0.5 }),
      ]
      const result = calculateFinalValue(100, modifiers)
      expect(result.value).toBe(150)
    })

    it('should apply FINAL modifiers last', () => {
      const modifiers: Modifier[] = [
        makeMod({ sourceKey: 'a1', type: ModifierType.ADDITIVE, value: 100 }),
        makeMod({ sourceKey: 'f1', type: ModifierType.FINAL, value: 0.2 }),
      ]
      const result = calculateFinalValue(100, modifiers)
      expect(result.value).toBe(240)
    })

    it('should return breakdown with additive sum', () => {
      const modifiers: Modifier[] = [
        makeMod({ sourceKey: 'm1', type: ModifierType.ADDITIVE, value: 30 }),
      ]
      const result = calculateFinalValue(100, modifiers)
      expect(result.breakdown.additive).toBe(30)
      expect(result.breakdown.percentMultiplier).toBe(1)
      expect(result.breakdown.independentMultiplier).toBe(1)
      expect(result.breakdown.finalMultiplier).toBe(1)
    })
  })

  describe('toTemplate', () => {
    it('should convert modifier to template format', () => {
      const template = AttributeEngine.toTemplate(
        { buffInstanceId: 'b1', attribute: 'attack', value: 50, type: 'ADDITIVE' },
        'Test Buff',
        'buff',
      )
      expect(template.id).toBe('b1')
      expect(template.sourceName).toBe('Test Buff')
      expect(template.type).toBe('ADDITIVE')
      expect(template.value).toBe(50)
    })
  })

  describe('toTemplates', () => {
    it('should batch convert modifiers', () => {
      const modifiers = [
        { buffInstanceId: 'b1', attribute: 'attack', value: 50, type: 'ADDITIVE' },
        { buffInstanceId: 'b2', attribute: 'defense', value: 0.1, type: 'PERCENTAGE' },
      ]
      const templates = AttributeEngine.toTemplates(
        modifiers,
        (id: string) => id === 'b1' ? 'Buff A' : 'Buff B',
        () => 'buff' as any,
      )
      expect(templates.length).toBe(2)
      expect(templates[0].id).toBe('b1')
      expect(templates[0].sourceName).toBe('Buff A')
      expect(templates[1].id).toBe('b2')
      expect(templates[1].sourceName).toBe('Buff B')
    })
  })
})
