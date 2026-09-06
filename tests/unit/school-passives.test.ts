/**
 * 流派被动技能集成测试 — 真实配置（skill_passive_schools.json + buffs.json）驱动
 *
 * 覆盖：配置加载与注册、风势叠层转化、破绽暴击叠层、裂甲连击段条件与爆发消耗、
 * 幻影反击（dodge 触发 + 每回合次数限制）、残影受击消耗、守护姿态施加。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
import { SkillManager } from '@/domain/skill/SkillManager'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import {
  BattleTriggerPhase,
  createPassiveContext,
} from '@/domain/battle/type/types'
import type { BattleData, BattleEntity, SkillConfig } from '@/domain/battle/type/types'
import { ParticipantSide } from '@/domain/battle/type/types'
import type { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { createBattleParticipantsFromConfig } from '@tests/factories/ParticipantFactory'

vi.mock('@/shared/utils/RAF', () => ({
  RAFTimer: class {
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

const SCHOOL_PASSIVE_IDS = [
  'school_lianzhan_fengshi_apply',
  'school_lianzhan_fengshi_transform',
  'school_lianzhan_liejia_apply',
  'school_lianzhan_liejia_burst',
  'school_lianzhan_fengyi_apply',
  'school_lianzhan_fengyi_consume',
  'school_lianzhan_jifeng_slow',
  'school_pojun_pozhan_apply',
  'school_pojun_pozhan_burst',
  'school_pojun_baonu_on_crit',
  'school_pojun_baonu_on_miss',
  'school_pojun_baonu_guarantee',
  'school_zhanmie_low50',
  'school_zhanmie_low25',
  'school_zhanmie_shieldbreak',
  'school_zhanmie_onkill',
  'school_budong_panshi_shield',
  'school_budong_panshi_break_aoe',
  'school_budong_panshi_break_taunt',
  'school_budong_panshi_break_heal',
  'school_budong_jingji_body',
  'school_budong_mingwang_t90',
  'school_budong_mingwang_t80',
  'school_budong_mingwang_t70',
  'school_budong_mingwang_t60',
  'school_budong_mingwang_t50',
  'school_budong_mingwang_regen',
  'school_budong_mingwang_guard',
  'school_budong_mingwang_breakdr',
  'school_huanying_counter',
  'school_huanying_counter_self',
  'school_huanying_canying_apply',
  'school_huanying_canying_consume',
  'school_huanying_yingbi',
  'school_huanying_shadow_strike',
  'school_huanying_shadow_strike_heal',
  'school_huanying_speedup',
  'school_huanying_first_dodge_heal',
]

function makeBattle(participants: BattleEntity[]): BattleData {
  const map = new Map<string, BattleEntity>()
  for (const p of participants) map.set(p.id, p)
  return {
    currentTurn: 1,
    battleId: 'school-test',
    participants: map,
  } as unknown as BattleData
}

/** 测试参战者（真实 JSON 配置：test_warrior vs test_tank） */
function createPair(): { attacker: BattleParticipantImpl; target: BattleParticipantImpl } {
  const { allies, enemies } = createBattleParticipantsFromConfig(
    ['test_warrior'],
    ['test_tank'],
  )
  if (!allies[0] || !enemies[0]) {
    throw new Error('缺少测试敌人配置: test_warrior / test_tank')
  }
  return { attacker: allies[0], target: enemies[0] }
}

function registerPassives(entity: BattleEntity, skillIds: string[]): void {
  const skills = skillIds
    .map((id) => GameDataProcessor.findSkillById(id))
    .filter((s): s is SkillConfig => !!s)
  ;(entity as { skills: { passive: SkillConfig[] } }).skills = {
    small: [],
    ultimate: [],
    passive: skills,
  }
  const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
  GameDataProcessor.registerParticipantPassives(entity, manager)
}

