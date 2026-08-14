/**
 * 木人(noAttack) + 轮转被动 E2E 测试
 *
 * 使用真实 JSON 配置 + 真实 BattleSystem 跑完整战斗回合：
 * - 木人 noAttack：全程不攻击，我方轮转角色血量保持满血
 * - 轮转被动：我方攻击命中时按轮转顺序给木人上 buff
 *   （duration=1 的 buff 在当轮 TURN_END 被移除，故通过 ON_APPLY 事件验证施加，
 *     层数 3 的验证见 tests/unit/rotator-noattack.test.ts）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus, BattleTriggerPhase } from '@/domain/battle/type/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { SeededRandom } from '@/shared/utils/SeededRandom'

const CONTROL_BUFF_IDS = [
  'buff_seal_all',
  'buff_seal',
  'buff_bind',
  'buff_guard_web',
  'buff_lava_bind',
  'guardian_buff_random_taunt',
  'buff_confusion',
  'buff_petrify',
  'buff_stun',
  'guardian_buff_paralyze',
]

const DOT_BUFF_IDS = [
  'buff_suffocation',
  'buff_bleed',
  'buff_drowning',
  'buff_burn',
  'buff_poison',
  'buff_strong_poison',
]

describe('木人 + 轮转被动 E2E', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(
      BATTLE_SYSTEM_TOKEN.toString(),
    )
  })

  it('木人不攻击：若干回合后我方轮转角色保持满血', async () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['test_control_rotator'],
      ['test_dummy_high'],
    )
    const rotator = allies[0]
    expect(rotator).toBeDefined()
    expect(rotator.noAttack).toBeFalsy()
    expect(enemies[0].noAttack).toBe(true)

    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    battleSystem.setHeadless(true)

    const hpBefore = rotator.getAttribute(ATTRIBUTE_CODE.currentHealth)
    // 跑 3 个完整回合（每轮：我方行动 1 次 + 木人行动 1 次）
    for (let i = 0; i < 3; i++) {
      await battleSystem.processTurn()
    }

    const hpAfter = rotator.getAttribute(ATTRIBUTE_CODE.currentHealth)
    // 木人全程不攻击 → 我方血量应保持满血（dot 结算作用于木人自身，不影响我方）
    expect(hpAfter).toBe(hpBefore)
  })

  it('控制轮转被动：攻击命中时确实按轮转给木人施加控制 buff', async () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['test_control_rotator'],
      ['test_dummy_high'],
    )
    const rotator = allies[0]
    const dummy = enemies[0]
    expect(rotator).toBeDefined()
    expect(dummy).toBeDefined()

    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    battleSystem.setHeadless(true)

    // 统计施加到木人身上的 buff（ON_APPLY 只在成功施加时发射）
    const appliedToDummy: string[] = []
    battleSystem
      .getBuffSystem()
      .getEventBus()
      .on(BattleTriggerPhase.ON_APPLY, (ev: any) => {
        if (ev.targetId === dummy.id && ev.extra?.buffId) {
          appliedToDummy.push(ev.extra.buffId)
        }
      })

    for (let i = 0; i < 5; i++) {
      await battleSystem.processTurn()
    }

    // 5 次攻击 × 80% ≈ 4 次触发，至少 1 次施加（几乎必然）
    expect(appliedToDummy.length).toBeGreaterThan(0)
    expect(CONTROL_BUFF_IDS.some((id) => appliedToDummy.includes(id))).toBe(
      true,
    )
  })

  it('duration=1 的 buff 持续到下一个回合结束（当轮结束后仍在木人身上）', async () => {
    // 固定随机数 → 80% 触发概率必中，测试确定性
    // NOTE: 战斗内随机已走 battleData.rng（P2-3/P2-8 改造后），mock SeededRandom.next 而非 Math.random
    const randomSpy = vi.spyOn(SeededRandom.prototype, 'next').mockReturnValue(0.1)
    try {
      const { allies, enemies } = createTestParticipantsFromConfig(
        ['test_control_rotator'],
        ['test_dummy_high'],
      )
      const rotator = allies[0]
      const dummy = enemies[0]
      expect(rotator).toBeDefined()
      expect(dummy).toBeDefined()

      battleSystem.initialize(allies, enemies)
      battleSystem.setBattleState(BattleStatus.ACTIVE)
      battleSystem.setQuickMode(true)
      battleSystem.setHeadless(true)

      // 第 1 个完整回合结束（轮转角色攻击施加 duration=1 的 buff → 木人行动结算不扣减）
      await battleSystem.processTurn()

      const buffSystem = battleSystem.getBuffSystem()
      const applied = buffSystem.getBuffInstances(dummy.id)
      const firstRoundBuffIds = applied.map((i) => i.buffId)
      // 当轮结束后 buff 仍在 → 持续到下一个回合结束
      expect(
        CONTROL_BUFF_IDS.some((id) => firstRoundBuffIds.includes(id)),
      ).toBe(true)

      // 第 2 个完整回合：轮转角色会再攻击并施加下一个轮转 buff，
      // 第 1 轮的旧 buff 在本次结算（下一回合）被移除
      await battleSystem.processTurn()
      const afterIds = buffSystem
        .getBuffInstances(dummy.id)
        .map((i) => i.buffId)
      for (const id of firstRoundBuffIds) {
        expect(afterIds).not.toContain(id)
      }
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('dot 轮转被动：攻击命中时确实给木人施加轮转列表中的 dot buff', async () => {
    const { allies, enemies } = createTestParticipantsFromConfig(
      ['test_dot_rotator'],
      ['test_dummy_high'],
    )
    const rotator = allies[0]
    const dummy = enemies[0]
    expect(rotator).toBeDefined()
    expect(dummy).toBeDefined()

    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    battleSystem.setHeadless(true)

    const appliedToDummy: string[] = []
    battleSystem
      .getBuffSystem()
      .getEventBus()
      .on(BattleTriggerPhase.ON_APPLY, (ev: any) => {
        if (ev.targetId === dummy.id && ev.extra?.buffId) {
          appliedToDummy.push(ev.extra.buffId)
        }
      })

    for (let i = 0; i < 6; i++) {
      await battleSystem.processTurn()
    }

    expect(appliedToDummy.length).toBeGreaterThan(0)
    expect(DOT_BUFF_IDS.some((id) => appliedToDummy.includes(id))).toBe(true)
  })
})
