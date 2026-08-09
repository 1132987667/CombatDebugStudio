/**
 * 封神榜搜索维度 / 操作日志 diff 测试
 *
 * 覆盖：
 * - GameDataApi.listByTable search：匹配 name/id + schema 标注的 searchable 字段（含 map「键:值」）；
 * - computeFieldDiff：操作日志字段级 before/after（排除 updatedAt、对象按内容比较）。
 *
 * 运行: npx vitest run tests/unit/fengshen-search-diff.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { GameDataApi } from '@/application/service/GameDataApi'
import { computeFieldDiff, diffValueText } from '@/shared/utils/entity-diff'
import { validateBuffConfigShape } from '@/domain/buff/buffConfigValidation'

/** 按 store 分桶的内存版持久化存储（与 fengshen-reflookup.test.ts 同构，测试隔离自带 fixture） */
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

describe('GameDataApi 搜索维度（searchable 字段）', () => {
  it('按 name 搜索命中（既有行为）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)
    const rows = await api.listByTable<{ id: string; name: string }>('actors', { search: '火护法' })
    expect(rows.some((r) => r.name === '火护法')).toBe(true)
  })

  it('按 searchable select 字段搜索（materials.type）命中', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)
    const rows = await api.listByTable<{ id: string; type: string }>('materials', { search: '木材' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.type === '木材')).toBe(true)
  })

  it('按 map 属性值搜索（actors.stats 键值）命中', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)
    // stats 含 maxHealth 等键；搜「attack:」前缀应命中有攻击属性的角色
    const rows = await api.listByTable<{ id: string; stats: Record<string, unknown> }>('actors', { search: 'attack:' })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => Object.keys(r.stats ?? {}).some((k) => k.includes('attack')))).toBe(true)
  })
})

describe('computeFieldDiff（操作日志字段级 diff）', () => {
  it('修改单个标量字段输出 before/after', () => {
    const diffs = computeFieldDiff(
      { id: 'a1', name: '角色', level: 10 },
      { id: 'a1', name: '角色', level: 12 },
    )
    expect(diffs).toEqual([{ key: 'level', before: '10', after: '12' }])
  })

  it('map 字段内容变化按对象比较输出', () => {
    const diffs = computeFieldDiff(
      { id: 'a1', stats: { attack: 10 } },
      { id: 'a1', stats: { attack: 15 } },
    )
    expect(diffs).toHaveLength(1)
    expect(diffs[0].key).toBe('stats')
    expect(diffs[0].before).toContain('10')
    expect(diffs[0].after).toContain('15')
  })

  it('排除 updatedAt，空值显示占位符', () => {
    const diffs = computeFieldDiff(
      { id: 'a1', name: 'x', updatedAt: 't1' },
      { id: 'a1', name: undefined, updatedAt: 't2' },
    )
    expect(diffs).toHaveLength(1)
    expect(diffs[0].key).toBe('name')
    expect(diffs[0].after).toBe('—')
  })

  it('新增（无旧实体）按全部字段输出 diff（create 场景由 save 单独跳过）', () => {
    const diffs = computeFieldDiff(null, { id: 'a1', name: 'x' })
    expect(diffs.length).toBe(2)
    expect(diffs.find((d) => d.key === 'name')?.after).toBe('x')
  })
})

describe('validateBuffConfigShape（Buff 结构校验，拦截引擎运行期会抛错的坏数据）', () => {
  it('合法 Buff（effects + polarity）无错误', () => {
    expect(validateBuffConfigShape({
      id: 'b1',
      polarity: 'positive',
      effects: [{ type: 'modifier', params: { attributes: {} } }],
    })).toEqual([])
  })

  it('未知原子效果类型被拦截', () => {
    const errors = validateBuffConfigShape({
      id: 'b1',
      polarity: 'positive',
      effects: [{ type: 'foo', params: {} }],
    })
    expect(errors.length).toBe(1)
    expect(errors[0]).toContain('effects[0].type')
  })

  it('缺少 polarity 且不可推导被拦截', () => {
    const errors = validateBuffConfigShape({ id: 'b1', effects: [] })
    expect(errors.some((e) => e.includes('polarity'))).toBe(true)
  })

  it('缺失 effects type 与非法 triggers phase 被拦截', () => {
    const errors = validateBuffConfigShape({
      id: 'b1',
      polarity: 'negative',
      effects: [{}],
      triggers: [{ phase: 'no_such_phase' }],
    })
    expect(errors.some((e) => e.includes('缺少 type'))).toBe(true)
    expect(errors.some((e) => e.includes('phase'))).toBe(true)
  })

  it('effects 条目归一化后（顶层 type=debuff）通过（DataIntegrityService 先归一化再校验）', () => {
    // 归一化后的 config 带 polarity/effects，纯函数本身通过
    expect(validateBuffConfigShape({
      id: 'buff_stun',
      polarity: 'negative',
      duration: 1,
      maxStacks: 1,
      effects: [{ type: 'modifier', params: { attributes: {} } }],
    })).toEqual([])
  })
})
