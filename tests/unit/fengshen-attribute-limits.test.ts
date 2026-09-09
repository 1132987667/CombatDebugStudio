/**
 * 封神榜 · 属性上限约束器测试（数值体系扩展 3.3 / §5.5）
 *
 * 覆盖：
 * - 规则守卫：attribute_limit 未配置返回空；checkScopes 控制各口径开关
 * - playerMax：种子默认配置（上限按最坏情况推导）无 issue；收紧上限后输出 error（block 无 quickFix）；
 *   下限高于可达值报配置矛盾
 * - equipAffix：flat 词条超上限（clamp → error + quickFix 钳回）；percent 词条仅在 kind='percent'
 *   属性上判断（kind='base' 的相对加成跳过）
 * - buffStacked：ADDITIVE 效果 × 叠满层超上限 → error + quickFix（按层数反推单层值）；
 *   perStack=false 不放大；PERCENTAGE 在 base 属性上跳过
 * - 注册表：attribute_limits 已注册，runValidations 默认跑全量
 * - seed 增量播种：缺行回补、用户已编辑行不被覆盖
 *
 * 运行: npx vitest run tests/unit/fengshen-attribute-limits.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { checkAttributeLimits } from '@/domain/fengshen/validators/attribute-limits'
import { runValidations } from '@/domain/fengshen/validators/registry'
import type { AttributeLimitConfig, PlayerGrowthConfig, EquipmentAffixData } from '@/domain/fengshen/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'

/** 按属性码上限条目工厂 */
function limitOf(max: number, onViolation: 'block' | 'clamp' | 'warn', kind: 'base' | 'percent' = 'base') {
  return { min: 0, max, kind, onViolation }
}

/** 种子同款玩家成长配置（base/growth/conversion 对齐 seed.ts buildPlayerConfig） */
const PLAYER_CONFIG: PlayerGrowthConfig = {
  id: 'player_config',
  maxLevel: 50,
  expFormula: '',
  base: { maxHealth: 60, attack: 15, defense: 10, hitValue: 10, dodgeValue: 10, speed: 10 },
  growth: { maxHealth: 24, attack: 8, defense: 4, hitValue: 3, dodgeValue: 3, speed: 2 },
  freePointsPerLevel: 4,
  conversion: { maxHealth: 12, attack: 2, defense: 2, hitValue: 2, dodgeValue: 2, speed: 2 },
  pillBonusPoints: 100,
  expectedTotalSap: 900,
}

/** 种子同款上限（六维按最坏情况推导 + critRate 75） */
const SEED_LIMITS: AttributeLimitConfig = {
  id: 'attribute_limit',
  limits: {
    maxHealth: limitOf(8000, 'block'),
    attack: limitOf(2000, 'block'),
    defense: limitOf(1500, 'block'),
    hitValue: limitOf(1500, 'block'),
    dodgeValue: limitOf(1500, 'block'),
    speed: limitOf(1500, 'block'),
    critRate: limitOf(75, 'clamp', 'percent'),
  },
  checkScopes: ['playerMax', 'equipAffix', 'buffStacked'],
}

function affixOf(over: Partial<EquipmentAffixData>): EquipmentAffixData {
  return {
    id: 'eqaff_test',
    name: '测试词条',
    attribute: 'maxHealth',
    modifierType: 'flat',
    valueRange: { min: 1, max: 300 },
    applicableSlots: ['charm'],
    weight: 100,
    ...over,
  } as EquipmentAffixData
}

function buffOf(attributes: BuffJsonEntry['attributes'], maxStacks?: number): BuffJsonEntry {
  return { id: 'buff_test', name: '测试', attributes, maxStacks } as BuffJsonEntry
}

describe('checkAttributeLimits 守卫', () => {
  it('attribute_limit 未配置返回空', () => {
    expect(checkAttributeLimits({ playerConfig: PLAYER_CONFIG, equipmentAffixes: [] })).toEqual([])
  })

  it('checkScopes 关闭对应口径后不检查', () => {
    const cfg = { ...SEED_LIMITS, limits: { maxHealth: limitOf(100, 'block') }, checkScopes: ['playerMax'] as AttributeLimitConfig['checkScopes'] }
    const issues = checkAttributeLimits({ attributeLimit: cfg, playerConfig: PLAYER_CONFIG, equipmentAffixes: [affixOf({ valueRange: { min: 1, max: 500 } })] })
    expect(issues.every((i) => !i.message.includes('词条')))
  })
})

describe('playerMax 口径', () => {
  it('种子默认上限（按最坏情况推导）无 issue', () => {
    const issues = checkAttributeLimits({ attributeLimit: SEED_LIMITS, playerConfig: PLAYER_CONFIG })
    expect(issues.filter((i) => i.field?.startsWith('base.'))).toEqual([])
  })

  it('收紧上限后满级最坏情况超限 → error（block 无 quickFix）', () => {
    const cfg: AttributeLimitConfig = { ...SEED_LIMITS, limits: { maxHealth: limitOf(4000, 'block') } }
    const issues = checkAttributeLimits({ attributeLimit: cfg, playerConfig: PLAYER_CONFIG })
    // 最坏情况 maxHealth = 1236 + 300×12 = 4836 > 4000
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(issues[0].rowId).toBe('player_config')
    expect(issues[0].message).toContain('4836')
    expect(issues[0].quickFix).toBeUndefined()
  })

  it('下限高于可达值报配置矛盾', () => {
    const cfg: AttributeLimitConfig = { ...SEED_LIMITS, limits: { speed: { min: 5000, max: 9999, kind: 'base', onViolation: 'warn' } } }
    const issues = checkAttributeLimits({ attributeLimit: cfg, playerConfig: PLAYER_CONFIG })
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('低于下限')
    expect(issues[0].severity).toBe('warn')
  })
})

