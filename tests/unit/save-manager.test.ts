// @vitest-environment happy-dom
/**
 * save-manager.test.ts — 存档管理器编排逻辑（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 手动/自动存档落盘、加载恢复、主档损坏→备份降级、无档→新建、导出/导入、新游戏重置
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SaveManager, type SaveStatePort } from '@/shared/utils/save-manager'
import {
  attachChecksum,
  createInitialGameState,
  LOCAL_AUTO_KEY,
  LOCAL_MAIN_KEY,
  SAVE_AUTO_KEY,
  SAVE_MAIN_KEY,
  type SaveData,
} from '@/shared/utils/save-schema'
import { SAVE_STORE, type IPersistentStorage, type StorageStoreName } from '@/domain/port/IPersistentStorage'

/** 内存版 IndexedDB 存储（替代真实 IndexedDbStorage） */
class MemStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const
  private map = new Map<string, Map<string, unknown>>()

  async set<T>(store: StorageStoreName, key: string, value: T): Promise<boolean> {
    if (!this.map.has(store)) this.map.set(store, new Map())
    this.map.get(store)!.set(key, value)
    return true
  }
  async get<T>(store: StorageStoreName, key: string): Promise<T | null> {
    return (this.map.get(store)?.get(key) as T | undefined) ?? null
  }
  async remove(store: StorageStoreName, key: string): Promise<boolean> {
    return this.map.get(store)?.delete(key) ?? false
  }
  async keys(store: StorageStoreName): Promise<string[]> {
    return [...(this.map.get(store)?.keys() ?? [])]
  }
  async clear(store: StorageStoreName): Promise<boolean> {
    this.map.delete(store)
    return true
  }
  async getStats() {
    return null
  }
  raw(store: StorageStoreName, key: string): unknown {
    return this.map.get(store)?.get(key)
  }
}

/** IDB 全操作失败的存储（模拟 IndexedDB 被禁用/隐私模式），localStorage 仍可用 */
class FailStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const
  async set<T>(): Promise<boolean> {
    return false
  }
  async get<T>(): Promise<T | null> {
    return null
  }
  async remove(): Promise<boolean> {
    return false
  }
  async keys(): Promise<string[]> {
    return []
  }
  async clear(): Promise<boolean> {
    return false
  }
  async getStats() {
    return null
  }
}

interface Fixture {
  storage: MemStorage
  manager: SaveManager
  port: SaveStatePort
  restored: SaveData[]
  /** 当前 collect 返回的状态（可修改以模拟进度变化） */
  state: SaveData
}

function makeFixture(seed?: Partial<SaveData>): Fixture {
  const storage = new MemStorage()
  const restored: SaveData[] = []
  const state = {
    ...createInitialGameState(),
    ...seed,
    player: { ...createInitialGameState().player, ...(seed?.player ?? {}) },
  }
  const port: SaveStatePort = {
    collect: async ({ currentSceneId }) => {
      // NOTE: 深拷贝快照——模拟真实 collect 语义（快照非引用），否则 save 后修改 state 会污染磁盘
      const snap = JSON.parse(JSON.stringify(state)) as SaveData
      snap.progress.current_scene = currentSceneId ?? state.progress.current_scene
      return snap
    },
    restore: async (d) => {
      restored.push(JSON.parse(JSON.stringify(d)))
    },
  }
  const manager = new SaveManager(port, storage)
  return { storage, manager, port, restored, state }
}

beforeEach(() => {
  localStorage.clear()
})

