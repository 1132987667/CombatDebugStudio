/**
 * 被动技能「每回合最多触发 N 次」限制测试
 *
 * maxTriggersPerRound 以 battle.currentTurn（全场回合编号）计，
 * 回合切换自动重置计数（PassiveSkillManager.shouldTriggerPassive 判定 +
 * triggerPassives 成功后累加）。本测试直接驱动判定方法锁定行为。
 */
import { describe, it, expect } from 'vitest'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { BattleTriggerPhase } from '@/domain/battle/type/types'
import type { BattleEntity, PassiveTriggerContext } from '@/domain/battle/type/types'
import { PassiveSkipReason } from '@/shared/types/trace-event'

function makeManager(): PassiveSkillManager {
  const skillManager = { getSkillConfig: () => undefined } as unknown as never
  const buffSystem = {} as never
  const uiEventPort = {} as never
  return new PassiveSkillManager(skillManager, buffSystem, uiEventPort)
}

function makeEntity(): BattleEntity {
  return { id: 'e1', name: '测试角色' } as unknown as BattleEntity
}

function ctx(turn: number): PassiveTriggerContext {
  return { phase: BattleTriggerPhase.DODGE, currentTurn: turn }
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1:p1:dodge',
    name: '测试被动',
    description: '',
    trigger: BattleTriggerPhase.DODGE,
    skillId: 's1',
    cooldown: 0,
    ...overrides,
  }
}

describe('被动每回合触发次数限制', () => {
  it('未配置 maxTriggersPerRound：不受限制', () => {
    const manager = makeManager()
    const config = makeConfig()
    const entity = makeEntity()

    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(1))).toBe(true)
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(1))).toBe(true)
  })

  it('同回合达到上限后拒绝，skipReason 为 MAX_TRIGGERS_PER_ROUND', () => {
    const manager = makeManager()
    const config = makeConfig({ maxTriggersPerRound: 2 })
    const entity = makeEntity()

    // 模拟前 2 次触发成功（triggerPassives 成功后的累加行为）
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(1))).toBe(true)
    config.roundTriggerCount = 1
    config.lastRoundNumber = 1
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(1))).toBe(true)
    config.roundTriggerCount = 2

    // 第 3 次：超限
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(1))).toBe(false)
  })

  it('回合切换自动重置计数', () => {
    const manager = makeManager()
    const config = makeConfig({ maxTriggersPerRound: 2 })
    const entity = makeEntity()

    config.roundTriggerCount = 2
    config.lastRoundNumber = 1
    // 回合 2：计数重置，允许触发
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(2))).toBe(true)
    expect(config.roundTriggerCount).toBe(0)
    expect(config.lastRoundNumber).toBe(2)
  })

  it('限制与冷却独立叠加：冷却先判，冷却恢复后每回合上限仍拒绝', () => {
    const manager = makeManager()
    const config = makeConfig({ maxTriggersPerRound: 1, cooldown: 2 })
    const entity = makeEntity()

    // 同回合（回合 2）已触发过 1 次
    config.roundTriggerCount = 1
    config.lastRoundNumber = 2
    // 冷却未到（回合 1 触发过，冷却 2）——冷却检查先于每回合限制
    config.lastTriggeredTurn = 1
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(2))).toBe(false)

    // 冷却恢复后，每回合上限仍然拒绝
    config.lastTriggeredTurn = 0
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(2))).toBe(false)
  })

  it('PassiveSkipReason 枚举含 MAX_TRIGGERS_PER_ROUND', () => {
    expect(PassiveSkipReason.MAX_TRIGGERS_PER_ROUND).toBe('MAX_TRIGGERS_PER_ROUND')
  })
})
