/**
 * 连击引擎测试 — selectAndExecuteAttack 的连击段追加逻辑
 *
 * 覆盖：comboRate 概率判定（链式、确定性 rng）、comboDamageCoefficient 伤害缩放、
 * 连击段闪避中断、目标死亡中断、MAX_COMBO_SEGMENTS 段数上限、
 * 连击段被动上下文携带 comboSegment（"连击第 N 段"类条件的数据基础）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BattleExecutor } from '@/domain/battle/service/BattleExecutor'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BattleTriggerPhase, BATTLE_CONSTANTS, ParticipantSide } from '@/domain/battle/type/types'
import type { BattleData, BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { DamageResult } from '@/domain/skill/DamageCalculator'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  offByListenerId: vi.fn(),
} as any

interface SetupOptions {
  comboRate?: number
  comboCoefficient?: number
  /** damageCalculator.calculateDamage 的返回序列 */
  damageResults: Array<Partial<DamageResult>>
  /** battle.rng.next() 的返回序列（连击判定消耗） */
  rngValues?: number[]
}

function makeEntity(
  id: string,
  name: string,
  team: 'ally' | 'enemy',
  hp: number,
  opts: SetupOptions,
): BattleEntity {
  const attrs: Record<string, number> = {
    [ATTRIBUTE_CODE.critRate]: 10,
    [ATTRIBUTE_CODE.critDamage]: 125,
  }
  if (opts.comboRate !== undefined) attrs[ATTRIBUTE_CODE.comboRate] = opts.comboRate
  if (opts.comboCoefficient !== undefined) {
    attrs[ATTRIBUTE_CODE.comboDamageCoefficient] = opts.comboCoefficient
  }
  return {
    id,
    name,
    team,
    currentHealth: hp,
    takeDamage(n: number) {
      // 真实扣血：isAlive 基于剩余气血，死亡中断由 hp 预算驱动
      const dealt = Math.min(this.currentHealth, n)
      this.currentHealth -= dealt
      return dealt
    },
    heal: () => 0,
    isAlive() {
      return this.currentHealth > 0
    },
    afterAction: () => {},
    getAttribute: (code: string) =>
      code in attrs ? attrs[code] : Number.NaN,
    getSkillIds: () => [],
    hasBuff: () => false,
  } as unknown as BattleEntity
}

function makeBattle(rngValues: number[]): BattleData {
  return {
    currentTurn: 1,
    battleId: 'b1',
    participants: new Map(),
    actions: [],
    rng: { next: () => rngValues.shift() ?? 0.99, nextInt: () => 1 },
  } as unknown as BattleData
}

function setup(opts: SetupOptions) {
  const registry = new BuffScriptRegistry()
  const buffSystem = new BuffSystem(registry, mockEventBus, createMockLogManager())
  buffSystem.getEventBus = vi.fn(() => mockEventBus)

  const triggerPassives = vi.fn()
  const passiveSkillManager = {
    triggerPassives,
    drainLastTriggeredPassives: () => [],
  } as any

  const calculateDamage = vi.fn()
  const damageResults = [...opts.damageResults]
  calculateDamage.mockImplementation(() => {
    const next = damageResults.shift()
    return {
      damage: 0,
      rawDamage: 0,
      isCritical: false,
      isMiss: false,
      ...next,
    }
  })

  const animationManager = {
    triggerFlightPhaseAndWait: vi.fn(async () => {}),
    triggerImpactPhaseAndWait: vi.fn(async () => {}),
    triggerMissImpactAndWait: vi.fn(async () => {}),
  }

  const battleRecorder = { recordCombatRecord: vi.fn(), recordAction: vi.fn() }
  const skillManager = {
    getExecutor: () => ({ cleanupComboState: vi.fn(), cleanupRotatingState: vi.fn() }),
  } as unknown as SkillManager

  const executor = new BattleExecutor(
    skillManager,
    { calculateDamage } as any,
    passiveSkillManager,
    battleRecorder as any,
    animationManager as any,
    buffSystem,
    undefined,
    undefined,
  )

  LoggerProvider.logger = createMockLogManager()
  return { executor, triggerPassives, calculateDamage, animationManager }
}

