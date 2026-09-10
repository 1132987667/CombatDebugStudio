/**
 * 封神榜 · 系统投放明细测试（数值体系扩展 3.1）
 *
 * 覆盖：
 * - evalDistributionValue 三模式：fixed / range 中值 / linear（k×level+b）
 * - systemActualSap：SAP = value ÷ sapMultiplier（六维），多规则同属性累加
 * - budgetDeviations：占比口径——种子样例配平后偏差 0；构造超 10% warn / 超 50% error；
 *   等比放大不告警；无预算系统 noBudget 标记
 * - budget-deviation 规则：注册进 NUMERIC_VALIDATION_RULES，severity 动态分级，
 *   配置缺失时跳过
 * - seed：system_distribution 缺行补种 + 已编辑行不覆盖
 *
 * 运行: npx vitest run tests/unit/fengshen-system-distributor.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import {
  evalDistributionValue,
  systemActualSap,
  budgetDeviations,
} from '@/domain/fengshen/system-distributor'
import { checkBudgetDeviation } from '@/domain/fengshen/validators/budget-deviation'
import { NUMERIC_VALIDATION_RULES } from '@/domain/fengshen/validators/registry'
import type {
  AttributeDef,
  SystemBudgetConfig,
  SystemDistributionConfig,
  SystemDistributionRule,
} from '@/domain/fengshen/types'

const MULTIPLIERS: Record<string, number> = {
  maxHealth: 12, attack: 2, defense: 2, hitValue: 2, dodgeValue: 2, speed: 2, critRate: 1,
}

/** 种子同款预算（7 系统，总权重 780） */
const BUDGET: SystemBudgetConfig = {
  id: 'system_budget',
  systems: [
    { system: 'level', label: '等级', weight: 120 },
    { system: 'equipment', label: '装备', weight: 240 },
    { system: 'school', label: '流派树', weight: 60 },
    { system: 'pet', label: '宠物', weight: 120 },
    { system: 'mount', label: '坐骑', weight: 120 },
    { system: 'artifact', label: '法宝', weight: 60 },
    { system: 'relic', label: '神器', weight: 60 },
  ],
}

/** 种子同款投放（按预算占比配平：level/equipment 各 ~400/800 SAP → shares 对齐权重） */
function seededDist(): SystemDistributionConfig {
  return {
    id: 'system_distribution',
    systems: [
      { system: 'level', label: '等级', distributions: [
        { attribute: 'attack', mode: 'formula', formula: { template: 'linear', k: 8, b: 7 } },
        { attribute: 'maxHealth', mode: 'formula', formula: { template: 'linear', k: 24, b: 36 } },
        { attribute: 'defense', mode: 'formula', formula: { template: 'linear', k: 4, b: 6 } },
      ] },
      { system: 'equipment', label: '装备', distributions: [
        { attribute: 'maxHealth', mode: 'fixed', value: 2400 },
        { attribute: 'attack', mode: 'range', range: { min: 1000, max: 1400 } },
      ] },
      { system: 'school', label: '流派树', distributions: [{ attribute: 'attack', mode: 'fixed', value: 400 }] },
      { system: 'pet', label: '宠物', distributions: [{ attribute: 'attack', mode: 'range', range: { min: 700, max: 900 } }] },
      { system: 'mount', label: '坐骑', distributions: [{ attribute: 'defense', mode: 'fixed', value: 800 }] },
      { system: 'artifact', label: '法宝', distributions: [{ attribute: 'hitValue', mode: 'fixed', value: 400 }] },
      { system: 'relic', label: '神器', distributions: [{ attribute: 'dodgeValue', mode: 'fixed', value: 400 }] },
    ],
  }
}

describe('evalDistributionValue 三模式', () => {
  it('fixed 返回定值', () => {
    expect(evalDistributionValue({ attribute: 'attack', mode: 'fixed', value: 2400 }, 50)).toBe(2400)
  })

  it('range 返回区间中值（期望口径）', () => {
    expect(evalDistributionValue({ attribute: 'attack', mode: 'range', range: { min: 1000, max: 1400 } }, 50)).toBe(1200)
  })

  it('formula linear = k × level + b', () => {
    expect(evalDistributionValue({ attribute: 'attack', mode: 'formula', formula: { template: 'linear', k: 8, b: 7 } }, 50)).toBe(407)
  })

  it('字段缺失兜底 0（不抛错——边界：配置残缺时不炸视图）', () => {
    const empty = { attribute: 'attack', mode: 'fixed' } as SystemDistributionRule
    expect(evalDistributionValue(empty, 50)).toBe(0)
    const noFormula = { attribute: 'attack', mode: 'formula' } as SystemDistributionRule
    expect(evalDistributionValue(noFormula, 50)).toBe(0)
  })
})

