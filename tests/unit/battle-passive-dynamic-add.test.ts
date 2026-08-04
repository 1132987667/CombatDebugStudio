/**
 * 战斗中动态添加角色 → 被动触发链路测试
 *
 * 覆盖修复：BattleManager.addCharacterToTeam 在战斗进行中接入
 * BattleSystem.triggerPassiveSkillsForCharacter（注册 + BATTLE_START 触发）。
 * 使用真实 JSON 配置：test_bard（测试·鼓舞者）的被动 test_passive_attack_up_battle_start
 * 在战斗开始时使自身攻击 +10%。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import type { BattleManager } from '@/domain/battle/BattleManager'
import type { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { createBattleParticipantsFromConfig } from '@tests/factories/ParticipantFactory'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))

vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    // NOTE: 必须保持异步时序——BattleAnimationManager 依赖 setTimeout 回调
    //       晚于 timeoutId 声明（同步执行会触发 TDZ ReferenceError）
    setTimeout(fn: (...args: unknown[]) => void, ms?: number): symbol {
      setTimeout(() => fn(), Math.max(0, ms ?? 0))
      return Symbol('mock')
    }
    setInterval = () => Symbol('mock')
    clear = () => {}
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

/** 创建带 battle_start 被动（自身攻击+10%）的测试·鼓舞者 */
function createBard() {
  const enemyData = GameDataProcessor.findEnemyById('test_bard')
  if (!enemyData) throw new Error('缺少测试敌人配置: test_bard')
  return GameDataProcessor.enemyToParticipant(enemyData, ParticipantSide.ENEMY)
}

describe('战斗中动态添加角色触发被动', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
  })

  it('战斗进行中 addCharacterToTeam 触发新角色 BATTLE_START 被动', async () => {
    const battleManager = container.resolve<BattleManager>('BattleManager')
    const { allies, enemies } = createBattleParticipantsFromConfig()
    battleManager.initializeTeams(allies, enemies)
    await battleManager.startBattle()

    const bard = createBard()
    const baseAttack = bard.getAttribute(ATTRIBUTE_CODE.attack)
    battleManager.addCharacterToTeam(bard, ParticipantSide.ENEMY)

    // 被动「战斗鼓舞」已生效：攻击 +10%
    // NOTE: 战斗已开始后才入队，guardian_gold 首领光环已于 startBattle 时施加完毕，
    //       故只吃到自身 +10%（aura 不追溯后来加入者）。
    expect(bard.getAttribute(ATTRIBUTE_CODE.attack)).toBeCloseTo(baseAttack * 1.1, 5)
  })

  it('编成阶段添加角色不提前触发，由 startBattle 统一触发', async () => {
    const battleManager = container.resolve<BattleManager>('BattleManager')
    const { allies, enemies } = createBattleParticipantsFromConfig()
    battleManager.initializeTeams(allies, enemies)

    const bard = createBard()
    const baseAttack = bard.getAttribute(ATTRIBUTE_CODE.attack)
    battleManager.addCharacterToTeam(bard, ParticipantSide.ENEMY)

    // 战斗未开始：不触发被动，攻击不变
    expect(bard.getAttribute(ATTRIBUTE_CODE.attack)).toBeCloseTo(baseAttack, 5)

    // startBattle → initialize() 统一注册并触发 BATTLE_START 被动（不重复、不遗漏）
    // NOTE: bard 在编成阶段入队（ENEMY），startBattle 时已在场——
    //       「战斗鼓舞」(+10%) + 同队金护法「首领光环」aura(+15%) 同时生效（PERCENTAGE 加法聚合）
    await battleManager.startBattle()
    expect(bard.getAttribute(ATTRIBUTE_CODE.attack)).toBeCloseTo(baseAttack * 1.25, 5)
  })

  it('回合级被动统计接线：BATTLE_START 触发计入 fired（TURN_END passiveTriggers 数据源，文档 §5 示例 5）', async () => {
    const battleManager = container.resolve<BattleManager>('BattleManager')
    const { allies, enemies } = createBattleParticipantsFromConfig()
    battleManager.initializeTeams(allies, enemies)
    await battleManager.startBattle()

    // startBattle 已触发 BATTLE_START 被动（test_passive_attack_up_battle_start 等）→ fired 计数应 > 0
    const passiveManager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    const counters = passiveManager.getAndResetTurnCounters()
    expect(counters.fired).toBeGreaterThan(0)
    // 清零后可复用：再次读取为 0（TURN_END 消费后不重复计数）
    expect(passiveManager.getAndResetTurnCounters().fired).toBe(0)
  })
})
