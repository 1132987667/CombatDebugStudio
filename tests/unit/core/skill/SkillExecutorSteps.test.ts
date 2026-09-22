/**
 * SkillExecutorSteps.test.ts — SkillExecutor 步骤执行语义回归（T2-A）
 *
 * 覆盖四组此前零测试的有状态分支：
 *   1. 必中/必暴标记的消耗语义（SkillExecutor.ts executeDamage 尾部）
 *   2. cleanse / remove_debuff 的计数与 polarity 过滤语义
 *   3. rotating_apply_buff 轮转下标推进（含免疫时照样前进、stacks 补足）
 *   4. fengshi / liejia / burn 引爆换算与消耗
 *   5. 未知步骤类型 / 未知 customType 的抛错防线
 *
 * BuffSystem 与 buff 配置全部用真实实例/真实 JSON（registry 构造即加载 buffs.json ∪ effects.json），
 * 不 mock 叠加语义——mock 掉 BuffSystem 的测试等于没测。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillExecutor } from '@/domain/skill/SkillExecutor'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { KNOWN_BUFF_IDS } from '@/domain/buff/types'
import { createParticipantFromEnemy } from '@tests/fixtures/participants'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import type { BattleAction } from '@/domain/battle/type/types'
import type { ExtendedSkillStep } from '@/domain/skill/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { SeededRandom } from '@/shared/utils/SeededRandom'

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  offByListenerId: vi.fn(),
}

/** 固定返回值随机源：next() 恒返回 roll，用于确定性控制命中/概率判定 */
function stubRng(roll: number): SeededRandom {
  return { next: () => roll } as unknown as SeededRandom
}

function makeAction(turn = 1): BattleAction {
  return { effects: [], turn } as unknown as BattleAction
}

/** 从真实敌人配置创建参与者并接好 BuffSystem 查询（hasBuff/getBuffInstanceIds 生效的前提） */
function makeFighter(buffSystem: BuffSystem, id: string): BattleEntity {
  const p = createParticipantFromEnemy(id, ParticipantSide.ALLY)
  if (!p) throw new Error(`测试敌人配置不存在: ${id}`)
  p.id = `${id}_${makeFighter.seq++}`
  p.setBuffQuery(buffSystem as never)
  return p as unknown as BattleEntity
}
makeFighter.seq = 0

