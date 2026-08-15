import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { createMockEntity } from '@tests/mocks/MockEntity'
import type { ExtendedSkillStep } from '@/domain/skill/types'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'
import { TraceLevel, TracePhase, type TraceEvent, type TraceScope } from '@/shared/types/trace-event'

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

      const { heal } = calculator.calculateHeal(step, source, target)

      expect(heal).toBeGreaterThan(0)
      expect(heal).toBe(31)
    })

    it('should cap heal at max health', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 990, maxHealth: 1000 })
      const step = createHealStep({ calculation: { baseValue: 200, extraValues: [] } })

      const { heal } = calculator.calculateHeal(step, source, target)

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

      const { heal } = calculator.calculateHeal(step, source, target)

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

      const { heal } = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(81)
    })

    it('should resolve level as source.level in extraValues', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 200, maxHealth: 1000 })
      const step = createHealStep({
        calculation: {
          baseValue: 150,
          extraValues: [{ attribute: 'level', ratio: 10 }],
        },
      })

      const { heal } = calculator.calculateHeal(step, source, target)

      // source.level = 50 → 150 + 50×10 = 650（未超上限）
      expect(heal).toBe(650)
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

      const { heal } = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(200)
    })
  })

  describe('edge cases', () => {
    it('should return 0 for step with no calculation', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const step = createHealStep({ calculation: undefined })

      const { heal } = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(0)
    })

    it('should return 0 when target is at full health', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 1000, maxHealth: 1000 })
      const step = createHealStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 0.5 }] } })

      const { heal } = calculator.calculateHeal(step, source, target)

      expect(heal).toBe(0)
    })
  })

  describe('HEAL_CALCULATION trace emission', () => {
    it('should emit HEAL_CALCULATION with correlationId from context.trace when tracePort set', () => {
      const events: TraceEvent[] = []
      const port: IDebugTracePort = {
        emit: (e) => { events.push(e); return e.id },
        isEnabled: () => true,
        beginScope: () => ({ correlationId: 'x', phase: TracePhase.ACTION_EXECUTION, child: () => ({}) } as TraceScope),
      }
      calculator.setTracePort(port)

      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 990, maxHealth: 1000 })
      const step = createHealStep({ calculation: { baseValue: 200, extraValues: [] } })
      const scope: TraceScope = {
        correlationId: 'corr_1_1',
        phase: TracePhase.ACTION_EXECUTION,
        meta: { battleId: 'battle-1', turn: 3 },
        child: () => scope,
      }

      const { heal } = calculator.calculateHeal(step, source, target, { trace: scope })

      expect(heal).toBe(10)
      expect(events).toHaveLength(1)
      const evt = events[0]
      expect(evt.phase).toBe(TracePhase.HEAL_CALCULATION)
      expect(evt.correlationId).toBe('corr_1_1')
      expect(evt.battleId).toBe('battle-1')
      expect(evt.turn).toBe(3)
      expect(evt.level).toBe(TraceLevel.DEBUG)
      expect(evt.payload).toMatchObject({ base: 200, final: 10, sourceId: source.id, targetId: target.id })
      // steps 复用 HealCalculationStep[]：上限钳制场景应记录 heal_cap 条目
      const steps = evt.payload.steps as Array<{ step: string; value: number }>
      expect(steps).toEqual([
        { step: 'heal_cap', value: 10, description: expect.stringContaining('溢出: 190') },
      ])
    })

    it('should not emit when tracePort is null (no-op)', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 200, maxHealth: 1000 })
      const step = createHealStep({ calculation: { baseValue: 50, extraValues: [] } })
      const scope: TraceScope = {
        correlationId: 'corr_1_1',
        phase: TracePhase.ACTION_EXECUTION,
        child: () => scope,
      }

      // 未注入 tracePort：不得抛异常，也不得 emit
      const { heal } = calculator.calculateHeal(step, source, target, { trace: scope })

      expect(heal).toBe(50)
    })

    it('base reflects pre-modifier value (baseValue + extraValues), not raw baseValue', () => {
      const events: TraceEvent[] = []
      const port: IDebugTracePort = {
        emit: (e) => { events.push(e); return e.id },
        isEnabled: () => true,
        beginScope: () => ({ correlationId: 'x', phase: TracePhase.ACTION_EXECUTION, child: () => ({}) } as TraceScope),
      }
      calculator.setTracePort(port)

      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 500, maxHealth: 1000 })
      // baseValue 0，全部来自 extraValues（attack × 0.5）→ 修饰前值 31，而非误导性的 0
      const step = createHealStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 0.5 }] } })
      const scope: TraceScope = {
        correlationId: 'corr_1_2',
        phase: TracePhase.ACTION_EXECUTION,
        child: () => scope,
      }

      calculator.calculateHeal(step, source, target, { trace: scope })

      expect(events).toHaveLength(1)
      expect(events[0].payload).toMatchObject({ base: 31, final: 31 })
    })
  })
})
