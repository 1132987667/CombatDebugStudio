import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillExecutor } from '@/domain/skill/SkillExecutor'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { createParticipantFromEnemy } from '@tests/fixtures/participants'
import type { ExtendedSkillStep } from '@/domain/skill/types'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))
vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    setTimeout = (fn: (...args: unknown[]) => void) => { fn(); return Symbol('mock') }
    setInterval = () => Symbol('mock')
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn(), offByListenerId: vi.fn() }
const TEST_MAX_ENERGY = 200
const TEST_INITIAL_ENERGY = 30

describe('SkillExecutor gainEnergy', () => {
  let executor: SkillExecutor

  beforeEach(() => {
    BattleParticipantImpl.eventBus = mockEventBus as any
    const registry = new BuffScriptRegistry()
    const mockLogger = { addDebugLog: vi.fn(), addSystemLog: vi.fn(), addBattleLog: vi.fn(), addActionLog: vi.fn(), clearLogs: vi.fn(), syncBattleLogs: vi.fn() } as any
    executor = new SkillExecutor(new BuffSystem(registry, mockEventBus, mockLogger), mockLogger, new DamageCalculator(), new HealCalculator())
  })

  it('should add energy to target', () => {
    const target = createParticipantFromEnemy('guardian_wood', ParticipantSide.ALLY)
    if (!target) return

    target.setAttribute(ATTRIBUTE_CODE.maxEnergy, TEST_MAX_ENERGY)
    target.setAttribute(ATTRIBUTE_CODE.currentEnergy, TEST_INITIAL_ENERGY)
    target.recalcAll()

    executor.executeStep({ type: 'gain_energy', parameters: { value: 20 } } as ExtendedSkillStep, { effects: [] } as any, target, target, {} as any)

    expect(target.currentEnergy).toBe(TEST_INITIAL_ENERGY + 20)
  })

  it('should not exceed max energy', () => {
    const target = createParticipantFromEnemy('guardian_wood', ParticipantSide.ALLY)
    if (!target) return

    target.setAttribute(ATTRIBUTE_CODE.maxEnergy, TEST_MAX_ENERGY)
    target.setAttribute(ATTRIBUTE_CODE.currentEnergy, TEST_MAX_ENERGY - 5)
    target.recalcAll()

    executor.executeStep({ type: 'gain_energy', parameters: { value: 20 } } as ExtendedSkillStep, { effects: [] } as any, target, target, {} as any)

    expect(target.currentEnergy).toBe(TEST_MAX_ENERGY)
  })
})
