/**
 * UnifiedArchiveService 服务层测试
 *
 * 覆盖 fromRecordedBattle 归一化（字段映射、时基归零、根事件合成、HP 快照累减）
 * 与 loadLatestArchive 的来源优先级（内存 > IndexedDB > null）。
 */
import { describe, it, expect, vi } from 'vitest'
import {
  fromRecordedBattle,
  loadLatestArchive,
  listRecordings,
} from '@/application/service/UnifiedArchiveService'
import { TracePhase } from '@/shared/types/trace-event'
import type { RecordedBattle } from '@/domain/battle/service/BattleRecorder'
import type { BattleSystem } from '@/domain/battle/BattleSystem'

function makeRecord(overrides: Partial<RecordedBattle> = {}): RecordedBattle {
  return {
    battleId: 'b1',
    replayId: 'r1',
    name: '战斗记录_b1',
    version: '2.0.0',
    randomSeed: 'seed-1',
    startTime: 1000,
    checksum: 'abc',
    winner: 'ally',
    initialState: {
      participants: [
        {
          id: 'p1',
          name: '剑客',
          team: 'ally',
          maxHealth: 100,
          currentHealth: 80,
          maxEnergy: 100,
          currentEnergy: 50,
          attributes: {},
        },
        {
          id: 'p2',
          name: '史莱姆',
          team: 'enemy',
          maxHealth: 100,
          currentHealth: 100,
          maxEnergy: 100,
          currentEnergy: 0,
          attributes: {},
        },
      ],
    },
    traceEvents: [
      {
        id: 'e1',
        phase: TracePhase.DAMAGE_CALCULATION,
        correlationId: 'c1',
        timestamp: 500,
        level: 'debug',
        turn: 1,
        sourceId: 'p1',
        targetId: 'p2',
        summary: '造成伤害',
        payload: { action: 'damage', final: 30 },
      },
    ],
    ...overrides,
  }
}

describe('fromRecordedBattle 归一化', () => {
  it('null/undefined 录制返回 null', () => {
    expect(fromRecordedBattle(null)).toBeNull()
    expect(fromRecordedBattle(undefined)).toBeNull()
  })

  it('时基归零 + HP 快照累减 + 缺根事件时合成 battle_start/battle_end', () => {
    const archive = fromRecordedBattle(makeRecord())!
    expect(archive).not.toBeNull()
    expect(archive.battleId).toBe('b1')
    // 时基归零：首事件 timestamp 500 → 0
    const dmgEvent = archive.events.find((e) => e.id === 'e1')!
    expect(dmgEvent.timestamp).toBe(0)
    // 合成根事件：battle_start（timestamp 0）与 battle_end（lastTs+1）
    const phases = archive.events.map((e) => e.phase)
    expect(phases).toContain('battle_lifecycle')
    // HP 快照：p2 受 30 伤害 → 100 → 70
    expect(dmgEvent.snapshot).toEqual({
      participants: [{ id: 'p2', hp: 70 }],
    })
  })

  it('final → result 归一化（检视器取 result 结算）', () => {
    const archive = fromRecordedBattle(makeRecord())!
    const dmg = archive.events.find((e) => e.id === 'e1')!
    expect(dmg.payload.result).toBe(30)
  })

  it('已有 battle_start 时不再合成重复根事件', () => {
    const rec = makeRecord({
      traceEvents: [
        {
          id: 'bs',
          phase: TracePhase.BATTLE_LIFECYCLE,
          correlationId: 'corr_root',
          timestamp: 0,
          level: 'info',
          payload: { action: 'battle_start' },
          summary: '战斗开始',
        },
      ],
    })
    const archive = fromRecordedBattle(rec)!
    const starts = archive.events.filter(
      (e) => e.phase === 'battle_lifecycle' && e.payload.action === 'battle_start',
    )
    expect(starts).toHaveLength(1)
  })
})

describe('loadLatestArchive 来源优先级', () => {
  it('内存录制存在时优先取内存（不访问 IndexedDB）', async () => {
    const battleSystem = {
      getAllBattleRecordings: vi.fn(() => [makeRecord(), makeRecord({ battleId: 'b2' })]),
      getSavedBattleRecordingsList: vi.fn(() => []),
      loadBattleRecording: vi.fn(),
    } as unknown as BattleSystem

    const archive = await loadLatestArchive(battleSystem)
    expect(archive?.battleId).toBe('b2') // 取内存最后一条
    expect(battleSystem.getSavedBattleRecordingsList).not.toHaveBeenCalled()
  })

  it('内存为空时回退 IndexedDB，按 saveKey 尾缀时间戳取最新', async () => {
    const battleSystem = {
      getAllBattleRecordings: vi.fn(() => []),
      getSavedBattleRecordingsList: vi.fn(() => [
        'battle_recording_b1_1000',
        'battle_recording_b2_2000',
      ]),
      loadBattleRecording: vi.fn(async (key: string) =>
        key.includes('b2') ? makeRecord({ battleId: 'b2' }) : null,
      ),
    } as unknown as BattleSystem

    const archive = await loadLatestArchive(battleSystem)
    // 时间戳 2000 更大 → 取 b2
    expect(archive?.battleId).toBe('b2')
  })

  it('内存与 IndexedDB 均空返回 null', async () => {
    const battleSystem = {
      getAllBattleRecordings: vi.fn(() => []),
      getSavedBattleRecordingsList: vi.fn(() => []),
      loadBattleRecording: vi.fn(),
    } as unknown as BattleSystem

    expect(await loadLatestArchive(battleSystem)).toBeNull()
  })
})

describe('listRecordings 排序', () => {
  it('按保存时间倒序（最新的在前）', async () => {
    const battleSystem = {
      getSavedBattleRecordingsList: vi.fn(() => [
        'battle_recording_b1_1000',
        'battle_recording_b2_2000',
      ]),
      loadBattleRecording: vi.fn(async (key: string) =>
        makeRecord({
          battleId: key.includes('b2') ? 'b2' : 'b1',
          startTime: key.includes('b2') ? 2000 : 1000,
        }),
      ),
    } as unknown as BattleSystem

    const metas = await listRecordings(battleSystem)
    expect(metas.map((m) => m.battleId)).toEqual(['b2', 'b1'])
    expect(metas[0].eventCount).toBe(1)
  })
})
