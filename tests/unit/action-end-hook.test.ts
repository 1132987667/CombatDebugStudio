/**
 * ACTION_END 行动后钩子 + 回合末统一结算测试（P2-8 重构）
 *
 * 契约：
 * - 每次行动完成后广播 ACTION_END 触发器事件（仅行动者本人）
 * - buff 每回合结算（updatePerTurn）统一在回合末进行，而非行动后
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus, BattleTriggerPhase } from '@/domain/battle/type/types'
import { StackRule } from '@/domain/buff/types'
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

describe('ACTION_END 行动后钩子 + 回合末统一结算（P2-8）', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(
      BATTLE_SYSTEM_TOKEN.toString(),
    )
  })

  function setup(allyIds: string[], enemyIds: string[]): void {
    const { allies, enemies } = createTestParticipantsFromConfig(allyIds, enemyIds)
    battleSystem.initialize(allies, enemies, undefined, 'action-end-seed')
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    battleSystem.setHeadless(true)
  }

  it('每个存活角色行动完成后触发一次 ACTION_END', async () => {
    setup(['test_warrior'], ['test_tank', 'test_controller'])

    const fired: string[] = []
    battleSystem
      .getBuffSystem()
      .getEventBus()
      .on(BattleTriggerPhase.ACTION_END, (ev: { sourceId?: string }) => {
        fired.push(ev.sourceId ?? '')
      })

    await battleSystem.processTurn()

    // 3 个存活角色各行动 1 次 → 恰好 3 次 ACTION_END（每人一次）
    expect(fired.length).toBe(3)
    expect(new Set(fired).size).toBe(3)
  })

  it('回合末统一结算：TURN_END 后所有存活角色 buff 同步递减', async () => {
    setup(['test_warrior'], ['test_tank'])

    const buffSystem = battleSystem.getBuffSystem()
    const battle = battleSystem.getBattleData()!
    const [warriorId, tankId] = [...battle.participants.keys()]
    const warrior = battle.participants.get(warriorId)!
    const tank = battle.participants.get(tankId)!
    // 战斗开始后给两个角色各施加 duration=2 的 buff
    const config = {
      duration: 2,
      maxStacks: 1,
      stackRule: StackRule.REFRESH,
    }
    buffSystem.addBuff(warrior.id, 'buff_atk_up', config, battle.currentTurn)
    buffSystem.addBuff(tank.id, 'buff_atk_up', config, battle.currentTurn)

    // 第 1 个回合结束：施加当轮（startTurn === currentTurn）跳过，buff 仍在
    await battleSystem.processTurn()
    const afterRound1 = [...battle.participants.entries()].map(
      ([id]) => buffSystem.getBuffInstances(id).length,
    )
    expect(afterRound1.every((n) => n === 1)).toBe(true)

    // 第 2 个回合结束：统一结算 → remainingTurns 递减
    await battleSystem.processTurn()
    const afterRound2 = [...battle.participants.entries()].map(
      ([id]) => buffSystem.getBuffInstances(id).map((i) => i.remainingTurns),
    )
    // duration=2：第 1 回合跳过、第 2 回合递减至 1 → 仍在
    expect(afterRound2.every((list) => list.length === 1 && list[0] === 1)).toBe(
      true,
    )

    // 第 3 个回合结束：递减至 0 → 移除
    await battleSystem.processTurn()
    const afterRound3 = [...battle.participants.entries()].map(
      ([id]) => buffSystem.getBuffInstances(id).length,
    )
    expect(afterRound3.every((n) => n === 0)).toBe(true)
  })
})
