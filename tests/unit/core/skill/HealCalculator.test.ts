import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { createMockEntity } from '../../../mocks/MockEntity'
import type { ExtendedSkillStep } from '@/domain/skill/types'

vi.mock('@/infrastructure/adapters/logging', () => ({
  battleLogManager: { addDebugLog: () => {} },
  LogLevel: { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
}))

function createHealStep(overrides?: Partial<ExtendedSkillStep>): ExtendedSkillStep {
  return {
    type: 'heal',
    calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 0.5 }] },
    skillId: 'test_heal',
    skillName: 'Test Heal',
    tier: 'small',
    ...overrides,
  } as ExtendedSkillStep
}

describe('HealCalculator', () => {
  let calculator: HealCalculator

  beforeEach(() => {
    calculator = new HealCalculator()
  })

  describe('calculation-based heal', () => {
    it('should calculate heal from calculation extraValues', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 500, maxHealth: 1000 })
      const step = createHealStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 0.5 }] } })

      const heal = calculator.calculateHeal(step, source, target)

      expect(heal).toBeGreaterThan(0)
      expect(heal).toBe(50)
    })

    it('should cap heal at max health', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 990, maxHealth: 1000 })
      const step = createHealStep({ calculation: { baseValue: 200, extraValues: [] } })

      const heal = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(10)
    })
  })

  describe('calculation-based heal', () => {
    it('should use base value when calculation config provided', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 500, maxHealth: 1000 })
      const step = createHealStep({
        calculation: { baseValue: 200, extraValues: [] },
      })

      const heal = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(200)
    })

    it('should add extra values from attributes', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 200, maxHealth: 1000 })
      const step = createHealStep({
        calculation: {
          baseValue: 50,
          extraValues: [{ attribute: 'attack', ratio: 0.5 }],
        },
      })

      const heal = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(100)
    })

    it('should not exceed max health with extra values', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 800, maxHealth: 1000 })
      const step = createHealStep({
        calculation: {
          baseValue: 500,
          extraValues: [{ attribute: 'attack', ratio: 1 }],
        },
      })

      const heal = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(200)
    })
  })

  describe('edge cases', () => {
    it('should return 0 for step with no calculation', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const step = createHealStep({ calculation: undefined } as any)

      const heal = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(0)
    })

    it('should return 0 when target is at full health', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 1000, maxHealth: 1000 })
      const step = createHealStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 0.5 }] } })

      const heal = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(0)
    })
  })
})
