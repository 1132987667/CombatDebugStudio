import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillExecutor } from '@/domain/skill/SkillExecutor'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide, ActionTypes } from '@/domain/battle/type/types'
import { BaseBattleAI } from '@/domain/battle/ai/BattleAI'
import { createParticipantFromEnemy } from '@tests/fixtures/participants'
import { getSkillConfig } from '@tests/fixtures/loadTestData'
import type { CustomStepParams, ExtendedSkillStep } from '@/domain/skill/types'

vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} },
  default: {},
}))
vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
    setTimeout = (fn: (...args: unknown[]) => void) => {
      fn()
      return Symbol('mock')
    }
    setInterval = () => Symbol('mock')
    clearTimeout = () => {}
    clearInterval = () => {}
  },
}))

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  offByListenerId: vi.fn(),
}

describe('noAttack 木人', () => {
  it('enemyToParticipant 传递 noAttack 标志（木人为 true，普通单位为 false）', () => {
    const dummy = createParticipantFromEnemy('test_dummy_low', ParticipantSide.ENEMY)
    expect(dummy?.noAttack).toBe(true)
    const normal = createParticipantFromEnemy('guardian_wood', ParticipantSide.ENEMY)
    expect(normal?.noAttack).toBeFalsy()
  })

  it('noAttack 单位 AI 决策返回 skip 动作', () => {
    const dummy = createParticipantFromEnemy('test_dummy_low', ParticipantSide.ENEMY)
    if (!dummy) return
    const ai = new BaseBattleAI()
    const action = ai.makeDecision({ currentTurn: 3 } as any, dummy)
    expect(action.type).toBe(ActionTypes.SKIP)
    expect(action.targetId).toBe(dummy.id)
  })

  it('普通单位 AI 决策不返回 skip', () => {
    const normal = createParticipantFromEnemy('guardian_wood', ParticipantSide.ENEMY)
    if (!normal) return
    const ai = new BaseBattleAI()
    const action = ai.makeDecision({ currentTurn: 3 } as any, normal)
    expect(action.type).not.toBe(ActionTypes.SKIP)
  })
})

