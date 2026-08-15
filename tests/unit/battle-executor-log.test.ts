/**
 * BattleExecutor 日志发射器（emitSkillLog / emitAttackLog）输出契约测试
 *
 * 特征锁定：重构前后日志面板的行为契约（message 文本 / segments 着色 / category / meta 字段），
 * 防止未来日志拼装回归。只验证日志输出，不跑战斗流程（无动画/结算依赖）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BattleExecutor } from '@/domain/battle/service/BattleExecutor'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import { BATTLE_LOG_CATEGORIES } from '@/shared/types/battle-log'
import type { BattleData, BattleEntity } from '@/domain/battle/type/types'
import { ParticipantSide, ActionTypes } from '@/domain/battle/type/types'
import { ActionResultType } from '@/domain/skill/types'
import { SeededRandom } from '@/shared/utils/SeededRandom'

// 镜像 BattleExecutor 内的局部 DTO（非导出，测试侧定义同构结构）
interface TestTargetResult {
  target: BattleEntity
  hpBefore: number
  hpAfter: number
  damage: number
  heal: number
  rawDamage: number
}

interface TestActionManifest {
  type: 'skill' | 'attack'
  source: BattleEntity
  targets: BattleEntity[]
  skillName: string
  skillId?: string
  isMiss: boolean
  isCrit: boolean
  totalDamage: number
  totalHeal: number
  results: TestTargetResult[]
}

const mockEventBus = {
  emit: () => {},
  on: () => {},
  off: () => {},
  offByListenerId: () => {},
} as any

function makeEntity(
  id: string,
  name: string,
  team: 'ally' | 'enemy',
  hp: number,
): BattleEntity {
  return {
    id,
    name,
    team,
    currentHealth: hp,
    isAlive: () => hp > 0,
    afterAction: () => {},
  } as unknown as BattleEntity
}

function makeBattle(): BattleData {
  return { currentTurn: 1 } as unknown as BattleData
}

describe('BattleExecutor 日志发射器', () => {
  let executor: BattleExecutor
  let skillManager: SkillManager
  let addBattleLog: ReturnType<typeof vi.fn>
  let flushBufferedSubLogs: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const registry = new BuffScriptRegistry()
    const buffSystem = new BuffSystem(registry, mockEventBus, {
      addDebugLog: () => {},
    } as any)
    skillManager = new SkillManager(buffSystem)
    skillManager.setSkillConfig('skill_fireball', {
      id: 'skill_fireball',
      name: '火球术',
    } as any)
    skillManager.setSkillConfig('skill_heal', {
      id: 'skill_heal',
      name: '治疗术',
    } as any)
    skillManager.setSkillConfig('skill_taunt', {
      id: 'skill_taunt',
      name: '嘲讽',
    } as any)
    executor = new BattleExecutor(
      skillManager,
      {} as any,
      { triggerPassives: vi.fn(), drainLastTriggeredPassives: () => [] } as any,
      { recordAction: vi.fn(), recordCombatRecord: vi.fn() } as any,
      {} as any,
      buffSystem,
    )

    addBattleLog = vi.fn()
    flushBufferedSubLogs = vi.fn()
    LoggerProvider.logger = createMockLogManager({
      addBattleLog,
      flushBufferedSubLogs,
    })
  })

  const skillManifest = (
    overrides: Partial<TestActionManifest> = {},
  ): TestActionManifest => ({
    type: 'skill',
    source: makeEntity('s1', '剑客', ParticipantSide.ALLY, 100),
    targets: [makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50)],
    skillName: '火球术',
    skillId: 'skill_fireball',
    isMiss: false,
    isCrit: false,
    totalDamage: 0,
    totalHeal: 0,
    results: [],
    ...overrides,
  })

  it('技能伤害：action 日志（DAMAGE + rawDamage 文本 + meta）+ 目标 sub 日志', () => {
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50)
    const results: TestTargetResult[] = [
      { target, hpBefore: 50, hpAfter: 20, damage: 30, heal: 0, rawDamage: 35 },
    ]
    ;(executor as any).emitSkillLog(
      makeBattle(),
      skillManifest({ isCrit: true, totalDamage: 30, results }),
    )

    expect(addBattleLog).toHaveBeenCalledTimes(2)
    const [action, sub] = addBattleLog.mock.calls.map((c) => c[0])

    // action 日志：减免前原始伤害（totalRawDamage）进文本 + meta.damage；rawDamage 不再显示
    expect(action.message).toBe(
      '[友方]剑客 对 [敌方]史莱姆 使用 【火球术】，★ 暴击!，造成 35 点伤害',
    )
    expect(action.category).toBe(BATTLE_LOG_CATEGORIES.DAMAGE)
    expect(action.meta).toMatchObject({
      role: 'action',
      entityId: 't1',
      hpBefore: 50,
      hpAfter: 20,
      damage: 30,
      crit: true,
      kill: false,
      skillName: '火球术',
    })
    // 实体段着色 + 技能段 hover
    expect(action.segments[0]).toMatchObject({
      text: '[友方]剑客',
      classStr: 'log-friendly',
      kind: 'entity',
    })
    const skillSeg = action.segments.find((s: any) => s.kind === 'skill')
    expect(skillSeg).toMatchObject({
      text: '【火球术】',
      classStr: 'log-skill',
      hover: { kind: 'skill', id: 'skill_fireball' },
    })

    // sub 日志：finalDamage + 气血箭头
    expect(sub.message).toBe(
      '[敌方]史莱姆 受到 30 点伤害  50 → 20',
    )
    expect(sub.category).toBe(BATTLE_LOG_CATEGORIES.DAMAGE)
    expect(sub.meta).toMatchObject({
      role: 'sub',
      entityId: 't1',
      hpBefore: 50,
      hpAfter: 20,
      damage: 30,
    })
    const dmgSeg = sub.segments.find((s: any) => s.kind === 'damage')
    expect(dmgSeg).toMatchObject({ text: '30', classStr: 'log-damage' })
  })

  it('技能伤害 + 击杀：action meta.kill = true（驱动回合"击杀!"标签）', () => {
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50)
    const dead = { ...target, isAlive: () => false }
    const results: TestTargetResult[] = [
      { target: dead as BattleEntity, hpBefore: 50, hpAfter: 0, damage: 50, heal: 0, rawDamage: 55 },
    ]
    ;(executor as any).emitSkillLog(
      makeBattle(),
      skillManifest({ totalDamage: 50, results }),
    )

    const action = addBattleLog.mock.calls[0][0]
    expect(action.meta.kill).toBe(true)
  })

  it('技能纯治疗（results 为空）：action 日志 HEAL + 恢复文本，无 sub；meta 无 entityId/hp 快照（治疗路径不填充 results，保持现状）', () => {
    const target = makeEntity('t1', '治疗目标', ParticipantSide.ALLY, 30)
    ;(executor as any).emitSkillLog(
      makeBattle(),
      skillManifest({
        source: makeEntity('s1', '牧师', ParticipantSide.ALLY, 100),
        targets: [target],
        skillName: '治疗术',
        skillId: 'skill_heal',
        totalHeal: 25,
      }),
    )

    expect(addBattleLog).toHaveBeenCalledTimes(1)
    const action = addBattleLog.mock.calls[0][0]
    expect(action.message).toBe(
      '[友方]牧师 对 [友方]治疗目标 使用 【治疗术】，恢复 25 点气血',
    )
    expect(action.category).toBe(BATTLE_LOG_CATEGORIES.HEAL)
    expect(action.meta).toMatchObject({
      role: 'action',
      skillName: '治疗术',
      crit: false,
      kill: false,
    })
    // 治疗路径不填 results → 无 entityId/hp 快照（与重构前一致）
    expect(action.meta.entityId).toBeUndefined()
    expect(action.meta.hpBefore).toBeUndefined()
    expect(action.meta.hpAfter).toBeUndefined()
  })

  it('技能零伤害零治疗：action 日志 STATUS，无伤害文本', () => {
    ;(executor as any).emitSkillLog(
      makeBattle(),
      skillManifest({ skillName: '嘲讽', skillId: 'skill_taunt' }),
    )

    expect(addBattleLog).toHaveBeenCalledTimes(1)
    const action = addBattleLog.mock.calls[0][0]
    expect(action.message).toBe(
      '[友方]剑客 对 [敌方]史莱姆 使用 【嘲讽】',
    )
    expect(action.category).toBe(BATTLE_LOG_CATEGORIES.STATUS)
  })

  it('技能多目标：", " 分隔 + 每目标独立 entity 段（独立着色）+ 每条 sub', () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const t1 = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50)
    const t2 = makeEntity('t2', '骷髅', ParticipantSide.ENEMY, 40)
    ;(executor as any).emitSkillLog(
      makeBattle(),
      skillManifest({
        targets: [t1, t2],
        totalDamage: 55,
        results: [
          { target: t1, hpBefore: 50, hpAfter: 20, damage: 30, heal: 0, rawDamage: 35 },
          { target: t2, hpBefore: 40, hpAfter: 15, damage: 25, heal: 0, rawDamage: 28 },
        ],
      }),
    )

    expect(addBattleLog).toHaveBeenCalledTimes(3) // action + 2 sub
    const [action, sub1, sub2] = addBattleLog.mock.calls.map((c) => c[0])

    // header：减免前原始伤害总和（totalRawDamage）进文本，目标间 ", " 分隔
    expect(action.message).toBe(
      '[友方]剑客 对 [敌方]史莱姆, [敌方]骷髅 使用 【火球术】，造成 63 点伤害',
    )
    const targetSegs = action.segments.filter((s: any) => s.kind === 'entity')
    expect(targetSegs.map((s: any) => s.text)).toEqual([
      '[友方]剑客',
      '[敌方]史莱姆',
      '[敌方]骷髅',
    ])
    expect(targetSegs.every((s: any) => s.classStr === 'log-hostile' || s.classStr === 'log-friendly')).toBe(true)

    expect(sub1.message).toBe('[敌方]史莱姆 受到 30 点伤害  50 → 20')
    expect(sub2.message).toBe('[敌方]骷髅 受到 25 点伤害  40 → 15')
  })

  it('日志发射顺序：action → flushBufferedSubLogs → result sub（BEFORE_ATTACK 被动日志夹在中间）', () => {
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50)
    const results: TestTargetResult[] = [
      { target, hpBefore: 50, hpAfter: 20, damage: 30, heal: 0, rawDamage: 35 },
    ]
    ;(executor as any).emitSkillLog(
      makeBattle(),
      skillManifest({ totalDamage: 30, results }),
    )

    expect(addBattleLog).toHaveBeenCalledTimes(2)
    const actionOrder = addBattleLog.mock.invocationCallOrder[0]
    const subOrder = addBattleLog.mock.invocationCallOrder[1]
    const flushOrder = flushBufferedSubLogs.mock.invocationCallOrder[0]
    expect(actionOrder).toBeLessThan(flushOrder)
    expect(flushOrder).toBeLessThan(subOrder)
  })

  it('普攻命中暴击：action 日志 CRIT + 原始伤害文本（rawDamage）+ sub 显示最终承伤', () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50)
    ;(executor as any).emitAttackLog(makeBattle(), {
      type: 'attack',
      source,
      targets: [target],
      skillName: '普通攻击',
      isMiss: false,
      isCrit: true,
      totalDamage: 30,
      totalHeal: 0,
      results: [
        { target, hpBefore: 50, hpAfter: 20, damage: 30, heal: 0, rawDamage: 35 },
      ],
    })

    expect(addBattleLog).toHaveBeenCalledTimes(2)
    const [action, sub] = addBattleLog.mock.calls.map((c) => c[0])

    // 「造成」= 减免前原始伤害（rawDamage）；「受到」sub = 最终承伤
    expect(action.message).toBe(
      '[友方]剑客 对 [敌方]史莱姆 发起「普通攻击」，★ 暴击!，造成 35 点伤害',
    )
    expect(action.category).toBe(BATTLE_LOG_CATEGORIES.CRIT)
    expect(action.meta).toMatchObject({
      role: 'action',
      entityId: 't1',
      hpBefore: 50,
      hpAfter: 20,
      damage: 30,
      rawDamage: 35,
      crit: true,
      kill: false,
      skillName: '普通攻击',
    })
    expect(sub.message).toBe(
      '[敌方]史莱姆 受到 30 点伤害  50 → 20',
    )
  })

  it('普攻被闪避：action 日志 STATUS + "被闪避!" sub', () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50)
    ;(executor as any).emitAttackLog(makeBattle(), {
      type: 'attack',
      source,
      targets: [target],
      skillName: '普通攻击',
      isMiss: true,
      isCrit: false,
      totalDamage: 0,
      totalHeal: 0,
      results: [],
    })

    expect(addBattleLog).toHaveBeenCalledTimes(2)
    const [action, sub] = addBattleLog.mock.calls.map((c) => c[0])

    expect(action.message).toBe(
      '[友方]剑客 对 [敌方]史莱姆 发起「普通攻击」',
    )
    expect(action.category).toBe(BATTLE_LOG_CATEGORIES.STATUS)
    expect(action.meta).toMatchObject({
      role: 'action',
      entityId: 't1',
      miss: true,
      skillName: '普通攻击',
    })
    expect(sub.message).toBe('被闪避!')
    expect(sub.meta).toMatchObject({ role: 'sub', miss: true })
  })

  it('技能执行异常：输出降级警告日志并降级为普攻（风险点 3 兜底）', async () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const battle = {
      currentTurn: 1,
      battleId: 'b1',
      participants: new Map<string, BattleEntity>([['s1', source]]),
      actions: [],
      rng: new SeededRandom('test-seed'),
    } as unknown as BattleData
    const skill = {
      id: 'skill_fireball',
      name: '火球术',
      selector: { faction: 'self' },
    } as any
    const executeSkill = vi
      .spyOn(skillManager, 'executeSkill')
      .mockImplementation(() => {
        throw new Error('boom')
      })

    const action = await executor.selectAndExecuteSkill(battle, source, skill)

    expect(executeSkill).toHaveBeenCalled()
    // 降级为普通攻击
    expect(action.type).toBe('attack')
    expect(action.damage).toBeGreaterThan(0)
    // 用户可见的降级警告日志
    const warn = addBattleLog.mock.calls.find((c: any[]) =>
      c[0].message.includes('发生异常'),
    )
    expect(warn).toBeTruthy()
    expect(warn[0].message).toBe(
      '[友方]剑客 尝试使用 【火球术】 时发生异常，降级为普通攻击',
    )
    expect(warn[0].category).toBe(BATTLE_LOG_CATEGORIES.STATUS)
    expect(warn[0].meta).toMatchObject({
      role: 'action',
      skillName: '火球术',
    })
  })

  it('executeAction fallback 普攻：飞行→命中结算→特效，并记录动作（executeDefaultAction 兜底路径）', async () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const target = {
      ...makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 50),
      takeDamage: (n: number) => n,
      heal: () => 0,
    } as unknown as BattleEntity
    const battle = {
      currentTurn: 1,
      battleId: 'b1',
      participants: new Map<string, BattleEntity>([
        ['s1', source],
        ['t1', target],
      ]),
      actions: [],
      rng: new SeededRandom('test-seed'),
    } as unknown as BattleData
    const flight = vi.fn().mockResolvedValue(undefined)
    const impact = vi.fn().mockResolvedValue(undefined)
    ;(executor as any).animationManager = {
      triggerAnimationAndWait: vi.fn().mockResolvedValue(undefined),
      triggerFlightPhaseAndWait: flight,
      triggerImpactPhaseAndWait: impact,
      triggerDirectImpactAndWait: vi.fn().mockResolvedValue(undefined),
      triggerMissImpactAndWait: vi.fn().mockResolvedValue(undefined),
      triggerBuffEffectAndWait: vi.fn().mockResolvedValue(undefined),
    }
    const recordAction = (executor as any).battleRecorder.recordAction

    await (executor as any).executeAction(battle, {
      id: 'action_1',
      type: ActionTypes.ATTACK,
      sourceId: 's1',
      targetId: 't1',
      damage: 30,
      success: true,
      timestamp: Date.now(),
      turn: 1,
      effects: [{ type: ActionResultType.DAMAGE, value: 30, description: '普通攻击' }],
    })

    expect(flight).toHaveBeenCalled()
    expect(impact).toHaveBeenCalled()
    expect(recordAction).toHaveBeenCalled()
    expect(battle.actions.length).toBe(1)
  })
})
