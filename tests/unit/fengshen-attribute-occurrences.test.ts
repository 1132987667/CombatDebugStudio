/**
 * 属性中心测试（B1b · 建议 1）
 *
 * 覆盖：
 * - 提取器纯函数：6 处出现位置（attributes.code / growth.perLevel / player_config 三键 /
 *   system_distribution.attribute / equipment_affixes.valueRange / affixes.statModifiers）
 *   及其边界（code 不存在、MAP 键缺失、非数字值、区间缺失、数组多元素）
 * - 种子扫描集成：GameDataApi.findAttributeOccurrences('attack') 命中全部位置
 *
 * 运行: npx vitest run tests/unit/fengshen-attribute-occurrences.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { GameDataApi } from '@/application/service/GameDataApi'
import { ATTRIBUTE_OCCURRENCE_RULES, type AttributeOccurrenceRule } from '@/domain/fengshen/attribute-occurrences'

/** 按标签取规则（标签即分组名，唯一） */
function rule(label: string): AttributeOccurrenceRule {
  const found = ATTRIBUTE_OCCURRENCE_RULES.find((r) => r.label === label)
  if (!found) throw new Error(`规则缺失：${label}`)
  return found
}

const RULE_ATTR = '基准值 · 属性定义'
const RULE_GROWTH = '基准值 · 成长曲线'
const RULE_BASE = '基准值 · 玩家配置（1 级基础）'
const RULE_PC_GROWTH = '基准值 · 玩家配置（每级成长）'
const RULE_CONVERSION = '派生值 · 玩家配置（属性点转化）'
const RULE_DIST = '引用值 · 系统投放'
const RULE_EQAFF = '基准值 · 装备词条区间'
const RULE_AFFIX = '引用值 · 词缀修正'

describe('属性出现规则表', () => {
  it('覆盖 6 处出现位置（8 条规则）', () => {
    expect(ATTRIBUTE_OCCURRENCE_RULES).toHaveLength(8)
    const labels = ATTRIBUTE_OCCURRENCE_RULES.map((r) => r.label)
    expect(new Set(labels).size).toBe(8)
  })

  it('code 不存在 → 每条规则均未命中', () => {
    const samples: unknown[] = [
      { code: 'attack' },
      { perLevel: { attack: 8 } },
      { base: { attack: 1 }, growth: { attack: 1 }, conversion: { attack: 1 } },
      { systems: [{ distributions: [{ attribute: 'attack', mode: 'fixed', value: 1 }] }] },
      { attribute: 'attack', valueRange: { min: 1, max: 2 } },
      { statModifiers: [{ attribute: 'attack', percent: 20 }] },
    ]
    for (const sample of samples) {
      for (const r of ATTRIBUTE_OCCURRENCE_RULES) {
        expect(r.extract(sample, '__not_exist__')).toEqual([])
      }
    }
  })

  it('非对象数据不抛错（配置残缺时视图不炸）', () => {
    for (const r of ATTRIBUTE_OCCURRENCE_RULES) {
      expect(r.extract(null, 'attack')).toEqual([])
      expect(r.extract('nonsense', 'attack')).toEqual([])
      expect(r.extract(undefined, 'attack')).toEqual([])
    }
  })
})

describe('提取器 · attributes 定义', () => {
  it('code 匹配 → 命中 code 字段', () => {
    expect(rule(RULE_ATTR).extract({ id: 'attack', code: 'attack' }, 'attack')).toEqual([
      { field: 'code', valueText: 'attack' },
    ])
  })

  it('code 不匹配 → 空', () => {
    expect(rule(RULE_ATTR).extract({ code: 'defense' }, 'attack')).toEqual([])
  })
})