describe('systemActualSap', () => {
  it('SAP = value ÷ sapMultiplier，多规则同属性累加', () => {
    const entry = {
      system: 'equipment' as const, label: '装备',
      distributions: [
        { attribute: 'maxHealth', mode: 'fixed', value: 2400 },
        { attribute: 'attack', mode: 'fixed', value: 600 },
        { attribute: 'attack', mode: 'fixed', value: 600 },
      ],
    }
    const { totalSap, byAttr } = systemActualSap(entry, MULTIPLIERS, 50)
    expect(byAttr.maxHealth).toBe(200)
    expect(byAttr.attack).toBe(600)
    expect(totalSap).toBe(800)
  })

  it('未知属性按 multiplier 1 兜底', () => {
    const entry = {
      system: 'school' as const, label: '流派树',
      distributions: [{ attribute: 'critRate', mode: 'fixed', value: 30 }],
    }
    expect(systemActualSap(entry, MULTIPLIERS, 50).totalSap).toBe(30)
  })
})

describe('budgetDeviations 占比口径', () => {
  it('种子样例配平：全部系统 status=ok', () => {
    const rows = budgetDeviations(seededDist(), BUDGET, MULTIPLIERS, 50)
    expect(rows).toHaveLength(7)
    for (const row of rows) expect(row.status).toBe('ok')
  })

  it('等比放大全部投放不改变偏差（总量超标由 attribute_limit 管，本规则只看占比）', () => {
    const dist = seededDist()
    for (const s of dist.systems) {
      for (const r of s.distributions) {
        if (r.mode === 'fixed' && r.value) r.value *= 10
        if (r.mode === 'range' && r.range) { r.range.min *= 10; r.range.max *= 10 }
        if (r.mode === 'formula' && r.formula) { r.formula.k *= 10; r.formula.b *= 10 }
      }
    }
    const rows = budgetDeviations(dist, BUDGET, MULTIPLIERS, 50)
    for (const row of rows) expect(row.status).toBe('ok')
  })

  it('单系统超投 → 按偏差幅度分级 warn（>10%）/ error（>50%）', () => {
    const dist = seededDist()
    // school 预算 share 60/780≈7.7%；投放放大 4 倍 → share ~30% → 偏差 ~+290%（error）
    const school = dist.systems.find((s) => s.system === 'school')!
    school.distributions[0].mode = 'fixed'
    ;(school.distributions[0] as { value?: number }).value = 1600
    // pet 放大 1.2 倍 → 轻度偏移（warn 区间验证由下一用例精确构造）
    const rows = budgetDeviations(dist, BUDGET, MULTIPLIERS, 50)
    const schoolRow = rows.find((r) => r.system === 'school')!
    expect(schoolRow.status).toBe('error')
    expect(schoolRow.deviation).toBeGreaterThan(50)
  })

  it('精确构造 +15% 偏差 → warn', () => {
    // 两系统：预算 50/50；投放 57.5/42.5 → 偏差 ±15%
    const budget: SystemBudgetConfig = {
      id: 'system_budget',
      systems: [
        { system: 'level', label: '等级', weight: 50 },
        { system: 'equipment', label: '装备', weight: 50 },
      ],
    }
    const dist: SystemDistributionConfig = {
      id: 'system_distribution',
      systems: [
        { system: 'level', label: '等级', distributions: [{ attribute: 'attack', mode: 'fixed', value: 115 }] },
        { system: 'equipment', label: '装备', distributions: [{ attribute: 'attack', mode: 'fixed', value: 85 }] },
      ],
    }
    const rows = budgetDeviations(dist, budget, MULTIPLIERS, 50)
    expect(rows.find((r) => r.system === 'level')!.status).toBe('warn')
    expect(rows.find((r) => r.system === 'equipment')!.status).toBe('warn')
  })

  it('配置了投放但无预算行的系统标 noBudget', () => {
    const dist = seededDist()
    dist.systems.push({ system: 'talent', label: '天赋', distributions: [{ attribute: 'speed', mode: 'fixed', value: 100 }] })
    const rows = budgetDeviations(dist, BUDGET, MULTIPLIERS, 50)
    const talent = rows.find((r) => r.system === 'talent')!
    expect(talent.noBudget).toBe(true)
    expect(talent.actualSap).toBe(50)
  })
})