function buildBattle(source: BattleEntity, target: BattleEntity, rngValues: number[]) {
  const battle = makeBattle(rngValues)
  battle.participants.set(source.id, source)
  battle.participants.set(target.id, target)
  return battle
}

describe('连击引擎', () => {
  beforeEach(() => {
    mockEventBus.emit.mockClear()
  })

  it('comboRate 未配置（NaN）：只执行普攻单段', async () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      damageResults: [],
    })
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 500, {
      damageResults: [],
    })
    const { executor } = setup({ damageResults: [{ damage: 100, rawDamage: 110 }] })
    const battle = buildBattle(source, target, [])

    const action = await executor.selectAndExecuteAttack(battle, source, 't1')

    expect(action.damage).toBe(100)
  })

  it('comboRate 命中：追加连击段，伤害按 comboDamageCoefficient 缩放', async () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      comboRate: 30,
      comboCoefficient: 50,
      damageResults: [],
    })
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 500, {
      damageResults: [],
    })
    // rng 序列：segment2 判定 0.01（触发）、segment3 判定 0.99（不触发）
    const { executor, triggerPassives } = setup({
      damageResults: [
        { damage: 100, rawDamage: 110 },
        { damage: 100, rawDamage: 110 },
      ],
      rngValues: [0.01, 0.99],
    })
    const battle = buildBattle(source, target, [0.01, 0.99])

    const action = await executor.selectAndExecuteAttack(battle, source, 't1')

    // 第一段 100 + 连击段 100×50% = 150
    expect(action.damage).toBe(150)
    // 连击段 ON_HIT 被动携带 comboSegment=2
    const onHitCalls = triggerPassives.mock.calls.filter(
      (c: unknown[]) =>
        (c[1] as { phase: string }).phase === BattleTriggerPhase.ON_HIT &&
        (c[1] as { comboSegment?: number }).comboSegment !== undefined,
    )
    expect(onHitCalls).toHaveLength(1)
    expect(onHitCalls[0][1].comboSegment).toBe(2)
    expect(onHitCalls[0][1].damage).toBe(50)
  })

  it('连击段被闪避：链式中断，后续不再判定', async () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      comboRate: 100,
      comboCoefficient: 100,
      damageResults: [],
    })
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 500, {
      damageResults: [],
    })
    const { executor, animationManager } = setup({
      damageResults: [
        { damage: 100, rawDamage: 110 },
        { isMiss: true },
      ],
      rngValues: [0.01, 0.01, 0.01],
    })
    const battle = buildBattle(source, target, [0.01, 0.01, 0.01])

    const action = await executor.selectAndExecuteAttack(battle, source, 't1')

    expect(action.damage).toBe(100)
    expect(animationManager.triggerMissImpactAndWait).toHaveBeenCalled()
  })

  it('段数上限：comboRate 100% 时最多 MAX_COMBO_SEGMENTS 段', async () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      comboRate: 100,
      comboCoefficient: 100,
      damageResults: [],
    })
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 500, {
      damageResults: [],
    })
    const maxSegments = BATTLE_CONSTANTS.MAX_COMBO_SEGMENTS
    const { executor } = setup({
      damageResults: Array.from({ length: maxSegments }, () => ({
        damage: 10,
        rawDamage: 10,
      })),
      rngValues: Array.from({ length: maxSegments }, () => 0.01),
    })
    const battle = buildBattle(source, target, Array(maxSegments).fill(0.01))

    const action = await executor.selectAndExecuteAttack(battle, source, 't1')

    expect(action.damage).toBe(10 * maxSegments)
  })

  it('目标死亡中断：不再判定后续连击段', async () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      comboRate: 100,
      comboCoefficient: 100,
      damageResults: [],
    })
    // 气血 150：第一段扣 100 剩 50，第二段扣尽死亡 → 第三段循环条件中断
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 150, {
      damageResults: [],
    })
    const { executor } = setup({
      damageResults: [
        { damage: 100, rawDamage: 110 },
        { damage: 100, rawDamage: 110 },
      ],
      rngValues: [0.01, 0.01],
    })
    const battle = buildBattle(source, target, [0.01, 0.01])

    const action = await executor.selectAndExecuteAttack(battle, source, 't1')

    expect(action.damage).toBe(200)
    expect(target.isAlive()).toBe(false)
  })
})