describe('SkillExecutor 步骤语义', () => {
  let registry: BuffScriptRegistry
  let buffSystem: BuffSystem
  let damageCalculator: DamageCalculator
  let executor: SkillExecutor
  let source: BattleEntity
  let target: BattleEntity

  beforeEach(() => {
    BattleParticipantImpl.eventBus = mockEventBus as never
    const mockLogger = createMockLogManager()
    LoggerProvider.logger = mockLogger

    registry = new BuffScriptRegistry()
    buffSystem = new BuffSystem(registry, mockEventBus as never, mockLogger)
    damageCalculator = new DamageCalculator()
    executor = new SkillExecutor(damageCalculator, new HealCalculator(), buffSystem)

    source = makeFighter(buffSystem, 'yaotu_fire')
    target = makeFighter(buffSystem, 'yaotu_gold')
    source.setAttribute(ATTRIBUTE_CODE.attack, 100)
    source.recalcAll()
    // 关闭闪避与暴击，保证主干用例走确定路径
    damageCalculator.setConfig({ enableDodge: false, enableCrit: false })
    // 清空敌方可能自带的初始 buff，从干净状态开始
    for (const inst of buffSystem.getBuffInstances(target.id)) buffSystem.removeBuff(inst.id)
    for (const inst of buffSystem.getBuffInstances(source.id)) buffSystem.removeBuff(inst.id)
  })

  // ══════════════════ 1. 必中 / 必暴消耗 ══════════════════

  describe('必暴/必中标记消耗', () => {
    const damageStep = (): ExtendedSkillStep =>
      ({
        type: 'deal_damage',
        calculation: { baseValue: 100, extraValues: [] },
      }) as unknown as ExtendedSkillStep

    it('必暴 buff 使第一步暴击，结算后实例被消耗', () => {
      buffSystem.addBuff(source.id, KNOWN_BUFF_IDS.GUARANTEED_CRIT, {}, 1)
      const action = makeAction()

      executor.executeStep(damageStep(), action, source, target, {} as never)

      const dmgEffect = action.effects.find((e) => e.type === 'damage')
      expect(dmgEffect?.isCritical).toBe(true)
      expect(buffSystem.getBuffInstances(source.id)).toHaveLength(0)
    })

    it('多段技能：必暴只服务首段，第二段不再暴击', () => {
      buffSystem.addBuff(source.id, KNOWN_BUFF_IDS.GUARANTEED_CRIT, {}, 1)
      const first = makeAction()
      executor.executeStep(damageStep(), first, source, target, {} as never)

      const second = makeAction()
      executor.executeStep(damageStep(), second, source, target, {} as never)

      expect(second.effects.find((e) => e.type === 'damage')?.isCritical).toBe(false)
    })

    it('必中：enableDodge + 恒高 roll 下无标记必miss，带标记命中且标记被消耗', () => {
      damageCalculator.setConfig({ enableDodge: true })
      damageCalculator.setRng(stubRng(0.99))
      target.setAttribute(ATTRIBUTE_CODE.dodgeValue, 100000)
      target.recalcAll()

      // 无标记 → miss
      const missAction = makeAction()
      executor.executeStep(damageStep(), missAction, source, target, {} as never)
      expect(missAction.effects.some((e) => e.type === 'miss')).toBe(true)

      // 带必中 → 命中，且首个伤害步骤后消耗（后续步骤不再继承必中）
      buffSystem.addBuff(source.id, KNOWN_BUFF_IDS.GUARANTEED_HIT, {}, 1)
      const hitAction = makeAction()
      executor.executeStep(damageStep(), hitAction, source, target, {} as never)
      expect(hitAction.effects.some((e) => e.type === 'miss')).toBe(false)
      expect(hitAction.effects.some((e) => e.type === 'damage')).toBe(true)
      expect(buffSystem.getBuffInstances(source.id)).toHaveLength(0)

      // 第二段：标记已消耗，回到 miss
      const nextAction = makeAction()
      executor.executeStep(damageStep(), nextAction, source, target, {} as never)
      expect(nextAction.effects.some((e) => e.type === 'miss')).toBe(true)
    })
  })

  // ══════════════════ 2. cleanse / remove_debuff ══════════════════

  describe('cleanse / remove_debuff 计数语义', () => {
    beforeEach(() => {
      // 3 个独立减益实例（不同 buffId，LIMITED 同类只合并为 1 实例）+ 1 个增益
      buffSystem.addBuff(target.id, 'buff_liejia', {}, 1)
      buffSystem.addBuff(target.id, 'buff_fengsuo', {}, 1)
      buffSystem.addBuff(target.id, 'buff_blind', {}, 1)
      buffSystem.addBuff(target.id, 'buff_atk_up', {}, 1)
    })

    const stepOf = (type: string, overrides?: object): ExtendedSkillStep =>
      ({ type, ...overrides }) as unknown as ExtendedSkillStep

    it('remove_debuff 缺省 count=1：只移除 1 个减益实例，增益不动', () => {
      executor.executeStep(stepOf('remove_debuff'), makeAction(), source, target)

      const ids = buffSystem.getBuffInstances(target.id).map((i) => i.buffId)
      expect(ids.filter((id) => id === 'buff_atk_up')).toHaveLength(1)
      expect(ids.filter((id) => id !== 'buff_atk_up')).toHaveLength(2)
    })

    it('remove_debuff count=2 移除 2 个减益后仍有增益', () => {
      executor.executeStep(stepOf('remove_debuff', { count: 2 }), makeAction(), source, target)

      const ids = buffSystem.getBuffInstances(target.id).map((i) => i.buffId)
      expect(ids).toContain('buff_atk_up')
      expect(ids.filter((id) => id !== 'buff_atk_up')).toHaveLength(1)
    })

    it('cleanse 缺省全清（含增益）', () => {
      executor.executeStep(stepOf('cleanse'), makeAction(), source, target)

      expect(buffSystem.getBuffInstances(target.id)).toHaveLength(0)
    })

    it('remove_debuff 不移除增益（polarity 过滤）', () => {
      // 清场后只留增益（removeDispellableBuffs 只清显式 dispellable，这里显式逐个移除）
      for (const inst of buffSystem.getBuffInstances(target.id)) {
        buffSystem.removeBuff(inst.id)
      }
      buffSystem.addBuff(target.id, 'buff_atk_up', {}, 1)

      executor.executeStep(stepOf('remove_debuff', { count: 99 }), makeAction(), source, target)

      expect(buffSystem.getBuffInstances(target.id).map((i) => i.buffId)).toEqual([
        'buff_atk_up',
      ])
    })
  })

  // ══════════════════ 3. rotating_apply_buff 轮转 ══════════════════

  describe('rotating_apply_buff 轮转施加', () => {
    const rotatingStep = (buffIds: string[], stacks?: number): ExtendedSkillStep =>
      ({
        type: 'custom',
        parameters: { customType: 'rotating_apply_buff', buffIds },
        ...(stacks ? { stacks } : {}),
      }) as unknown as ExtendedSkillStep

    it('按 buffIds 顺序循环：A→B→A', () => {
      const seen: string[] = []
      for (let i = 0; i < 3; i++) {
        const action = makeAction()
        executor.executeStep(
          rotatingStep(['buff_attack_up_20', 'buff_hit_down']),
          action,
          source,
          target,
        )
        seen.push(String(action.effects.find((e) => e.type === 'buff')?.buffId))
      }
      expect(seen).toEqual([
        'buff_attack_up_20',
        'buff_hit_down',
        'buff_attack_up_20',
      ])
    })

    it('目标免疫当前 buff 时下标照样前进（轮转节奏稳定）', () => {
      buffSystem.registerSingleImmunity(target.id, 'attack_up_20')

      executor.executeStep(
        rotatingStep(['buff_attack_up_20', 'buff_hit_down']),
        makeAction(),
        source,
        target,
      )
      // A 被免疫 → 目标身上没有 A；下一次应轮到 B
      expect(
        buffSystem.getBuffInstances(target.id).map((i) => i.buffId),
      ).not.toContain('buff_attack_up_20')

      executor.executeStep(
        rotatingStep(['buff_attack_up_20', 'buff_hit_down']),
        makeAction(),
        source,
        target,
      )
      expect(
        buffSystem.getBuffInstances(target.id).map((i) => i.buffId),
      ).toContain('buff_hit_down')
    })

    it('stacks=3 时首层走完整管线 + 补足 2 层 LIMITED 叠层', () => {
      executor.executeStep(rotatingStep(['buff_fengshi'], 3), makeAction(), source, target)

      const instances = buffSystem
        .getBuffInstances(target.id)
        .filter((i) => i.buffId === 'buff_fengshi')
      expect(instances).toHaveLength(1)
      expect(instances[0].currentStacks).toBe(3)
    })

    it('cleanupRotatingStates 后轮转回到首位（跨局不残留）', () => {
      executor.executeStep(
        rotatingStep(['buff_attack_up_20', 'buff_hit_down']),
        makeAction(),
        source,
        target,
      )
      executor.clearAllRotatingStates()

      const action = makeAction()
      executor.executeStep(
        rotatingStep(['buff_attack_up_20', 'buff_hit_down']),
        action,
        source,
        target,
      )
      expect(action.effects.find((e) => e.type === 'buff')?.buffId).toBe(
        'buff_attack_up_20',
      )
    })
  })

  // ══════════════════ 4. 引爆：风势 / 裂甲 / 灼烧 ══════════════════

  describe('fengshi_detonate 风势引爆', () => {
    it('N 层风势 → round(attack×0.1×N) 伤害 + floor(N/2) 层裂甲转化 + 风势清空', () => {
      for (let i = 0; i < 4; i++) buffSystem.addBuff(target.id, 'buff_fengshi', {}, 1)
      const hpBefore = target.currentHealth

      const action = makeAction()
      executor.executeStep(
        {
          type: 'custom',
          parameters: {
            customType: 'fengshi_detonate',
            damagePercentPerStack: 0.1,
            stacksPerDebuff: 2,
            applyBuffId: 'buff_liejia',
          },
        } as unknown as ExtendedSkillStep,
        action,
        source,
        target,
      )

      expect(hpBefore - target.currentHealth).toBe(40) // round(100×0.1×4)
      const liejia = buffSystem.getBuffInstances(target.id).find((i) => i.buffId === 'buff_liejia')
      expect(liejia?.currentStacks).toBe(2) // floor(4/2)
      expect(
        buffSystem.getBuffInstances(target.id).some((i) => i.buffId === 'buff_fengshi'),
      ).toBe(false)
    })

    it('风痕真伤段数受 fenghenMaxSegments 封顶，且消耗全部风痕', () => {
      for (let i = 0; i < 5; i++) buffSystem.addBuff(target.id, 'buff_fenghen', {}, 1)

      const action = makeAction()
      executor.executeStep(
        {
          type: 'custom',
          parameters: {
            customType: 'fengshi_detonate',
            fenghenTrueDamagePerStack: 0.05,
            fenghenMaxSegments: 3,
            stacksPerDebuff: 0,
            applyBuffId: '',
          },
        } as unknown as ExtendedSkillStep,
        action,
        source,
        target,
      )

      // round(100 × 0.05 × min(5,3)) = 15
      const dmg = action.effects.find((e) => e.type === 'damage')
      expect(dmg?.value).toBe(15)
      expect(
        buffSystem.getBuffInstances(target.id).some((i) => i.buffId === 'buff_fenghen'),
      ).toBe(false)
    })

    it('无风势可引爆时只产 STATUS 提示，不掉血', () => {
      const hpBefore = target.currentHealth
      const action = makeAction()
      executor.executeStep(
        {
          type: 'custom',
          parameters: { customType: 'fengshi_detonate' },
        } as unknown as ExtendedSkillStep,
        action,
        source,
        target,
      )
      expect(target.currentHealth).toBe(hpBefore)
      expect(action.effects.some((e) => String(e.description).includes('没有'))).toBe(true)
    })
  })

  describe('liejia_detonate 裂甲引爆', () => {
    function detonateLiejia(params: Record<string, unknown>): { action: BattleAction; hpDelta: number } {
      const hpBefore = target.currentHealth
      const action = makeAction()
      executor.executeStep(
        { type: 'custom', parameters: { customType: 'liejia_detonate', ...params } } as unknown as ExtendedSkillStep,
        action,
        source,
        target,
      )
      return { action, hpDelta: hpBefore - target.currentHealth }
    }

    it('每层追加伤害 + 每层真伤（段数≤层数），消耗裂甲并上碎甲', () => {
      for (let i = 0; i < 5; i++) buffSystem.addBuff(target.id, 'buff_liejia', {}, 1)
      const { action, hpDelta } = detonateLiejia({
        damagePercentPerStack: 0.08,
        trueDamagePerStack: 0.05,
        maxSegments: 8,
        applyBuffId: 'buff_suijia',
      })

      expect(hpDelta).toBe(40 + 25) // round(100×0.08×5) + round(100×0.05×min(5,8))
      expect(
        buffSystem.getBuffInstances(target.id).some((i) => i.buffId === 'buff_liejia'),
      ).toBe(false)
      expect(
        buffSystem.getBuffInstances(target.id).some((i) => i.buffId === 'buff_suijia'),
      ).toBe(true)
      const dmg = action.effects.filter((e) => e.type === 'damage').at(-1)
      expect(dmg?.value).toBe(65)
    })

    it('真伤段数被 maxSegments 截断（5 层裂甲 maxSegments=2 → 真伤只算 2 段）', () => {
      for (let i = 0; i < 5; i++) buffSystem.addBuff(target.id, 'buff_liejia', {}, 1)
      const { hpDelta } = detonateLiejia({
        damagePercentPerStack: 0.08,
        trueDamagePerStack: 0.05,
        maxSegments: 2,
        applyBuffId: '',
      })
      expect(hpDelta).toBe(40 + 10)
    })
  })

  describe('burn_detonate 灼烧引爆', () => {
    function detonateBurn(isFull: boolean): { action: BattleAction; hpDelta: number } {
      const hpBefore = target.currentHealth
      const action = makeAction()
      executor.executeStep(
        {
          type: 'custom',
          parameters: {
            customType: isFull ? 'burn_detonate_full' : 'burn_detonate',
            burnDamagePercent: 0.05,
          },
        } as unknown as ExtendedSkillStep,
        action,
        source,
        target,
      )
      return { action, hpDelta: hpBefore - target.currentHealth }
    }

    beforeEach(() => {
      buffSystem.addBuff(target.id, 'buff_burn', {}, 1) // duration=2 → remainingTurns 2
    })

    it('非完全引爆：按 剩余回合×maxHealth×percent 结算，灼烧保留', () => {
      const { hpDelta } = detonateBurn(false)
      expect(hpDelta).toBe(Math.round(target.maxHealth * 0.05 * 2))
      expect(
        buffSystem.getBuffInstances(target.id).some((i) => i.buffId === 'buff_burn'),
      ).toBe(true)
    })

    it('完全引爆：伤害 ×2 倍率且灼烧被移除', () => {
      const { hpDelta } = detonateBurn(true)
      expect(hpDelta).toBe(Math.round(target.maxHealth * 0.05 * 2) * 2)
      expect(
        buffSystem.getBuffInstances(target.id).some((i) => i.buffId === 'buff_burn'),
      ).toBe(false)
    })

    it('NOTE 行为锁定：灼烧基数按实例剩余回合数计，叠层数不放大伤害', () => {
      // handleBurnDetonate 不读 currentStacks——2 层灼烧与 1 层伤害相同。
      // 此用例锁定现状；若未来改为按层放大，此测试应红并联动更新。
      buffSystem.addBuff(target.id, 'buff_burn', {}, 1) // 叠到 2 层
      const inst = buffSystem
        .getBuffInstances(target.id)
        .find((i) => i.buffId === 'buff_burn')
      expect(inst?.currentStacks).toBe(2)

      const { hpDelta } = detonateBurn(false)
      expect(hpDelta).toBe(Math.round(target.maxHealth * 0.05 * 2))
    })

    it('目标无灼烧时静默返回，不产伤害 effect', () => {
      for (const inst of buffSystem
        .getBuffInstances(target.id)
        .filter((i) => i.buffId === 'buff_burn')) {
        buffSystem.removeBuff(inst.id)
      }
      const action = makeAction()
      executor.executeStep(
        {
          type: 'custom',
          parameters: { customType: 'burn_detonate', burnDamagePercent: 0.05 },
        } as unknown as ExtendedSkillStep,
        action,
        source,
        target,
      )
      expect(action.effects.filter((e) => e.type === 'damage')).toHaveLength(0)
    })
  })

  // ══════════════════ 5. 抛错防线 ══════════════════

  describe('未实现类型的抛错防线', () => {
    it('未知步骤类型抛「未实现的技能步骤类型」', () => {
      expect(() =>
        executor.executeStep(
          { type: 'teleport' } as unknown as ExtendedSkillStep,
          makeAction(),
          source,
          target,
        ),
      ).toThrow(/未实现的技能步骤类型/)
    })

    it('未知 customType 抛「未实现的自定义步骤类型」', () => {
      expect(() =>
        executor.executeStep(
          { type: 'custom', parameters: { customType: 'mystery' } } as unknown as ExtendedSkillStep,
          makeAction(),
          source,
          target,
        ),
      ).toThrow(/未实现的自定义步骤类型/)
    })
  })
})
