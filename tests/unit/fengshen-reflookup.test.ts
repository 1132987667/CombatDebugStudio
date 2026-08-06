/**
 * GameDataApi 引用字典 / 元素选项测试（纯逻辑可运行检查）
 *
 * 覆盖：loadRefNameIndex 全局 id→中文 字典（含 elements 元素、guardian_* 跨表同 id）、
 *       listElementDefs 元素选项（编辑下拉数据源修复）。
 *
 * 运行: npx vitest run tests/unit/fengshen-reflookup.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { GameDataApi } from '@/application/service/GameDataApi'

/** 按 store 分桶的内存版持久化存储（与 fengshen-data.test.ts 同构，测试隔离自带 fixture） */
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

describe('GameDataApi 引用字典 / 元素选项', () => {
  it('loadRefNameIndex 构建全局 id→中文 字典（含 elements 元素、guardian 跨表同 id 一致）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)
    const idx = await api.loadRefNameIndex()

    expect(idx['crane_wing']).toBe('鹤翼阵')
    expect(idx['growth_balanced']).toBe('均衡型')
    expect(idx['guardian_fire']).toBe('火护法')
    expect(idx['enemy_001']).toBe('花妖')
    expect(idx['fire']).toBe('火')
    expect(idx['buff_hit_reduction']).toBeDefined()
    expect(idx['mat_001']).toBe('灵草')
    expect(idx['lineup_001']).toBe('五行试炼阵')
  })

  it('listElementDefs 返回元素选项（编辑下拉数据源，元素定义在 elements[].id/name）', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const api = new GameDataApi(storage)
    const defs = await api.listElementDefs()
    expect(defs).toEqual([
      { id: 'fire', name: '火' },
      { id: 'water', name: '水' },
      { id: 'wood', name: '木' },
      { id: 'earth', name: '土' },
      { id: 'metal', name: '金' },
    ])
  })
})