function stacksOf(buffSystem: BuffSystem, entityId: string, buffId: string): number {
  return buffSystem.getBuffStackCount(entityId, buffId)
}

describe('流派被动配置加载', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    // BattleSystem.initialize 在真实流程中注入技能配置——测试直接加载同一数据源
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('全部流派被动可从技能数据中找到', () => {
    for (const id of SCHOOL_PASSIVE_IDS) {
      const skill = GameDataProcessor.findSkillById(id)
      expect(skill, `缺少被动配置: ${id}`).toBeTruthy()
      expect(skill!.skillType).toBe('passive')
      expect(skill!.triggerTimes?.length).toBeGreaterThan(0)
    }
  })

  it('注册后被动挂载到对应触发时机', () => {
    const { attacker } = createPair()
    registerPassives(attacker, [
      'school_lianzhan_fengshi_apply',
      'school_lianzhan_fengshi_transform',
    ])
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    const registered = manager.getPassives(attacker.id)
    expect(registered).toHaveLength(2)
    expect(registered.every((c) => c.trigger === BattleTriggerPhase.ON_HIT)).toBe(true)
  })
})

describe('连战·风势缠身', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    // BattleSystem.initialize 在真实流程中注入技能配置——测试直接加载同一数据源
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('命中叠层，8 层后转化为风痕并清空风势', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, [
      'school_lianzhan_fengshi_apply',
      'school_lianzhan_fengshi_transform',
    ])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')

    const ctx = () =>
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target,
        sourceId: attacker.id,
      })

    for (let i = 1; i <= 7; i++) {
      manager.triggerPassives(attacker, ctx())
      expect(stacksOf(buffSystem, target.id, 'buff_fengshi')).toBe(i)
    }
    // 第 8 次命中：风势满 8 层 → 转化为 1 层风痕，风势清空
    manager.triggerPassives(attacker, ctx())
    expect(stacksOf(buffSystem, target.id, 'buff_fengshi')).toBe(0)
    expect(stacksOf(buffSystem, target.id, 'buff_fenghen')).toBe(1)
    // 第 9 次命中：风势重新从 1 层叠加，风痕保持
    manager.triggerPassives(attacker, ctx())
    expect(stacksOf(buffSystem, target.id, 'buff_fengshi')).toBe(1)
    expect(stacksOf(buffSystem, target.id, 'buff_fenghen')).toBe(1)
  })
})

describe('破军·破绽烙印', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    // BattleSystem.initialize 在真实流程中注入技能配置——测试直接加载同一数据源
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('暴击叠破绽层', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, ['school_pojun_pozhan_apply'])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')

    const ctx = () =>
      createPassiveContext(BattleTriggerPhase.CRIT, battle, {
        target,
        sourceId: attacker.id,
        isCritical: true,
      })
    manager.triggerPassives(attacker, ctx())
    manager.triggerPassives(attacker, ctx())
    expect(stacksOf(buffSystem, target.id, 'buff_pozhan')).toBe(2)
  })
})

describe('连战·裂甲刻印', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    // BattleSystem.initialize 在真实流程中注入技能配置——测试直接加载同一数据源
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('连击第 3 段起叠裂甲，5 层后命中触发碎甲爆发并清空', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, [
      'school_lianzhan_liejia_apply',
      'school_lianzhan_liejia_burst',
    ])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    const hpBefore = target.currentHealth

    // 第 2 段连击：不叠裂甲
    manager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target, sourceId: attacker.id, comboSegment: 2,
      }),
    )
    expect(stacksOf(buffSystem, target.id, 'buff_liejia')).toBe(0)

    // 第 3~6 段：叠到 4 层（第 6 段时满 4 层未爆发——第 7 段才满 5 层触发爆发）
    for (let seg = 3; seg <= 6; seg++) {
      manager.triggerPassives(
        attacker,
        createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
          target, sourceId: attacker.id, comboSegment: seg,
        }),
      )
    }
    expect(stacksOf(buffSystem, target.id, 'buff_liejia')).toBe(4)

    // 第 7 段：apply 使裂甲到 5 层 → burst 条件满足 → 消耗全部裂甲 + 碎甲 + 追加伤害
    const hpAfterSix = target.currentHealth
    manager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target, sourceId: attacker.id, comboSegment: 7,
      }),
    )
    expect(stacksOf(buffSystem, target.id, 'buff_liejia')).toBe(0)
    expect(stacksOf(buffSystem, target.id, 'buff_suijia')).toBe(1)
    expect(target.currentHealth).toBeLessThan(hpAfterSix)
    expect(hpAfterSix).toBeLessThanOrEqual(hpBefore)
  })
})

