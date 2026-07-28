import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { createMockEntity, defaultAttrs } from '../../../mocks/MockEntity'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { ExtendedSkillStep } from '@/domain/skill/types'
import { AttackType, DamageCategory } from '@/domain/skill/types'
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
      source.getRandomAttackDamage = () => 100
      const step = createSkillStep({ calculation: { baseValue: 0, extraValues: [{ attribute: 'attack', ratio: 2 }] } })

      const result = calculator.calculateDamage(step, source, target)

      expect(result.isMiss).toBe(false)
      expect(result.damage).toBeGreaterThan(0)
      expect(result.damage).toBeLessThanOrEqual(300)
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
      source.getRandomAttackDamage = () => 0
      const origGetAttr = source.getAttribute
      source.getAttribute = (attr: string) => {
        if (attr === ATTRIBUTE_CODE.hit) return 100
        if (attr === ATTRIBUTE_CODE.attack || attr === ATTRIBUTE_CODE.minAttack || attr === ATTRIBUTE_CODE.maxAttack) return 0
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

    it('should order breakdown steps: crit → source bonuses → rawDamage → defense', () => {
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

      // 关键顺序：crit → damageBoost → rawDamage → defense → final
      const critIdx = stepNames.indexOf('crit')
      const boostIdx = stepNames.indexOf('damageBoost')
      const rawIdx = stepNames.indexOf('rawDamage')
      const defIdx = stepNames.indexOf('defense')
      const finalIdx = stepNames.indexOf('final')

      expect(critIdx).toBeGreaterThanOrEqual(0)
      expect(boostIdx).toBeGreaterThan(critIdx)
      expect(rawIdx).toBeGreaterThan(boostIdx)
      expect(defIdx).toBeGreaterThan(rawIdx)
      expect(finalIdx).toBeGreaterThan(defIdx)
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
        if (attr === ATTRIBUTE_CODE.generalDamageReduction || attr === ATTRIBUTE_CODE.damageReduction) return 50
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
  })

  describe('config', () => {
    it('should allow setting custom config', () => {
      calculator.setConfig({ enableCrit: false })

      const config = calculator.getConfig()
      expect(config.enableCrit).toBe(false)
    })
  })
})
