/**
 * battle-control-semantics.test.ts — 控制语义对齐回归测试
 *
 * 依据《统一战斗系统文档.md》§6.4 / §11 / §13 用例 4、5：
 * - G1：行动判定由 status-meta 的 blocksAction/blocksSkill 双标志驱动——
 *       沉默（blocksAction=false）可普攻、不可放技能；眩晕两者皆禁。
 * - G2：冰冻/睡眠受击唤醒（伤害成立才解除）；睡眠目标该次伤害 ×1.2。
 * - G5：战斗中物品使用——完全控制禁用、沉默可用；heal/energy 效果解析。
 *
 * 运行: npx vitest run tests/unit/battle-control-semantics.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import type { BattleExecutor } from '@/domain/battle/service/BattleExecutor'
import { BattleStatus } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'

describe('G1：控制查询按 blocksAction/blocksSkill 双标志分流', () => {
  let buffSystem: BuffSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    buffSystem = container.resolve<BuffSystem>('BuffSystem')
  })

  it('沉默：禁技能但不算完全被控（仍可普攻）', () => {
    const { enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    const id = enemies[0]!.id
    buffSystem.addBuff(id, 'buff_silence', {}, 1)
    expect(buffSystem.canUseSkill(id)).toBe(false)
    expect(buffSystem.isCharacterControlled(id)).toBe(false)
  })

  it('眩晕：完全被控且禁技能', () => {
    const { enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    const id = enemies[0]!.id
    buffSystem.addBuff(id, 'buff_stun', {}, 1)
    expect(buffSystem.isCharacterControlled(id)).toBe(true)
    expect(buffSystem.canUseSkill(id)).toBe(false)
  })

  it('无控制：行动与技能均不受限', () => {
    const { enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    const id = enemies[0]!.id
    expect(buffSystem.isCharacterControlled(id)).toBe(false)
    expect(buffSystem.canUseSkill(id)).toBe(true)
  })
})

describe('G2：受击唤醒与睡眠承伤', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
  })

  function startBattle() {
    const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    battleSystem.loadSkillConfigs(GameDataProcessor.getSkillsData())
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    return { allies, enemies }
  }

  function executorOf(): BattleExecutor {
    // BattleSystem.executor 为私有字段，测试直接访问（避免为测试暴露生产 API）
    return (battleSystem as unknown as { executor: BattleExecutor }).executor
  }

  it('沉默单位仍可执行普攻（手动指令走完整管线）', async () => {
    const { allies, enemies } = startBattle()
    const source = allies[0]!
    const target = enemies[0]!
    battleSystem.getBuffSystem().addBuff(source.id, 'buff_silence', {}, 1)

    const hpBefore = target.currentHealth
    const error = await battleSystem.executeManualAction(source.id, null, target.id)

    expect(error).toBeNull()
    expect(target.currentHealth).toBeLessThan(hpBefore)
  })

  it('冰冻目标受击后解除控制', async () => {
    const { allies, enemies } = startBattle()
    const source = allies[0]!
    const target = enemies[0]!
    const bs = battleSystem.getBuffSystem()
    bs.addBuff(target.id, 'buff_freeze', {}, 1)
    expect(bs.isCharacterControlled(target.id)).toBe(true)

    await battleSystem.executeManualAction(source.id, null, target.id)

    expect(bs.isCharacterControlled(target.id)).toBe(false)
  })

  it('睡眠目标受击解除，且该次伤害 ×1.2（settleDamage 固定值直接验证）', () => {
    const { allies, enemies } = startBattle()
    const source = allies[0]!
    const target = enemies[0]!
    const bs = battleSystem.getBuffSystem()
    const battle = battleSystem.getBattleData()!
    const executor = executorOf()

    // 基线：固定 100 伤害 → 实扣 100
    const base = executor.settleDamage(source, target, 100, 100, false, battle)
    expect(base).toBe(100)

    // 挂睡眠后同样固定 100：实扣 120，且睡眠被唤醒
    target.setAttribute(ATTRIBUTE_CODE.currentHealth, 1000)
    target.setAttribute(ATTRIBUTE_CODE.maxHealth, 1000)
    bs.addBuff(target.id, 'buff_sleep', {}, 1)
    expect(bs.isSleeping(target.id)).toBe(true)

    const slept = executor.settleDamage(source, target, 100, 100, false, battle)
    expect(slept).toBe(120)
    expect(bs.isSleeping(target.id)).toBe(false)
    expect(bs.isCharacterControlled(target.id)).toBe(false)
  })

  it('冰冻伤害被护盾完全吸收时不唤醒', () => {
    const { allies, enemies } = startBattle()
    const target = enemies[0]!
    const bs = battleSystem.getBuffSystem()
    const battle = battleSystem.getBattleData()!
    const executor = executorOf()

    bs.addBuff(target.id, 'buff_freeze', {}, 1)
    target.setAttribute(ATTRIBUTE_CODE.maxHealth, 1000)
    target.setAttribute(ATTRIBUTE_CODE.currentHealth, 1000)
    bs.setShieldValue(target.id, 500)

    executor.settleDamage(allies[0]!, target, 10, 10, false, battle)
    expect(bs.isCharacterControlled(target.id)).toBe(true)
  })
})

describe('G5：战斗中物品使用（executeItem）', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
  })

  function startBattle() {
    const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    battleSystem.loadSkillConfigs(GameDataProcessor.getSkillsData())
    battleSystem.initialize(allies, enemies)
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    return { allies, enemies }
  }

  it('疗伤丹恢复 30% 最大气血（elix_001 heal 百分比口径）', () => {
    const { allies } = startBattle()
    const user = allies[0]!
    const maxHealth = user.getAttribute(ATTRIBUTE_CODE.maxHealth)
    user.setAttribute(ATTRIBUTE_CODE.currentHealth, Math.floor(maxHealth * 0.5))

    const error = battleSystem.executeItem(user.id, 'elix_001')

    expect(error).toBeNull()
    const expected = Math.floor(maxHealth * 0.5) + Math.floor(maxHealth * 0.3)
    expect(user.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(expected)
  })

  it('聚气丹恢复 30 点能量（不超过上限）', () => {
    const { allies } = startBattle()
    const user = allies[0]!
    user.setAttribute(ATTRIBUTE_CODE.currentEnergy, 10)
    const before = user.getAttribute(ATTRIBUTE_CODE.currentEnergy)

    const error = battleSystem.executeItem(user.id, 'elix_003')

    expect(error).toBeNull()
    expect(user.getAttribute(ATTRIBUTE_CODE.currentEnergy)).toBe(before + 30)
  })

  it('完全控制（眩晕）下不可使用物品；沉默可用（§6.5）', () => {
    const { allies } = startBattle()
    const user = allies[0]!
    const bs = battleSystem.getBuffSystem()

    // 眩晕（blocksAction=true）→ 拒绝
    bs.addBuff(user.id, 'buff_stun', {}, 1)
    expect(battleSystem.executeItem(user.id, 'elix_001')).toContain('完全控制')

    // 换成沉默（blocksSkill=true / blocksAction=false）→ 可用
    bs.clearAllBuffs(user.id)
    bs.addBuff(user.id, 'buff_silence', {}, 1)
    expect(battleSystem.executeItem(user.id, 'elix_001')).toBeNull()
  })

  it('不存在的物品返回失败原因', () => {
    const { allies } = startBattle()
    expect(battleSystem.executeItem(allies[0]!.id, 'ghost_item')).toBe('物品不存在')
  })
})
