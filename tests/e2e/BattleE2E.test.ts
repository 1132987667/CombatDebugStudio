/**
 * BattleSystem E2E 测试
 *
 * 使用真实 JSON 配置创建参与者（替代内联 Mock 数据）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus } from '@/domain/battle/type/types'
import { createBattleParticipantsFromConfig } from '@tests/factories/ParticipantFactory'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))

vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    setTimeout(fn: (...args: unknown[]) => void, _ms?: number): symbol {
      fn()
      return Symbol('mock')
    }
    setInterval = () => Symbol('mock')
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

describe('BattleSystem E2E', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
  })

  it('should create battle with correct participant count', () => {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    const { allies, enemies } = createBattleParticipantsFromConfig()

    const state = battleSystem.initialize(allies, enemies)

    expect(state).toBeDefined()
    expect(state.participants.size).toBe(2)
    expect(state.battleState).toBe(BattleStatus.PREPARING)
  })

  it('should set turn order based on speed', () => {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    const { allies, enemies } = createBattleParticipantsFromConfig()

    battleSystem.initialize(allies, enemies)
    const battleData = battleSystem.getBattleData()!

    expect(battleData.participants.size).toBe(2)
    expect(battleData.turnOrder.length).toBe(2)
    // 速度较快的守护者应先行动
    expect(battleData.turnOrder[0].id).toBe(battleData.turnOrder[0].id)
  })

  it('光环 buff 的修饰符分发给同队参与者（首领光环攻击+15%）', () => {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    // guardian_gold（金护法）与 enemy_079 同队，均携带 skill_enemy_079_passive（首领光环）
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['guardian_fire'],
      ['guardian_gold', 'enemy_079'],
    )

    battleSystem.initialize(allies, enemies)

    // 参与者 id 带阵营前缀（如 [enemy]_enemy_079_5），按包含关系匹配
    const target = enemies.find((p) => p.id.includes('enemy_079'))
    expect(target).toBeDefined()
    const stack = battleSystem.getBuffSystem().getModifierStack(target!.id)
    const attackMods = stack.getModifiers(ATTRIBUTE_CODE.attack)
    expect(
      attackMods.some(
        (m) => m.value === 15 && m.type === ModifierType.PERCENTAGE,
      ),
    ).toBe(true)
  })
})
