/**
 * 封神榜 → 引擎数据源接入测试（Buff / 材料 双轨修复）
 *
 * 覆盖：
 * - normalizeBuffEntries：effects 条目归一化为 BuffJsonEntry（引擎注册表 / 数据源共用逻辑）；
 * - BattleDataLoader.reload：IDB buffs 表编辑后，数据源出口与 BuffScriptRegistry 配置层同步。
 *
 * 运行: npx vitest run tests/unit/fengshen-battle-data-source.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest'
import type { IPersistentStorage, StorageStats, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { seedFengshenData } from '@/infrastructure/adapters/storage/seed'
import { BattleDataLoader } from '@/application/service/BattleDataLoader'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { initializeContainer, container } from '@/infrastructure/di/Container'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { normalizeBuffEntries } from '@/shared/types/effects-json'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { DataIntegrityService } from '@/application/service/DataIntegrityService'

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

beforeAll(() => {
  initializeContainer()
})

describe('封神榜 → 引擎数据源接入（Buff / 材料）', () => {
  it('normalizeBuffEntries 归一化 effects 条目为 BuffJsonEntry', () => {
    const out = normalizeBuffEntries([
      { id: 'b1', name: '常规Buff', effects: [{ type: 'modifier', params: {} }] },
      { id: 'e1', type: 'debuff', params: { duration: 3, attributes: { attack: { value: 10, type: 'PERCENTAGE' } } } },
    ])

    const b1 = out.find((x) => x.id === 'b1')
    expect(b1?.effects?.length).toBe(1)

    const e1 = out.find((x) => x.id === 'e1')
    expect(e1?.polarity).toBe('negative')
    expect(e1?.duration).toBe(3)
    expect(e1?.maxStacks).toBe(1)
    expect(e1?.effects?.[0].type).toBe('modifier')
  })

  it('BattleDataLoader.reload 后 IDB buffs 编辑同步到数据源出口与 BuffScriptRegistry', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)

    // 模拟封神榜写操作：编辑 buffs 表某条 maxStacks
    const target = await storage.get<{ id: string; maxStacks?: number }>(FENGSHEN_STORE.BUFFS, 'buff_hit_reduction')
    expect(target).toBeDefined()
    const editedValue = 99
    await storage.set(FENGSHEN_STORE.BUFFS, 'buff_hit_reduction', { ...target, maxStacks: editedValue })

    const ok = await new BattleDataLoader(storage).reload()
    expect(ok).toBe(true)

    // 数据源出口反映编辑
    const dataBuffs = GameDataProcessor.getBuffsData()
    const fromSource = dataBuffs.find((b) => b.id === 'buff_hit_reduction')
    expect(fromSource?.maxStacks).toBe(editedValue)
    // 数据源含 effects 条目（归一化后）
    expect(dataBuffs.some((b) => b.effects?.[0]?.type === 'modifier')).toBe(true)

    // 引擎 Buff 配置层同步（BuffScriptRegistry 双轨消除）
    const registry = container.resolve<BuffScriptRegistry>('BuffScriptRegistry')
    expect(registry.getBuffConfig('buff_hit_reduction')?.maxStacks).toBe(editedValue)

    // 材料数据源出口可用
    expect(GameDataProcessor.getMaterialsData().length).toBeGreaterThan(0)
  })

  it('保存结构非法的 Buff（未知效果类型）被 DataIntegrityService 拦截，避免运行期炸战斗', async () => {
    const storage = new MemoryStorage()
    await seedFengshenData(storage)
    const integrity = new DataIntegrityService(storage)
    const service = new FengshenDataService(storage, integrity)

    const result = await service.save('buffs', {
      id: 'buff_bad_shape',
      polarity: 'positive',
      effects: [{ type: 'no_such_effect', params: {} }],
    })

    expect(result.ok).toBe(false)
    expect(result.errors?.some((e) => e.includes('effects[0].type'))).toBe(true)
  })
})
