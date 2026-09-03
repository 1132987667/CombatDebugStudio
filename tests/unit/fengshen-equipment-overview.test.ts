/**
 * 封神榜 · 装备总览数值推算测试
 *
 * 覆盖：
 * - 种子透传：main_affix_pool 未被白名单丢掉、新核心系数表生效
 * - 双通路区间：基础六维走装备公式、百分比走 affix_value_curve，均 × 品阶权重 × 浮动
 * - 区间口径：品阶权重每件随机取一次 → 取 [tier.min×float.min, tier.max×float.max] 外包络
 * - 词条池引用解析：组码展开 / 单属性直取
 * - 品质 → 附加行数、禁止词条过滤
 * - 配置缺口显式告警（未知品阶 / 缺主要池 / 缺曲线），不静默归零
 * - 分步推导：每步有名有式、结论行唯一，锁住悬浮气泡的层级契约
 *
 * 运行: npx vitest run tests/unit/fengshen-equipment-overview.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { GameDataApi } from '@/application/service/GameDataApi'
import type { AffixRuleConfig, EquipFormulaConfig } from '@/domain/fengshen/types'
import { equipBaseUnit } from '@/domain/fengshen/player-config'
import {
  buildEquipmentOverview,
  expandPoolRef,
  qualityAffixCount,
  resolveAttrRange,
  rowGroups,
} from '@/domain/fengshen/equipment-overview'

/** 按 store 分桶的内存版持久化存储（与 fengshen-exp-reward.test.ts 同构） */
class MemoryStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const
  private buckets = new Map<string, Map<string, unknown>>()

  private bucket(store: string): Map<string, unknown> {
    let b = this.buckets.get(store)
    if (!b) { b = new Map(); this.buckets.set(store, b) }
    return b
  }

  async set<T>(store: StorageStoreName, key: string, value: T): Promise<boolean> {
    this.bucket(store).set(key, value)
    return true
  }
  async get<T>(store: StorageStoreName, key: string): Promise<T | null> {
    return (this.bucket(store).get(key) as T | undefined) ?? null
  }
  async remove(store: StorageStoreName, key: string): Promise<boolean> {
    return this.bucket(store).delete(key)
  }
  async keys(store: StorageStoreName): Promise<string[]> {
    return Array.from(this.bucket(store).keys())
  }
  async clear(store: StorageStoreName): Promise<boolean> {
    this.bucket(store).clear()
    return true
  }
  async keysByField(): Promise<string[]> {
    return []
  }
  async getStats(): Promise<StorageStats | null> {
    return null
  }
}

let cfg: AffixRuleConfig
let formula: EquipFormulaConfig
const conv: Record<string, number> = { maxHealth: 12, attack: 2, defense: 2, hitValue: 2, dodgeValue: 2, speed: 2 }

beforeAll(async () => {
  const storage = new MemoryStorage()
  await seedFengshenData(storage)
  const api = new GameDataApi(storage)
  cfg = (await api.getAffixRule())!
  formula = (await api.getEquipFormula())!
})

describe('种子透传', () => {
  it('main_affix_pool 未被 seed 白名单丢弃', () => {
    expect(cfg.main_affix_pool?.sword).toEqual({
      fixed: 'comboRate',
      random_pool: ['speedBonus', 'hitBonus', 'comboRate', 'normalAtkBonus'],
    })
  })

  it('核心系数为 2026-09-02 定稿值（剑 0.9 / 布甲 0.8 / 皮甲 0.9 / 盔甲 1.0）', () => {
    expect(cfg.core_affix_ratio.sword.ratio).toBe(0.9)
    expect(cfg.core_affix_ratio.cloth_armor.ratio).toBe(0.8)
    expect(cfg.core_affix_ratio.leather_armor.ratio).toBe(0.9)
    expect(cfg.core_affix_ratio.plate_armor.ratio).toBe(1.0)
  })
})

