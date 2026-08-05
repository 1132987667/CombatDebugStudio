/**
 * 确定性战斗复现测试
 *
 * 验证问题6修复的核心契约：同一 seed 初始化两场战斗，执行相同回合数后
 * 状态（回合顺序 / 血量 / 能量 / 行动序列）完全一致——证明战斗内所有随机判定
 * （命中/暴击/目标/AI/触发器）都走 battleData.rng，而非 Math.random。
 *
 * 运行: npx vitest run tests/unit/seeded-battle-determinism.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus } from '@/domain/battle/type/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'

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

const SEED = 'determinism-seed-42'
const ROUNDS = 4

interface BattleOutcome {
  turnOrder: string[]
  hp: Array<[string, number, number]>
  actions: Array<{
    type: string
    sourceId?: string
    targetId?: string
    damage: number
    heal: number
  }>
}

// 参与者 ID 带全局递增序号（_0/_1/...），两次运行序号不同但相对关系一致；归一化后比较
const norm = (id: string): string => id.replace(/_\d+$/, '')

function makeBattleSystem(): BattleSystem {
  container.clear()
  initializeContainer()
  return container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
}

async function runBattle(seed: string): Promise<BattleOutcome> {
  const battleSystem = makeBattleSystem()
  const { allies, enemies } = createTestParticipantsFromConfig(
    ['test_warrior'],
    ['test_tank', 'test_controller'],
  )
  battleSystem.initialize(allies, enemies, undefined, seed)
  battleSystem.setBattleState(BattleStatus.ACTIVE)
  battleSystem.setQuickMode(true)
  battleSystem.setHeadless(true)

  for (let i = 0; i < ROUNDS; i++) {
    await battleSystem.processTurn()
  }

  const data = battleSystem.getBattleData()!
  return {
    turnOrder: data.turnOrder.map(norm),
    hp: [...data.participants.entries()].map(([id, p]) => [
      norm(id),
      p.currentHealth,
      p.currentEnergy,
    ]),
    actions: data.actions.map((a) => ({
      type: a.type,
      sourceId: a.sourceId ? norm(a.sourceId) : undefined,
      targetId: a.targetId ? norm(a.targetId) : undefined,
      damage: a.damage ?? 0,
      heal: a.heal ?? 0,
    })),
  }
}

describe('确定性战斗复现', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(
      BATTLE_SYSTEM_TOKEN.toString(),
    )
  })

  it('同一 seed 两次战斗结果完全一致', async () => {
    const first = await runBattle(SEED)
    const second = await runBattle(SEED)

    expect(second.turnOrder).toEqual(first.turnOrder)
    expect(second.hp).toEqual(first.hp)
    expect(second.actions).toEqual(first.actions)
  })

  it('battleData.rng 已在 initialize 时建立并注入', () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['test_warrior'],
      ['test_tank'],
    )
    battleSystem.initialize(allies, enemies, undefined, SEED)

    const data = battleSystem.getBattleData()
    expect(data?.rng).toBeDefined()
    // initialize 未传 seed 时也应自动生成实例（生命周期契约）
    battleSystem.resetBattle()
    expect(battleSystem.getBattleData()?.rng).toBeDefined()
  })
})
