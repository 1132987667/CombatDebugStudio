/**
 * 装备词条库测试（词缀库与装备部位强绑定校验）
 *
 * 覆盖：slotKey 校验 / 部位匹配 / 按部位抽池（weight 加权）/ 数值随机 /
 *       DataIntegrityService 保存强校验（attribute ∈ attributes.json、slotKey 合法、school 合法、valueRange 完整）/ 健康检查。
 *
 * 运行: npx vitest run tests/unit/equipment-affix.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { DataIntegrityService } from '@/application/service/DataIntegrityService'
import type { EquipmentAffixData } from '@/domain/fengshen/types'
import {
  validateSlotKey,
  affixAppliesTo,
  rollEquipmentAffix,
  rollAffixValue,
  rollAffixStat,
} from '@/shared/utils/equipmentAffix'

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

const affixAttack: EquipmentAffixData = {
  id: 'eqaff_test_atk',
  name: '测试攻击',
  attribute: 'attack',
  modifierType: 'flat',
  valueRange: { min: 8, max: 20 },
  applicableSlots: ['*'],
  weight: 100,
  rarity: 1,
}

const affixLightWeapon: EquipmentAffixData = {
  id: 'eqaff_test_light',
  name: '测试连影',
  attribute: 'comboRate',
  modifierType: 'percent',
  valueRange: { min: 5, max: 15 },
  applicableSlots: ['weapon:轻型'],
  school: '灵猴道',
  weight: 60,
  rarity: 2,
}

const affixArmor: EquipmentAffixData = {
  id: 'eqaff_test_armor',
  name: '测试固本',
  attribute: 'defense',
  modifierType: 'flat',
  valueRange: { min: 6, max: 15 },
  applicableSlots: ['armor'],
  weight: 80,
  rarity: 1,
}

const makeServices = () => {
  const storage = new MemoryStorage()
  const integrity = new DataIntegrityService(storage)
  return { storage, integrity }
}

describe('validateSlotKey（部位枚举强校验）', () => {
  it('接受 * 通配 / 部位级 / 部位+子类型', () => {
    expect(validateSlotKey('*')).toBeNull()
    expect(validateSlotKey('weapon')).toBeNull()
    expect(validateSlotKey('weapon:轻型')).toBeNull()
    expect(validateSlotKey('accessory:冠冕')).toBeNull()
  })
  it('拒绝未知部位 / 未知子类型 / 部位与子类型交叉', () => {
    expect(validateSlotKey('hat')).not.toBeNull()
    expect(validateSlotKey('weapon:布甲')).not.toBeNull()
    expect(validateSlotKey('weapon:皮甲')).not.toBeNull()
    expect(validateSlotKey('armor:戒指')).not.toBeNull()
  })
})

describe('affixAppliesTo（部位匹配）', () => {
  it('* 通配匹配任何部位', () => {
    expect(affixAppliesTo(affixAttack, 'weapon', '轻型')).toBe(true)
    expect(affixAppliesTo(affixAttack, 'accessory', '戒指')).toBe(true)
  })
  it('部位级匹配该部位全部子类型', () => {
    expect(affixAppliesTo(affixArmor, 'armor', '铠甲')).toBe(true)
    expect(affixAppliesTo(affixArmor, 'armor', '皮甲')).toBe(true)
    expect(affixAppliesTo(affixArmor, 'weapon', '轻型')).toBe(false)
  })
  it('部位+子类型精确匹配', () => {
    expect(affixAppliesTo(affixLightWeapon, 'weapon', '轻型')).toBe(true)
    expect(affixAppliesTo(affixLightWeapon, 'weapon', '重型')).toBe(false)
    expect(affixAppliesTo(affixLightWeapon, 'armor', '皮甲')).toBe(false)
  })
})

describe('rollEquipmentAffix（按部位抽池）', () => {
  const pool = [affixAttack, affixLightWeapon, affixArmor]
  it('只从匹配池抽取（weight 加权）', () => {
    const picked = rollEquipmentAffix(pool, 'weapon', '轻型', () => 0.01)
    expect(picked).not.toBeNull()
    expect(affixAppliesTo(picked!, 'weapon', '轻型')).toBe(true)
  })
  it('无匹配词条返回 null', () => {
    const noWildcard = [affixLightWeapon, affixArmor]
    expect(rollEquipmentAffix(noWildcard, 'weapon', '重型', () => 0.01)).toBeNull()
    expect(rollEquipmentAffix([], 'weapon', '轻型')).toBeNull()
  })
  it('weight=0 的词条不参与随机', () => {
    const zero = { ...affixAttack, id: 'eqaff_zero', weight: 0 }
    const rng = () => 0.5
    const result = rollEquipmentAffix([affixAttack, zero], 'accessory', '戒指', rng)
    expect(result?.id).toBe('eqaff_test_atk')
  })
  it('候选全为 weight=0 时返回 null（weight=0 语义：不参与随机）', () => {
    const zero = { ...affixAttack, weight: 0 }
    expect(rollEquipmentAffix([zero], 'accessory', '戒指')).toBeNull()
  })
  it('抽池权重越大越容易被抽中', () => {
    const heavy = { ...affixAttack, id: 'eqaff_heavy', weight: 1000 }
    let heavyCount = 0
    for (let i = 0; i < 1000; i++) {
      if (rollEquipmentAffix([affixAttack, heavy], 'weapon', '中型', () => Math.random())?.id === 'eqaff_heavy') heavyCount++
    }
    expect(heavyCount).toBeGreaterThan(800)
  })
})

describe('rollAffixValue / rollAffixStat（数值区间随机）', () => {
  it('在 [min,max] 区间内取整', () => {
    const v = rollAffixValue({ ...affixAttack, valueRange: { min: 8, max: 20 } }, () => 0.5)
    expect(v).toBe(14)
  })
  it('区间非法（max<=min）时取 min', () => {
    expect(rollAffixValue({ ...affixAttack, valueRange: { min: 5, max: 5 } }, () => 0.9)).toBe(5)
  })
  it('rollAffixStat 产出与 equipment stats 一致的条目', () => {
    const stat = rollAffixStat(affixLightWeapon, () => 0.5)
    expect(stat).toEqual({ attribute: 'comboRate', modifierType: 'percent', value: 10 })
  })
})

describe('DataIntegrityService 装备词条强校验', () => {
  let storage: MemoryStorage
  let integrity: DataIntegrityService
  beforeEach(async () => {
    ;({ storage, integrity } = makeServices())
    await seedFengshenData(storage)
  })

  const valid = (): Record<string, unknown> => ({
    id: 'eqaff_valid',
    name: '合法词条',
    attribute: 'attack',
    modifierType: 'flat',
    valueRange: { min: 1, max: 5 },
    applicableSlots: ['weapon', 'accessory:戒指'],
    school: '金行道',
    weight: 50,
    rarity: 1,
  })

  it('合法词条通过保存校验', async () => {
    const result = await integrity.validateOnSave('equipment_affixes', valid())
    expect(result.valid).toBe(true)
  })
  it('属性不存在于 attributes.json 被拦截', async () => {
    const result = await integrity.validateOnSave('equipment_affixes', { ...valid(), attribute: 'attackPercent' })
    expect(result.valid).toBe(false)
    expect(result.errors.join()).toContain('不存在于 attributes.json')
  })
  it('原型链属性名（constructor 等）不误判为合法属性', async () => {
    const result = await integrity.validateOnSave('equipment_affixes', { ...valid(), attribute: 'constructor' })
    expect(result.valid).toBe(false)
  })
  it('applicableSlots 非法（未知部位/交叉子类型）被拦截', async () => {
    const bad1 = await integrity.validateOnSave('equipment_affixes', { ...valid(), applicableSlots: ['hat'] })
    expect(bad1.valid).toBe(false)
    const bad2 = await integrity.validateOnSave('equipment_affixes', { ...valid(), applicableSlots: ['weapon:皮甲'] })
    expect(bad2.valid).toBe(false)
  })
  it('school 不存在于 schools.json 被拦截', async () => {
    const result = await integrity.validateOnSave('equipment_affixes', { ...valid(), school: '不存在流派' })
    expect(result.valid).toBe(false)
    expect(result.errors.join()).toContain('不存在于 schools.json')
  })
  it('valueRange 缺失 / min>max / 负数被拦截', async () => {
    const missing = await integrity.validateOnSave('equipment_affixes', { ...valid(), valueRange: {} })
    expect(missing.valid).toBe(false)
    const reversed = await integrity.validateOnSave('equipment_affixes', { ...valid(), valueRange: { min: 10, max: 5 } })
    expect(reversed.valid).toBe(false)
    const negative = await integrity.validateOnSave('equipment_affixes', { ...valid(), valueRange: { min: -1, max: 5 } })
    expect(negative.valid).toBe(false)
  })
  it('weight 非负数字', async () => {
    const result = await integrity.validateOnSave('equipment_affixes', { ...valid(), weight: -1 })
    expect(result.valid).toBe(false)
  })
  it('健康检查报告词条库中的非法词条，seed 数据无问题', async () => {
    const clean = await integrity.runHealthCheck()
    const eqIssues = clean.issues.filter((i) => i.sourceTable === 'equipment_affixes')
    expect(eqIssues).toHaveLength(0)

    await storage.set(FENGSHEN_STORE.EQUIPMENT_AFFIXES, 'eqaff_broken', {
      id: 'eqaff_broken',
      name: '坏词条',
      attribute: 'nonexistentAttr',
      modifierType: 'flat',
      valueRange: { min: 5, max: 3 },
      applicableSlots: ['weapon:布甲'],
      school: '不存在的流派',
      weight: 10,
    })
    const report = await integrity.runHealthCheck()
    const issues = report.issues.filter((i) => i.sourceTable === 'equipment_affixes' && i.sourceId === 'eqaff_broken')
    expect(issues.map((i) => i.field).sort()).toEqual(['applicableSlots', 'attribute', 'school', 'valueRange'])
  })
})