describe('save（手动 / 自动）', () => {
  it('手动存档写主档 + localStorage，不覆盖自动备份', async () => {
    const f = makeFixture()
    f.state.player.level = 7
    expect(await f.manager.save('manual')).toBe(true)
    const main = f.storage.raw(SAVE_STORE.SAVES, SAVE_MAIN_KEY) as SaveData
    expect(main.player.level).toBe(7)
    expect(main.meta.version).toBe('2.0.0')
    expect(f.storage.raw(SAVE_STORE.SAVES, SAVE_AUTO_KEY)).toBeFalsy()
    const local = JSON.parse(localStorage.getItem(LOCAL_MAIN_KEY)!) as SaveData
    expect(local.player.level).toBe(7)
  })

  it('自动存档同时写主档与备份', async () => {
    const f = makeFixture()
    expect(await f.manager.autoSave()).toBe(true)
    expect(f.storage.raw(SAVE_STORE.SAVES, SAVE_MAIN_KEY)).toBeTruthy()
    expect(f.storage.raw(SAVE_STORE.SAVES, SAVE_AUTO_KEY)).toBeTruthy()
    expect(localStorage.getItem(LOCAL_AUTO_KEY)).toBeTruthy()
  })

  it('IDB 不可用但 localStorage 可用：save 判定成功且降级档已落盘（防误报保存失败）', async () => {
    const f = makeFixture()
    const manager = new SaveManager(f.port, new FailStorage())
    manager.setCurrentSceneId('scene_1_1')
    expect(await manager.save('manual')).toBe(true)
    const local = JSON.parse(localStorage.getItem(LOCAL_MAIN_KEY)!) as SaveData
    expect(local.meta.version).toBe('2.0.0')
    expect(local.meta.checksum).toBeTruthy()
    expect(local.progress.current_scene).toBe('scene_1_1')
  })

  it('IDB 与 localStorage 均不可用：save 判定失败', async () => {
    const f = makeFixture()
    const manager = new SaveManager(f.port, new FailStorage())
    localStorage.clear()
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    try {
      expect(await manager.save('manual')).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('load', () => {
  it('无档时创建初始档并返回 source=new', async () => {
    const f = makeFixture()
    const r = await f.manager.load()
    expect(r.ok).toBe(true)
    expect(r.source).toBe('new')
    expect(f.restored.at(-1)).toMatchObject({ player: { level: 1 } })
    expect(f.storage.raw(SAVE_STORE.SAVES, SAVE_MAIN_KEY)).toBeTruthy()
  })

  it('从主档恢复进度', async () => {
    const f = makeFixture()
    f.state.player.level = 12
    await f.manager.save('auto')
    // 新实例重新加载
    const storage = f.storage
    const port: SaveStatePort = {
      collect: async ({ currentSceneId }) => ({ ...createInitialGameState(), progress: { ...createInitialGameState().progress, current_scene: currentSceneId ?? '' } }),
      restore: async (d) => { f.restored.push(d) },
    }
    const mgr = new SaveManager(port, storage)
    const r = await mgr.load()
    expect(r.source).toBe('main')
    expect(f.restored.at(-1)?.player.level).toBe(12)
  })

  it('主档 checksum 被篡改时降级到自动备份', async () => {
    const f = makeFixture()
    f.state.player.level = 9
    await f.manager.save('auto')
    // 篡改主档（写入不同的 main 数据使 checksum 失效）
    const corrupted = JSON.parse(JSON.stringify(f.storage.raw(SAVE_STORE.SAVES, SAVE_MAIN_KEY))) as SaveData
    corrupted.player.gold = 99999
    await f.storage.set(SAVE_STORE.SAVES, SAVE_MAIN_KEY, corrupted)

    // 新 manager 复用同一 storage，从 auto 备份恢复
    const restored: SaveData[] = []
    const port: SaveStatePort = {
      collect: async () => createInitialGameState(),
      restore: async (d) => { restored.push(d) },
    }
    const mgr = new SaveManager(port, f.storage)
    const r = await mgr.load()
    expect(r.source).toBe('auto')
    expect(r.message).toContain('备份')
    expect(restored.at(-1)?.player.level).toBe(9)
  })

  it('主档结构损坏且无备份时重置为新档', async () => {
    const f = makeFixture()
    await f.storage.set(SAVE_STORE.SAVES, SAVE_MAIN_KEY, { meta: { version: '2.0.0' } } as unknown as SaveData)
    const r = await f.manager.load()
    expect(r.source).toBe('reset')
    expect(f.restored.at(-1)).toMatchObject({ player: { level: 1 } })
  })

  it('localStorage 旧档静默迁移至 IDB 并删除旧键', async () => {
    const f = makeFixture()
    const legacy = attachChecksum({ ...createInitialGameState(), player: { ...createInitialGameState().player, level: 3 } })
    localStorage.setItem(LOCAL_MAIN_KEY, JSON.stringify(legacy))
    const r = await f.manager.load()
    expect(r.source).toBe('local')
    expect(r.migrated).toBe(true)
    expect(f.restored.at(-1)?.player.level).toBe(3)
    expect(f.storage.raw(SAVE_STORE.SAVES, SAVE_MAIN_KEY)).toBeTruthy()
    expect(localStorage.getItem(LOCAL_MAIN_KEY)).toBeNull()
  })

  it('IDB 不可用时 localStorage 迁移保留旧键（防迁移失败丢档）', async () => {
    const restored: SaveData[] = []
    const port: SaveStatePort = {
      collect: async () => createInitialGameState(),
      restore: async (d) => { restored.push(d) },
    }
    const manager = new SaveManager(port, new FailStorage())
    const legacy = attachChecksum({ ...createInitialGameState(), player: { ...createInitialGameState().player, level: 3 } })
    localStorage.setItem(LOCAL_MAIN_KEY, JSON.stringify(legacy))
    const r = await manager.load()
    expect(r.source).toBe('local')
    expect(r.migrated).toBe(false)
    expect(restored.at(-1)?.player.level).toBe(3)
    // 旧键保留：IDB 未写入，下次加载仍能从降级档恢复
    expect(localStorage.getItem(LOCAL_MAIN_KEY)).toBeTruthy()
  })
})

describe('export / import', () => {
  it('exportSave 返回可解析的完整 JSON', async () => {
    const f = makeFixture()
    const json = await f.manager.exportSave()
    const parsed = JSON.parse(json) as SaveData
    expect(parsed.meta.version).toBe('2.0.0')
    expect(parsed.meta.checksum).toBeTruthy()
  })

  it('importSave 导入合法存档并恢复', async () => {
    const f = makeFixture()
    const data = attachChecksum({ ...createInitialGameState(), player: { ...createInitialGameState().player, level: 8, gold: 500 } })
    const file = new File([JSON.stringify(data)], 'save.json', { type: 'application/json' })
    const r = await f.manager.importSave(file)
    expect(r.ok).toBe(true)
    expect(f.restored.at(-1)).toMatchObject({ player: { level: 8, gold: 500 } })
    expect(f.storage.raw(SAVE_STORE.SAVES, SAVE_MAIN_KEY)).toBeTruthy()
  })

  it('importSave 拒绝非法 JSON 与缺字段存档', async () => {
    const f = makeFixture()
    const bad = await f.manager.importSave(new File(['not json'], 'x.json'))
    expect(bad.ok).toBe(false)
    const missing = await f.manager.importSave(new File([JSON.stringify({ foo: 1 })], 'x.json'))
    expect(missing.ok).toBe(false)
  })
})

describe('reset（新游戏）', () => {
  it('清除旧进度并落盘初始档（进度清零，回到 Lv.1）', async () => {
    const f = makeFixture()
    f.state.player.level = 20
    await f.manager.save('auto')
    const r = await f.manager.reset()
    expect(r.source).toBe('reset')
    // 旧进度已清除，重写为初始档（防刷新丢失）
    const main = f.storage.raw(SAVE_STORE.SAVES, SAVE_MAIN_KEY) as SaveData
    const auto = f.storage.raw(SAVE_STORE.SAVES, SAVE_AUTO_KEY) as SaveData
    expect(main.player.level).toBe(1)
    expect(main.player.gold).toBe(0)
    expect(auto.player.level).toBe(1)
    // 初始档也必须带有效 checksum，保证下次加载的完整性校验成立
    expect(main.meta.checksum).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(LOCAL_MAIN_KEY)!).player.level).toBe(1)
    expect(f.restored.at(-1)).toMatchObject({ player: { level: 1, gold: 0 } })
  })
})

describe('currentSceneId 透传', () => {
  it('collect 收到当前场景 id', async () => {
    let seen: string | null = 'unset'
    const storage = new MemStorage()
    const port: SaveStatePort = {
      collect: async ({ currentSceneId }) => {
        seen = currentSceneId
        return createInitialGameState()
      },
      restore: async () => {},
    }
    const manager = new SaveManager(port, storage)
    manager.setCurrentSceneId('scene_3_1')
    await manager.save('auto')
    expect(seen).toBe('scene_3_1')
  })
})

describe('debug 调试方法（DebugCavePanel 存档调试）', () => {
  it('debugReadRaw 读取主档原始 JSON；无档返回 null', async () => {
    const f = makeFixture()
    expect(await f.manager.debugReadRaw()).toBeNull()
    f.state.player.level = 5
    await f.manager.save('auto')
    const raw = await f.manager.debugReadRaw()
    expect(raw?.player.level).toBe(5)
    expect(raw?.meta.version).toBe('2.0.0')
  })

  it('debugClearAll 删除主档 + 自动备份 + localStorage 键', async () => {
    const f = makeFixture()
    await f.manager.save('auto')
    expect(await f.manager.debugReadRaw()).toBeTruthy()
    await f.manager.debugClearAll()
    expect(await f.manager.debugReadRaw()).toBeNull()
    expect(f.storage.raw(SAVE_STORE.SAVES, SAVE_AUTO_KEY)).toBeFalsy()
    expect(localStorage.getItem(LOCAL_MAIN_KEY)).toBeNull()
    expect(localStorage.getItem(LOCAL_AUTO_KEY)).toBeNull()
  })

  it('debugWriteLegacy 写入 v1.x 旧档（8 槽），load 后迁移为 6 槽结构', async () => {
    const f = makeFixture()
    await f.manager.debugWriteLegacy()
    const raw = await f.manager.debugReadRaw()
    expect(raw?.meta.version).toBe('1.0.0')
    expect((raw?.equipment as unknown as Record<string, unknown>).necklace).toBeTruthy()
    const r = await f.manager.load()
    expect(r.ok).toBe(true)
    // 迁移后版本升级 + necklace 映射 helmet、belt 映射 boots
    const migrated = f.storage.raw(SAVE_STORE.SAVES, SAVE_MAIN_KEY) as SaveData
    expect(migrated.meta.version).toBe('2.0.0')
    expect(migrated.equipment.helmet).toBe('ac_001')
    expect(migrated.equipment.boots).toBe('ac_002')
  })

  it('debugWriteCorrupt 写入损坏 JSON，load 触发降级（主档损坏→备份→重置）', async () => {
    const f = makeFixture()
    await f.manager.debugWriteCorrupt()
    const r = await f.manager.load()
    expect(r.ok).toBe(true)
    // 无备份时降级到重置（初始档）
    expect(r.source).toBe('reset')
    expect(f.restored.at(-1)).toMatchObject({ player: { level: 1 } })
  })

  it('debugCompare 对比内存与磁盘差异（剔除 meta 时间戳/checksum）', async () => {
    const f = makeFixture()
    // 磁盘无档
    const empty = await f.manager.debugCompare()
    expect(empty.changed).toBe(true)
    expect(empty.diffs).toContain('磁盘无存档')
    // 保存后一致（磁盘被持久化写入独立 JSON，collect 与磁盘同源）
    await f.manager.save('auto')
    const same = await f.manager.debugCompare()
    expect(same.changed).toBe(false)
    // 修改内存状态后检出差异（port.collect 捕获的 state 为同一引用，直接改属性）
    f.state.player.level = 42
    const diff = await f.manager.debugCompare()
    expect(diff.changed).toBe(true)
    expect(diff.diffs).toContain('player')
    // 恢复后回到一致
    f.state.player.level = 1
    const back = await f.manager.debugCompare()
    expect(back.changed).toBe(false)
  })
})
