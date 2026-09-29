/**
 * B2 交付闭环：configs 双源漂移检查（DriftCheckService）单测。
 *
 * 对照源 = buildSeedTableSet()（configs/ JSON + 代码构建器），种子态库应零漂移；
 * 手改 / 库内新增 / 库内缺失三类检出；差异表重载恢复且不触碰未选表。
 *
 * 运行: npx vitest run tests/unit/fengshen-drift.test.ts
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { seedFengshenData, buildSeedTableSet } from '@/infrastructure/adapters/storage/seed'
import { DriftCheckService } from '@/application/service/DriftCheckService'

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

/** 可注入写失败的存储：模拟配额满 / 存储不可用 */
class FlakyStorage extends MemoryStorage {
  failSetStore: string | null = null

  async set<T>(store: StorageStoreName, key: string, value: T): Promise<boolean> {
    if (this.failSetStore && store === this.failSetStore) return false
    return super.set(store, key, value)
  }
}

const storage = new MemoryStorage()
const drift = new DriftCheckService(storage)

beforeEach(async () => {
  for (const store of Object.values(FENGSHEN_STORE)) {
    await storage.clear(store as StorageStoreName)
  }
  await storage.set(FENGSHEN_STORE.META, 'dataVersion', { id: 'dataVersion', version: 1, updatedAt: new Date().toISOString() })
})

describe('buildSeedTableSet 对照源', () => {
  it('覆盖全部有对照源的数据表（不含 meta），行均有合法 id', () => {
    const set = buildSeedTableSet()
    expect(Object.keys(set)).not.toContain(FENGSHEN_STORE.META)
    expect(Object.keys(set).length).toBeGreaterThanOrEqual(15)
    for (const [table, rowsById] of Object.entries(set)) {
      expect(Object.keys(rowsById).length, `表 ${table} 行数 > 0`).toBeGreaterThan(0)
      for (const [id, entity] of Object.entries(rowsById)) {
        expect(id, `表 ${table} 行 id 非空`).toBeTruthy()
        expect((entity as { id?: unknown }).id).toBe(id)
      }
    }
  })
})

describe('DriftCheckService 漂移检出', () => {
  it('种子态库零漂移（updatedAt 已排除）', async () => {
    await seedFengshenData(storage)
    const report = await drift.check()
    expect(report.checkedTables.length).toBeGreaterThanOrEqual(15)
    expect(report.modified).toEqual([])
    expect(report.addedInDb).toEqual([])
    expect(report.missingInDb).toEqual([])
  })

  it('手改 params 行：modified 检出且字段级 diff 指向改动字段（before=configs 值）', async () => {
    await seedFengshenData(storage)
    const row = await storage.get<Record<string, unknown>>(FENGSHEN_STORE.PARAMS, 'energy_gain_per_turn')
    expect(row).not.toBeNull()
    const original = row?.value
    await storage.set(FENGSHEN_STORE.PARAMS, 'energy_gain_per_turn', { ...row, value: (original as number) + 1 })

    const report = await drift.check()
    expect(report.modified).toHaveLength(1)
    const item = report.modified[0]
    expect(item).toMatchObject({ table: 'params', id: 'energy_gain_per_turn', reason: 'modified' })
    expect(item.fieldDiffs?.map((d) => d.key)).toEqual(['value'])
    // FieldDiff 为展示口径：值经 diffValueText 字符串化（与操作日志同源）
    expect(item.fieldDiffs?.[0].before).toBe(String(original))
    expect(item.fieldDiffs?.[0].after).toBe(String((original as number) + 1))
  })

  it('库内新增与删除行分别落入 addedInDb / missingInDb', async () => {
    await seedFengshenData(storage)
    const victim = (await storage.keys(FENGSHEN_STORE.PARAMS))[0]
    await storage.remove(FENGSHEN_STORE.PARAMS, victim)
    await storage.set(FENGSHEN_STORE.PARAMS, 'custom_param', {
      id: 'custom_param',
      name: '策划手加',
      value: 1,
      updatedAt: new Date().toISOString(),
    })

    const report = await drift.check()
    expect(report.missingInDb.map((i) => i.id)).toEqual([victim])
    expect(report.addedInDb.map((i) => i.id)).toEqual(['custom_param'])
    expect(report.addedInDb[0].name).toBe('策划手加')
  })

  it('指定表范围只检查所选表', async () => {
    await seedFengshenData(storage)
    const row = await storage.get<Record<string, unknown>>(FENGSHEN_STORE.ENEMIES, (await storage.keys(FENGSHEN_STORE.ENEMIES))[0])
    await storage.set(FENGSHEN_STORE.ENEMIES, (row as { id: string }).id, { ...row, name: '手改敌人' })

    const report = await drift.check(['params'])
    expect(report.checkedTables).toEqual(['params'])
    expect(report.modified).toEqual([])
  })
})