describe('budget-deviation 校验规则', () => {
  const ATTRS: AttributeDef[] = (['maxHealth', 'attack', 'defense', 'hitValue', 'dodgeValue', 'speed'] as const).map((code) => ({
    id: code, name: code, code, isPercentage: false, sapMultiplier: MULTIPLIERS[code], valueTier: 'L1' as const, systems: [],
  }))

  it('已注册进 NUMERIC_VALIDATION_RULES', () => {
    expect(NUMERIC_VALIDATION_RULES.some((r) => r.id === 'budget_deviation')).toBe(true)
  })

  it('配置缺失时任一侧缺失 → 跳过（空 issue）', () => {
    expect(checkBudgetDeviation({ systemDistribution: seededDist() })).toEqual([])
    expect(checkBudgetDeviation({ systemBudget: BUDGET })).toEqual([])
  })

  it('超投 50%+ → error issue；系统名与人话描述', () => {
    const dist = seededDist()
    const school = dist.systems.find((s) => s.system === 'school')!
    school.distributions = [{ attribute: 'attack', mode: 'fixed', value: 1600 }]
    const issues = checkBudgetDeviation({
      systemDistribution: dist,
      systemBudget: BUDGET,
      attributes: ATTRS,
    })
    const error = issues.find((i) => i.severity === 'error')
    expect(error).toBeDefined()
    expect(error!.rowId).toBe('system_distribution')
    expect(error!.message).toContain('流派树')
  })

  it('无预算系统 → warn issue 提示', () => {
    const dist = seededDist()
    dist.systems.push({ system: 'talent', label: '天赋', distributions: [{ attribute: 'speed', mode: 'fixed', value: 100 }] })
    const issues = checkBudgetDeviation({ systemDistribution: dist, systemBudget: BUDGET, attributes: ATTRS })
    expect(issues.some((i) => i.message.includes('天赋') && i.message.includes('无预算行'))).toBe(true)
  })
})

/** 按 store 分桶的内存版持久化存储（与 fengshen-attribute-limits.test.ts 同构） */
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

describe('seed 增量播种（system_distribution）', () => {
  it('首次播种包含 system_distribution，且样例配平（预算侧全 ok）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const row = await storage.get<{ data: SystemDistributionConfig }>(FENGSHEN_STORE.PARAMS, 'system_distribution')
    expect(row).not.toBeNull()
    // 种子样例自洽：对种子预算配平（totalWeight 以播种出的 system_budget 为准）
    const budgetRow = await storage.get<{ data: SystemBudgetConfig }>(FENGSHEN_STORE.PARAMS, 'system_budget')
    const rows = budgetDeviations(row!.data, budgetRow!.data, MULTIPLIERS, 50)
    for (const r of rows) expect(r.status).toBe('ok')
  })

  it('缺行回补；已编辑行不覆盖', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    await storage.remove(FENGSHEN_STORE.PARAMS, 'system_distribution')
    const result = await seedFengshenData(storage)
    expect(result.imported).toBe(true)
    expect(await storage.get(FENGSHEN_STORE.PARAMS, 'system_distribution')).not.toBeNull()

    const edited = (await storage.get<{ data: SystemDistributionConfig }>(FENGSHEN_STORE.PARAMS, 'system_distribution'))!
    edited.data.systems = [{ system: 'talent', label: '天赋', distributions: [] }]
    await storage.set(FENGSHEN_STORE.PARAMS, 'system_distribution', edited)
    await seedFengshenData(storage)
    const after = await storage.get<{ data: SystemDistributionConfig }>(FENGSHEN_STORE.PARAMS, 'system_distribution')
    expect(after!.data.systems).toHaveLength(1)
    expect(after!.data.systems[0].system).toBe('talent')
  })
})
