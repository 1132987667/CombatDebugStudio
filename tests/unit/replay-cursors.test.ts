/**
 * 回放派生游标等价性测试（P4：昊天镜回放每帧 O(N) → 单调游标增量推进）
 *
 * 契约：游标版（createTurnCursor / createLastEventCursor / createAttrsCursor）与
 * 纯函数版（currentTurnAt / lastEventAt / deriveAttrsAt）在任意 t 序列下结果一致，
 * 包括播放头回退（拖进度条）后的重扫。
 */
import { describe, it, expect } from 'vitest'
import { currentTurnAt, lastEventAt, createTurnCursor, createLastEventCursor } from '@/domain/battle/replay/unified/unified-sim'
import { deriveAttrsAt, createAttrsCursor } from '@/domain/battle/replay/unified/unified-attrs'
import type { UnifiedArchive } from '@/domain/battle/replay/unified/unified-archive'
import type { UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'

let seq = 0
function ev(partial: Partial<UnifiedEvent> & { timestamp: number }): UnifiedEvent {
  return { id: `e${++seq}`, phase: 'turn_flow', ...partial } as UnifiedEvent
}

function makeEvents(): UnifiedEvent[] {
  return [
    ev({ timestamp: 100, payload: { action: 'start' }, turn: 1 }),
    ev({ timestamp: 200, phase: 'attribute_recalc', sourceId: 'p1', payload: { entityId: 'p1', recalc: { attack: 100 } } }),
    ev({ timestamp: 300, payload: { action: 'start' }, turn: 2 }),
    ev({ timestamp: 400, phase: 'attribute_recalc', sourceId: 'p1', payload: { entityId: 'p1', recalc: { attack: 120 } } }),
    ev({ timestamp: 500, payload: { action: 'start' }, turn: 3 }),
  ]
}

function makeArchive(events: UnifiedEvent[]): UnifiedArchive {
  return {
    battleId: 'b1',
    initialState: {
      participants: [
        { id: 'p1', name: 'P1', team: 'ally', maxHp: 100, hp: 100, maxEnergy: 100, energy: 0, attributes: { attack: 50, defense: 30 } },
        { id: 'p2', name: 'P2', team: 'enemy', maxHp: 80, hp: 80, maxEnergy: 100, energy: 0, attributes: { attack: 40 } },
      ],
    },
    events,
  } as unknown as UnifiedArchive
}

/** 随机游走的 t 序列：前进/停顿/回退混合 */
function walkTimes(max: number): number[] {
  const ts = [0]
  let cur = 0
  for (let i = 0; i < 60; i++) {
    cur = Math.max(0, Math.min(max, cur + (Math.floor(Math.random() * 7) - 2) * 50))
    ts.push(cur)
  }
  ts.push(max)
  return ts
}

describe('回放游标与纯函数等价（含回退重扫）', () => {
  it('createTurnCursor ≡ currentTurnAt', () => {
    const evs = makeEvents()
    const cursor = createTurnCursor(evs)
    for (const t of walkTimes(600)) {
      expect(cursor.at(t)).toBe(currentTurnAt(evs, t))
    }
  })

  it('createLastEventCursor ≡ lastEventAt', () => {
    const evs = makeEvents()
    const cursor = createLastEventCursor(evs)
    for (const t of walkTimes(600)) {
      expect(cursor.at(t)).toBe(lastEventAt(evs, t))
    }
  })

  it('createAttrsCursor ≡ deriveAttrsAt（含回退后增量 patch 正确）', () => {
    const evs = makeEvents()
    const archive = makeArchive(evs)
    const cursor = createAttrsCursor(archive, evs)
    for (const t of walkTimes(600)) {
      expect(cursor.at(t)).toEqual(deriveAttrsAt(archive, evs, t))
    }
  })

  it('游标增量推进结果在事件数组更换后重置', () => {
    const evs1 = makeEvents()
    const evs2 = makeEvents() // 新引用（同内容）
    const cursor = createTurnCursor(evs1)
    expect(cursor.at(350)).toBe(2)
    // 换数组（模拟切存档）——游标由调用方重建，这里验证新游标独立
    const cursor2 = createTurnCursor(evs2)
    expect(cursor2.at(150)).toBe(1)
    expect(cursor.at(550)).toBe(3)
  })
})
