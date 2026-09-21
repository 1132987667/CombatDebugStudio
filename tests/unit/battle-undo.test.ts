/**
 * battle-undo.test.ts — 战斗单步回退（Undo）回归测试
 *
 * 验证 BattleSystem 行动前快照 → undoLastAction 恢复的等价性：
 * - 属性（气血/能量）/ 技能冷却 / Buff 实例与修饰符栈 / 护盾 / rng 种子 / 行动日志长度
 * - 手动普攻、技能、物品（executeItem）三类行动入口都能回退
 * - 空栈拒绝、跨战斗清空、自动战斗禁用
 * - 修饰符残留回归（对抗评审 CRITICAL）：Buff 施加/移除后 sync 必须裁剪栈来源条目，
 *   直挂白名单（custom:/passive:/affix:/bonus:）不被误杀
 *
 * 运行: npx vitest run tests/unit/battle-undo.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BATTLE_SYSTEM_TOKEN } from '@/domain/battle/entity/BattleInterfaces'
import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStatus } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE, ModifierType, ModifierSourceType } from '@/domain/attribute/types'
import { createTestParticipantsFromConfig } from '@tests/fixtures/participants'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'

describe('战斗单步回退（undoLastAction）', () => {
  let battleSystem: BattleSystem

  beforeEach(() => {
    container.clear()
    initializeContainer()
    battleSystem = container.resolve<BattleSystem>(BATTLE_SYSTEM_TOKEN.toString())
  })

  function startBattle() {
    const { allies, enemies } = createTestParticipantsFromConfig(['yaotu_fire'], ['yaotu_gold'])
    battleSystem.loadSkillConfigs(GameDataProcessor.getSkillsData())
    battleSystem.initialize(allies, enemies, undefined, 'undo-test-seed')
    battleSystem.setBattleState(BattleStatus.ACTIVE)
    battleSystem.setQuickMode(true)
    return { allies, enemies }
  }

  function battleOf() {
    return battleSystem.getBattleData()!
  }

  it('无行动可回退时返回失败原因；栈深度随行动增长', async () => {
    const { allies, enemies } = startBattle()
    expect(battleSystem.getUndoDepth()).toBe(0)
    expect(battleSystem.undoLastAction()).toBe('没有可回退的行动')

    await battleSystem.executeManualAction(allies[0]!.id, null, enemies[0]!.id)
    expect(battleSystem.getUndoDepth()).toBe(1)
  })

  it('普攻回退：气血/能量/行动日志长度/rng 种子全部恢复', async () => {
    const { allies, enemies } = startBattle()
    const battle = battleOf()
    const target = enemies[0]!
    const source = allies[0]!

    const hpBefore = target.currentHealth
    const energyBefore = source.getAttribute(ATTRIBUTE_CODE.currentEnergy)
    const actionsBefore = battle.actions.length
    const seedBefore = battle.rng.getSeed()

    const error = await battleSystem.executeManualAction(source.id, null, target.id)
    expect(error).toBeNull()
    expect(target.currentHealth).toBeLessThan(hpBefore)
    expect(battle.actions.length).toBeGreaterThan(actionsBefore)
    expect(battle.rng.getSeed()).not.toBe(seedBefore)

    expect(battleSystem.undoLastAction()).toBeNull()
    expect(target.currentHealth).toBe(hpBefore)
    expect(source.getAttribute(ATTRIBUTE_CODE.currentEnergy)).toBe(energyBefore)
    expect(battle.actions.length).toBe(actionsBefore)
    expect(battle.rng.getSeed()).toBe(seedBefore)
    expect(battleSystem.getUndoDepth()).toBe(0)
  })

  it('技能回退：冷却表恢复为施放前状态', async () => {
    const { allies, enemies } = startBattle()
    const source = allies[0]!
    const target = enemies[0]!
    const bs = battleSystem.getBuffSystem()

    const energy = source.getAttribute(ATTRIBUTE_CODE.currentEnergy)
    const usable = source.getSkillList().find(
      (s) => source.canExecuteSkill(source.id, s.id, energy, bs).can,
    )
    expect(usable).toBeDefined()

    const error = await battleSystem.executeManualAction(source.id, usable!.id, target.id)
    expect(error).toBeNull()
    expect(bs.isCharacterControlled(target.id)).toBe(false)

    expect(battleSystem.undoLastAction()).toBeNull()
    // 回退后同一技能仍可释放（冷却未被本次施放消耗）
    const energyAfterUndo = source.getAttribute(ATTRIBUTE_CODE.currentEnergy)
    expect(
      source.canExecuteSkill(source.id, usable!.id, energyAfterUndo, bs).can,
    ).toBe(true)
  })

  it('Buff 回退：行动前已有的 Buff 在回退后仍在（实例 ID 不变），施放期间新增的 Buff 被移除', async () => {
    const { allies, enemies } = startBattle()
    const source = allies[0]!
    const target = enemies[0]!
    const bs = battleSystem.getBuffSystem()

    const keepId = bs.addBuff(target.id, 'buff_atk_up', {}, 1)
    expect(keepId).toBeTruthy()

    await battleSystem.executeManualAction(source.id, null, target.id)
    // 施放期间若产生了新 Buff 实例，回退后应消失；原有实例必须原样保留
    expect(battleSystem.undoLastAction()).toBeNull()
    const remaining = bs.getBuffInstances(target.id)
    expect(remaining.some((b) => b.id === keepId)).toBe(true)
  })

  it('护盾回退：setShieldValue + 承伤消耗后回退恢复原值', async () => {
    const { allies, enemies } = startBattle()
    const source = allies[0]!
    const target = enemies[0]!
    const bs = battleSystem.getBuffSystem()

    bs.setShieldValue(target.id, 500)
    await battleSystem.executeManualAction(source.id, null, target.id)

    expect(battleSystem.undoLastAction()).toBeNull()
    expect(bs.getShieldValue(target.id)).toBe(500)
    expect(target.currentHealth).toBe(target.getAttribute(ATTRIBUTE_CODE.maxHealth))
  })

  it('物品使用回退：executeItem 治疗量撤销', () => {
    const { allies } = startBattle()
    const user = allies[0]!
    const maxHealth = user.getAttribute(ATTRIBUTE_CODE.maxHealth)
    user.setAttribute(ATTRIBUTE_CODE.currentHealth, Math.floor(maxHealth * 0.5))

    const error = battleSystem.executeItem(user.id, 'elix_001')
    expect(error).toBeNull()
    const healed = user.getAttribute(ATTRIBUTE_CODE.currentHealth)
    expect(healed).toBeGreaterThan(Math.floor(maxHealth * 0.5))

    expect(battleSystem.undoLastAction()).toBeNull()
    expect(user.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(Math.floor(maxHealth * 0.5))
  })

  it('两步回退：连续两次 undo 各自弹栈，第三步报空', async () => {
    const { allies, enemies } = startBattle()
    const battle = battleOf()
    const source = allies[0]!
    const target = enemies[0]!
    const hpInit = target.currentHealth
    const turnInit = battle.currentTurn

    await battleSystem.executeManualAction(source.id, null, target.id)
    const hpAfterFirst = target.currentHealth
    await battleSystem.executeManualAction(source.id, null, target.id)
    expect(battleSystem.getUndoDepth()).toBe(2)

    expect(battleSystem.undoLastAction()).toBeNull()
    expect(target.currentHealth).toBe(hpAfterFirst)
    expect(battleSystem.getUndoDepth()).toBe(1)

    expect(battleSystem.undoLastAction()).toBeNull()
    expect(target.currentHealth).toBe(hpInit)

    expect(battleSystem.undoLastAction()).toBe('没有可回退的行动')
    expect(battle.currentTurn).toBe(turnInit)
  })

  it('clearUndoHistory 清空栈（调试注入后失效路径）', async () => {
    const { allies, enemies } = startBattle()
    await battleSystem.executeManualAction(allies[0]!.id, null, enemies[0]!.id)
    expect(battleSystem.getUndoDepth()).toBe(1)
    battleSystem.clearUndoHistory()
    expect(battleSystem.undoLastAction()).toBe('没有可回退的行动')
  })

  it('新一场战斗 initialize 清空上一场回退栈', async () => {
    const { allies, enemies } = startBattle()
    await battleSystem.executeManualAction(allies[0]!.id, null, enemies[0]!.id)
    expect(battleSystem.getUndoDepth()).toBe(1)

    const again = startBattle()
    expect(battleSystem.getUndoDepth()).toBe(0)
    // 新战斗可正常打点
    await battleSystem.executeManualAction(again.allies[0]!.id, null, again.enemies[0]!.id)
    expect(battleSystem.getUndoDepth()).toBe(1)
  })

  it('自动战斗进行中禁止回退', async () => {
    const { allies, enemies } = startBattle()
    await battleSystem.executeManualAction(allies[0]!.id, null, enemies[0]!.id)
    battleOf().autoBattle = true
    expect(battleSystem.undoLastAction()).toBe('自动战斗中不可回退')
    battleOf().autoBattle = false
    expect(battleSystem.undoLastAction()).toBeNull()
  })

  // ════ 对抗评审回归：修饰符残留三连（sync 空栈裁剪 + 白名单直挂保留）════

  it('Buff 属性回退：撤销施加 Buff 的行动后攻击属性回落', () => {
    const { allies } = startBattle()
    const bs = battleSystem.getBuffSystem()
    const p = allies[0]!
    const attackBefore = p.getAttribute(ATTRIBUTE_CODE.attack)

    // 复现 executeManualAction 的行动前打点，随后直接施加纯属性 Buff
    ;(battleSystem as unknown as { captureUndoSnapshot: () => void }).captureUndoSnapshot()
    bs.addBuff(p.id, 'buff_attack_up_20', {}, 1)
    p.recalcAll()
    expect(p.getAttribute(ATTRIBUTE_CODE.attack)).toBeGreaterThan(attackBefore)

    expect(battleSystem.undoLastAction()).toBeNull()
    expect(p.getAttribute(ATTRIBUTE_CODE.attack)).toBe(attackBefore)
  })

  it('Buff 移除回正：最后一个栈修饰符消失后属性必须回落（sync 空栈裁剪）', () => {
    const { allies } = startBattle()
    const bs = battleSystem.getBuffSystem()
    const p = allies[0]!
    const attackBefore = p.getAttribute(ATTRIBUTE_CODE.attack)

    bs.addBuff(p.id, 'buff_attack_up_20', {}, 1)
    p.recalcAll()
    expect(p.getAttribute(ATTRIBUTE_CODE.attack)).toBeGreaterThan(attackBefore)

    bs.clearAllBuffs(p.id)
    p.recalcAll()
    expect(p.getAttribute(ATTRIBUTE_CODE.attack)).toBe(attackBefore)
  })

  it('直挂修饰符白名单：custom: 条目不被 Buff 的增删同步误杀', () => {
    const { allies } = startBattle()
    const bs = battleSystem.getBuffSystem()
    const p = allies[0]!
    const attackBefore = p.getAttribute(ATTRIBUTE_CODE.attack)

    // 模拟 SkillExecutor 连击类直挂（custom: 前缀，不经 ModifierStack）
    const attrData = p.getAttrValue(ATTRIBUTE_CODE.attack)!
    attrData.modifiers.push({
      sourceKey: 'custom:review_probe',
      sourceType: ModifierSourceType.SKILL,
      attribute: ATTRIBUTE_CODE.attack,
      value: 10,
      type: ModifierType.ADDITIVE,
    })
    p.recalcAll()
    const withCustom = p.getAttribute(ATTRIBUTE_CODE.attack)
    // custom: 存活并参与计算（若被 sync 误杀则等于 attackBefore）
    expect(withCustom).toBeGreaterThan(attackBefore)

    // Buff 入栈触发整体替换——custom: 与栈条目必须同时生效
    bs.addBuff(p.id, 'buff_attack_up_20', {}, 1)
    p.recalcAll()
    const withBoth = p.getAttribute(ATTRIBUTE_CODE.attack)
    expect(withBoth).toBeCloseTo(withCustom * 1.2, 1)

    // Buff 移除——仅栈条目被裁剪，custom: 原样保留
    bs.clearAllBuffs(p.id)
    p.recalcAll()
    expect(p.getAttribute(ATTRIBUTE_CODE.attack)).toBe(withCustom)
  })
})
