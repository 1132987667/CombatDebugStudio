/**
 * 文件: live-battle-stream.test.ts
 * 功能: 实时战斗流（LiveBattleStream）自检测试
 */
import { describe, it, expect, vi } from 'vitest'
import { LiveBattleStream, type LiveParticipant } from '@/application/service/LiveBattleStream'
import type { TraceEvent } from '@/shared/types/trace-event'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import { TRACE_EVENT_ADDED } from '@/domain/battle/logs/TraceEventCollector'
import { validateUnified } from '@/domain/battle/replay/unified/unified-validator'
import { buildArchiveIndices } from '@/domain/battle/replay/unified/unified-indices'
import { deriveDebugTree, allNodesFlat } from '@/domain/battle/replay/unified/unified-debug-tree'
import { summarizeBattle } from '@/domain/battle/replay/unified/unified-summary'

/** 伪领域事件总线 */
function makeBus(): IDomainEventBus {
  const handlers = new Map<string, Array<(p?: unknown) => void>>()
  return {
    on: (e, h) => {
      const l = handlers.get(e) ?? []
      l.push(h as (p?: unknown) => void)
      handlers.set(e, l)
    },
    off: (e, h) => {
      const l = handlers.get(e)
      if (!l) return
      const i = l.indexOf(h as (p?: unknown) => void)
      if (i >= 0) l.splice(i, 1)
    },
    emit: (e, p) => {
      for (const h of handlers.get(e) ?? []) h(p)
    },
    clear: () => handlers.clear(),
    offByListenerId: () => {},
  }
}

function mk(id: string, ts: number, phase: TraceEvent['phase'], extra: Partial<TraceEvent> = {}): TraceEvent {
  return { id, correlationId: id, phase, timestamp: ts, level: 'info', payload: {}, summary: id, ...extra }
}

const PARTICIPANTS: LiveParticipant[] = [
  { id: 'u1', name: '剑士', maxHp: 3200, hp: 3200, maxEnergy: 100, energy: 100 },
  { id: 'u2', name: '骷髅', maxHp: 1500, hp: 1500, maxEnergy: 100, energy: 60 },
]

