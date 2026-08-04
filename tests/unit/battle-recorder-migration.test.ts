/**
 * BattleRecorder 旧持久化数据迁移测试
 *
 * 背景：持久化存储中可能残留旧版本格式的战斗记录（缺 combatRecords 字段）。
 *      BattleRecordingDialog 渲染列表时读取 rec.combatRecords.length，
 *      旧数据经 loadRecording 进入内存后 combatRecords 为 undefined → 打开"战斗记录"弹窗崩溃。
 *
 * 运行: npx vitest run tests/unit/battle-recorder-migration.test.ts
 */
import { describe, it, expect } from 'vitest'
import { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import type { IPersistentStorage, StorageStats } from '@/domain/port/IPersistentStorage'
import { STORAGE_STORE } from '@/domain/port/IPersistentStorage'

/** 内存版持久化存储（mock IndexedDB） */
class MemoryStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const
  private store = new Map<string, unknown>()

  async set<T>(_store: string, key: string, value: T): Promise<boolean> {
    this.store.set(key, value)
    return true
  }
  async get<T>(_store: string, key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null
  }
  async remove(_store: string, key: string): Promise<boolean> {
    return this.store.delete(key)
  }
  async keys(_store: string): Promise<string[]> {
    return Array.from(this.store.keys())
  }
  async clear(_store: string): Promise<boolean> {
    this.store.clear()
    return true
  }
  async keysByField(_store: string, field: string, direction: 'asc' | 'desc' = 'asc'): Promise<string[]> {
    const entries = Array.from(this.store.entries())
      .map(([k, v]) => ({
        k,
        v: (v as Record<string, unknown> | undefined)?.[field] as number | undefined ?? 0,
      }))
    entries.sort((a, b) => (direction === 'asc' ? a.v - b.v : b.v - a.v))
    return entries.map((e) => e.k)
  }
  async getStats(): Promise<StorageStats | null> {
    return null
  }
}

describe('BattleRecorder 旧数据迁移', () => {
  it('加载缺 combatRecords 字段的旧记录后补空数组（防止战斗记录弹窗崩溃）', async () => {
    const storage = new MemoryStorage()
    const recorder = new BattleRecorder(storage)

    // 旧版本持久化数据：无 combatRecords 字段
    const legacyData = {
      battleId: 'b_legacy',
      replayId: 'r_legacy',
      version: 'legacy',
      randomSeed: 'seed_legacy',
      startTime: 1700000000000,
      events: [],
      initialState: { participants: [] },
      rounds: [],
    }

    await storage.set(STORAGE_STORE.RECORDINGS, 'battle_recording_b_legacy_1', legacyData)
    const loaded = await recorder.loadRecording('battle_recording_b_legacy_1')

    expect(loaded).not.toBeNull()
    // 迁移必须补上 combatRecords，否则 UI 读 rec.combatRecords.length 时崩溃
    expect(loaded!.combatRecords).toEqual([])

    // 后续 getAllRecordings 返回的记录必须可直接渲染（弹窗列表路径）
    for (const rec of recorder.getAllRecordings()) {
      expect(Array.isArray(rec.combatRecords)).toBe(true)
    }
  })

  it('持久化记录超出 maxRecordings 上限时按 savedAt 删最旧（防批量生成无限累积）', async () => {
    const storage = new MemoryStorage()
    const recorder = new BattleRecorder(storage)

    // 连续保存 55 条（模拟多次"生成数据·保存记录"累积）
    for (let i = 0; i < 55; i++) {
      recorder.startRecording(`b_${i}`, { participants: [] })
      await recorder.saveRecording(`b_${i}`, `rec_${i}`)
    }

    const keys = await storage.keys(STORAGE_STORE.RECORDINGS)
    // maxRecordings = 50：超出部分按保存时间（savedAt）删最旧
    expect(keys.length).toBe(50)
    expect(keys.some((k) => k.includes('b_0'))).toBe(false) // 最早 5 条已被裁剪
    expect(keys.some((k) => k.includes('b_54'))).toBe(true) // 最新保存的保留
  })
})