describe('装备公式通路', () => {
  it('单位基数 = 900 ÷ 6 ÷ 3 ÷ 50 = 1', () => {
    expect(equipBaseUnit(formula)).toBe(1)
  })

  it('10 级仙品剑核心攻击：含 0.9 系数与品阶/浮动外包络 = 16~40', () => {
    const r = resolveAttrRange(cfg, formula, conv, 'attack', 10, 'xian', formula.coreWeight, 0.9)
    // min = 1×10×2×0.9(tier)×0.5(float)×0.9(ratio)×2(conv) = 16.2
    // max = 1×10×2×1.0(tier)×1.1(float)×0.9(ratio)×2(conv) = 39.6
    expect(r).toMatchObject({ attribute: 'attack', source: 'formula', min: 16, max: 40 })
    // 步骤顺序即层级契约：策划在气泡里自上而下读到的就是推导顺序
    expect(r.calc.map((s) => s.label)).toEqual([
      '通路', '基准', '单位基数', '等级', '属性权重', '词条系数', '属性转化', '品阶', '浮动', '区间',
    ])
    expect(r.calc.find((s) => s.label === '词条系数')?.expr).toBe('0.9 = 子类型核心属性词条系数')
  })

  it('气血转化 12 倍于攻击：同参数下气血区间约为攻击的 6 倍', () => {
    const hp = resolveAttrRange(cfg, formula, conv, 'maxHealth', 10, 'xian', formula.coreWeight, 1)
    const atk = resolveAttrRange(cfg, formula, conv, 'attack', 10, 'xian', formula.coreWeight, 1)
    expect(hp.max / atk.max).toBeCloseTo(6, 0)
  })
})

describe('词条曲线通路', () => {
  it('暴击率 10 级仙品：(1+0.06×9)~(3+0.1×9) 再乘品阶与浮动 = 0.7~4.3', () => {
    const r = resolveAttrRange(cfg, formula, conv, 'critRate', 10, 'xian', formula.affixWeight)
    expect(r.source).toBe('curve')
    expect(r.min).toBe(0.7)
    expect(r.max).toBe(4.3)
  })

  it('等级单调不减', () => {
    const lo = resolveAttrRange(cfg, formula, conv, 'critRate', 1, 'xian', 1)
    const hi = resolveAttrRange(cfg, formula, conv, 'critRate', 50, 'xian', 1)
    expect(hi.min).toBeGreaterThan(lo.min)
    expect(hi.max).toBeGreaterThan(lo.max)
  })

  it('无曲线属性显式标记 none，不静默返回 0 区间', () => {
    const r = resolveAttrRange(cfg, formula, conv, 'vulnerability', 10, 'xian', 1)
    expect(r.source).toBe('none')
  })

  it('未知品阶返回 none 而非 NaN', () => {
    const r = resolveAttrRange(cfg, formula, conv, 'attack', 10, 'nope', 1)
    expect(r).toMatchObject({ attribute: 'attack', source: 'none', min: 0, max: 0 })
    expect(r.calc[0].label).toBe('缺口')
    expect(r.calc[0].expr).toContain('nope')
  })
})

describe('分步推导', () => {
  /** 结论行必须把区间两端复述出来，策划不必回看单元格就能对上数 */
  const resultOf = (r: ReturnType<typeof resolveAttrRange>) => r.calc.filter((s) => s.result)

  it('公式与曲线通路：每步有名有式，结论行唯一', () => {
    for (const attr of ['attack', 'critRate']) {
      const r = resolveAttrRange(cfg, formula, conv, attr, 50, 'xian', formula.affixWeight)
      expect(r.calc.length).toBeGreaterThan(4)
      expect(r.calc.every((s) => !!s.label && !!s.expr)).toBe(true)
      expect(new Set(r.calc.map((s) => s.label)).size, `${attr} 步骤标签须唯一`).toBe(r.calc.length)
      const [result] = resultOf(r)
      expect(resultOf(r)).toHaveLength(1)
      expect(result.expr).toBe(`${r.min} ~ ${r.max}`)
      expect(result.note).toContain('×')
      // 外包络会高估单件收益，口径说明必须显式出现在浮动步
      expect(r.calc.find((s) => s.label === '浮动')?.note).toContain('未必同时命中')
    }
  })

  it('曲线通路标明取的是第几行、同级属性有哪些', () => {
    const r = resolveAttrRange(cfg, formula, conv, 'critRate', 10, 'xian', formula.affixWeight)
    const row = r.calc.find((s) => s.label === '曲线行')
    expect(row?.expr).toBe('第 4 行 · counterRate、trueDamageRate、critRate 等 5 项')
    expect(row?.note).toBe('同行属性共用一档')
  })

  it('核心条的词条系数说明带子类型中文名，不是泛称', () => {
    const o = buildEquipmentOverview(cfg, formula, conv, { level: 10, slot: 'weapon', subType: 'sword', tier: 'xian', quality: 3 })
    expect(o.core!.calc.find((s) => s.label === '词条系数')?.expr).toBe('0.9 = 剑的核心属性词条系数')
  })

  it('缺曲线属性给出缺口步骤与补配方向，不给空推导', () => {
    const r = resolveAttrRange(cfg, formula, conv, 'vulnerability', 10, 'xian', 1)
    expect(r.source).toBe('none')
    expect(r.calc.length).toBe(2)
    const gap = r.calc.find((s) => s.label === '缺口')
    expect(gap?.note).toContain('曲线表')
  })
})

