import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { createMockEntity, defaultAttrs } from '@tests/mocks/MockEntity'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { ExtendedSkillStep } from '@/domain/skill/types'
import { AttackType, DamageCategory } from '@/domain/skill/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import type { StepExecutionContext } from '@/domain/battle/type/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { HealCalculator } from '@/domain/skill/HealCalculator'

vi.mock('@/infrastructure/adapters/logging', () => ({
  battleLogManager: { addDebugLog: () => {}, addSystemLog: () => {} },
  LogLevel: { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
}))

LoggerProvider.logger = {
  addDebugLog: vi.fn(),
  addSystemLog: vi.fn(),
  addBattleLog: vi.fn(),
  addActionLog: vi.fn(),
  clearLogs: vi.fn(),
  syncBattleLogs: vi.fn(),
  getSystemLogs: () => [],
} as any

function createSkillStep(overrides?: Partial<ExtendedSkillStep>): ExtendedSkillStep {
  return {
    type: 'deal_damage',
    calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 2 }] },
    skillId: 'test_skill',
    skillName: 'Test Skill',
    tier: 'small',
    ...overrides,
  } as ExtendedSkillStep
}

describe('DamageCalculator', () => {
  let calculator: DamageCalculator

  beforeEach(() => {
    calculator = new DamageCalculator()
  })

  describe('calculateDamage', () => {
    it('should calculate damage based on formula', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const step = createSkillStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 2 }] } })

      const result = calculator.calculateDamage(step, source, target)

      expect(result.isMiss).toBe(false)
      expect(result.damage).toBeGreaterThan(0)
      expect(result.damage).toBeLessThanOrEqual(300)
    })

    it('v2.1.0: 无 calculation 时基础伤害 = attack + level×2，且确定无区间随机', () => {
      // 攻击模型扁平化：无 calculation 的 skillStep 走 calculateBaseDamage 默认分支，
      // 直接取单一 attack（不再用 min/max 区间 + Math.random）
      const source = createMockEntity() // attack=63, level=50
      const target = createMockEntity()
      calculator = new DamageCalculator({ minDamageThreshold: 0, maxDamageThreshold: 99999 })

      const step = createSkillStep({ calculation: undefined })
      const context: StepExecutionContext = { record: { effects: [] } as unknown as CombatRecord }
      calculator.calculateDamage(step, source, target, context)

      // floor(63 + 50×2) = 163 —— 精确值，覆盖等级加成项（levelBonus=100）
      expect(context.record!.damageBreakdown!.baseDamage).toBe(163)

      // 确定性：多次调用结果一致（扁平化后不再依赖随机伤害区间）
      const r1 = calculator.calculateDamage(step, source, target)
      const r2 = calculator.calculateDamage(step, source, target)
      expect(r1.damage).toBe(r2.damage)
    })

    it('v2.1.0: 基础伤害随 attack 线性变化（单一数据源）', () => {
      const target = createMockEntity()
      const step = createSkillStep({ calculation: undefined })

      const baseOf = (atk: number): number => {
        const s = createMockEntity()
        const orig = s.getAttribute
        s.getAttribute = (attr: string) => {
          if (attr === ATTRIBUTE_CODE.attack) return atk
          return orig(attr)
        }
        const ctx: StepExecutionContext = { record: { effects: [] } as unknown as CombatRecord }
        calculator.calculateDamage(step, s, target, ctx)
        return ctx.record!.damageBreakdown!.baseDamage
      }

      // level=50 → levelBonus=100；attack 63→163、100→200、0→100（仅剩等级加成）
      expect(baseOf(63)).toBe(163)
      expect(baseOf(100)).toBe(200)
      expect(baseOf(0)).toBe(100)
    })

    it('should apply dodge when target has max dodge rate', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      // 启用闪避门控，否则闪避判定被跳过
      calculator.setConfig({ enableDodge: true })
      target.getAttrVal = (attr: string) => {
        if (attr === 'dodgeRate' || attr === ATTRIBUTE_CODE.dodge) {
          return { value: 100, base: 100, modifiers: [], dirty: false }
        }
        return defaultAttrs[attr as ATTRIBUTE_CODE]
      }
      target.getAttribute = (attr: string) => {
        if (attr === 'dodgeRate' || attr === ATTRIBUTE_CODE.dodge) return 100
        return defaultAttrs[attr as ATTRIBUTE_CODE]?.value ?? 0
      }

      const rand = vi.spyOn(Math, 'random').mockReturnValue(0.5)

      const step = createSkillStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 1 }] } })
      const result = calculator.calculateDamage(step, source, target)

      expect(result.isMiss).toBe(true)
      expect(result.damage).toBe(0)
      rand.mockRestore()
    })

    it('should apply minimum damage threshold', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const step = createSkillStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 2 }] } })
      const origGetAttr = source.getAttribute
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.hit) return 100
        if (attr === ATTRIBUTE_CODE.attack) return 0
        return origGetAttr(attr)
      }

      const result = calculator.calculateDamage(step, source, target)

      expect(result.damage).toBe(1)
    })

    it('should include source-side bonuses in rawDamage before target reductions', () => {
      // 测试：暴击 + damageBoost → rawDamage 包含来源方加成，防御在之后
      const source = createMockEntity()
      const target = createMockEntity()

      // 设置必暴 + 高暴伤
      const origSrcGetAttr = source.getAttribute
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.critRate) return 100
        if (attr === ATTRIBUTE_CODE.critDamage) return 200
        if (attr === ATTRIBUTE_CODE.damageBoost) return 20
        return origSrcGetAttr(attr)
      }

      // 目标有防御
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.defense) return 50
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        enableCrit: true,
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      // 固定基础伤害 100，无 extraValues
      const step = createSkillStep({
        calculation: { baseValue: 100 },
      })

      const result = calculator.calculateDamage(step, source, target)

      // postCritDamage = 100 × 2.0 = 200
      // damageBoost 20% → 200 × 1.2 = 240
      // rawDamage = 240（来源方产出，防御前）
      // defense -50 → 240 - 50 = 190
      // finalDamage = 190
      expect(result.rawDamage).toBe(240)
      expect(result.damage).toBe(190)
    })

    it('should order breakdown steps: crit → source bonuses → defense', () => {
      // 测试步骤链顺序
      const source = createMockEntity()
      const target = createMockEntity()
      const origSrcGetAttr = source.getAttribute
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.critRate) return 100
        if (attr === ATTRIBUTE_CODE.critDamage) return 200
        if (attr === ATTRIBUTE_CODE.damageBoost) return 20
        return origSrcGetAttr(attr)
      }
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.defense) return 50
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        enableCrit: true,
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
      })

      // 调用计算获取 breakdown
      const context: any = { record: { effects: [] } }
      calculator.calculateDamage(step, source, target, context)
      const breakdown = context.record.damageBreakdown

      expect(breakdown).toBeDefined()
      const stepNames = breakdown.steps.map((s: { stepName: string }) => s.stepName)

      // 关键顺序：crit → damageBoost → defense（rawDamage/final 为无变换打点，不再入链）
      const critIdx = stepNames.indexOf('crit')
      const boostIdx = stepNames.indexOf('damageBoost')
      const defIdx = stepNames.indexOf('defense')

      expect(critIdx).toBeGreaterThanOrEqual(0)
      expect(boostIdx).toBeGreaterThan(critIdx)
      expect(defIdx).toBeGreaterThan(boostIdx)
    })

    it('should correctly compute rawDamage for TRUE damage with source bonuses', () => {
      // 真实伤害 + damageBoost：damageBoost 生效于 rawDamage，通用减免跳过
      const source = createMockEntity()
      const target = createMockEntity()
      const origSrcGetAttr = source.getAttribute
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.critRate) return 100
        if (attr === ATTRIBUTE_CODE.critDamage) return 200
        if (attr === ATTRIBUTE_CODE.damageBoost) return 20
        return origSrcGetAttr(attr)
      }
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.damageReduction) return 50
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        enableCrit: true,
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
        damageCategory: DamageCategory.TRUE,
      })

      const result = calculator.calculateDamage(step, source, target)

      // postCritDamage = 100 × 2.0 = 200
      // damageBoost 20% → 200 × 1.2 = 240
      // rawDamage = 240
      // 真实伤害：跳过防御、攻击类型减免、通用减免，但不还原，保留来源方加成
      // damage = 240（保留来源方加成，不再回退到 postCritDamage）
      expect(result.rawDamage).toBe(240)
      expect(result.damage).toBe(240)
    })

    it('should apply damageTakenIncrease to TRUE damage', () => {
      // 真实伤害 + 易伤：易伤在目标方减免阶段，真实伤害仍应受易伤影响
      const source = createMockEntity()
      const target = createMockEntity()
      const origSrcGetAttr = source.getAttribute
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.critRate) return 100
        if (attr === ATTRIBUTE_CODE.critDamage) return 200
        if (attr === ATTRIBUTE_CODE.damageBoost) return 20
        return origSrcGetAttr(attr)
      }
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.damageTakenIncrease) return 25
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        enableCrit: true,
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
        damageCategory: DamageCategory.TRUE,
      })

      const result = calculator.calculateDamage(step, source, target)

      // postCritDamage = 100 × 2.0 = 200
      // damageBoost 20% → 200 × 1.2 = 240 (rawDamage = 240)
      // 真实伤害跳过防御/攻击类型减免/通用减免
      // 易伤 25% → 240 × 1.25 = 300
      // finalDamage = 300
      expect(result.rawDamage).toBe(240)
      expect(result.damage).toBe(300)
    })

    it('should apply fireSkillDmgBonus for HUO element skills', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const origSrcGetAttr = source.getAttribute
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.fireSkillDmgBonus) return 25
        return origSrcGetAttr(attr)
      }
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.defense) return 0
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
        elementType: 'HUO',
      })

      const result = calculator.calculateDamage(step, source, target)

      // base = 100, no crit
      // fireSkillDmgBonus 25% → 100 × 1.25 = 125
      // rawDamage = 125
      // defense 0 → 125
      // finalDamage = 125
      expect(result.rawDamage).toBe(125)
      expect(result.damage).toBe(125)
    })

    it('should apply physicalSkillDmgBonus for NORMAL attack type', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const origSrcGetAttr = source.getAttribute
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.physicalSkillDmgBonus) return 30
        return origSrcGetAttr(attr)
      }
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.defense) return 0
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
        attackType: AttackType.NORMAL,
      })

      const result = calculator.calculateDamage(step, source, target)

      // base = 100, no crit
      // attackType=NORMAL → physicalSkillDmgBonus 30% → 100 × 1.3 = 130
      // rawDamage = 130
      // defense 0 → 130
      // finalDamage = 130
      expect(result.rawDamage).toBe(130)
      expect(result.damage).toBe(130)
    })

    it('should apply elemental resistance for ELEMENTAL damage', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.fireRes) return 30
        if (attr === ATTRIBUTE_CODE.defense) return 0
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
        damageCategory: DamageCategory.ELEMENTAL,
        elementType: 'HUO',
      })

      const result = calculator.calculateDamage(step, source, target)

      // base = 100, no crit
      // 元素抗性 30% → 100 × 0.7 = 70
      expect(result.damage).toBe(70)
    })

    it('should apply fieldElemental modifier', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.fireRes) return 0
        if (attr === ATTRIBUTE_CODE.defense) return 0
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
        fieldElementalModifier: () => 15, // 场地火伤+15%
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
        damageCategory: DamageCategory.ELEMENTAL,
        elementType: 'HUO',
      })

      const result = calculator.calculateDamage(step, source, target)

      // base = 100, 元素抗性 0, 无 extraValues
      // 场地效果 +15% → Math.floor(100 × 1.15) — IEEE 754 可能为 114
      const expected = Math.floor(100 * (1 + 15 / 100))
      expect(result.damage).toBe(expected)
    })

    it('should apply normalAtkReduction for NORMAL attack type', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.normalAtkDmgReduction) return 20
        if (attr === ATTRIBUTE_CODE.defense) return 0
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
        attackType: AttackType.NORMAL,
      })

      const result = calculator.calculateDamage(step, source, target)

      // base = 100, defense = 0
      // 普攻减免 20% → 100 × 0.8 = 80
      expect(result.damage).toBe(80)
    })

    it('should apply skillDmgReduction for SKILL attack type', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.skillDmgReduction) return 20
        if (attr === ATTRIBUTE_CODE.defense) return 0
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
        attackType: AttackType.SKILL,
      })

      const result = calculator.calculateDamage(step, source, target)

      // base = 100, defense = 0
      // 技能减免 20% → 100 × 0.8 = 80
      expect(result.damage).toBe(80)
    })

    it('should apply targetModifier from skill step', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      const origTgtGetAttr = target.getAttribute
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.defense) return 0
        if (attr === ATTRIBUTE_CODE.attack) return 200 // 用于目标修正
        return origTgtGetAttr(attr)
      }

      calculator = new DamageCalculator({
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const step = createSkillStep({
        calculation: { baseValue: 100 },
        targetModifiers: { [ATTRIBUTE_CODE.attack]: 10 }, // 目标攻击力 10% 转化为增伤
      })

      const result = calculator.calculateDamage(step, source, target)

      // base = 100, defense = 0
      // targetModifier: modifier=10, attrValue(attack)=200
      //   → modifierEffect = 10 * 200 / 100 = 20
      //   → damage = 100 × (1 + 20) = 2100
      expect(result.damage).toBe(2100)
    })

    it('should list all stepNames in order for a full pipeline', () => {
      const source = createMockEntity()
      const target = createMockEntity({ currentHealth: 200, maxHealth: 1000 })
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.critRate) return 100
        if (attr === ATTRIBUTE_CODE.critDamage) return 200
        if (attr === ATTRIBUTE_CODE.damageBoost) return 15
        if (attr === ATTRIBUTE_CODE.fireSkillDmgBonus) return 10
        if (attr === ATTRIBUTE_CODE.damageToLowHp) return 20
        // physicalSkillDmgBonus: stays default (0) — ELEMENTAL damage skips physical bonus
        return defaultAttrs[attr as ATTRIBUTE_CODE]?.value ?? 0
      }
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.defense) return 30
        if (attr === ATTRIBUTE_CODE.critDmgTakenReduction) return 10
        if (attr === ATTRIBUTE_CODE.skillDmgReduction) return 15
        if (attr === ATTRIBUTE_CODE.fireRes) return 5
        if (attr === ATTRIBUTE_CODE.damageReduction) return 10
        if (attr === ATTRIBUTE_CODE.damageTakenIncrease) return 20
        return defaultAttrs[attr as ATTRIBUTE_CODE]?.value ?? 0
      }

      calculator = new DamageCalculator({
        enableCrit: true,
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const context: any = { record: { effects: [] } }
      // 使用 extraValues 使 preCrit 步骤产生，使用 ELEMENTAL+SKILL 触发 fireSkillDmgBonus
      const step = createSkillStep({
        calculation: { baseValue: 100, extraValues: [{ attribute: 'attack', ratio: 1 }] },
        damageCategory: DamageCategory.ELEMENTAL,
        elementType: 'HUO',
        attackType: AttackType.SKILL,
      })
      calculator.calculateDamage(step, source, target, context)
      const breakdown = context.record.damageBreakdown
      const stepNames = breakdown.steps.map((s: { stepName: string }) => s.stepName)

      // 预期步骤顺序（不含 physicalSkillDmgBonus — ELEMENTAL damage 不触发；
      // 不含 rawDamage/final — 无变换打点，值在 payload 顶层 raw/final 字段）
      const expectedOrder = [
        'base', 'extra', 'preCrit', 'crit', 'damageBoost', 'fireSkillDmgBonus',
        'damageToLowHp',
        'critDmgTakenReduction', 'defense', 'skillDmgReduction',
        'elementalResistance', 'damageReduction', 'dmgTakenIncrease',
      ]
      const filtered = stepNames.filter((n: string) => expectedOrder.includes(n))
      expect(filtered).toEqual(expectedOrder)
    })

    it('should maintain before/after value coherence across steps (skip clamp)', () => {
      const source = createMockEntity()
      const target = createMockEntity()
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.critRate) return 100
        if (attr === ATTRIBUTE_CODE.critDamage) return 200
        if (attr === ATTRIBUTE_CODE.damageBoost) return 20
        return defaultAttrs[attr as ATTRIBUTE_CODE]?.value ?? 0
      }
      target.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.defense) return 50
        return defaultAttrs[attr as ATTRIBUTE_CODE]?.value ?? 0
      }

      calculator = new DamageCalculator({
        enableCrit: true,
        minDamageThreshold: 0,
        maxDamageThreshold: 99999,
      })

      const context: any = { record: { effects: [] } }
      const step = createSkillStep({ calculation: { baseValue: 100 } })
      calculator.calculateDamage(step, source, target, context)
      const breakdown = context.record.damageBreakdown
      const steps = breakdown.steps

      // 除 clamp 外，每步的 after 应等于下一步的 before（steps 只含实际变换环节，链连续）
      for (let i = 0; i < steps.length - 1; i++) {
        if (steps[i + 1].stepName === 'clamp') continue
        expect(steps[i].after).toBe(steps[i + 1].before)
      }
    })
  })

  describe('config', () => {
    it('should allow setting custom config', () => {
      calculator.setConfig({ enableCrit: false })

      const config = calculator.getConfig()
      expect(config.enableCrit).toBe(false)
    })
  })
})
