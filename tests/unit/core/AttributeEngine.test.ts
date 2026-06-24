import { describe, it, expect } from 'vitest'
import { AttributeEngine } from '@/domain/attribute/AttributeEngine'
import type { ModifierTemplate } from '@/domain/attribute/modifier-template'

describe('AttributeEngine', () => {
  describe('compute', () => {
    it('should return base value when no modifiers', () => {
      const result = AttributeEngine.compute(100, [])

      expect(result.finalValue).toBe(100)
      expect(result.baseValue).toBe(100)
      expect(result.steps.length).toBe(0)
    })

    it('should apply ADDITIVE modifiers', () => {
      const modifiers: ModifierTemplate[] = [
        { id: 'buff_1', sourceName: '攻+', sourceType: 'buff', targetAttribute: 'attack', type: 'ADDITIVE', value: 50 },
      ]

      const result = AttributeEngine.compute(100, modifiers)

      expect(result.finalValue).toBe(150)
    })

    it('should apply multiple ADDITIVE modifiers', () => {
      const modifiers: ModifierTemplate[] = [
        { id: 'm1', sourceName: '攻+', sourceType: 'buff', targetAttribute: 'attack', type: 'ADDITIVE', value: 30 },
        { id: 'm2', sourceName: '攻+', sourceType: 'buff', targetAttribute: 'attack', type: 'ADDITIVE', value: 20 },
      ]

      const result = AttributeEngine.compute(100, modifiers)

      expect(result.finalValue).toBe(150)
    })

    it('should apply PERCENTAGE modifiers', () => {
      const modifiers: ModifierTemplate[] = [
        { id: 'p1', sourceName: '攻%', sourceType: 'buff', targetAttribute: 'attack', type: 'PERCENTAGE', value: 0.2 },
      ]

      const result = AttributeEngine.compute(100, modifiers)

      expect(result.finalValue).toBe(120)
    })

    it('should apply ADDITIVE before PERCENTAGE', () => {
      const modifiers: ModifierTemplate[] = [
        { id: 'm1', sourceName: '攻+', sourceType: 'buff', targetAttribute: 'attack', type: 'ADDITIVE', value: 50 },
        { id: 'p1', sourceName: '攻%', sourceType: 'buff', targetAttribute: 'attack', type: 'PERCENTAGE', value: 0.1 },
      ]

      const result = AttributeEngine.compute(100, modifiers)

      expect(result.finalValue).toBe(165)
    })

    it('should apply MULTIPLICATIVE modifiers', () => {
      const modifiers: ModifierTemplate[] = [
        { id: 'm1', sourceName: '乘区', sourceType: 'buff', targetAttribute: 'attack', type: 'MULTIPLICATIVE', value: 0.5 },
      ]

      const result = AttributeEngine.compute(100, modifiers)

      expect(result.finalValue).toBe(150)
    })

    it('should apply FINAL modifiers last', () => {
      const modifiers: ModifierTemplate[] = [
        { id: 'a1', sourceName: '加攻', sourceType: 'buff', targetAttribute: 'attack', type: 'ADDITIVE', value: 100 },
        { id: 'f1', sourceName: '最终', sourceType: 'buff', targetAttribute: 'attack', type: 'FINAL', value: 0.2 },
      ]

      const result = AttributeEngine.compute(100, modifiers)

      expect(result.finalValue).toBe(240)
    })

    it('should return breakdown with additive sum', () => {
      const modifiers: ModifierTemplate[] = [
        { id: 'm1', sourceName: '攻+', sourceType: 'buff', targetAttribute: 'attack', type: 'ADDITIVE', value: 30 },
      ]

      const result = AttributeEngine.compute(100, modifiers)

      expect(result.breakdown.additive).toBe(30)
      expect(result.breakdown.percentMultiplier).toBe(1)
      expect(result.breakdown.independentMultiplier).toBe(1)
      expect(result.breakdown.finalMultiplier).toBe(1)
    })

    it('should record calculation steps', () => {
      const modifiers: ModifierTemplate[] = [
        { id: 'step1', sourceName: '加攻', sourceType: 'buff', targetAttribute: 'attack', type: 'ADDITIVE', value: 50 },
      ]

      const result = AttributeEngine.compute(100, modifiers)

      expect(result.steps.length).toBe(1)
      expect(result.steps[0].modifierId).toBe('step1')
      expect(result.steps[0].previousValue).toBe(100)
      expect(result.steps[0].intermediateResult).toBe(150)
    })
  })

  describe('compute with dynamic value', () => {
    it('should resolve dynamic values using context', () => {
      const modifiers: ModifierTemplate[] = [
        {
          id: 'd1', sourceName: '动态', sourceType: 'skill', targetAttribute: 'attack',
          type: 'ADDITIVE',
          value: (ctx) => (ctx.attributes['attack'] ?? 0) * 0.5,
        },
      ]

      const result = AttributeEngine.compute(100, modifiers, {
        attributes: { attack: 200 },
        params: {},
      })

      expect(result.finalValue).toBe(200)
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
        (id) => id === 'b1' ? 'Buff A' : 'Buff B',
        () => 'buff',
      )

      expect(templates.length).toBe(2)
      expect(templates[0].id).toBe('b1')
      expect(templates[0].sourceName).toBe('Buff A')
      expect(templates[1].id).toBe('b2')
      expect(templates[1].sourceName).toBe('Buff B')
    })
  })
})
