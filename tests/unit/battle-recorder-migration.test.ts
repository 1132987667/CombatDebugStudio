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

/** 模拟 IndexedDB 的存储：写入/读取经过结构化克隆（真实 IDB 往返会序列化数据） */
class CloneStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const
  private store = new Map<string, unknown>()

  async set<T>(_store: string, key: string, value: T): Promise<boolean> {
    this.store.set(key, structuredClone(value))
    return true
  }
  async get<T>(_store: string, key: string): Promise<T | null> {
    const v = this.store.get(key)
    return v === undefined ? null : (structuredClone(v) as T)
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
      .map(([k, v]) => ({ k, v: (v as Record<string, unknown> | undefined)?.[field] as number | undefined ?? 0 }))
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

  it('保存后加载可读回：checksum 校验必须先于字段迁移（防"保存成功但昊天镜读不到"）', async () => {
    const storage = new MemoryStorage()
    const recorder = new BattleRecorder(storage)

    recorder.startRecording('b_ck', { participants: [] })
    // 真实战斗路径：普通攻击/技能记录的 overkill 仅在溢出时赋值，
    // DOT 记录连 actionOrder 都没有 → combatRecords 中存在缺字段条目
    const rec = recorder.getRecording('b_ck')!
    ;(rec.combatRecords as unknown as Array<Record<string, unknown>>).push({
      id: 'r1',
      battleId: 'b_ck',
      timestamp: 1,
      turn: 1,
      actorId: 'a',
      actorName: 'A',
      actionType: 'attack',
      targetId: 't',
      targetName: 'T',
      damage: 5,
      heal: 0,
      effects: [],
      message: 'x',
    })

    const saveKey = await recorder.saveRecording('b_ck', 'rec_ck')
    expect(saveKey).not.toBeNull()

    // 校验失败会返回 null → UnifiedArchiveService.listRecordings 跳过该记录（数据源列表缺失）
    const loaded = await recorder.loadRecording(saveKey!)
    expect(loaded).not.toBeNull()
    // 迁移在校验通过后补字段（供 UI 渲染），不影响校验结果
    expect(loaded!.combatRecords[0].actionOrder).toBe(0)
    expect(loaded!.combatRecords[0].overkill).toBe(0)
  })

  it('昊天镜数据源链路：保存后可被 getSavedRecordingsList 列出并可读回', async () => {
    const storage = new MemoryStorage()
    const recorder = new BattleRecorder(storage)

    recorder.startRecording('b_list', {
      participants: [
        { id: 'p1', name: '甲', team: 'ally', maxHealth: 100, currentHealth: 100, maxEnergy: 50, currentEnergy: 50 },
      ],
    } as never)
    // 真实战斗路径：combatRecords 中普遍存在缺 overkill/actionOrder 的条目
    ;(recorder.getRecording('b_list')!.combatRecords as unknown as Array<Record<string, unknown>>).push({
      id: 'r1', battleId: 'b_list', timestamp: 1, turn: 1,
      actorId: 'p1', actorName: '甲', actionType: 'attack', targetId: 'e1', targetName: '乙',
      damage: 5, heal: 0, effects: [], message: 'x',
    })

    const saveKey = await recorder.saveRecording('b_list', '战斗记录_测试')
    expect(saveKey).not.toBeNull()

    // UnifiedArchiveService.listRecordings 的等价链路
    const keys = await recorder.getSavedRecordingsList()
    expect(keys).toContain(saveKey)
    const loaded = await recorder.loadRecording(keys[0])
    expect(loaded).not.toBeNull()
    expect(loaded!.battleId).toBe('b_list')
    expect(loaded!.name).toBe('战斗记录_测试')
  })

  it('IndexedDB 结构化克隆往返后 checksum 仍通过（真实浏览器数据源链路）', async () => {
    const storage = new CloneStorage()
    const recorder = new BattleRecorder(storage)

    recorder.startRecording('b_clone', { participants: [] })
    ;(recorder.getRecording('b_clone')!.combatRecords as unknown as Array<Record<string, unknown>>).push({
      id: 'r1', battleId: 'b_clone', timestamp: 1, turn: 1,
      actorId: 'a', actorName: 'A', actionType: 'attack', targetId: 't', targetName: 'T',
      damage: 5, heal: 0, effects: [], message: 'x', damageSource: 'attack',
    })
    // traceEvents 同样含可选字段（undefined 属性在 IDB 往返后保留、JSON.stringify 均跳过）
    recorder.recordTraceEvents('b_clone', [{
      id: 'e1', phase: 'action_execution', correlationId: 'c1', timestamp: 0, level: 'info', turn: 1,
    }] as never)

    const saveKey = await recorder.saveRecording('b_clone', '克隆记录')
    expect(saveKey).not.toBeNull()

    const keys = await recorder.getSavedRecordingsList()
    const loaded = await recorder.loadRecording(keys[0])
    expect(loaded).not.toBeNull()
    expect(loaded!.battleId).toBe('b_clone')
  })

  it('默认命名：随机词牌名 + 三位序号（唤灵台保存战斗记录）', async () => {
    const storage = new MemoryStorage()
    const recorder = new BattleRecorder(storage)

    recorder.startRecording('b_c1', { participants: [] })
    const k1 = await recorder.saveRecording('b_c1')
    expect(k1).not.toBeNull()
    const l1 = await recorder.loadRecording(k1!)
    expect(l1).not.toBeNull()
    expect(l1!.name).toMatch(/^(临江仙|念奴娇|满江红|水调歌头|沁园春|蝶恋花|清平乐|如梦令|鹧鸪天|浣溪沙)001$/)

    recorder.startRecording('b_c2', { participants: [] })
    const k2 = await recorder.saveRecording('b_c2')
    const l2 = await recorder.loadRecording(k2!)
    expect(l2!.name).toMatch(/^(临江仙|念奴娇|满江红|水调歌头|沁园春|蝶恋花|清平乐|如梦令|鹧鸪天|浣溪沙)002$/)

    // 显式传名不受默认命名影响（批量生成等路径）
    recorder.startRecording('b_c3', { participants: [] })
    const k3 = await recorder.saveRecording('b_c3', '自定义名')
    const l3 = await recorder.loadRecording(k3!)
    expect(l3!.name).toBe('自定义名')
  })

  it('删除中间记录后默认命名序号不复用（最大序号 + 1）', async () => {
    const storage = new MemoryStorage()
    const recorder = new BattleRecorder(storage)
    const SEQ_RE = /^(?:临江仙|念奴娇|满江红|水调歌头|沁园春|蝶恋花|清平乐|如梦令|鹧鸪天|浣溪沙)(\d{3})$/
    const seqOf = (name: string | undefined): string => SEQ_RE.exec(name ?? '')?.[1] ?? ''

    recorder.startRecording('b_d1', { participants: [] })
    const k1 = await recorder.saveRecording('b_d1')
    recorder.startRecording('b_d2', { participants: [] })
    const k2 = await recorder.saveRecording('b_d2')
    recorder.startRecording('b_d3', { participants: [] })
    await recorder.saveRecording('b_d3')
    expect(seqOf((await recorder.loadRecording(k1!))!.name)).toBe('001')
    expect(seqOf((await recorder.loadRecording(k2!))!.name)).toBe('002')

    // 删除中间记录（002），再保存：序号应跳到 004，不复用已存在的 003
    await recorder.deleteRecording(k2!)
    recorder.startRecording('b_d4', { participants: [] })
    const k4 = await recorder.saveRecording('b_d4')
    const l4 = await recorder.loadRecording(k4!)
    expect(l4).not.toBeNull()
    expect(seqOf(l4!.name)).toBe('004')

    const keys = await recorder.getSavedRecordingsList()
    expect(keys.length).toBe(3)
    expect(keys).not.toContain(k2)
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
