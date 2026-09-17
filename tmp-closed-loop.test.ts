// 临时闭环验证：seed v41 重播 → 重算 → 真实写入校验（复现用户流程），跑完即删
import { describe, it, expect } from 'vitest'
import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { GameDataApi } from '@/application/service/GameDataApi'
import { rebuildAllEnemies, type EnemyStatsRow } from '@/domain/fengshen/enemy-generate'
import { DataIntegrityService } from '@/application/service/DataIntegrityService'

class MemoryStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const
  private buckets = new Map<string, Map<string, unknown>>()
  private bucket(store: string): Map<string, unknown> {
    let b = this.buckets.get(store)
    if (!b) { b = new Map(); this.buckets.set(store, b) }
    return b
  }
  async set<T>(store: StorageStoreName, key: string, value: T): Promise<boolean> {
    this.bucket(store).set(key, value); return true
  }
  async get<T>(store: StorageStoreName, key: string): Promise<T | null> {
    return (this.bucket(store).get(key) as T | undefined) ?? null
  }
  async remove(store: StorageStoreName, key: string): Promise<boolean> { return this.bucket(store).delete(key) }
  async keys(store: StorageStoreName): Promise<string[]> { return Array.from(this.bucket(store).keys()) }
  async clear(store: StorageStoreName): Promise<boolean> { this.buckets.delete(store); return true }
  async keysByField(): Promise<string[]> { return [] }
  async stats() { return { stores: 0, keys: 0, estimatedBytes: 0 } }
}

describe('重算闭环（seed v41 → 重算 → 写入校验）', () => {
  it('全量重播后重算写入零失败（幼年蟹将/金甲蟹将不再重名）', async () => {
    const storage = new MemoryStorage()
    const seed = await seedFengshenData(storage)
    expect(seed.imported).toBe(true)

    const api = new GameDataApi(storage)
    const rows = await api.listByTable<EnemyStatsRow>('enemies', { limit: 500 })
    const report = rebuildAllEnemies(rows)

    const crab = report.entries.filter((e) => e.id === 'enemy_010' || e.id === 'enemy_016')
    expect(crab.length).toBe(2)

    const integrity = new DataIntegrityService(storage)
    const byId = new Map(rows.map((r) => [r.id, r]))
    const failures: string[] = []
    let written = 0
    for (const entry of report.entries) {
      if (!entry.changed) continue
      const row = byId.get(entry.id)
      if (!row) continue
      const result = await integrity.validateOnSave('enemies', { ...row, stats: entry.after })
      if (result.ok) {
        written++
        await storage.set(FENGSHEN_STORE.ENEMIES, entry.id, { ...row, stats: entry.after })
      } else {
        failures.push(`${entry.id}: ${result.errors?.[0]}`)
      }
    }
    expect(failures, failures.join('; ')).toEqual([])
    expect(written).toBe(report.entries.filter((e) => e.changed).length)

    const after = await api.listByTable<{ id: string; name: string }>('enemies', { limit: 500 })
    expect(after.filter((r) => r.id === 'enemy_010').map((r) => r.name)).toEqual(['旧幼年蟹将'])
  })
})
