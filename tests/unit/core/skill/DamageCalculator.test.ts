import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { createMockEntity, defaultAttrs } from '../../../mocks/MockEntity'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { ExtendedSkillStep } from '@/domain/skill/types'

vi.mock('@/infrastructure/adapters/logging', () => ({
  battleLogManager: { addDebugLog: () => {} },
  LogLevel: { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
}))

function createSkillStep(overrides?: Partial<ExtendedSkillStep>): ExtendedSkillStep {
  return {
    type: 'deal_damage',
    calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 2 }] },
    skillId: 'test_skill',
    skillName: 'Test Skill',
    tier: 'small',
    ...overrides,
  } as ExtendedSkillStep
}

describe('DamageCalculator', () => {
  let calculator: DamageCalculator

  beforeEach(() => {
    calculator = new DamageCalculator()
  })

  describe('calculateDamage', () => {
    it('should calculate damage based on formula', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      source.getRandomAttackDemage = () => 100
      const step = createSkillStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 2 }] } })

      const result = calculator.calculateDamage(step, source, target)

      expect(result.isMiss).toBe(false)
      expect(result.damage).toBeGreaterThan(0)
      expect(result.damage).toBeLessThanOrEqual(300)
    })

    it('should apply dodge when target has max dodge rate', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      target.getAttributeValue = (attr: string) => {
        if (attr === 'dodgeRate' || attr === ATTRIBUTE_CODE.dodge) {
          return { value: 100, base: 100, modifiers: [], dirty: false }
        }
        return defaultAttrs[attr as ATTRIBUTE_CODE]
      }
      target.getAttribute = (attr: string) => {
        if (attr === 'dodgeRate' || attr === ATTRIBUTE_CODE.dodge) return 100
        return defaultAttrs[attr as ATTRIBUTE_CODE]?.value ?? 0
      }

      const rand = vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const step = createSkillStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 1 }] } })
      const result = calculator.calculateDamage(step, source, target)

      expect(result.isMiss).toBe(true)
      expect(result.damage).toBe(0)
      rand.mockRestore()
    })

    it('should apply minimum damage threshold', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const step = createSkillStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 2 }] } })
      source.getRandomAttackDemage = () => 0
      const origGetAttr = source.getAttribute
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.hit) return 100
        if (attr === ATTRIBUTE_CODE.attack || attr === ATTRIBUTE_CODE.minAttack || attr === ATTRIBUTE_CODE.maxAttack) return 0
        return origGetAttr(attr)
      }

      const result = calculator.calculateDamage(step, source, target)

      expect(result.damage).toBe(1)
    })
  })

  describe('config', () => {
    it('should allow setting custom config', () => {
      calculator.setConfig({ criticalEnabled: false })

      const config = calculator.getConfig()
      expect(config.criticalEnabled).toBe(false)
    })
  })
})