describe('幻影·幻影反击', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    // BattleSystem.initialize 在真实流程中注入技能配置——测试直接加载同一数据源
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('闪避触发反击（攻击者掉血），每回合最多 2 次', () => {
    const { attacker, target: defender } = createPair()
    const battle = makeBattle([attacker, defender])
    registerPassives(defender, ['school_huanying_counter'])
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    // 注入确定性随机源：恒通过 0.8 触发概率（触发概率判定走 nextRandom(rng)）
    manager.setRng({ next: () => 0.01 } as any)
    const hpStart = attacker.currentHealth

    const ctx = () =>
      createPassiveContext(BattleTriggerPhase.DODGE, battle, {
        sourceId: defender.id,
        targetId: attacker.id,
        target: attacker,
        damage: 0,
      })

    manager.triggerPassives(defender, ctx())
    const hpAfterFirst = attacker.currentHealth
    expect(hpAfterFirst).toBeLessThan(hpStart)

    manager.triggerPassives(defender, ctx())
    const hpAfterSecond = attacker.currentHealth
    expect(hpAfterSecond).toBeLessThan(hpAfterFirst)

    // 第 3 次：超过每回合 2 次上限，不再反击
    manager.triggerPassives(defender, ctx())
    expect(attacker.currentHealth).toBe(hpAfterSecond)
  })
})

describe('幻影·残影叠层', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    // BattleSystem.initialize 在真实流程中注入技能配置——测试直接加载同一数据源
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('闪避叠残影，受击消耗 1 层', () => {
    const { attacker, target: defender } = createPair()
    const battle = makeBattle([attacker, defender])
    registerPassives(defender, [
      'school_huanying_canying_apply',
      'school_huanying_canying_consume',
    ])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')

    manager.triggerPassives(
      defender,
      createPassiveContext(BattleTriggerPhase.DODGE, battle, {
        sourceId: defender.id, targetId: attacker.id, target: attacker, damage: 0,
      }),
    )
    expect(stacksOf(buffSystem, defender.id, 'buff_canying')).toBe(1)

    manager.triggerPassives(
      defender,
      createPassiveContext(BattleTriggerPhase.DAMAGE_TAKEN, battle, {
        target: attacker, sourceId: attacker.id, damage: 50,
      }),
    )
    expect(stacksOf(buffSystem, defender.id, 'buff_canying')).toBe(0)
  })
})

describe('不动·不动明王', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    // BattleSystem.initialize 在真实流程中注入技能配置——测试直接加载同一数据源
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('战斗开始获得守护姿态（guardian buff）', () => {
    const { attacker: holder } = createPair()
    const battle = makeBattle([holder])
    registerPassives(holder, ['school_budong_mingwang_guard'])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')

    manager.triggerPassives(
      holder,
      createPassiveContext(BattleTriggerPhase.BATTLE_START, battle, {}),
    )
    expect(stacksOf(buffSystem, holder.id, 'buff_guardian')).toBe(1)
    // 守护参数可被引擎读取（定向转移依赖）
    expect(buffSystem.findBuffParamsByTag(holder.id, 'guardian')).toMatchObject({
      percent: 0.5,
      reduction: 0.1,
    })
  })
})
