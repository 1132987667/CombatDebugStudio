/**
 * 流派机制第二批测试 — action_start / armorBreak / 必中 / combo 段条件 / no_shield 禁盾 / 守护转移 / 溅射
 *
 * 对应引擎改动：
 * - BattleTriggerPhase.ACTION_START（executeParticipantAction 发射）
 * - DamageCalculator 无视防御（armorBreak 缩放有效防御）与必中门控（buff_guaranteed_hit 跳过闪避判定）
 * - PassiveSkillManager 连击段条件（combo_segment_min）
 * - BuffSystem 护盾获得禁用（no_shield tag）与守护者参数查询
 * - BattleExecutor 守护转移（guardian tag）与溅射（splash 属性）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BattleExecutor } from '@/domain/battle/service/BattleExecutor'
import { SkillManager } from '@/domain/skill/SkillManager'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { DeferredDamageToken } from '@/domain/skill/DeferredDamageToken'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BuffSystem as BuffSystemType } from '@/domain/buff/BuffSystem'
import {
  BattleTriggerPhase,
  BATTLE_CONSTANTS,
  ParticipantSide,
} from '@/domain/battle/type/types'
import type { BattleData, BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { KNOWN_BUFF_IDS } from '@/domain/buff/types'
import type { DamageResult } from '@/domain/skill/DamageCalculator'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  offByListenerId: vi.fn(),
} as any

function makeEntity(
  id: string,
  name: string,
  team: 'ally' | 'enemy',
  hp: number,
  overrides: Record<string, unknown> = {},
): BattleEntity {
  const attrs: Record<string, number> = {
    [ATTRIBUTE_CODE.critRate]: 0,
    [ATTRIBUTE_CODE.critDamage]: 125,
  }
  if (overrides.attrs) Object.assign(attrs, overrides.attrs)
  return {
    id,
    name,
    team,
    currentHealth: hp,
    takeDamage(n: number) {
      const dealt = Math.min(this.currentHealth, n)
      this.currentHealth -= dealt
      return dealt
    },
    heal: () => 0,
    isAlive() {
      return this.currentHealth > 0
    },
    afterAction: () => {},
    // 未注册属性返回 0：与真实实体 getAttribute 语义对齐（NaN 会在伤害公式中扩散）
    getAttribute: (code: string) => (code in attrs ? attrs[code] : 0),
    getSkillIds: () => [],
    hasBuff: () => false,
    getBuffInstanceIds: () => [],
    seatIndex: overrides.seatIndex ?? 0,
    ...overrides,
  } as unknown as BattleEntity
}

function makeBattle(rngValues: number[] = []): BattleData {
  return {
    currentTurn: 1,
    battleId: 'b1',
    participants: new Map(),
    actions: [],
    rng: { next: () => rngValues.shift() ?? 0.99, nextInt: () => 0 },
  } as unknown as BattleData
}

// ==================== armorBreak 无视防御 ====================

describe('DamageCalculator.armorBreak 无视防御', () => {
  it('armorBreak=50、防御 100：有效防御 50，伤害比无 armorBreak 多 50', () => {
    const calc = new DamageCalculator({ enableDodge: false, enableCrit: false })
    const attackStep = {
      type: 'deal_damage',
      calculation: { baseValue: 1000, extraValues: [] },
      damageCategory: 'physical',
    } as any
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      attrs: { [ATTRIBUTE_CODE.armorBreak]: 50 },
    })
    const target = makeEntity('t1', '甲士', ParticipantSide.ENEMY, 2000, {
      attrs: { [ATTRIBUTE_CODE.defense]: 100 },
    })

    const withBreak = calc.calculateDamage(attackStep, source, target)
    // 无 armorBreak 基线
    source.getAttribute = () => Number.NaN
    const withoutBreak = calc.calculateDamage(attackStep, source, target)

    expect(withBreak.damage).toBe(950) // 1000 - 100×50%
    expect(withoutBreak.damage).toBe(900) // 1000 - 100
  })

  it('armorBreak=100：防御完全无效；armorBreak>100 按上限 100 处理', () => {
    const calc = new DamageCalculator({ enableDodge: false, enableCrit: false })
    const attackStep = {
      type: 'deal_damage',
      calculation: { baseValue: 1000, extraValues: [] },
      damageCategory: 'physical',
    } as any
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      attrs: { [ATTRIBUTE_CODE.armorBreak]: 150 },
    })
    const target = makeEntity('t1', '甲士', ParticipantSide.ENEMY, 2000, {
      attrs: { [ATTRIBUTE_CODE.defense]: 100 },
    })

    const result = calc.calculateDamage(attackStep, source, target)
    expect(result.damage).toBe(1000)
  })
})

// ==================== 必中标记 ====================

describe('DamageCalculator 必中标记（buff_guaranteed_hit）', () => {
  it('携带必中标记：跳过闪避判定，必命中', () => {
    const calc = new DamageCalculator({ enableDodge: true, enableCrit: false })
    calc.setRng({ next: () => 0.99 } as any) // 极低命中判定值——无标记必 miss
    const attackStep = {
      type: 'deal_damage',
      calculation: { baseValue: 100, extraValues: [] },
      damageCategory: 'physical',
    } as any
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      hasBuff: (id: string) => id === KNOWN_BUFF_IDS.GUARANTEED_HIT,
      attrs: { [ATTRIBUTE_CODE.hitValue]: 1, [ATTRIBUTE_CODE.dodgeValue]: 0 },
    })
    const target = makeEntity('t1', '刺客', ParticipantSide.ENEMY, 2000)

    const result = calc.calculateDamage(attackStep, source, target)
    expect(result.isMiss).toBe(false)
    expect(result.damage).toBe(100)
  })

  it('无必中标记：同条件下判定闪避（isMiss=true）', () => {
    const calc = new DamageCalculator({ enableDodge: true, enableCrit: false })
    calc.setRng({ next: () => 0.99 } as any)
    const attackStep = {
      type: 'deal_damage',
      calculation: { baseValue: 100, extraValues: [] },
      damageCategory: 'physical',
    } as any
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      attrs: { [ATTRIBUTE_CODE.hitValue]: 1, [ATTRIBUTE_CODE.dodgeValue]: 0 },
    })
    const target = makeEntity('t1', '刺客', ParticipantSide.ENEMY, 2000, {
      attrs: { [ATTRIBUTE_CODE.dodgeValue]: 10000 },
    })

    const result = calc.calculateDamage(attackStep, source, target)
    expect(result.isMiss).toBe(true)
    expect(result.damage).toBe(0)
  })
})

// ==================== 连击段条件 ====================

describe('PassiveSkillManager 连击段条件（combo_segment_min）', () => {
  function makeManager(): PassiveSkillManager {
    return new PassiveSkillManager(
      { getSkillConfig: () => undefined } as unknown as SkillManager,
      {} as never,
      {} as never,
    )
  }

  const baseConfig = {
    id: 'e1:p1:on_hit',
    name: '测试被动',
    description: '',
    trigger: BattleTriggerPhase.ON_HIT,
    skillId: 's1',
    cooldown: 0,
  }
  const entity = { id: 'e1', name: '测试' } as unknown as BattleEntity
  const ctx = (segment?: number) => ({
    phase: BattleTriggerPhase.ON_HIT,
    currentTurn: 1,
    comboSegment: segment,
  })

  it('comboSegment=3、min=3：满足（第 3 段及以后）', () => {
    const manager = makeManager()
    const config = { ...baseConfig, condition: 'combo_segment_min', conditionParams: { min: 3 } }
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(3))).toBe(true)
  })

  it('comboSegment=2、min=3：不满足（第 2 段不算第 3 段及以后）', () => {
    const manager = makeManager()
    const config = { ...baseConfig, condition: 'combo_segment_min', conditionParams: { min: 3 } }
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(2))).toBe(false)
  })

  it('普攻首段（comboSegment=1）或非连击触发（缺省）：不满足 min=2', () => {
    const manager = makeManager()
    const config = { ...baseConfig, condition: 'combo_segment_min', conditionParams: { min: 2 } }
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(1))).toBe(false)
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(undefined))).toBe(false)
  })

  it('缺少 params.min：条件抛错并按不满足处理', () => {
    const manager = makeManager()
    const config = { ...baseConfig, condition: 'combo_segment_min' }
    expect(manager.shouldTriggerPassive(config, entity, undefined, ctx(3))).toBe(false)
  })
})

// ==================== 无法获得护盾（no_shield） ====================

describe('BuffSystem 护盾获得禁用（no_shield tag）', () => {
  let buffSystem: BuffSystemType

  beforeEach(() => {
    buffSystem = new BuffSystem(new BuffScriptRegistry(), mockEventBus, createMockLogManager())
  })

  it('默认可获盾；携带 buff_suijia（no_shield tag）后禁止获盾', () => {
    expect(buffSystem.canGainShield('t1')).toBe(true)
    // buff_suijia 来自 buffs.json（tags: ["no_shield"]）
    buffSystem.addBuff('t1', 'buff_suijia', {}, 1)
    expect(buffSystem.canGainShield('t1')).toBe(false)
  })

  it('ShieldEffect.onApply 在禁用状态下跳过上盾', () => {
    buffSystem.addBuff('t1', 'buff_suijia', {}, 1)
    buffSystem.setShieldValue('t1', 0)
    // 通过 addBuff 施加一个带 ShieldEffect 的护盾 buff（buff_wind_shield 为 flat 护盾样例）
    const instId = buffSystem.addBuff('t1', 'buff_wind_shield', {}, 1)
    expect(instId).toBeTruthy()
    expect(buffSystem.getShieldValue('t1')).toBe(0)
  })

  it('ShieldEffect.onApply 在正常状态下正常上盾', () => {
    const instId = buffSystem.addBuff('t1', 'buff_wind_shield', {}, 1)
    expect(instId).toBeTruthy()
    expect(buffSystem.getShieldValue('t1')).toBeGreaterThan(0)
  })
})

// ==================== 守护转移（guardian tag） ====================

describe('BattleExecutor 守护转移', () => {
  let executor: BattleExecutor
  let buffSystem: BuffSystemType
  let triggerPassives: ReturnType<typeof vi.fn>
  let recordThreat: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, createMockLogManager())
    buffSystem.getEventBus = vi.fn(() => mockEventBus)
    triggerPassives = vi.fn()
    recordThreat = vi.fn()

    const skillManager = {
      getExecutor: () => ({ cleanupComboState: vi.fn(), cleanupRotatingState: vi.fn() }),
    } as unknown as SkillManager

    executor = new BattleExecutor(
      skillManager,
      {} as any,
      { triggerPassives, drainLastTriggeredPassives: () => [] } as any,
      {} as any,
      {} as any,
      buffSystem,
      undefined,
      { recordThreat } as any,
    )
    LoggerProvider.logger = createMockLogManager()
  })

  it('守护者有盾时代队友承受 50%（减伤 10% 后）：目标/守护者各 45', () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 500, {
      takeDamage: (n: number) => n, // 不真扣血，便于断言分摊值
    })
    const guardianTakeDamage = vi.fn((n: number) => n)
    const guardian = makeEntity('g1', '护卫', ParticipantSide.ENEMY, 500, {
      takeDamage: guardianTakeDamage,
    })
    buffSystem.addBuff('g1', 'buff_guardian', {}, 1) // percent 0.5 / reduction 0.1 / requireShield true
    buffSystem.setShieldValue('g1', 1000) // requireShield 检查需要盾存在

    const battle = makeBattle()
    battle.participants.set('t1', target)
    battle.participants.set('g1', guardian)

    const actual = executor.settleDamage(source, target, 100, 100, false, battle)

    // 100 × (1-0.1) = 90 → 守护者 45 / 目标 45
    expect(actual).toBe(45)
    expect(guardianTakeDamage).toHaveBeenCalledWith(45)
    // 守护者侧也发 DAMAGE_TAKEN 事件
    const g1Event = mockEventBus.emit.mock.calls.find(
      (c: unknown[]) => c[0] === BattleTriggerPhase.DAMAGE_TAKEN && (c[1] as any).targetId === 'g1',
    )
    expect(g1Event).toBeTruthy()
    expect(g1Event[1].value).toBe(45)
  })

  it('守护者无盾（requireShield）或无守护 buff：不转移', () => {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 500, {
      takeDamage: (n: number) => n,
    })
    const guardian = makeEntity('g1', '护卫', ParticipantSide.ENEMY, 500, {
      takeDamage: (n: number) => n,
    })
    buffSystem.addBuff('g1', 'buff_guardian', {}, 1)
    // 不给盾 → requireShield 不满足

    const battle = makeBattle()
    battle.participants.set('t1', target)
    battle.participants.set('g1', guardian)

    const actual = executor.settleDamage(source, target, 100, 100, false, battle)

    expect(actual).toBe(100)
    expect(guardian.currentHealth).toBe(500) // 守护者未承受伤害
  })
})

// ==================== 守护分摊按承接者面板重算减免 ====================

/**
 * 口径来源《流派文档》不动明王：「护盾存在时，队友受到的伤害降低 10%，自身承受该伤害的
 * 50%（此伤害可被免伤和护盾吸收）」。守护份额是它自己挨的一击，须吃守护者自身面板。
 *
 * 关键约束：防御是【减法】项，份额基数改为减免前后必须折算防御
 * （defenseScale = 份额/减免前），否则每份都被扣满整段防御 —— 中位数值档位
 * （攻 88 / 防 52）下会把整击归零，守护者变成团队免疫。
 */
