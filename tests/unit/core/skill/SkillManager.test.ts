import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { createParticipantFromEnemy } from '@tests/fixtures/participants'
import { SeededRandom } from '@/shared/utils/SeededRandom'
import type { SkillConfig } from '@/domain/skill/types'

const mockEventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn(), offByListenerId: vi.fn() }
const mockLogger = {
  addDebugLog: vi.fn(),
  addSystemLog: vi.fn(),
  addBattleLog: vi.fn(),
  addActionLog: vi.fn(),
  clearLogs: vi.fn(),
  syncBattleLogs: vi.fn(),
} as any

function makeSplashConfig(probability?: number): SkillConfig {
  return {
    id: 'test_splash',
    name: 'Test Splash',
    energyCost: 0,
    cooldown: 0,
    skillType: 'small',
    selector: { faction: 'enemy', strategy: 'first', count: 1 },
    steps: [
      {
        type: 'deal_damage',
        attackType: 'normal',
        calculation: { baseValue: 10, extraValues: [] },
      },
      {
        type: 'deal_damage',
        attackType: 'normal',
        targetType: 'random_adjacent',
        ...(probability !== undefined ? { probability } : {}),
        calculation: { baseValue: 20, extraValues: [] },
      },
    ],
  }
}

describe('SkillManager 溅射步骤', () => {
  let manager: SkillManager

  beforeEach(() => {
    BattleParticipantImpl.eventBus = mockEventBus as any
    const registry = new BuffScriptRegistry()
    const buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
    manager = new SkillManager(buffSystem)
  })

  function setup() {
    const source = createParticipantFromEnemy('guardian_fire', ParticipantSide.ALLY)!
    const mainTarget = createParticipantFromEnemy('guardian_gold', ParticipantSide.ENEMY)!
    const adjacent = createParticipantFromEnemy('guardian_wood', ParticipantSide.ENEMY)!
    source.setAttribute(ATTRIBUTE_CODE.critRate, 0)
    for (const p of [mainTarget, adjacent]) {
      p.setAttribute(ATTRIBUTE_CODE.defense, 0)
    }
    return { source, mainTarget, adjacent }
  }

  it('溅射步骤只打相邻目标，不再重复打主目标', () => {
    manager.loadSkillConfigs([makeSplashConfig()])
    const { source, mainTarget, adjacent } = setup()
    const hpMain = mainTarget.getAttribute(ATTRIBUTE_CODE.currentHealth)
    const hpAdj = adjacent.getAttribute(ATTRIBUTE_CODE.currentHealth)

    manager.executeSkill(
      'test_splash',
      source,
      mainTarget,
      1,
      undefined,
      () => [adjacent],
      undefined,
      undefined,
      new SeededRandom('seed-splash'),
    )

    expect(hpMain - mainTarget.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(10)
    expect(hpAdj - adjacent.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(20)
  })

  it('probability=0 时溅射步骤不触发', () => {
    manager.loadSkillConfigs([makeSplashConfig(0)])
    const { source, mainTarget, adjacent } = setup()
    const hpMain = mainTarget.getAttribute(ATTRIBUTE_CODE.currentHealth)
    const hpAdj = adjacent.getAttribute(ATTRIBUTE_CODE.currentHealth)

    manager.executeSkill(
      'test_splash',
      source,
      mainTarget,
      1,
      undefined,
      () => [adjacent],
      undefined,
      undefined,
      new SeededRandom('seed-zero'),
    )

    expect(hpMain - mainTarget.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(10)
    expect(hpAdj - adjacent.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(0)
  })

  it('probability=1 时溅射步骤必触发', () => {
    manager.loadSkillConfigs([makeSplashConfig(1)])
    const { source, mainTarget, adjacent } = setup()
    const hpMain = mainTarget.getAttribute(ATTRIBUTE_CODE.currentHealth)
    const hpAdj = adjacent.getAttribute(ATTRIBUTE_CODE.currentHealth)

    manager.executeSkill(
      'test_splash',
      source,
      mainTarget,
      1,
      undefined,
      () => [adjacent],
      undefined,
      undefined,
      new SeededRandom('seed-one'),
    )

    expect(hpMain - mainTarget.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(10)
    expect(hpAdj - adjacent.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(20)
  })

  it('无相邻目标时溅射步骤跳过，主目标不受溅射伤害', () => {
    manager.loadSkillConfigs([makeSplashConfig()])
    const { source, mainTarget } = setup()
    const hpMain = mainTarget.getAttribute(ATTRIBUTE_CODE.currentHealth)

    manager.executeSkill(
      'test_splash',
      source,
      mainTarget,
      1,
      undefined,
      () => [],
      undefined,
      undefined,
      new SeededRandom('seed-empty'),
    )

    expect(hpMain - mainTarget.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(10)
  })
})
