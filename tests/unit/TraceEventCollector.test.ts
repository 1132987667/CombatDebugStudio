/**
 * 文件: TraceEventCollector.test.ts
 * 功能: TraceEventCollector（IDebugTracePort 实现 + 查询能力）单测
 */
import { describe, it, expect } from 'vitest'
import { TraceEventCollector } from '@/domain/battle/logs/TraceEventCollector'
import { createTraceEvent, TracePhase } from '@/shared/types/trace-event'

/** 便捷构建：显式 id + correlationId，支持 turn 等附加字段 */
function ev(
  id: string,
  parentId: string | undefined,
  phase: TracePhase,
  summary: string,
  extra: { turn?: number } = {},
) {
  return createTraceEvent({ id, correlationId: id, phase, summary, parentId, ...extra })
}

describe('TraceEventCollector', () => {
  it('stores and retrieves entries', () => {
    const c = new TraceEventCollector()
    c.emit(ev('t1', undefined, TracePhase.ACTION_EXECUTION, '攻击'))
    c.emit(ev('t2', 't1', TracePhase.DAMAGE_CALCULATION, '基础伤害: 35'))
    c.emit(ev('t3', 't1', TracePhase.DAMAGE_CALCULATION, '未暴击'))

    expect(c.size).toBe(3)
    expect(c.getAll().length).toBe(3)
  })

  it('builds tree from parentId', () => {
    const c = new TraceEventCollector()
    c.emit(ev('root', undefined, TracePhase.ACTION_EXECUTION, '攻击'))
    c.emit(ev('child1', 'root', TracePhase.DAMAGE_CALCULATION, '基础'))
    c.emit(ev('child2', 'root', TracePhase.BUFF_LIFECYCLE, '暴击'))
    c.emit(ev('grandchild', 'child1', TracePhase.BUFF_LIFECYCLE, '细节'))

    const tree = c.getTree('root')
    expect(tree).not.toBeNull()
    expect(tree!.id).toBe('root')
    expect(tree!.children).toHaveLength(2)
    expect(tree!.children![0].id).toBe('child1')
    expect(tree!.children![0].children).toHaveLength(1)
    expect(tree!.children![0].children![0].id).toBe('grandchild')
  })

  it('queries by turn and phase', () => {
    const c = new TraceEventCollector()
    c.emit(ev('a', undefined, TracePhase.DAMAGE_CALCULATION, '伤害', { turn: 1 }))
    c.emit(ev('b', undefined, TracePhase.ACTION_EXECUTION, '行动', { turn: 1 }))
    c.emit(ev('c', undefined, TracePhase.DAMAGE_CALCULATION, '伤害', { turn: 2 }))

    const turn1 = c.query({ turn: 1 })
    expect(turn1).toHaveLength(2)
    expect(turn1.map((e) => e.id).sort()).toEqual(['a', 'b'])

    const dmg = c.query({ phase: TracePhase.DAMAGE_CALCULATION })
    expect(dmg.map((e) => e.id).sort()).toEqual(['a', 'c'])
  })

  it('queries by battleId and actorId', () => {
    const c = new TraceEventCollector()
    c.emit(createTraceEvent({
      id: 'x1', correlationId: 'corr_1', phase: TracePhase.DAMAGE_CALCULATION,
      summary: '', battleId: 'b1', sourceId: 'actor1', targetId: 'actor2',
    }))
    c.emit(createTraceEvent({
      id: 'x2', correlationId: 'corr_2', phase: TracePhase.DAMAGE_CALCULATION,
      summary: '', battleId: 'b2', sourceId: 'actor1',
    }))

    expect(c.query({ battleId: 'b1' }).map((e) => e.id)).toEqual(['x1'])
    expect(c.query({ actorId: 'actor2' }).map((e) => e.id)).toEqual(['x1'])
    expect(c.query({ actorId: 'actor1' }).map((e) => e.id).sort()).toEqual(['x1', 'x2'])
  })

  it('returns empty when a dimension has no matches (does not fall back to all)', () => {
    const c = new TraceEventCollector()
    c.emit(ev('a', undefined, TracePhase.DAMAGE_CALCULATION, '伤害', { turn: 1 }))
    c.emit(ev('b', undefined, TracePhase.BUFF_LIFECYCLE, 'Buff', { turn: 2 }))

    expect(c.query({ turn: 99 })).toEqual([])
    expect(c.query({ phase: 'nonexistent_phase' })).toEqual([])
    expect(c.query({ battleId: 'b_missing' })).toEqual([])
    // 组合维度：turn 有数据但 phase 无匹配 → 空
    expect(c.query({ turn: 1, phase: 'buff_lifecycle' })).toEqual([])
  })

  it('returns roots by turn', () => {
    const c = new TraceEventCollector()
    c.emit(ev('root1', undefined, TracePhase.ACTION_EXECUTION, '攻击', { turn: 1 }))
    c.emit(ev('child', 'root1', TracePhase.DAMAGE_CALCULATION, '基础', { turn: 1 }))
    c.emit(ev('root2', undefined, TracePhase.ACTION_EXECUTION, '技能', { turn: 1 }))

    const roots = c.getRootsByTurn(1)
    expect(roots).toHaveLength(2)
    expect(roots.map((r) => r.id).sort()).toEqual(['root1', 'root2'])
  })

  it('beginScope yields same correlationId with child phases', () => {
    const c = new TraceEventCollector()
    const scope = c.beginScope('corr_1', TracePhase.ACTION_EXECUTION, { battleId: 'b1', turn: 1 })
    const child = scope.child(TracePhase.DAMAGE_CALCULATION)

    expect(scope.correlationId).toBe('corr_1')
    expect(child.correlationId).toBe('corr_1')
    expect(child.phase).toBe(TracePhase.DAMAGE_CALCULATION)
    expect(scope.phase).toBe(TracePhase.ACTION_EXECUTION)
    expect(child.meta?.battleId).toBe('b1')
  })

  it('emit returns id and child scope carries it as parentId (行动→计算 挂接)', () => {
    const c = new TraceEventCollector()
    const base = c.beginScope('corr_1', TracePhase.ACTION_EXECUTION, { battleId: 'b1', turn: 1 })
    expect(base.parentId).toBeUndefined()

    const execId = c.emit(createTraceEvent({
      correlationId: base.correlationId,
      parentId: base.parentId,
      phase: TracePhase.ACTION_EXECUTION,
      battleId: 'b1',
      turn: 1,
      summary: '剑士 执行行动',
    }))
    expect(execId).toBeTruthy()

    const actionScope = base.child(TracePhase.ACTION_EXECUTION, execId)
    expect(actionScope.parentId).toBe(execId)

    const dmgId = c.emit(createTraceEvent({
      correlationId: actionScope.correlationId,
      parentId: actionScope.parentId,
      phase: TracePhase.DAMAGE_CALCULATION,
      battleId: 'b1',
      turn: 1,
      summary: '伤害计算',
    }))
    expect(dmgId).not.toBe(execId)

    // 因果链：DAMAGE_CALCULATION 挂在 ACTION_EXECUTION 下
    const tree = c.getTree(execId)
    expect(tree).not.toBeNull()
    expect(tree!.children?.map((ch) => ch.id)).toEqual([dmgId])
  })

  it('emit never throws on malformed input', () => {
    const c = new TraceEventCollector()
    // 畸形输入不抛异常（文档 §7：调试日志的失败绝不能中断战斗），id 走兜底生成
    expect(() => c.emit({} as never)).not.toThrow()
    expect(c.size).toBe(1)
  })

  it('clears correctly', () => {
    const c = new TraceEventCollector()
    c.emit(ev('a', undefined, TracePhase.ACTION_EXECUTION, '测试'))
    expect(c.size).toBe(1)
    c.clear()
    expect(c.size).toBe(0)
  })

  it('imports/exportAll roundtrip', () => {
    const c = new TraceEventCollector()
    c.emit(ev('x', undefined, TracePhase.ACTION_EXECUTION, '测试'))
    const exported = c.exportAll()
    expect(exported).toHaveLength(1)

    const c2 = new TraceEventCollector()
    c2.importAll(exported)
    expect(c2.size).toBe(1)
    expect(c2.getTree('x')).not.toBeNull()
  })
})
