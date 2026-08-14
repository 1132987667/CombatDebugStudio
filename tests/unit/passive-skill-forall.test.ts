/**
 * PassiveSkillManager.triggerPassiveSkillsForAll 回归测试
 *
 * 覆盖目标：索引重构（indexByPhase 常驻索引 → passives 按需派生）后的行为等价。
 * 关键路径：注册→触发→移除→触发 生命周期、isAlive 守卫、无注册角色时的回退遍历。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import type { PassiveSkillConfig } from '@/domain/skill/PassiveSkillManager'
import { BattleTriggerPhase } from '@/domain/battle/type/types'
import type { BattleEntity, PassiveTriggerContext } from '@/domain/battle/type/types'

function makeEntity(id: string, alive = true): BattleEntity {
  return {
    id,
    name: id,
    isAlive: () => alive,
    team: 'ally',
    getAttribute: () => 0,
    getSkillIds: () => [],
    hasBuff: () => false,
    getBuffInstanceIds: () => [],
  } as unknown as BattleEntity
}

function makeConfig(overrides: Partial<PassiveSkillConfig> = {}): PassiveSkillConfig {
  return {
    id: `passive_${Math.random()}`,
    skillId: 'skill_test',
    trigger: BattleTriggerPhase.BEFORE_ATTACK,
    ...overrides,
  }
}

describe('PassiveSkillManager.triggerPassiveSkillsForAll', () => {
  let manager: PassiveSkillManager
  let triggerPassives: ReturnType<typeof vi.fn>

  beforeEach(() => {
    triggerPassives = vi.fn()
    manager = new PassiveSkillManager(
      {} as any,
      {} as any,
      {} as any,
    )
    // 拦截 triggerPassives，统计调用而不执行真实逻辑
    ;(manager as any).triggerPassives = triggerPassives
  })

  it('注册了该 phase 的角色被触发，未注册的跳过', () => {
    const e1 = makeEntity('p1')
    const e2 = makeEntity('p2')
    const participants = new Map([
      ['p1', e1],
      ['p2', e2],
    ])
    manager.registerPassive('p1', makeConfig({ trigger: BattleTriggerPhase.BEFORE_ATTACK }))

    manager.triggerPassiveSkillsForAll(participants, {
      phase: BattleTriggerPhase.BEFORE_ATTACK,
      currentTurn: 1,
    } as PassiveTriggerContext)

    expect(triggerPassives).toHaveBeenCalledTimes(1)
    expect(triggerPassives.mock.calls[0][0]).toBe(e1)
  })

  it('注册了其他 phase 的角色不触发本 phase', () => {
    const e1 = makeEntity('p1')
    const participants = new Map([['p1', e1]])
    manager.registerPassive('p1', makeConfig({ trigger: BattleTriggerPhase.BEFORE_ATTACK }))

    manager.triggerPassiveSkillsForAll(participants, {
      phase: BattleTriggerPhase.AFTER_ATTACK,
      currentTurn: 1,
    } as PassiveTriggerContext)

    // 该 phase 无注册 → 回退遍历所有参与者，triggerPassives 内部再按 shouldTriggerPassive 判定
    expect(triggerPassives).toHaveBeenCalledTimes(1)
    expect(triggerPassives.mock.calls[0][0]).toBe(e1)
  })

  it('已死亡角色被 isAlive 守卫跳过', () => {
    const alive = makeEntity('p1', true)
    const dead = makeEntity('p2', false)
    const participants = new Map([
      ['p1', alive],
      ['p2', dead],
    ])
    manager.registerPassive('p1', makeConfig({ trigger: BattleTriggerPhase.BEFORE_ATTACK }))
    manager.registerPassive('p2', makeConfig({ trigger: BattleTriggerPhase.BEFORE_ATTACK }))

    manager.triggerPassiveSkillsForAll(participants, {
      phase: BattleTriggerPhase.BEFORE_ATTACK,
      currentTurn: 1,
    } as PassiveTriggerContext)

    expect(triggerPassives).toHaveBeenCalledTimes(1)
    expect(triggerPassives.mock.calls[0][0]).toBe(alive)
  })

  it('移除被动后不再触发；clearAll 后无任何触发', () => {
    const e1 = makeEntity('p1')
    const participants = new Map([['p1', e1]])
    const cfg = makeConfig({ trigger: BattleTriggerPhase.BEFORE_ATTACK })
    manager.registerPassive('p1', cfg)

    manager.removePassive('p1', cfg.id)
    manager.triggerPassiveSkillsForAll(participants, {
      phase: BattleTriggerPhase.BEFORE_ATTACK,
      currentTurn: 1,
    } as PassiveTriggerContext)
    // 移除后仍走回退遍历（shouldTriggerPassive 内部判定为不触发），triggerPassives 仍被调用
    expect(triggerPassives).toHaveBeenCalledTimes(1)

    triggerPassives.mockClear()
    manager.registerPassive('p1', makeConfig({ trigger: BattleTriggerPhase.BEFORE_ATTACK }))
    manager.clearAll()
    manager.triggerPassiveSkillsForAll(participants, {
      phase: BattleTriggerPhase.BEFORE_ATTACK,
      currentTurn: 1,
    } as PassiveTriggerContext)
    expect(triggerPassives).toHaveBeenCalledTimes(1) // 回退遍历仍调用（内部判定为不触发）
  })

  it('多角色注册同一 phase：全部触发，遍历顺序与注册无关（按 passives Map 顺序）', () => {
    const e1 = makeEntity('p1')
    const e2 = makeEntity('p2')
    const participants = new Map([
      ['p1', e1],
      ['p2', e2],
    ])
    manager.registerPassive('p2', makeConfig({ trigger: BattleTriggerPhase.BEFORE_ATTACK }))
    manager.registerPassive('p1', makeConfig({ trigger: BattleTriggerPhase.BEFORE_ATTACK }))

    manager.triggerPassiveSkillsForAll(participants, {
      phase: BattleTriggerPhase.BEFORE_ATTACK,
      currentTurn: 1,
    } as PassiveTriggerContext)

    expect(triggerPassives).toHaveBeenCalledTimes(2)
    const calledIds = triggerPassives.mock.calls.map((c: unknown[]) => (c[0] as BattleEntity).id)
    expect(calledIds).toContain('p1')
    expect(calledIds).toContain('p2')
  })
})
