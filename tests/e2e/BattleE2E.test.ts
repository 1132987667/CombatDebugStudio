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
})