describe('提取器 · growth.perLevel MAP 键', () => {
  it('命中键 → 值文本带「每级」前缀', () => {
    expect(rule(RULE_GROWTH).extract({ perLevel: { maxHealth: 60, attack: 8 } }, 'attack')).toEqual([
      { field: 'perLevel.attack', valueText: '每级 +8' },
    ])
  })

  it('边界：键缺失 / 值为非数字 → 空', () => {
    expect(rule(RULE_GROWTH).extract({ perLevel: { defense: 4 } }, 'attack')).toEqual([])
    expect(rule(RULE_GROWTH).extract({ perLevel: { attack: '8' } }, 'attack')).toEqual([])
    expect(rule(RULE_GROWTH).extract({}, 'attack')).toEqual([])
  })
})

describe('提取器 · player_config 三键（基准 + 派生）', () => {
  const doc = {
    base: { maxHealth: 60, attack: 16 },
    growth: { attack: 8, speed: 2 },
    conversion: { attack: 2, speed: 2 },
  }

  it('base → 基准值', () => {
    expect(rule(RULE_BASE).extract(doc, 'attack')).toEqual([{ field: 'base.attack', valueText: '16' }])
  })

  it('growth → 基准值（每级）', () => {
    expect(rule(RULE_PC_GROWTH).extract(doc, 'attack')).toEqual([{ field: 'growth.attack', valueText: '每级 +8' }])
  })

  it('conversion → 派生值（属性点转化）', () => {
    const r = rule(RULE_CONVERSION)
    expect(r.kind).toBe('derived')
    expect(r.extract(doc, 'attack')).toEqual([{ field: 'conversion.attack', valueText: '1 属性点 → 2' }])
  })

  it('边界：键缺失 → 空', () => {
    expect(rule(RULE_BASE).extract(doc, 'speed')).toEqual([])
    expect(rule(RULE_PC_GROWTH).extract(doc, 'maxHealth')).toEqual([])
    expect(rule(RULE_CONVERSION).extract(doc, 'maxHealth')).toEqual([])
  })
})

describe('提取器 · system_distribution.systems[].distributions[]', () => {
  const doc = {
    systems: [
      { system: 'level', distributions: [{ attribute: 'defense', mode: 'formula' }, { attribute: 'attack', mode: 'formula', formula: { template: 'linear', k: 8, b: 7 } }] },
      { system: 'equipment', distributions: [{ attribute: 'attack', mode: 'range', range: { min: 1000, max: 1400 } }, { attribute: 'attack', mode: 'fixed', value: 400 }] },
    ],
  }

  it('多系统多规则 → 命中索引正确', () => {
    expect(rule(RULE_DIST).extract(doc, 'attack')).toEqual([
      { field: 'systems[0].distributions[1].attribute', valueText: '公式 linear：8×等级+7' },
      { field: 'systems[1].distributions[0].attribute', valueText: '区间 1000~1400' },
      { field: 'systems[1].distributions[1].attribute', valueText: '定值 400' },
    ])
  })

  it('模式字段残缺 → 以占位符呈现，不抛错', () => {
    const broken = { systems: [{ distributions: [{ attribute: 'attack', mode: 'range' }] }] }
    expect(rule(RULE_DIST).extract(broken, 'attack')).toEqual([
      { field: 'systems[0].distributions[0].attribute', valueText: '区间 —~—' },
    ])
    const noMode = { systems: [{ distributions: [{ attribute: 'attack' }] }] }
    expect(rule(RULE_DIST).extract(noMode, 'attack')).toEqual([
      { field: 'systems[0].distributions[0].attribute', valueText: '—' },
    ])
  })
})

describe('提取器 · equipment_affixes.valueRange', () => {
  it('attribute 匹配 → 区间文本', () => {
    expect(rule(RULE_EQAFF).extract({ attribute: 'attack', valueRange: { min: 1, max: 50 } }, 'attack')).toEqual([
      { field: 'valueRange', valueText: '1~50' },
    ])
  })

  it('边界：区间缺失 → 标注缺失；attribute 不匹配 → 空', () => {
    expect(rule(RULE_EQAFF).extract({ attribute: 'attack' }, 'attack')).toEqual([
      { field: 'valueRange', valueText: '（区间缺失）' },
    ])
    expect(rule(RULE_EQAFF).extract({ attribute: 'attack', valueRange: { min: 1 } }, 'attack')).toEqual([
      { field: 'valueRange', valueText: '（区间缺失）' },
    ])
    expect(rule(RULE_EQAFF).extract({ attribute: 'defense', valueRange: { min: 1, max: 2 } }, 'attack')).toEqual([])
  })
})

