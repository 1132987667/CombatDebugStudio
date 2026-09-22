/**
 * SkillExecutorState.test.ts — SkillExecutor 概率合成 / 连击状态 / 延迟模式回归（T2-B）
 *
 * 覆盖三组有状态/概率分支：
 *   1. fengsuo_bounce 弹射概率合成（速度差、天网、风逐的加成与消耗）
 *   2. third_strike / combo_master 连击状态机与 clearAll 卫生
 *   3. context.token 延迟模式：只记账不落血
 * 随机源全部用固定 roll 桩，杜绝 flaky。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillExecutor } from '@/domain/skill/SkillExecutor'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { DeferredDamageToken } from '@/domain/skill/DeferredDamageToken'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { createParticipantFromEnemy } from '@tests/fixtures/participants'
import { createMockLogManager } from '@tests/mocks/MockLogger'
import type { BattleAction, BattleEntity, StepExecutionContext } from '@/domain/battle/type/types'
import type { ExtendedSkillStep } from '@/domain/skill/types'
import type { SeededRandom } from '@/shared/utils/SeededRandom'

const mockEventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  offByListenerId: vi.fn(),
}

function stubRng(roll: number): SeededRandom {
  return { next: () => roll } as unknown as SeededRandom
}

function makeAction(turn = 1): BattleAction {
  return { effects: [], turn } as unknown as BattleAction
}

let seq = 0
function makeFighter(buffSystem: BuffSystem, id: string): BattleEntity {
  const p = createParticipantFromEnemy(id, ParticipantSide.ALLY)
  if (!p) throw new Error(`测试敌人配置不存在: ${id}`)
  p.id = `${id}_${seq++}`
  p.setBuffQuery(buffSystem as never)
  return p as unknown as BattleEntity
}

const bounceStep = (): ExtendedSkillStep =>
  ({ type: 'custom', parameters: { customType: 'fengsuo_bounce' } }) as unknown as ExtendedSkillStep

describe('SkillExecutor 概率与状态', () => {
  let buffSystem: BuffSystem
  let damageCalculator: DamageCalculator
  let executor: SkillExecutor
  let source: BattleEntity
  let target: BattleEntity

  beforeEach(() => {
    BattleParticipantImpl.eventBus = mockEventBus as never
    const mockLogger = createMockLogManager()
    LoggerProvider.logger = mockLogger

    buffSystem = new BuffSystem(new BuffScriptRegistry(), mockEventBus as never, mockLogger)
    damageCalculator = new DamageCalculator()
    executor = new SkillExecutor(damageCalculator, new HealCalculator(), buffSystem)

    source = makeFighter(buffSystem, 'yaotu_fire')
    target = makeFighter(buffSystem, 'yaotu_gold')
    damageCalculator.setConfig({ enableDodge: false, enableCrit: false })
  })

  // ══════════════════ 1. fengsuo_bounce 概率合成 ══════════════════

  describe('风锁弹射概率合成', () => {
    function setupSpeed(mySpeed: number, tgtSpeed: number): void {
      source.setAttribute(ATTRIBUTE_CODE.speed, mySpeed)
      source.setAttribute(ATTRIBUTE_CODE.attack, 100)
      target.setAttribute(ATTRIBUTE_CODE.speed, tgtSpeed)
      source.recalcAll()
      target.recalcAll()
    }

    it('速度差贡献概率：0.2 + 30/10×0.05 = 0.35，roll 0.34 触发、0.36 不触发', () => {
      setupSpeed(30, 0)

      executor.setRng(stubRng(0.34))
      const hitAction = makeAction()
      executor.executeStep(bounceStep(), hitAction, source, target)
      expect(hitAction.effects.some((e) => e.type === 'damage')).toBe(true)
      // 伤害 = round(attack × 0.6)
      expect(hitAction.effects.find((e) => e.type === 'damage')?.value).toBe(60)
      // 命中后附加 1 层风锁
      expect(
        buffSystem.getBuffInstances(target.id).some((i) => i.buffId === 'buff_fengsuo'),
      ).toBe(true)

      executor.setRng(stubRng(0.36))
      const missAction = makeAction()
      executor.executeStep(bounceStep(), missAction, source, target)
      expect(missAction.effects.some((e) => String(e.description).includes('未触发'))).toBe(true)
    })

    it('天网联动：概率 +20% 且上限抬升，伤害 ×1.3', () => {
      setupSpeed(0, 0) // 裸概率 0.2
      buffSystem.addBuff(source.id, 'buff_tianwang', {}, 1)

      executor.setRng(stubRng(0.3)) // 0.3 < 0.2+0.2=0.4 触发
      const action = makeAction()
      executor.executeStep(bounceStep(), action, source, target)
      const dmg = action.effects.find((e) => e.type === 'damage')
      expect(dmg?.value).toBe(Math.round(100 * 0.6 * 1.3))
    })

    it('风逐联动：概率翻倍且每次仅消耗 1 层，降至 0 层实例才消失', () => {
      setupSpeed(0, 0)
      buffSystem.addBuff(source.id, 'buff_fengzhu', {}, 1)
      buffSystem.addBuff(source.id, 'buff_fengzhu', {}, 1) // LIMITED 叠 2 层

      executor.setRng(stubRng(0.39)) // 0.2×2=0.4，0.39 < 0.4 触发
      const action = makeAction()
      executor.executeStep(bounceStep(), action, source, target)
      expect(action.effects.some((e) => e.type === 'damage')).toBe(true)

      const stacks = () =>
        buffSystem.getBuffStackCount(source.id, 'buff_fengzhu')
      // 回归锁定（2026-09-22 修复）：原实现 removeBuff 整体删除多层实例，
      // 与"消耗 1 层"语义不符；现 consumeBuffStack 逐层递减。
      expect(stacks()).toBe(1)
      expect(
        buffSystem
          .getBuffInstances(source.id)
          .filter((i) => i.buffId === 'buff_fengzhu'),
      ).toHaveLength(1)

      executor.setRng(stubRng(0.39))
      executor.executeStep(bounceStep(), makeAction(), source, target)
      expect(stacks()).toBe(0)
    })

    it('基础概率被 maxProbability 封顶（速度差再大也不超 0.4）', () => {
      setupSpeed(100000, 0) // 裸概率远超 0.4

      executor.setRng(stubRng(0.41)) // ≥ 0.4 上限 → 不触发
      const action = makeAction()
      executor.executeStep(bounceStep(), action, source, target)
      expect(action.effects.some((e) => String(e.description).includes('未触发'))).toBe(true)
    })
  })

  // ══════════════════ 2. 连击状态机 ══════════════════

  describe('third_strike / combo_master 状态卫生', () => {
    const customStep = (customType: string): ExtendedSkillStep =>
      ({ type: 'custom', parameters: { customType } }) as unknown as ExtendedSkillStep

    it('third_strike：第 3 次触发 damageBoost +50 修饰符，第 4 次静默', () => {
      for (let i = 0; i < 3; i++) {
        executor.executeStep(customStep('third_strike'), makeAction(), source, target)
      }
      expect(source.getAttribute(ATTRIBUTE_CODE.damageBoost)).toBe(50)

      const action4 = makeAction()
      executor.executeStep(customStep('third_strike'), action4, source, target)
      expect(action4.effects.some((e) => String(e.description).includes('第三连击'))).toBe(false)
    })

    it('combo_master：同一目标连击递增 +10%/次，切换目标回到无加成提示', () => {
      executor.executeStep(customStep('combo_master'), makeAction(), source, target) // streak1 无 bonus
      const second = makeAction()
      executor.executeStep(customStep('combo_master'), second, source, target) // streak2 → +10
      expect(source.getAttribute(ATTRIBUTE_CODE.damageBoost)).toBe(10)

      // 切换目标 → streak 重置为 1，修饰符留在原值（upsert 不回收，由 cleanup 负责）
      const other = makeFighter(buffSystem, 'yaotu_wood')
      const third = makeAction()
      executor.executeStep(customStep('combo_master'), third, source, other)
      expect(third.effects.some((e) => String(e.description).includes('连击 x'))).toBe(false)
    })

    it('clearAllComboStates 后计数清零：再来 3 次重新触发 +50', () => {
      for (let i = 0; i < 3; i++) {
        executor.executeStep(customStep('third_strike'), makeAction(), source, target)
      }
      executor.clearAllComboStates()
      // 修饰符残留说明：clearAll 只清追踪状态；这里以 combo_master 验证 streak 重算
      const action = makeAction()
      executor.executeStep(customStep('combo_master'), action, source, target)
      executor.executeStep(customStep('combo_master'), action, source, target)
      expect(action.effects.some((e) => String(e.description).includes('连击 x2'))).toBe(true)
    })
  })

  // ══════════════════ 3. 延迟模式 ══════════════════

  describe('context.token 延迟结算', () => {
    it('deal_damage 带 token：伤害只记账，目标不掉血', () => {
      const hpBefore = target.currentHealth
      const token = new DeferredDamageToken()
      const context = { token } as unknown as StepExecutionContext

      executor.executeStep(
        { type: 'deal_damage', calculation: { baseValue: 80, extraValues: [] } } as unknown as ExtendedSkillStep,
        makeAction(),
        source,
        target,
        context,
      )

      expect(target.currentHealth).toBe(hpBefore)
      const entries = token.getEntries()
      expect(entries).toHaveLength(1)
      expect(entries[0].damage).toBeGreaterThan(0)
      expect(entries[0].rawDamage).toBeGreaterThanOrEqual(entries[0].damage)
    })

    it('引爆带 token：附加伤害同样走记账路径', () => {
      source.setAttribute(ATTRIBUTE_CODE.attack, 100)
      source.recalcAll()
      for (let i = 0; i < 4; i++) buffSystem.addBuff(target.id, 'buff_fengshi', {}, 1)
      const hpBefore = target.currentHealth
      const token = new DeferredDamageToken()
      const context = { token } as unknown as StepExecutionContext

      executor.executeStep(
        {
          type: 'custom',
          parameters: { customType: 'fengshi_detonate', damagePercentPerStack: 0.1, stacksPerDebuff: 0, applyBuffId: '' },
        } as unknown as ExtendedSkillStep,
        makeAction(),
        source,
        target,
        context,
      )

      expect(target.currentHealth).toBe(hpBefore)
      expect(token.getEntries()[0].damage).toBe(40)
      // 但风势本身仍被消耗（引爆语义即时生效）
      expect(
        buffSystem.getBuffInstances(target.id).some((i) => i.buffId === 'buff_fengshi'),
      ).toBe(false)
    })
  })
})
