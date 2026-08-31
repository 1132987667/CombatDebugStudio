/**
 * 封神榜 · 玩家配置功能域测试
 *
 * 覆盖：
 * - 纯函数：fixedGrowthSap / calcTotalSap / computePlayerBase / computePlayerPreview / parseExpFormula / fillExpFromFormula
 * - 装备数值公式：equipBaseUnit / calcEquipBaseValue（复现策划示例 10级仙品剑）
 * - seed：params 域三条结构化种子（player_config / system_budget / equip_formula）导入
 * - API：GameDataApi 查询三表
 * - 校验：validatePlayerConfig 拦截非法成长配置
 *
 * 运行: npx vitest run tests/unit/fengshen-player-config.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { GameDataApi } from '@/application/service/GameDataApi'
import { initializeContainer } from '@/infrastructure/di/Container'
import type { PlayerGrowthConfig, EquipFormulaConfig } from '@/domain/fengshen/types'
import {
  calcEquipBaseValue,
  calcTotalSap,
  computePlayerBase,
  computePlayerPreview,
  equipBaseUnit,
  fillExpFromFormula,
  fixedGrowthSap,
  parseExpFormula,
  tierWeightValue,
  validatePlayerConfig,
} from '@/domain/fengshen/player-config'

/** 按 store 分桶的内存版持久化存储（与 fengshen-exp-reward.test.ts 同构） */
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

beforeAll(() => {
  initializeContainer()
})

/** 与 seed.ts buildPlayerConfig 同构的默认配置（对齐 PRD §19 / D1 决策） */
const samplePlayer: PlayerGrowthConfig = {
  id: 'player_config',
  maxLevel: 50,
  expFormula: 'round(50 × L^1.35 + 60 × L)',
  base: { maxHealth: 60, attack: 15, defense: 10, hitValue: 10, dodgeValue: 10, speed: 10 },
  growth: { maxHealth: 24, attack: 8, defense: 4, hitValue: 3, dodgeValue: 3, speed: 2 },
  freePointsPerLevel: 4,
  conversion: { maxHealth: 12, attack: 2, defense: 2, hitValue: 2, dodgeValue: 2, speed: 2 },
  pillBonusPoints: 100,
  currentLevel: 1,
}

const sampleFormula: EquipFormulaConfig = {
  id: 'equip_formula',
  baseSap: 900,
  slotCount: 6,
  weightPerSlot: 3,
  maxLevel: 50,
  coreWeight: 2,
  affixWeight: 1,
  floatRange: { min: 0.5, max: 1.1 },
  tierWeight: {
    fan: { min: 0.5, max: 0.6 },
    xuan: { min: 0.6, max: 0.7 },
    di: { min: 0.7, max: 0.8 },
    tian: { min: 0.8, max: 0.9 },
    xian: { min: 0.9, max: 1.0 },
  },
}

describe('SAP 总量与固定成长（D1：每级12固定 + 4自由 = 16点，满级900）', () => {
  it('fixedGrowthSap：六维成长折算 = 12 属性点', () => {
    // 24/12 + 8/2 + 4/2 + 3/2 + 3/2 + 2/2 = 2+4+2+1.5+1.5+1 = 12
    expect(fixedGrowthSap(samplePlayer)).toBeCloseTo(12, 2)
  })

  it('calcTotalSap：固定600 + 自由200 + 丹药100 = 900', () => {
    const t = calcTotalSap(samplePlayer)
    expect(t.fixed).toBeCloseTo(600, 2)
    expect(t.free).toBe(200)
    expect(t.pill).toBe(100)
    expect(t.total).toBeCloseTo(900, 2)
  })
})

describe('computePlayerBase / computePlayerPreview', () => {
  it('computePlayerBase：1 级 = base，满级 50 = base + 49×growth', () => {
    const lv1 = computePlayerBase(samplePlayer, 1)
    expect(lv1.maxHealth).toBe(60)
    expect(lv1.attack).toBe(15)
    const lv50 = computePlayerBase(samplePlayer, 50)
    expect(lv50.maxHealth).toBe(60 + 49 * 24)
    expect(lv50.attack).toBe(15 + 49 * 8)
    expect(lv50.speed).toBe(10 + 49 * 2)
  })

  it('computePlayerPreview：自由点按转化率折算并计入 SAP', () => {
    // 10 级，全投攻击 4 点 → 攻击 + 4×2 = 8
    const p = computePlayerPreview(samplePlayer, 10, { attack: 4 })
    expect(p.stats.attack).toBe(15 + 9 * 8 + 4 * 2)
    expect(p.usedPoints).toBe(4)
    // SAP：攻击值 / 转化率
    expect(p.sapByAttr.attack).toBeCloseTo(p.stats.attack / 2, 2)
  })

  it('availablePoints 超出不强制（由视图提示，纯函数只累计 usedPoints）', () => {
    const p = computePlayerPreview(samplePlayer, 10, { attack: 99 })
    expect(p.usedPoints).toBe(99)
  })
})