describe('DriftCheckService 差异表重载', () => {
  it('重载差异表恢复 configs 态，未选表的手改保留', async () => {
    await seedFengshenData(storage)
    // params 手改 + enemies 手改
    const paramRow = await storage.get<Record<string, unknown>>(FENGSHEN_STORE.PARAMS, 'min_damage')
    await storage.set(FENGSHEN_STORE.PARAMS, 'min_damage', { ...paramRow, value: 55 })
    const enemyId = (await storage.keys(FENGSHEN_STORE.ENEMIES))[0]
    const enemyRow = await storage.get<Record<string, unknown>>(FENGSHEN_STORE.ENEMIES, enemyId)
    await storage.set(FENGSHEN_STORE.ENEMIES, enemyId, { ...enemyRow, name: '手改敌人' })
    // params 库内新增行（重载后应被清除）
    await storage.set(FENGSHEN_STORE.PARAMS, 'custom_param', { id: 'custom_param', value: 1, updatedAt: '' })

    const result = await drift.reloadTables(['params'])
    expect(result.tables).toEqual(['params'])
    expect(result.restoredRows).toBeGreaterThan(0)

    // 重载表归零（custom_param 已清除，min_damage 回种子值）
    const after = await drift.check(['params'])
    expect(after.modified).toEqual([])
    expect(after.addedInDb).toEqual([])
    expect(after.missingInDb).toEqual([])
    expect((await storage.get<Record<string, unknown>>(FENGSHEN_STORE.PARAMS, 'min_damage'))?.value).toBe(
      buildSeedTableSet().params.min_damage.value,
    )
    // 未选表手改保留
    expect((await storage.get<Record<string, unknown>>(FENGSHEN_STORE.ENEMIES, enemyId))?.name).toBe('手改敌人')
  })

  it('重载后 dataVersion 递增且写 op=rollback 日志', async () => {
    await seedFengshenData(storage)
    const result = await drift.reloadTables(['growth'])
    expect(result.version).toBe(2)
    let found = false
    for (const key of await storage.keys(FENGSHEN_STORE.META)) {
      const entry = await storage.get<{ op?: string; entityId?: string }>(FENGSHEN_STORE.META, key)
      if (entry?.op === 'rollback' && entry.entityId === 'growth') found = true
    }
    expect(found).toBe(true)
  })

  it('无对照源的表拒绝重载', async () => {
    await expect(drift.reloadTables(['meta' as never])).rejects.toThrow(/对照源/)
  })

  it('重载时行写入失败：抛错提示内容可能不完整', async () => {
    const flaky = new FlakyStorage()
    await seedFengshenData(flaky)
    const flakyDrift = new DriftCheckService(flaky)
    flaky.failSetStore = FENGSHEN_STORE.PARAMS
    await expect(flakyDrift.reloadTables(['params'])).rejects.toThrow(/可能不完整/)
  })
})
