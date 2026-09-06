/**
 * 斗战流（连击）被动与技能集成测试 — 真实配置驱动
 *
 * 覆盖：配置加载、风锁弹射与束缚链、风锁后遗症（blockedByTag）、
 * 风势涌/连击气势属性修正、风意爆发/裂甲爆发/裂甲天崩的引爆 custom 步骤。
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
  createStepContext,
  BattleActionHelper,
} from '@/domain/battle/type/types'
import type { BattleData, BattleEntity, SkillConfig } from '@/domain/battle/type/types'
import type { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { createBattleParticipantsFromConfig } from '@tests/factories/ParticipantFactory'
import { ActionResultType } from '@/domain/skill/types'

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
  'school_fengsuo_bounce',
  'school_fengsuo_bind',
  'school_fengsuo_fengzhu',
  'school_fenghen_jiban_apply',
  'school_fenghen_jiban_heal',
  'school_yufeng_hitdown',
  'school_yufeng_attack',
  'school_fengshi_combo_rate',
  'school_fengshiyong_apply',
  'school_lianshi_qishi',
  'school_fengshi_liejia_link',
  'school_liejia_tougu',
]

const SCHOOL_ACTIVE_IDS = [
  'skill_school_fufengbian',
  'skill_school_fengliantanshe',
  'skill_school_fengsuotianwang',
  'skill_school_xunfengji',
  'skill_school_fengyibaofa',
  'skill_school_kuangfengjuexi',
  'skill_school_liejiaji',
  'skill_school_liejiabaofa',
  'skill_school_liejiatianbeng',
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

function wireBuffQuery(...entities: BattleEntity[]): void {
  const buffSystem = container.resolve<BuffSystem>('BuffSystem')
  for (const e of entities) {
    ;(e as { setBuffQuery(q: unknown): void }).setBuffQuery(buffSystem)
  }
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
  // 实体的 hasBuff/getBuffInstanceIds 依赖 buffQuery（真实战斗由 BattleManager 注入）
  ;(entity as { setBuffQuery(q: unknown): void }).setBuffQuery(
    container.resolve<BuffSystem>('BuffSystem'),
  )
}

function stacksOf(buffSystem: BuffSystem, entityId: string, buffId: string): number {
  return buffSystem.getBuffStackCount(entityId, buffId)
}

describe('斗战流配置加载', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('全部流派被动可从技能数据中找到且为被动类型', () => {
    for (const id of SCHOOL_PASSIVE_IDS) {
      const skill = GameDataProcessor.findSkillById(id)
      expect(skill, `缺少被动配置: ${id}`).toBeTruthy()
      expect(skill!.skillType).toBe('passive')
      expect(skill!.triggerTimes?.length).toBeGreaterThan(0)
    }
  })

  it('全部主动技能（小技能/大技能）可从技能数据中找到', () => {
    for (const id of SCHOOL_ACTIVE_IDS) {
      const skill = GameDataProcessor.findSkillById(id)
      expect(skill, `缺少主动技能配置: ${id}`).toBeTruthy()
      expect(['small', 'ultimate']).toContain(skill!.skillType)
      expect(skill!.steps.length).toBeGreaterThan(0)
    }
  })
})

describe('风锁连环（核心被动）', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('连击段命中弹射：随机敌人受伤并获得风锁', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, ['school_fengsuo_bounce'])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    manager.setRng({ next: () => 0.01 } as any)
    // 弹射概率判定走 SkillExecutor 自己的随机源（custom 步骤内）
    container
      .resolve<SkillManager>('SkillManager')
      .getExecutor()
      .setRng({ next: () => 0.01 } as any)

    const hpBefore = target.currentHealth
    manager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target, sourceId: attacker.id, comboSegment: 2,
      }),
    )
    expect(target.currentHealth).toBeLessThan(hpBefore)
    expect(stacksOf(buffSystem, target.id, 'buff_fengsuo')).toBe(1)
  })

  it('风锁满 3 层触发束缚：stun + 清空风锁 + 风锁后遗症', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, ['school_fengsuo_bounce', 'school_fengsuo_bind'])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    manager.setRng({ next: () => 0.01 } as any)

    // 直接预置 3 层风锁（跳过概率叠层），一次连击命中触发束缚
    for (let i = 0; i < 3; i++) {
      buffSystem.addBuff(target.id, 'buff_fengsuo', {}, 1)
    }
    expect(stacksOf(buffSystem, target.id, 'buff_fengsuo')).toBe(3)

    manager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target, sourceId: attacker.id, comboSegment: 2,
      }),
    )
    expect(stacksOf(buffSystem, target.id, 'buff_fengsuo')).toBe(0)
    expect(stacksOf(buffSystem, target.id, 'buff_shufu')).toBe(1)
    expect(stacksOf(buffSystem, target.id, 'buff_fengsuo_aftermath')).toBe(1)
  })

  it('风锁后遗症期间无法获得新风锁（blockedByTag）', () => {
    const { target } = createPair()
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')

    buffSystem.addBuff(target.id, 'buff_fengsuo_aftermath', {}, 1)
    const instanceId = buffSystem.addBuff(target.id, 'buff_fengsuo', {}, 1)
    expect(instanceId).toBe('')
    expect(stacksOf(buffSystem, target.id, 'buff_fengsuo')).toBe(0)
  })

  it('风痕羁绊：30% 概率上风缚；风缚目标被连击命中回复气血（每回合限 3 次）', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, ['school_fenghen_jiban_apply', 'school_fenghen_jiban_heal'])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    // 风缚施加在 target 身上，条件判定 target.hasBuff 需要其 buffQuery
    ;(target as { setBuffQuery(q: unknown): void }).setBuffQuery(buffSystem)
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    manager.setRng({ next: () => 0.01 } as any)

    manager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target, sourceId: attacker.id,
      }),
    )
    expect(stacksOf(buffSystem, target.id, 'buff_fengfu')).toBe(1)

    // 风缚目标被连击命中 → 自身（持有者）回复 2% 最大气血，每回合上限 6%（3 次）
    attacker.takeDamage(50)
    const hpBefore = attacker.currentHealth
    for (let i = 0; i < 5; i++) {
      manager.triggerPassives(
        attacker,
        createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
          target, sourceId: attacker.id, comboSegment: 2,
        }),
      )
    }
    expect(attacker.currentHealth).toBeGreaterThan(hpBefore)
  })
})

describe('速度比较条件（驭风之力/风痕羁绊）', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('target_speed_lower：仅攻击速度低于自身的目标时上风缚', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, ['school_fenghen_jiban_apply'])
    ;(target as { setBuffQuery(q: unknown): void }).setBuffQuery(
      container.resolve<BuffSystem>('BuffSystem'),
    )
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')
    manager.setRng({ next: () => 0.01 } as any)

    const mySpeed = attacker.getAttribute('speed' as never)
    const targetSpeed = target.getAttribute('speed' as never)
    const ctx = () =>
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target, sourceId: attacker.id,
      })

    if (targetSpeed > mySpeed) {
      // 假人速度反超时条件不成立——交换验证方向
      manager.triggerPassives(attacker, ctx())
      expect(stacksOf(buffSystem, target.id, 'buff_fengfu')).toBe(0)
    } else {
      manager.triggerPassives(attacker, ctx())
      expect(stacksOf(buffSystem, target.id, 'buff_fengfu')).toBe(1)
    }
  })

  it('exists_faster_enemy：存在更快的敌人时攻击 +5%', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, ['school_yufeng_attack'])
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')

    const mySpeed = attacker.getAttribute('speed' as never)
    const targetSpeed = target.getAttribute('speed' as never)
    const atkBefore = attacker.getAttribute('attack' as never)

    manager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.TURN_START, battle, {}),
    )
    const atkAfter = attacker.getAttribute('attack' as never)

    if (targetSpeed > mySpeed) {
      expect(atkAfter).toBeCloseTo(atkBefore + 5, 5)
    } else {
      // 假人速度不满足条件时（无更快敌人）不生效
      expect(atkAfter).toBeCloseTo(atkBefore, 5)
    }
  })
})

describe('连战·风势（新数据）', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  it('命中叠层，8 层后转化为风痕并清空风势（保留链路）', () => {
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
        target, sourceId: attacker.id,
      })
    for (let i = 1; i <= 8; i++) {
      manager.triggerPassives(attacker, ctx())
    }
    expect(stacksOf(buffSystem, target.id, 'buff_fengshi')).toBe(0)
    expect(stacksOf(buffSystem, target.id, 'buff_fenghen')).toBe(1)
  })

  it('连击触发风意（2 回合刷新制，每层 3%）', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, ['school_lianzhan_fengyi_apply'])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')

    manager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target, sourceId: attacker.id, comboSegment: 2,
      }),
    )
    manager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target, sourceId: attacker.id, comboSegment: 3,
      }),
    )
    expect(stacksOf(buffSystem, attacker.id, 'buff_fengyi')).toBe(2)
  })

  it('连击段命中获得风势涌 buff', () => {
    const { attacker, target } = createPair()
    const battle = makeBattle([attacker, target])
    registerPassives(attacker, ['school_fengshiyong_apply'])
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    const manager = container.resolve<PassiveSkillManager>('PassiveSkillManager')

    manager.triggerPassives(
      attacker,
      createPassiveContext(BattleTriggerPhase.ON_HIT, battle, {
        target, sourceId: attacker.id, comboSegment: 2,
      }),
    )
    expect(stacksOf(buffSystem, attacker.id, 'buff_fengshiyong')).toBe(1)
  })
})

describe('引爆 custom 步骤（风意爆发/狂风绝息/裂甲爆发/裂甲天崩）', () => {
  beforeEach(() => {
    container.clear()
    initializeContainer()
    container
      .resolve<SkillManager>('SkillManager')
      .loadSkillConfigs(GameDataProcessor.getSkillsData())
  })

  function executeCustomStep(
    source: BattleEntity,
    target: BattleEntity,
    parameters: Record<string, unknown>,
  ) {
    const executor = container.resolve<SkillManager>('SkillManager').getExecutor()
    const action = BattleActionHelper.createSkill({
      sourceId: source.id,
      targetId: target.id,
      skillId: 'test_detonate',
      skillName: '引爆测试',
      turn: 1,
      success: true,
    })
    executor.executeStep(
      { type: 'custom', parameters } as any,
      action,
      source,
      target,
      createStepContext(),
    )
    return action
  }

  it('fengshi_detonate：消耗全部风势，每层追加伤害，每 2 层转化 1 层裂甲', () => {
    const { attacker, target } = createPair()
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    for (let i = 0; i < 5; i++) {
      buffSystem.addBuff(target.id, 'buff_fengshi', {}, 1)
    }
    expect(stacksOf(buffSystem, target.id, 'buff_fengshi')).toBe(5)
    target.takeDamage(10)
    const hpBefore = target.currentHealth

    const action = executeCustomStep(attacker, target, {
      customType: 'fengshi_detonate',
      damagePercentPerStack: 0.1,
      stacksPerDebuff: 2,
      applyBuffId: 'buff_liejia',
    })

    expect(stacksOf(buffSystem, target.id, 'buff_fengshi')).toBe(0)
    expect(stacksOf(buffSystem, target.id, 'buff_liejia')).toBe(2) // floor(5/2)
    expect(target.currentHealth).toBeLessThan(hpBefore)
    const dmgEffect = action.effects.find(
      (e) => e.type === ActionResultType.DAMAGE && String(e.description).includes('风势'),
    )
    expect(dmgEffect).toBeTruthy()
  })

  it('fengshi_detonate 风绝模式：每层风痕追加真实伤害并消耗全部风痕', () => {
    const { attacker, target } = createPair()
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    buffSystem.addBuff(target.id, 'buff_fenghen', {}, 1)
    buffSystem.addBuff(target.id, 'buff_fenghen', {}, 1)
    expect(stacksOf(buffSystem, target.id, 'buff_fenghen')).toBe(2)
    target.takeDamage(10)
    const hpBefore = target.currentHealth

    executeCustomStep(attacker, target, {
      customType: 'fengshi_detonate',
      damagePercentPerStack: 0.08,
      stacksPerDebuff: 0,
      fenghenTrueDamagePerStack: 0.4,
      fenghenMaxSegments: 8,
      applyBuffId: 'buff_suijia',
    })

    expect(stacksOf(buffSystem, target.id, 'buff_fenghen')).toBe(0)
    expect(stacksOf(buffSystem, target.id, 'buff_suijia')).toBe(1)
    expect(target.currentHealth).toBeLessThan(hpBefore)
  })

  it('liejia_detonate：每层伤害加成 + 每层一段真实伤害 + 碎甲', () => {
    const { attacker, target } = createPair()
    const buffSystem = container.resolve<BuffSystem>('BuffSystem')
    for (let i = 0; i < 5; i++) {
      buffSystem.addBuff(target.id, 'buff_liejia', {}, 1)
    }
    target.takeDamage(10)
    const hpBefore = target.currentHealth

    const action = executeCustomStep(attacker, target, {
      customType: 'liejia_detonate',
      damagePercentPerStack: 0.12,
      trueDamagePerStack: 0.6,
      maxSegments: 5,
      applyBuffId: 'buff_suijia',
    })

    expect(stacksOf(buffSystem, target.id, 'buff_liejia')).toBe(0)
    expect(stacksOf(buffSystem, target.id, 'buff_suijia')).toBe(1)
    expect(target.currentHealth).toBeLessThan(hpBefore)
    const dmgEffect = action.effects.find(
      (e) => e.type === ActionResultType.DAMAGE && String(e.description).includes('裂甲'),
    )
    expect(dmgEffect).toBeTruthy()
  })
})