describe('经验公式解析与展开', () => {
  it('parseExpFormula 解析 round(50 × L^1.35 + 60 × L)', () => {
    expect(parseExpFormula('round(50 × L^1.35 + 60 × L)')).toEqual({ a: 50, b: 1.35, c: 60 })
  })

  it('fillExpFromFormula 展开 50 级且 L=1 时为 round(50+60)=110', () => {
    const rows = fillExpFromFormula('round(50 × L^1.35 + 60 × L)', 50)
    expect(rows.length).toBe(50)
    expect(rows[0]).toEqual({ level: 1, expRequired: Math.round(50 + 60) })
    expect(rows[49].level).toBe(50)
  })

  it('公式格式不匹配返回空数组（视图提示手填）', () => {
    expect(fillExpFromFormula('invalid', 50)).toEqual([])
  })
})

describe('装备数值公式（§3.7 策划公式，复现示例）', () => {
  it('equipBaseUnit = 900/6/3/50 = 1', () => {
    expect(equipBaseUnit(sampleFormula)).toBe(1)
  })

  it('10级仙品剑：核心攻击 40，浮动 [20,44]', () => {
    const v = calcEquipBaseValue(sampleFormula, 10, 'core', tierWeightValue(sampleFormula, 'xian'), 2)
    expect(v.base).toBe(40)
    expect(v.min).toBe(20)
    expect(v.max).toBe(44)
  })

  it('10级仙品剑：附加命中 20，浮动 [10,22]', () => {
    const v = calcEquipBaseValue(sampleFormula, 10, 'affix', tierWeightValue(sampleFormula, 'xian'), 2)
    expect(v.base).toBe(20)
    expect(v.min).toBe(10)
    expect(v.max).toBe(22)
  })

  it('品阶权重取区间上限：仙品 1.0 / 凡品 0.6', () => {
    expect(tierWeightValue(sampleFormula, 'xian')).toBe(1.0)
    expect(tierWeightValue(sampleFormula, 'fan')).toBe(0.6)
  })
})

describe('validatePlayerConfig', () => {
  it('合法配置无错误', () => {
    expect(validatePlayerConfig(samplePlayer)).toEqual([])
  })

  it('固定成长 SAP ≠ 12 被拦截', () => {
    const bad = { ...samplePlayer, growth: { ...samplePlayer.growth, maxHealth: 12 } }
    const errors = validatePlayerConfig(bad)
    expect(errors.some((e) => e.includes('应为 12'))).toBe(true)
  })

  it('转化率 ≤ 0 被拦截', () => {
    const bad = { ...samplePlayer, conversion: { ...samplePlayer.conversion, attack: 0 } }
    expect(validatePlayerConfig(bad).some((e) => e.includes('attack'))).toBe(true)
  })
})

describe('seed：params 域三条结构化种子', () => {
  it('导入后 player_config / system_budget / equip_formula 存在且结构完整', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)

    const pc = await api.getPlayerConfig()
    expect(pc?.maxLevel).toBe(50)
    expect(pc?.freePointsPerLevel).toBe(4)
    expect(pc?.pillBonusPoints).toBe(100)
    expect(fixedGrowthSap(pc!)).toBeCloseTo(12, 2)

    const sb = await api.getSystemBudget()
    expect(sb?.systems.length).toBe(7)
    expect(sb?.systems.find((s) => s.system === 'level')?.totalSap).toBe(900)
    expect(sb?.systems.find((s) => s.system === 'equipment')?.weight).toBe(240)

    const ef = await api.getEquipFormula()
    expect(ef?.baseSap).toBe(900)
    expect(ef?.tierWeight).toHaveProperty('xian')
  })
})