describe('提取器 · affixes.statModifiers[]', () => {
  it('多元素命中；ADDITIVE 记「百分点」，缺省记「百分比」', () => {
    const doc = {
      statModifiers: [
        { attribute: 'attack', percent: 20 },
        { attribute: 'defense', percent: 30 },
        { attribute: 'attack', percent: 15, type: 'ADDITIVE' },
      ],
    }
    expect(rule(RULE_AFFIX).extract(doc, 'attack')).toEqual([
      { field: 'statModifiers[0]', valueText: '百分比 20%' },
      { field: 'statModifiers[2]', valueText: '百分点 15%' },
    ])
  })

  it('边界：数组元素非对象 → 跳过；数组缺失 → 空', () => {
    expect(rule(RULE_AFFIX).extract({ statModifiers: ['x', null] }, 'attack')).toEqual([])
    expect(rule(RULE_AFFIX).extract({}, 'attack')).toEqual([])
  })
})

/** 按 store 分桶的内存版持久化存储（与 fengshen-system-distributor.test.ts 同构） */
class MemoryStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const
  private buckets = new Map<string, Map<string, unknown>>()

  private bucket(store: string): Map<string, unknown> {
    let b = this.buckets.get(store)
    if (!b) {
      b = new Map()
      this.buckets.set(store, b)
    }
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
    this.buckets.delete(store)
    return true
  }
  async keysByField(): Promise<string[]> {
    return []
  }
  getStats(): StorageStats | null {
    return null
  }
}

describe('GameDataApi.findAttributeOccurrences（种子扫描）', () => {
  it('attack 命中 6 处出现位置（含基准 / 派生 / 引用三档口径）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)
    const hits = await api.findAttributeOccurrences('attack')

    const has = (table: string, rowId: string, field: string): boolean =>
      hits.some((h) => h.table === table && h.rowId === rowId && h.field === field)

    // ① 属性定义
    expect(has('attributes', 'attack', 'code')).toBe(true)
    // ② 成长曲线（4 条曲线均含 attack）
    expect(has('growth', 'growth_balanced', 'perLevel.attack')).toBe(true)
    expect(hits.filter((h) => h.table === 'growth')).toHaveLength(4)
    // ③ 玩家配置：base（基准）+ growth（基准）+ conversion（派生）
    expect(has('params', 'player_config', 'base.attack')).toBe(true)
    expect(has('params', 'player_config', 'growth.attack')).toBe(true)
    expect(has('params', 'player_config', 'conversion.attack')).toBe(true)
    // ④ 系统投放（引用）
    expect(hits.some((h) => h.table === 'params' && h.rowId === 'system_distribution')).toBe(true)
    // ⑤ 装备词条区间（基准）
    expect(has('equipment_affixes', 'eqaff_atk_flat', 'valueRange')).toBe(true)
    expect(has('equipment_affixes', 'eqaff_atk_percent', 'valueRange')).toBe(true)
    // ⑥ 词缀修正（引用）
    expect(hits.some((h) => h.table === 'affixes')).toBe(true)

    // 三档口径齐备
    const kinds = new Set(hits.map((h) => h.kind))
    expect(kinds.has('baseline')).toBe(true)
    expect(kinds.has('derived')).toBe(true)
    expect(kinds.has('reference')).toBe(true)
  })

  it('未知属性 → 空数组', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)
    expect(await api.findAttributeOccurrences('__not_exist__')).toEqual([])
  })
})