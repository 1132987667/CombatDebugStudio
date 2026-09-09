/**
 * 装备实例属性生成测试（gear-generate.ts，PRD《完整项目说明》§21）
 *
 * 覆盖：
 * - 文档示例验算：10 级仙品剑核心攻击基准 36、可获得区间 [16, 40]；附加命中 [9, 22]
 * - 三属性固定/随机边界：核心按子类型系数、主要第 1 条固定 / 第 2 条随机池、附加按品质行数
 * - 禁止规则（forbidden 部位级/子类型级）、去重、显式缺口 warnings
 * - rng 确定性：同种子序列产出一致
 *
 * 运行: npx vitest run tests/unit/gear-generate.test.ts
 */
import { describe, it, expect } from 'vitest'
import { rollGearStats, rollCoreStat } from '@/domain/fengshen/gear-generate'
import { resolveAttrRange } from '@/domain/fengshen/equipment-overview'
import { affixRuleDefaults } from '@/domain/fengshen/affix-rule-defaults'
import { buildEquipFormula } from '@/infrastructure/adapters/storage/seed'
import type { EquipFormulaConfig } from '@/domain/fengshen/types'

/** 文档转化系数：1 属性点 = 12 气血 = 2 攻击 = 2 防御 = 2 命中 = 2 闪避 = 2 速度 */
const CONVERSION: Record<string, number> = {
  maxHealth: 12, attack: 2, defense: 2, hitValue: 2, dodgeValue: 2, speed: 2,
}

const CFG = affixRuleDefaults()
const FORMULA = buildEquipFormula().data as unknown as EquipFormulaConfig

/** 线性同余 rng（可复现序列，seed ∈ (0,1)） */
function lcg(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const BASE_INPUT = {
  slot: 'weapon', subType: 'sword', tier: 'xian', itemLevel: 10, quality: 5, qualityFactor: 1,
}

describe('文档示例验算（§21 装备属性数值公式）', () => {
  it('10 级仙品剑核心攻击：基准 36，可获得区间 [16, 40]', () => {
    // 基准 = 1(单位基数) × 10(等级) × 2(核心权重) × 0.9(剑词条系数) × 2(攻击转化)
    const range = resolveAttrRange(CFG, FORMULA, CONVERSION, 'attack', 10, 'xian', FORMULA.coreWeight, 0.9)
    expect(range.source).toBe('formula')
    expect(range.min).toBe(16) // 36 × 0.9(品阶下界) × 0.5(浮动下界) = 16.2
    expect(range.max).toBe(40) // 36 × 1.0(品阶上界) × 1.1(浮动上界) = 39.6
  })

  it('10 级附加命中：基准 20，可获得区间 [9, 22]', () => {
    const range = resolveAttrRange(CFG, FORMULA, CONVERSION, 'hitValue', 10, 'xian', FORMULA.affixWeight)
    expect(range.source).toBe('formula')
    expect(range.min).toBe(9) // 20 × 0.9 × 0.5 = 9
    expect(range.max).toBe(22) // 20 × 1.0 × 1.1 = 22
  })
})

describe('rollGearStats：三属性固定/随机边界', () => {
  it('剑（连击流）：核心攻击 1 条 + 主要固定 comboRate + 主要随机 1 条 + 附加按品质行数', () => {
    const r = rollGearStats(BASE_INPUT, CFG, FORMULA, CONVERSION, lcg(42))
    expect(r.warnings).toEqual([])
    expect(r.core).not.toBeNull()
    expect(r.core!.attribute).toBe('attack')
    expect(r.core!.value).toBeGreaterThanOrEqual(16)
    expect(r.core!.value).toBeLessThanOrEqual(40)

    const fixed = r.affixes.filter((a) => a.fixed)
    expect(fixed).toHaveLength(1)
    expect(fixed[0].attribute).toBe('comboRate')

    const mainRandom = r.affixes.filter((a) => a.main)
    expect(mainRandom).toHaveLength(1)
    expect(['speedBonus', 'hitBonus', 'comboRate', 'normalAtkBonus']).toContain(mainRandom[0].attribute)

    const append = r.affixes.filter((a) => !a.fixed && !a.main)
    expect(append).toHaveLength(5) // 神 5 → 投放矩阵 5 行各 1 条
    // 全部词条属性码唯一（主要允许与固定重复，附加彼此去重）
    const appendAttrs = append.map((a) => a.attribute)
    expect(new Set(appendAttrs).size).toBe(appendAttrs.length)
  })

  it('品质决定附加条数：凡 1 / 精 2 / 超 3 / 绝 4 / 神 5', () => {
    for (const [quality, count] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]] as const) {
      const r = rollGearStats({ ...BASE_INPUT, quality }, CFG, FORMULA, CONVERSION, lcg(7))
      const append = r.affixes.filter((a) => !a.fixed && !a.main)
      expect(append).toHaveLength(count)
    }
  })

  it('核心值乘品质系数：qualityFactor 0.85 时核心值 ≤ 区间上界 × 0.85', () => {
    const r = rollCoreStat({ ...BASE_INPUT, qualityFactor: 0.85 }, { cfg: CFG, formula: FORMULA, conversion: CONVERSION, rng: lcg(99) })
    expect(r.stat).not.toBeNull()
    expect(r.stat!.value).toBeLessThanOrEqual(Math.round(40 * 0.85))
    expect(r.stat!.value).toBeGreaterThanOrEqual(13) // 16 × 0.85 = 13.6，取整后 ≥ 13
  })
})