describe('词条池引用解析', () => {
  it('组码整组展开', () => {
    expect(expandPoolRef(cfg, 'ALL-MEC')).toEqual(['energyInit', 'energyGainEfficiency', 'splash'])
  })

  it('单属性码原样返回', () => {
    expect(expandPoolRef(cfg, 'comboRate')).toEqual(['comboRate'])
  })

  it('附加行按阵营取池，未知阵营为空', () => {
    expect(rowGroups(cfg, 'ATK', 1)).toEqual(['ATK-L1'])
    expect(rowGroups(cfg, 'DEF', 5)).toEqual(['L4-通用', 'DEF-L3'])
    expect(rowGroups(cfg, 'ATK', 99)).toEqual([])
  })
})

describe('品质与条数', () => {
  it('凡1/精2/超3/绝4/神5，越界收口', () => {
    expect([1, 2, 3, 4, 5].map((q) => qualityAffixCount(q, 5))).toEqual([1, 2, 3, 4, 5])
    expect(qualityAffixCount(9, 5)).toBe(5)
    expect(qualityAffixCount(0, 5)).toBe(0)
    expect(qualityAffixCount(NaN, 5)).toBe(0)
  })

  it('品质 2 → 仅前 2 行附加生效，5 行全部返回供 UI 置灰', () => {
    const o = buildEquipmentOverview(cfg, formula, conv, { level: 10, slot: 'weapon', subType: 'sword', tier: 'xian', quality: 2 })
    expect(o.affixRows).toHaveLength(cfg.affix_rows.length)
    expect(o.affixRows.filter((r) => r.included)).toHaveLength(2)
  })

  it('ATK 侧附加行候选池非空且携带区间', () => {
    const o = buildEquipmentOverview(cfg, formula, conv, { level: 10, slot: 'weapon', subType: 'sword', tier: 'xian', quality: 5 })
    const row1 = o.affixRows.find((r) => r.row === 1)!
    expect(row1.candidates.map((c) => c.attribute)).toEqual(['attack', 'hitValue', 'speed'])
    expect(row1.candidates[0].source).toBe('formula')
    const row5 = o.affixRows.find((r) => r.row === 5)!
    expect(row5.candidates.some((c) => c.source === 'curve')).toBe(true)
  })

  it('附加候选去重（同一属性跨组只出现一次）', () => {
    const o = buildEquipmentOverview(cfg, formula, conv, { level: 10, slot: 'weapon', subType: 'sword', tier: 'xian', quality: 5 })
    const row3 = o.affixRows.find((r) => r.row === 3)!
    const codes = row3.candidates.map((c) => c.attribute)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('禁止词条过滤', () => {
  it('子类型级禁止规则只约束该子类型，不误伤同部位其他子类型', () => {
    // forbidden 配置了 { slot: 'weapon', subType: '刺' } 禁连击率/连击伤害系数/破甲/易伤
    const atkRow3Groups = rowGroups(cfg, 'ATK', 3)
    expect(atkRow3Groups).toEqual(['ATK-MEC', 'SHD-L2'])
    const sword = buildEquipmentOverview(cfg, formula, conv, { level: 10, slot: 'weapon', subType: 'sword', tier: 'xian', quality: 3 })
    const dagger = buildEquipmentOverview(cfg, formula, conv, { level: 10, slot: 'weapon', subType: 'dagger', tier: 'xian', quality: 3 })
    const swordRow3 = sword.affixRows.find((r) => r.row === 3)!.candidates.map((c) => c.attribute)
    const daggerRow3 = dagger.affixRows.find((r) => r.row === 3)!.candidates.map((c) => c.attribute)
    expect(swordRow3).toContain('comboRate')
    expect(daggerRow3).not.toContain('comboRate')
    expect(swordRow3.filter((a) => a === 'comboRate')).toHaveLength(1)
  })

  it('命中的禁止属性从附加候选中剔除，未命中的保留', () => {
    const patched: AffixRuleConfig = structuredClone(cfg)
    patched.forbidden = [{ slot: 'weapon', slotLabel: '武器', attributes: ['attack'], attributeLabels: ['攻击'] }]
    const o = buildEquipmentOverview(patched, formula, conv, { level: 10, slot: 'weapon', subType: 'sword', tier: 'xian', quality: 5 })
    const row1 = o.affixRows.find((r) => r.row === 1)!
    expect(row1.candidates.map((c) => c.attribute)).toEqual(['hitValue', 'speed'])
    // 核心属性不受禁止规则约束（部位必然提供）
    expect(o.core?.attribute).toBe('attack')
  })
})

describe('主要属性', () => {
  it('剑：固定条连击率 + 随机池 4 项候选，全部曲线通路且不含基础六维', () => {
    const o = buildEquipmentOverview(cfg, formula, conv, { level: 20, slot: 'weapon', subType: 'sword', tier: 'tian', quality: 3 })
    expect(o.mainFixed?.attribute).toBe('comboRate')
    expect(o.mainFixed?.source).toBe('curve')
    expect(o.mainRandom.map((r) => r.attribute)).toEqual(['speedBonus', 'hitBonus', 'comboRate', 'normalAtkBonus'])
  })

  it('随机池混写组码与属性码时一并展开（护腕 ALL-MEC + SHD-L2 = 7 项）', () => {
    const o = buildEquipmentOverview(cfg, formula, conv, { level: 10, slot: 'glove', subType: 'glove', tier: 'xian', quality: 1 })
    expect(o.mainRandom).toHaveLength(7)
    expect(o.warnings.some((w) => /第 1 条（固定）未配置/.test(w))).toBe(true)
  })

  it('未配置主要池的子类型给出告警而非崩溃', () => {
    const o = buildEquipmentOverview(cfg, formula, conv, { level: 10, slot: 'weapon', subType: 'dagger', tier: 'xian', quality: 1 })
    expect(o.mainFixed).toBeNull()
    expect(o.mainRandom).toEqual([])
    expect(o.warnings.some((w) => /dagger 未配置主要属性池/.test(w))).toBe(true)
  })
})

describe('配置完整性', () => {
  it('15 个子类型全部配到核心系数，全部能算出非零核心区间', () => {
    const subTypes = Object.entries(cfg.sub_type_groups)
      .flatMap(([slot, g]) => g.sub_types.map((s) => ({ slot, id: s.id })))
    expect(subTypes).toHaveLength(15)
    for (const st of subTypes) {
      const o = buildEquipmentOverview(cfg, formula, conv, { level: 50, slot: st.slot, subType: st.id, tier: 'xian', quality: 5 })
      expect(o.core, `${st.slot}/${st.id} 核心属性`).not.toBeNull()
      expect(o.core!.source).toBe('formula')
      expect(o.core!.max).toBeGreaterThan(0)
    }
  })

  it('满级 6 部位 5 行附加全部有可投放属性', () => {
    for (const slot of Object.keys(cfg.slot_side)) {
      const o = buildEquipmentOverview(cfg, formula, conv, { level: 50, slot, subType: cfg.sub_type_groups[slot].sub_types[0].id, tier: 'xian', quality: 5 })
      for (const row of o.affixRows) {
        expect(row.candidates.length, `${slot} 第 ${row.row} 行`).toBeGreaterThan(0)
      }
    }
  })
})