describe('BattleExecutor 守护分摊按承接者面板重算', () => {
  let calc: DamageCalculator
  let executor: BattleExecutor
  let buffSystem: BuffSystemType

  const PHYSICAL_STEP = {
    type: 'deal_damage',
    calculation: { baseValue: 100, extraValues: [] },
    damageCategory: 'physical',
    attackType: 'normal',
  } as any

  beforeEach(() => {
    const registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus, createMockLogManager())
    buffSystem.getEventBus = vi.fn(() => mockEventBus)
    calc = new DamageCalculator({ enableDodge: false, enableCrit: false })

    const skillManager = {
      getExecutor: () => ({ cleanupComboState: vi.fn(), cleanupRotatingState: vi.fn() }),
    } as unknown as SkillManager

    executor = new BattleExecutor(
      skillManager,
      calc,
      { triggerPassives: vi.fn(), drainLastTriggeredPassives: () => [] } as any,
      {} as any,
      {} as any,
      buffSystem,
      undefined,
      undefined,
    )
    LoggerProvider.logger = createMockLogManager()
  })

  /** 与生产同构：BattleExecutor.createRedirectRecalc 就是包一层 recalcTargetMitigation */
  const recalcFor = (source: BattleEntity, step: any) =>
    (share: number, guardian: BattleEntity, defenseScale: number, isCritical: boolean) =>
      calc.recalcTargetMitigation(share, step, source, guardian, isCritical, defenseScale)

  function setupGuardian(targetDef: number, guardianDef: number) {
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 1000)
    const target = makeEntity('t1', '术士', ParticipantSide.ENEMY, 5000, {
      attrs: { [ATTRIBUTE_CODE.defense]: targetDef },
      takeDamage: vi.fn((n: number) => n),
    })
    const guardian = makeEntity('g1', '护卫', ParticipantSide.ENEMY, 5000, {
      attrs: { [ATTRIBUTE_CODE.defense]: guardianDef },
      takeDamage: vi.fn((n: number) => n),
    })
    buffSystem.addBuff('g1', 'buff_guardian', {}, 1) // percent 0.5 / reduction 0.1
    buffSystem.setShieldValue('g1', 1000)
    const battle = makeBattle()
    battle.participants.set('t1', target)
    battle.participants.set('g1', guardian)
    return { source, target, guardian, battle }
  }

  const calledWith = (fn: unknown) => (fn as ReturnType<typeof vi.fn>).mock.calls[0][0] as number

  it('守护者防御越高自己受得越少（份额吃自身面板，不再照抄主目标减免）', () => {
    const tanky = setupGuardian(0, 60)
    executor.settleDamage(
      tanky.source, tanky.target, 100, 100, false, tanky.battle, false,
      recalcFor(tanky.source, PHYSICAL_STEP),
    )
    // 份额 100×0.9×0.5=45，折算防御 round(60×0.45)=27 → 45−27=18
    expect(calledWith(tanky.guardian.takeDamage)).toBe(18)

    const soft = setupGuardian(0, 20)
    executor.settleDamage(
      soft.source, soft.target, 100, 100, false, soft.battle, false,
      recalcFor(soft.source, PHYSICAL_STEP),
    )
    // 低防守护者折算防御 round(20×0.45)=9 → 45−9=36
    expect(calledWith(soft.guardian.takeDamage)).toBe(36)
  })

  it('队友份额不受守护者面板影响（否则越肉的守护者越坑队友）', () => {
    for (const guardianDef of [0, 60, 200]) {
      const s = setupGuardian(0, guardianDef)
      executor.settleDamage(
        s.source, s.target, 100, 100, false, s.battle, false,
        recalcFor(s.source, PHYSICAL_STEP),
      )
      expect(calledWith(s.target.takeDamage)).toBe(45)
    }
  })

  it('中位数值档位（攻 88 / 防 52）走完整链路：分摊不归零，团队总承伤优于无守护', () => {
    const strike = { ...PHYSICAL_STEP, calculation: { baseValue: 88, extraValues: [] } }
    const s = setupGuardian(52, 52)
    // 队友侧真实结算结果作为 settleDamage 入参（防御 52 → 88−52=36）
    const real = calc.calculateDamage(strike, s.source, s.target)
    expect(real.rawDamage).toBe(88)
    expect(real.damage).toBe(36)

    executor.settleDamage(
      s.source, s.target, real.damage, real.rawDamage, false, s.battle, false,
      recalcFor(s.source, strike),
    )

    const toTarget = calledWith(s.target.takeDamage)
    const toGuardian = calledWith(s.guardian.takeDamage)
    // 守护份额 88×0.9×0.5=39.6，折算防御 round(52×0.45)=23 → floor(16.6)=16
    expect(toGuardian).toBe(16)
    expect(toTarget).toBe(16)
    // 悬崖守卫：减法防御若逐份扣满，这里会是 0（整击被无效化）
    expect(toGuardian + toTarget).toBeGreaterThan(0)
    expect(toGuardian + toTarget).toBeLessThan(real.damage) // 32 < 36
  })

  it('targetModifiers 之外的乘区同样吃守护者面板（免伤生效）', () => {
    const s = setupGuardian(0, 0)
    s.guardian.getAttribute = (code: string) =>
      code === ATTRIBUTE_CODE.damageReduction ? 50 : 0
    executor.settleDamage(
      s.source, s.target, 100, 100, false, s.battle, false,
      recalcFor(s.source, PHYSICAL_STEP),
    )
    // 份额 45，无防御，免伤 50% → 22
    expect(calledWith(s.guardian.takeDamage)).toBe(22)
    expect(calledWith(s.target.takeDamage)).toBe(45)
  })
})