describe('禁止规则（forbidden）', () => {
  it('武器禁止免伤率：任何品质下附加/主要都不出现 damageReduction', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = rollGearStats(BASE_INPUT, CFG, FORMULA, CONVERSION, lcg(seed * 1337))
      expect(r.affixes.some((a) => a.attribute === 'damageReduction')).toBe(false)
    }
  })

  it('刺（dagger）子类型级禁令：不出现连击率/破甲（部位级免伤率同样生效）', () => {
    const r = rollGearStats({ ...BASE_INPUT, subType: 'dagger' }, CFG, FORMULA, CONVERSION, lcg(555))
    const attrs = r.affixes.map((a) => a.attribute)
    expect(attrs).not.toContain('comboRate')
    expect(attrs).not.toContain('armorBreak')
  })

  it('护符（charm）禁止防御系：附加不出现 defense/defenseBonus/defenseCoefficient', () => {
    const r = rollGearStats(
      { slot: 'charm', subType: 'charm', tier: 'tian', itemLevel: 35, quality: 5, qualityFactor: 1 },
      CFG, FORMULA, CONVERSION, lcg(2024),
    )
    const attrs = r.affixes.map((a) => a.attribute)
    expect(attrs).not.toContain('defense')
    expect(attrs).not.toContain('defenseBonus')
  })
})

describe('显式缺口（不补默认值）', () => {
  it('未配置 main_affix_pool 的子类型（皮甲）产生缺口 warning，主要条为空', () => {
    const r = rollGearStats(
      { slot: 'armor', subType: 'leather_armor', tier: 'di', itemLevel: 25, quality: 3, qualityFactor: 1 },
      CFG, FORMULA, CONVERSION, lcg(11),
    )
    expect(r.affixes.filter((a) => a.fixed || a.main)).toHaveLength(0)
    expect(r.warnings.some((w) => w.includes('main_affix_pool'))).toBe(true)
  })

  it('护手主要固定条未配置（fixed 为空）产生 warning，随机池正常投放', () => {
    const r = rollGearStats(
      { slot: 'glove', subType: 'glove', tier: 'xuan', itemLevel: 15, quality: 2, qualityFactor: 1 },
      CFG, FORMULA, CONVERSION, lcg(13),
    )
    expect(r.affixes.filter((a) => a.fixed)).toHaveLength(0)
    expect(r.warnings.some((w) => w.includes('第 1 条'))).toBe(true)
    expect(r.affixes.filter((a) => a.main).length).toBe(1)
  })
})

describe('rng 确定性', () => {
  it('同一种子产出完全一致（可复现）', () => {
    const a = rollGearStats(BASE_INPUT, CFG, FORMULA, CONVERSION, lcg(8888))
    const b = rollGearStats(BASE_INPUT, CFG, FORMULA, CONVERSION, lcg(8888))
    expect(b).toEqual(a)
  })
})
