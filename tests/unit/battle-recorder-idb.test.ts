/**
 * BattleRecorder × 真实 IndexedDB（fake-indexeddb）端到端往返测试
 *
 * 背景：唤灵台保存战斗记录成功（如「如梦令051」），但昊天镜数据源列表读不到。
 *       MemoryStorage/structuredClone 均通过，需在真实 IndexedDB 语义下验证
 *       checksum 往返稳定性与列表读取链路。
 *
 * 运行: npx vitest run tests/unit/battle-recorder-idb.test.ts
 */
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { IndexedDbStorage } from '@/infrastructure/adapters/storage/IndexedDbStorage'
import { BattleRecorder } from '@/domain/battle/service/BattleRecorder'
import { listRecordings } from '@/application/service/UnifiedArchiveService'
import { STORAGE_STORE } from '@/domain/port/IPersistentStorage'
import type { BattleSystem } from '@/domain/battle/BattleSystem'

describe('BattleRecorder × 真实 IndexedDB 往返', () => {
  const storage = new IndexedDbStorage()

  beforeEach(async () => {
    await storage.clear(STORAGE_STORE.RECORDINGS)
  })

  it('保存 → 列表 → 读回（checksum 在真实 IDB 往返后有效）', async () => {
    const recorder = new BattleRecorder(storage)
    recorder.startRecording('b_idb', { participants: [] })

    // 真实战斗路径：缺 overkill/actionOrder 的 combatRecord（校验失败会让 listRecordings 跳过）
    ;(recorder.getRecording('b_idb')!.combatRecords as unknown as Array<Record<string, unknown>>).push({
      id: 'r1', battleId: 'b_idb', timestamp: 1, turn: 1,
      actorId: 'a', actorName: 'A', actionType: 'attack', targetId: 't', targetName: 'T',
      damage: 5, heal: 0, effects: [], message: 'x', damageSource: 'attack',
    })
    recorder.recordTraceEvents('b_idb', [{
      id: 'e1', phase: 'action_execution', correlationId: 'c1', timestamp: 0, level: 'info', turn: 1,
    }] as never)

    const saveKey = await recorder.saveRecording('b_idb')
    expect(saveKey).not.toBeNull()

    // UnifiedArchiveService.listRecordings 等价链路
    const keys = await recorder.getSavedRecordingsList()
    expect(keys).toContain(saveKey)

    const loaded = await recorder.loadRecording(keys[0])
    expect(loaded).not.toBeNull()
    expect(loaded!.battleId).toBe('b_idb')
    expect(loaded!.name).toMatch(/^(临江仙|念奴娇|满江红|水调歌头|沁园春|蝶恋花|清平乐|如梦令|鹧鸪天|浣溪沙)\d{3}$/)
  })

  it('连续保存多条后全部可列出（序号递增、无丢失）', async () => {
    const recorder = new BattleRecorder(storage)
    for (let i = 0; i < 5; i++) {
      recorder.startRecording(`b_m${i}`, { participants: [] })
      await recorder.saveRecording(`b_m${i}`)
    }

    const keys = await recorder.getSavedRecordingsList()
    expect(keys.length).toBe(5)
    for (const key of keys) {
      const loaded = await recorder.loadRecording(key)
      expect(loaded).not.toBeNull()
    }
  })

  it('UnifiedArchiveService.listRecordings（昊天镜数据源）可列出刚保存的记录', async () => {
    const recorder = new BattleRecorder(storage)
    recorder.startRecording('b_e2e', { participants: [] })

    // 最小 BattleSystem 接口适配（仅暴露 listRecordings 用到的两个方法）
    const bs = {
      getSavedBattleRecordingsList: () => recorder.getSavedRecordingsList(),
      loadBattleRecording: (k: string) => recorder.loadRecording(k),
    } as unknown as BattleSystem

    await recorder.saveRecording('b_e2e')

    const metas = await listRecordings(bs)
    expect(metas).toHaveLength(1)
    expect(metas[0].battleId).toBe('b_e2e')
    expect(metas[0].saveKey).toBeTruthy()
    // 词牌名 + 三位序号
    expect(metas[0].name).toMatch(/^(临江仙|念奴娇|满江红|水调歌头|沁园春|蝶恋花|清平乐|如梦令|鹧鸪天|浣溪沙)\d{3}$/)
  })

  it('listRecordings 按保存时间倒序（不依赖 IndexedDB 主键字典序）', async () => {
    // saveKey 含 battleId 前缀：主键字典序按 battleId 排（a/z），与保存时间无关
    const bs = {
      getSavedBattleRecordingsList: async () => [
        'battle_recording_z_1690000000000',
        'battle_recording_a_1700000000001',
        'battle_recording_b_1700000000005',
      ],
      loadBattleRecording: async (key: string) => ({
        battleId: `bt_${key}`,
        name: `战斗记录_${key}`,
        startTime: 0,
        traceEvents: [],
        events: [],
        replayId: 'r',
        version: '2.0.0',
        randomSeed: '0',
        checksum: '',
      }),
    } as unknown as BattleSystem

    const metas = await listRecordings(bs)
    expect(metas.map((m) => m.saveKey)).toEqual([
      'battle_recording_b_1700000000005', // 最新
      'battle_recording_a_1700000000001',
      'battle_recording_z_1690000000000', // 最旧
    ])
  })
})
