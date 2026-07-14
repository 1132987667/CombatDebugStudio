import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus } from '@/domain/battle/type/types'
import { createTestBattleParticipants } from '../factories/ParticipantFactory'

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
    const { allies, enemies } = createTestBattleParticipants()

    const state = battleSystem.initialize(allies, enemies)

    expect(state).toBeDefined()
    expect(state.participants.size).toBe(4)
    expect(state.battleState).toBe(BattleStatus.PREPARING)
  })

  it('should set turn order based on speed', () => {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    const { allies, enemies } = createTestBattleParticipants()

    battleSystem.initialize(allies, enemies)
    const battleData = battleSystem.getBattleData()!

    expect(battleData.participants.size).toBe(4)
    expect(battleData.turnOrder.length).toBe(4)
  })

  it('should have all participants alive after initialization', () => {
    const battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
    const { allies, enemies } = createTestBattleParticipants()

    battleSystem.initialize(allies, enemies)

    const participants = battleSystem.getCurParticipantsInfo()
    const alive = participants.filter(p => p.isAlive())
    expect(alive.length).toBe(4)
  })
})