describe('LiveBattleStream', () => {
  it('补捞历史 + 合成根事件 + 观察者快照，结构合法', () => {
    const bus = makeBus()
    const history = [
      mk('h1', 1000, 'action_execution', { sourceId: 'u1', targetId: 'u2', summary: '剑士 攻击' }),
      mk('h2', 1100, 'damage_calculation', { sourceId: 'u1', targetId: 'u2', payload: { result: 120 }, summary: '造成 120 伤害' }),
    ]
    const participants = { value: PARTICIPANTS }
    const stream = new LiveBattleStream({
      eventBus: bus,
      collector: { getAll: () => history },
      getParticipants: () => participants.value,
    })
    stream.start()

    const arch = stream.currentArchive()
    expect(arch.version).toBe('2.0.0')
    expect(arch.events[0].payload.action).toBe('battle_start')
    expect(arch.events[1].id).toBe('h1')
    // 时基归零
    expect(arch.events[1].timestamp).toBe(0)
    expect(arch.events[2].timestamp).toBe(100)
    // 结算事件带观察者快照
    expect(arch.events[2].snapshot?.participants[0]).toEqual({ id: 'u1', hp: 3200, energy: 100 })

    const v = validateUnified(arch)
    expect(v.errors).toEqual([])
  })

  it('实时追加事件并触发 onUpdate；battle_end 收尾', () => {
    const bus = makeBus()
    const onUpdate = vi.fn()
    const onEnd = vi.fn()
    const participants = { value: PARTICIPANTS }
    const stream = new LiveBattleStream({
      eventBus: bus,
      collector: null,
      getParticipants: () => participants.value,
      onUpdate,
      onEnd,
    })
    stream.start()
    expect(onUpdate).not.toHaveBeenCalled()

    // 追加战斗事件
    bus.emit(TRACE_EVENT_ADDED, mk('e1', 2000, 'damage_calculation', { targetId: 'u2', payload: { result: 80 }, summary: '80 伤害' }))
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(stream.currentArchive().events.some((e) => e.id === 'e1')).toBe(true)

    // battle_end 收尾
    bus.emit(TRACE_EVENT_ADDED, mk('e2', 3000, 'battle_lifecycle', { payload: { action: 'battle_end', winner: 'u1' }, summary: '结束' }))
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(stream.isActive()).toBe(false)
    // winner 从 battle_end 事件提取（修复前 currentArchive().winner 恒 undefined，
    // 实时源战报摘要胜方恒"未分胜负"，与实时弹窗/录制路径口径不一致）
    expect(stream.currentArchive().winner).toBe('u1')
    // 战报胜方经统一统计源可见
    expect(summarizeBattle(stream.currentArchive()).winner).toBe('u1')
    // 收尾后再 emit 不再追加
    bus.emit(TRACE_EVENT_ADDED, mk('e3', 3100, 'turn_flow', { summary: '多余' }))
    expect(stream.currentArchive().events.some((e) => e.id === 'e3')).toBe(false)
  })

  it('实时流索引与调试树可用（实时双投影消费同一存档）', () => {
    const bus = makeBus()
    const participants = { value: PARTICIPANTS }
    const stream = new LiveBattleStream({
      eventBus: bus,
      collector: null,
      getParticipants: () => participants.value,
    })
    stream.start()
    bus.emit(TRACE_EVENT_ADDED, mk('a1', 100, 'action_execution', { sourceId: 'u1', targetId: 'u2', summary: '行动' }))
    bus.emit(TRACE_EVENT_ADDED, mk('a2', 200, 'damage_calculation', { sourceId: 'u1', targetId: 'u2', parentId: 'a1', payload: { result: 60 }, summary: '60' }))
    bus.emit(TRACE_EVENT_ADDED, mk('a3', 300, 'turn_flow', { payload: { action: 'start', turn: 1 }, turn: 1, summary: '回合' }))

    const arch = stream.currentArchive()
    const idx = buildArchiveIndices(arch)
    const pname = (id: string): string => id
    const entries = deriveDebugTree(idx.evs, idx.byId, pname)
    const flat = allNodesFlat(entries)
    const covered = new Set(flat.flatMap((n) => n.events.map((e) => e.id)))
    for (const e of idx.evs) expect(covered.has(e.id)).toBe(true)
  })

  it('真实发射形态 turn_flow（TURN_START/TURN_END 枚举值）归一化为 start/end，时间线有回合分组', () => {
    // 真实发射端 BattleSystem 用 TurnFlowAction.TURN_START（值 'TURN_START'），
    // 而 deriveDebugTree/currentTurnAt 按契约 'start'/'end' 建回合——不归一化则
    // 实时时间线建不出回合分组（所有节点平铺顶层，与演示存档不一致）。
    const bus = makeBus()
    const participants = { value: PARTICIPANTS }
    const stream = new LiveBattleStream({
      eventBus: bus,
      collector: null,
      getParticipants: () => participants.value,
    })
    stream.start()
    bus.emit(TRACE_EVENT_ADDED, mk('t0', 0, 'battle_lifecycle', { payload: { action: 'battle_start' }, summary: '开始' }))
    bus.emit(TRACE_EVENT_ADDED, mk('t1', 100, 'turn_flow', { turn: 1, payload: { action: 'TURN_START' }, summary: '回合' }))
    bus.emit(TRACE_EVENT_ADDED, mk('a1', 200, 'action_execution', { sourceId: 'u1', targetId: 'u2', payload: { controlMode: 'ai' }, summary: '行动' }))
    bus.emit(TRACE_EVENT_ADDED, mk('t2', 300, 'turn_flow', { turn: 1, payload: { action: 'TURN_END' }, summary: '结束' }))

    const arch = stream.currentArchive()
    const idx = buildArchiveIndices(arch)
    const entries = deriveDebugTree(idx.evs, idx.byId, (id: string) => id)
    // 归一化后 action 契约一致，回合分组存在且行动节点归属回合内
    const rounds = entries.filter((e) => e.kind === 'round')
    expect(rounds).toHaveLength(1)
    const r1 = rounds[0]
    if (r1.kind !== 'round') throw new Error('expected round')
    expect(r1.nodes.some((n) => n.action)).toBe(true)
  })

  it('真实发射形态（final 而非 result）归一化后战报数值正确', () => {
    // 真实 TraceDamageLogger / HealCalculator 发 final 字段；录制路径由
    // normalizeTraceEvent 归一化，实时流必须同样归一化，否则战报输出/治疗恒为 0。
    const bus = makeBus()
    const participants = { value: PARTICIPANTS }
    const stream = new LiveBattleStream({
      eventBus: bus,
      collector: null,
      getParticipants: () => participants.value,
    })
    stream.start()
    bus.emit(TRACE_EVENT_ADDED, mk('d1', 100, 'action_execution', { sourceId: 'u1', summary: '行动' }))
    bus.emit(TRACE_EVENT_ADDED, mk('d2', 200, 'damage_calculation', {
      sourceId: 'u1', targetId: 'u2',
      payload: { final: 120, crit: { rate: 0.3, multiplier: 1.5, triggered: true } },
      summary: '暴击 120',
    }))
    bus.emit(TRACE_EVENT_ADDED, mk('h1', 300, 'heal_calculation', {
      sourceId: 'u1', targetId: 'u1',
      payload: { final: 30, skillName: '治疗术' },
      summary: '治疗 30',
    }))

    const sum = summarizeBattle(stream.currentArchive())
    // final → result 归一化：输出/治疗/最高单次可信
    expect(sum.units.u1.dealt).toBe(120)
    expect(sum.units.u1.healed).toBe(30)
    expect(sum.units.u2.taken).toBe(120)
    expect(sum.units.u1.highestHit).toBe(120)
    expect(sum.judgment.crits).toBe(1)
    expect(sum.judgment.hits).toBe(1)
    // 技能表：damage 120、治疗术 heal 30 均从归一化 result 派生
    const dmgSkill = sum.skills.find((s) => s.damage > 0)!
    expect(dmgSkill.damage).toBe(120)
    const healSkill = sum.skills.find((s) => s.skillName === '治疗术')!
    expect(healSkill.heal).toBe(30)
  })
})
