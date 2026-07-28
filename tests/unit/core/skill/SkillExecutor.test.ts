import { SkillExecutor } from '@/domain/skill/SkillExecutor'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import {
  EMPTY_SKILL_SET,
  makeDefaultAttributes,
} from '../../../fixtures/participants'
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

function createParticipant(energy = 30, maxEnergy = 200): BattleParticipantImpl {
  return new BattleParticipantImpl({
    id: 'test_energy_char',
    name: '能量测试角色',
    level: 50,
    team: ParticipantSide.ALLY,
    enabled: true,
    skills: EMPTY_SKILL_SET,
    attributeValues: makeDefaultAttributes({
      [ATTRIBUTE_CODE.currentEnergy]: energy,
      [ATTRIBUTE_CODE.maxEnergy]: maxEnergy,
    }),
  })
}

function createExecutor(): SkillExecutor {
  const registry = new BuffScriptRegistry()
  const mockEventBus = {
    emit: () => {},
    on: () => {},
    off: () => {},
    offByListenerId: () => {},
  } as any
  // 设置 gainEnergy 需要的事件总线
  BattleParticipantImpl.eventBus = mockEventBus as any
  const mockLogger = {
    addDebugLog: () => {},
    addSystemLog: () => {},
    addBattleLog: () => {},
    addActionLog: () => {},
    clearLogs: () => {},
    syncBattleLogs: () => {},
  } as any
  const buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
  const damageCalculator = new DamageCalculator()
  const healCalculator = new HealCalculator(buffSystem)
  return new SkillExecutor(damageCalculator, healCalculator, buffSystem)
}

describe('SkillExecutor', () => {
  describe('gain_energy', () => {
    it('应增加目标能量', () => {
      const executor = createExecutor()
      const participant = createParticipant(30, 200)
      const step: ExtendedSkillStep = {
        type: 'gain_energy' as any,
        targetConfig: { faction: 'self', strategy: 'first' },
        parameters: { value: 15 },
      }
      const action = {
        sourceId: participant.id,
        targetId: participant.id,
        effects: [],
      } as any

      executor.executeStep(step, action, participant, participant)

      expect(participant.currentEnergy).toBe(45)
    })

    it('不应超过最大能量上限', () => {
      const executor = createExecutor()
      const participant = createParticipant(195, 200)
      const step: ExtendedSkillStep = {
        type: 'gain_energy' as any,
        targetConfig: { faction: 'self', strategy: 'first' },
        parameters: { value: 15 },
      }
      const action = {
        sourceId: participant.id,
        targetId: participant.id,
        effects: [],
      } as any

      executor.executeStep(step, action, participant, participant)

      expect(participant.currentEnergy).toBe(200)
    })

    it('value <= 0 应不做任何事', () => {
      const executor = createExecutor()
      const participant = createParticipant(30, 200)
      const step: ExtendedSkillStep = {
        type: 'gain_energy' as any,
        targetConfig: { faction: 'self', strategy: 'first' },
        parameters: { value: 0 },
      }
      const action = {
        sourceId: participant.id,
        targetId: participant.id,
        effects: [],
      } as any

      executor.executeStep(step, action, participant, participant)

      expect(participant.currentEnergy).toBe(30)
    })
  })
})