// ==================== 守护分摊的重算上下文传递 ====================

/**
 * 技能路径在 BattleExecutor 里按目标聚合多步伤害后才调 settleDamage，届时需还能拿到
 * 某一步 skillStep 才能按承接者面板重算减免。step 是随 DeferredDamageToken 条目带过来的，
 * 这个契约一断，守护分摊会静默退回旧口径（不报错、只是数值不对），故单独钉住。
 */
describe('DeferredDamageToken 携带重算上下文', () => {
  it('record 保留 skillStep，供聚合后选取重算减免的那一步', () => {
    const token = new DeferredDamageToken()
    const target = makeEntity('t1', '术士', ParticipantSide.ENEMY, 500)
    const step = { type: 'deal_damage', damageCategory: 'physical' } as any

    token.record(target, 30, 0, 80, step)
    token.record(target, 10, 0, 200, step)

    const entries = token.getEntries()
    expect(entries).toHaveLength(2)
    expect(entries[0].skillStep).toBe(step)
  })

  it('未传 step（真伤/附加伤害，本就不进减免链）时 skillStep 为空', () => {
    const token = new DeferredDamageToken()
    const target = makeEntity('t1', '术士', ParticipantSide.ENEMY, 500)
    token.record(target, 30)
    expect(token.getEntries()[0].skillStep).toBeUndefined()
  })
})