describe('equipAffix 口径', () => {
  it('flat 词条超上限 → error + quickFix 钳回', () => {
    const cfg: AttributeLimitConfig = { ...SEED_LIMITS, limits: { maxHealth: limitOf(200, 'clamp') } }
    const issues = checkAttributeLimits({ attributeLimit: cfg, equipmentAffixes: [affixOf({ valueRange: { min: 20, max: 300 } })] })
    expect(issues).toHaveLength(1)
    expect(issues[0].table).toBe('equipment_affixes')
    expect(issues[0].severity).toBe('error')
    expect(issues[0].quickFix).toEqual({ field: 'valueRange.max', value: 200, label: '钳回 200' })
  })

  it('percent 词条仅在 kind=percent 属性上判断（base 属性的相对加成跳过）', () => {
    const cfg: AttributeLimitConfig = { ...SEED_LIMITS, limits: { attack: limitOf(2000, 'clamp') } }
    const percentAffix = affixOf({ attribute: 'attack', modifierType: 'percent', valueRange: { min: 3, max: 12 } })
    expect(checkAttributeLimits({ attributeLimit: cfg, equipmentAffixes: [percentAffix] })).toEqual([])

    const critAffix = affixOf({ attribute: 'critRate', modifierType: 'percent', valueRange: { min: 1, max: 90 } })
    const issues = checkAttributeLimits({ attributeLimit: SEED_LIMITS, equipmentAffixes: [critAffix] })
    expect(issues).toHaveLength(1)
    expect(issues[0].quickFix?.value).toBe(75)
  })

  it('onViolation=warn 时仅提示不拦截', () => {
    const cfg: AttributeLimitConfig = { ...SEED_LIMITS, limits: { maxHealth: limitOf(200, 'warn') } }
    const issues = checkAttributeLimits({ attributeLimit: cfg, equipmentAffixes: [affixOf({ valueRange: { min: 20, max: 300 } })] })
    expect(issues[0].severity).toBe('warn')
    expect(issues[0].quickFix).toBeUndefined()
  })
})

describe('buffStacked 口径', () => {
  it('ADDITIVE 效果叠满层超上限 → error + quickFix 按层数反推（clamp）', () => {
    const buff = buffOf({ maxHealth: { value: 3000, type: 'ADDITIVE' } }, 3)
    const cfg: AttributeLimitConfig = { ...SEED_LIMITS, limits: { maxHealth: limitOf(8000, 'clamp') } }
    const issues = checkAttributeLimits({ attributeLimit: cfg, buffs: [buff] })
    expect(issues).toHaveLength(1)
    expect(issues[0].table).toBe('buffs')
    expect(issues[0].message).toContain('9000')
    expect(issues[0].quickFix?.value).toBeCloseTo(8000 / 3, 2)
  })

  it('perStack=false 不按层数放大', () => {
    const buff = buffOf({ maxHealth: { value: 3000, type: 'ADDITIVE', perStack: false } }, 3)
    expect(checkAttributeLimits({ attributeLimit: SEED_LIMITS, buffs: [buff] })).toEqual([])
  })

  it('PERCENTAGE 在 base 口径属性上跳过', () => {
    const buff = buffOf({ attack: { value: 500, type: 'PERCENTAGE' } }, 5)
    expect(checkAttributeLimits({ attributeLimit: SEED_LIMITS, buffs: [buff] })).toEqual([])
  })
})

describe('注册表集成', () => {
  it('attribute_limits 已注册，runValidations 默认执行', () => {
    const report = runValidations({ attributeLimit: { ...SEED_LIMITS, limits: { maxHealth: limitOf(4000, 'block') } }, playerConfig: PLAYER_CONFIG })
    expect(report.errorCount).toBeGreaterThanOrEqual(1)
    expect(report.issues.every((i) => i.ruleId === 'attribute_limits')).toBe(true)
  })
})

/** 按 store 分桶的内存版持久化存储（与 fengshen-player-config.test.ts 同构） */
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

describe('seed 增量播种（attribute_limit）', () => {
  it('首次播种包含 attribute_limit 行', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const row = await storage.get(FENGSHEN_STORE.PARAMS, 'attribute_limit')
    expect(row).not.toBeNull()
  })

  it('已播种库缺行时回补（幂等：不 bump SEED_FLAG）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    await storage.remove(FENGSHEN_STORE.PARAMS, 'attribute_limit')
    const result = await seedFengshenData(storage)
    expect(result.imported).toBe(true)
    expect(await storage.get(FENGSHEN_STORE.PARAMS, 'attribute_limit')).not.toBeNull()
  })

  it('用户已编辑的行不被覆盖', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const edited = (await storage.get<{ data: AttributeLimitConfig }>(FENGSHEN_STORE.PARAMS, 'attribute_limit'))!
    edited.data.limits.critRate = { min: 0, max: 60, kind: 'percent', onViolation: 'warn' }
    await storage.set(FENGSHEN_STORE.PARAMS, 'attribute_limit', edited)
    await seedFengshenData(storage)
    const after = await storage.get<{ data: AttributeLimitConfig }>(FENGSHEN_STORE.PARAMS, 'attribute_limit')
    expect(after?.data.limits.critRate?.max).toBe(60)
  })
})