describe('轮转 buff custom step', () => {
  let executor: SkillExecutor
  let buffSystem: BuffSystem

  beforeEach(() => {
    BattleParticipantImpl.eventBus = mockEventBus as any
    const registry = new BuffScriptRegistry()
    const mockLogger = {
      addDebugLog: vi.fn(),
      addSystemLog: vi.fn(),
      addBattleLog: vi.fn(),
      addActionLog: vi.fn(),
      clearLogs: vi.fn(),
      syncBattleLogs: vi.fn(),
    } as any
    buffSystem = new BuffSystem(registry, mockEventBus, mockLogger)
    executor = new SkillExecutor(
      new DamageCalculator(),
      new HealCalculator(),
      buffSystem,
    )
  })

  it('控制轮转：按 buffIds 顺序逐个施加，到末尾后循环', () => {
    const source = createParticipantFromEnemy(
      'test_control_rotator',
      ParticipantSide.ALLY,
    )
    if (!source) return
    const step = getSkillConfig(
      'test_passive_control_rotator',
    )?.steps[0] as ExtendedSkillStep
    expect(step).toBeTruthy()
    const buffIds = (step.parameters as CustomStepParams).buffIds
    expect(buffIds.length).toBeGreaterThan(1)

    const action = { effects: [] } as any
    // 连续 N+1 次施加，每次验证轮转指针指向的 buff
    for (let i = 0; i < buffIds.length + 1; i++) {
      const target = createParticipantFromEnemy(
        'test_dummy_mid',
        ParticipantSide.ENEMY,
      )
      if (!target) continue
      target.setBuffQuery(buffSystem as any)
      executor.executeStep(step, action, source, target, {} as any)
      const expected = buffIds[i % buffIds.length]
      expect(target.hasBuff(expected)).toBe(true)
      // 其余 buff 不应在目标身上
      for (const other of buffIds) {
        if (other !== expected) {
          expect(target.hasBuff(other)).toBe(false)
        }
      }
    }
  })

  it('dot 轮转：以 3 层施加，且每次施加的 buff 按顺序轮转', () => {
    const source = createParticipantFromEnemy(
      'test_dot_rotator',
      ParticipantSide.ALLY,
    )
    if (!source) return
    const step = getSkillConfig(
      'test_passive_dot_rotator',
    )?.steps[0] as ExtendedSkillStep
    expect(step).toBeTruthy()
    const buffIds = (step.parameters as CustomStepParams).buffIds
    expect(step.stacks).toBe(3)

    const action = { effects: [] } as any
    for (let i = 0; i < buffIds.length; i++) {
      const target = createParticipantFromEnemy(
        'test_dummy_high',
        ParticipantSide.ENEMY,
      )
      if (!target) continue
      target.setBuffQuery(buffSystem as any)
      executor.executeStep(step, action, source, target, {} as any)
      const expected = buffIds[i % buffIds.length]
      expect(target.hasBuff(expected)).toBe(true)
      // 验证层数达到 3
      const instances = buffSystem
        .getBuffInstances(target.id)
        .filter((inst) => inst.buffId === expected)
      expect(instances.length).toBeGreaterThan(0)
      expect(instances[0].currentStacks).toBe(3)
    }
  })

  it('无脚本 dot buff 叠满 3 层后再施加：不崩溃且保持 3 层（满层刷新路径）', () => {
    const source = createParticipantFromEnemy(
      'test_control_rotator',
      ParticipantSide.ALLY,
    )
    const target = createParticipantFromEnemy(
      'test_dummy_high',
      ParticipantSide.ENEMY,
    )
    if (!source || !target) return
    target.setBuffQuery(buffSystem as any)

    // 只有 1 个 buff 的轮转步骤 → 每次都施加 buff_suffocation
    const step = {
      type: 'custom',
      targetConfig: { faction: 'enemy' },
      duration: 1,
      stacks: 3,
      parameters: {
        customType: 'rotating_apply_buff',
        buffIds: ['buff_suffocation'],
      },
    } as ExtendedSkillStep
    const action = { effects: [] } as any

    // 第 1 次：1 层创建 + 2 次叠层 = 3 层
    // 第 2~4 次：每次都会走到 LIMIT 满层刷新分支（无脚本 buff，script 为 null）
    for (let i = 0; i < 4; i++) {
      executor.executeStep(step, action, source, target, {} as any)
    }

    const instances = buffSystem
      .getBuffInstances(target.id)
      .filter((inst) => inst.buffId === 'buff_suffocation')
    expect(instances.length).toBeGreaterThan(0)
    // 满层刷新：层数保持 3，不超上限
    expect(instances[0].currentStacks).toBe(3)
  })

  it('duration=1 的 buff 持续到下一个回合结束（当轮不扣减，下轮结算移除）', () => {
    const source = createParticipantFromEnemy(
      'test_control_rotator',
      ParticipantSide.ALLY,
    )
    const target = createParticipantFromEnemy(
      'test_dummy_high',
      ParticipantSide.ENEMY,
    )
    if (!source || !target) return
    target.setBuffQuery(buffSystem as any)

    const step = {
      type: 'custom',
      targetConfig: { faction: 'enemy' },
      duration: 1,
      stacks: 1,
      parameters: {
        customType: 'rotating_apply_buff',
        buffIds: ['buff_suffocation'],
      },
    } as ExtendedSkillStep
    const action = { effects: [], turn: 1 } as any

    // 第 1 回合施加 duration=1 的 buff
    executor.executeStep(step, action, source, target, {} as any)
    expect(target.hasBuff('buff_suffocation')).toBe(true)

    // 施加当轮的结算不扣减 → 持续到下一个回合结束
    buffSystem.updatePerTurn(target.id, 1)
    expect(target.hasBuff('buff_suffocation')).toBe(true)

    // 下一回合的结算 → 移除
    buffSystem.updatePerTurn(target.id, 2)
    expect(target.hasBuff('buff_suffocation')).toBe(false)
  })

  it('duration=1 的 dot：施加当轮不跳伤，下轮跳伤 1 次后移除（tick 与行动顺序无关）', () => {
    const damageRequests: Array<{
      targetId: string
      damage: number
      damagePercent?: number
    }> = []
    buffSystem.setDamageCallback((targetId, damage, _raw, damagePercent) => {
      damageRequests.push({ targetId, damage, damagePercent })
    })

    const source = createParticipantFromEnemy(
      'test_control_rotator',
      ParticipantSide.ALLY,
    )
    const target = createParticipantFromEnemy(
      'test_dummy_high',
      ParticipantSide.ENEMY,
    )
    if (!source || !target) return
    target.setBuffQuery(buffSystem as any)

    const step = {
      type: 'custom',
      targetConfig: { faction: 'enemy' },
      duration: 1,
      stacks: 1,
      parameters: {
        customType: 'rotating_apply_buff',
        buffIds: ['buff_suffocation'],
      },
    } as ExtendedSkillStep
    const action = { effects: [], turn: 1 } as any

    executor.executeStep(step, action, source, target, {} as any)

    // 施加当轮的结算：不触发 dot tick（buff 尚未开始计伤害周期）
    buffSystem.updatePerTurn(target.id, 1)
    expect(damageRequests.length).toBe(0)
    expect(target.hasBuff('buff_suffocation')).toBe(true)

    // 下一回合的结算：跳 1 次伤害（单层 3% 最大生命）后移除
    buffSystem.updatePerTurn(target.id, 2)
    expect(damageRequests.length).toBe(1)
    expect(damageRequests[0].damagePercent).toBeCloseTo(3 / 100)
    expect(target.hasBuff('buff_suffocation')).toBe(false)
  })
})