// ==================== 溅射（splash） ====================

describe('BattleExecutor 溅射（splash 属性）', () => {
  it('splash=50：普攻第一段命中后对相邻敌人追加 50% 伤害', async () => {
    const mockEventBusLocal = mockEventBus
    const buffSystem = new BuffSystem(new BuffScriptRegistry(), mockEventBusLocal, createMockLogManager())
    buffSystem.getEventBus = vi.fn(() => mockEventBusLocal)
    const triggerPassives = vi.fn()

    const damageResults = [{ damage: 100, rawDamage: 110 }]
    const calculateDamage = vi.fn(
      () =>
        ({
          damage: 0,
          rawDamage: 0,
          isCritical: false,
          isMiss: false,
          ...damageResults.shift(),
        }) as DamageResult,
    )
    const animationManager = {
      triggerFlightPhaseAndWait: vi.fn(async () => {}),
      triggerImpactPhaseAndWait: vi.fn(async () => {}),
      triggerMissImpactAndWait: vi.fn(async () => {}),
    }

    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100, {
      attrs: { [ATTRIBUTE_CODE.splash]: 50 },
    })
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 500, {
      seatIndex: 0,
    })
    const adjacent = makeEntity('t2', '史莱姆B', ParticipantSide.ENEMY, 500, {
      seatIndex: 1,
    })

    const executor = new BattleExecutor(
      { getExecutor: () => ({}) } as unknown as SkillManager,
      { calculateDamage } as any,
      { triggerPassives, drainLastTriggeredPassives: () => [] } as any,
      { recordCombatRecord: vi.fn(), recordAction: vi.fn() } as any,
      animationManager as any,
      buffSystem,
      undefined,
      undefined,
    )
    LoggerProvider.logger = createMockLogManager()

    const battle = makeBattle()
    battle.participants.set('s1', source)
    battle.participants.set('t1', target)
    battle.participants.set('t2', adjacent)

    await executor.selectAndExecuteAttack(battle, source, 't1')

    // 相邻敌人承受 100 × 50% = 50
    expect(adjacent.currentHealth).toBe(450)
    expect(target.currentHealth).toBe(400)
  })

  it('splash 未配置：不溅射', async () => {
    const buffSystem = new BuffSystem(new BuffScriptRegistry(), mockEventBus, createMockLogManager())
    buffSystem.getEventBus = vi.fn(() => mockEventBus)
    const calculateDamage = vi.fn(
      () => ({ damage: 100, rawDamage: 110, isCritical: false, isMiss: false }) as DamageResult,
    )
    const source = makeEntity('s1', '剑客', ParticipantSide.ALLY, 100)
    const target = makeEntity('t1', '史莱姆', ParticipantSide.ENEMY, 500, { seatIndex: 0 })
    const adjacent = makeEntity('t2', '史莱姆B', ParticipantSide.ENEMY, 500, { seatIndex: 1 })

    const executor = new BattleExecutor(
      { getExecutor: () => ({}) } as unknown as SkillManager,
      { calculateDamage } as any,
      { triggerPassives: vi.fn(), drainLastTriggeredPassives: () => [] } as any,
      { recordCombatRecord: vi.fn(), recordAction: vi.fn() } as any,
      {
        triggerFlightPhaseAndWait: vi.fn(async () => {}),
        triggerImpactPhaseAndWait: vi.fn(async () => {}),
        triggerMissImpactAndWait: vi.fn(async () => {}),
      } as any,
      buffSystem,
      undefined,
      undefined,
    )
    LoggerProvider.logger = createMockLogManager()

    const battle = makeBattle()
    battle.participants.set('s1', source)
    battle.participants.set('t1', target)
    battle.participants.set('t2', adjacent)

    await executor.selectAndExecuteAttack(battle, source, 't1')

    expect(adjacent.currentHealth).toBe(500)
  })

  it('MAX_COMBO_SEGMENTS 常量为 6（1 段普攻 + 5 段连击上限）', () => {
    expect(BATTLE_CONSTANTS.MAX_COMBO_SEGMENTS).toBe(6)
  })
})
