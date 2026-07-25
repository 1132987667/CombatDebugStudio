/**
 * 文件: TraceLogCollector.test.ts
 */
import { describe, it, expect } from 'vitest'
import { TraceLogCollector } from '@/domain/battle/logs/TraceLogCollector'
import { createTraceLogEntry } from '@/shared/types/trace-log'

describe('TraceLogCollector', () => {
  it('stores and retrieves entries', () => {
    const c = new TraceLogCollector()
    c.add(createTraceLogEntry('t1', undefined, 'attack', 0, '攻击', 0))
    c.add(createTraceLogEntry('t2', 't1', 'base', 35, '基础伤害: 35', 1))
    c.add(createTraceLogEntry('t3', 't1', 'crit', 0, '未暴击', 1))

    expect(c.size).toBe(3)
    expect(c.getAll().length).toBe(3)
  })

  it('builds tree from parentTraceId', () => {
    const c = new TraceLogCollector()
    c.add(createTraceLogEntry('root', undefined, 'attack', 0, '攻击', 0))
    c.add(createTraceLogEntry('child1', 'root', 'base', 35, '基础', 1))
    c.add(createTraceLogEntry('child2', 'root', 'crit', 0, '暴击', 1))
    c.add(createTraceLogEntry('grandchild', 'child1', 'detail', 10, '细节', 2))

    const tree = c.getTree('root')
    expect(tree).not.toBeNull()
    expect(tree!.traceId).toBe('root')
    expect(tree!.children).toHaveLength(2)
    expect(tree!.children![0].traceId).toBe('child1')
    expect(tree!.children![0].children).toHaveLength(1)
    expect(tree!.children![0].children![0].traceId).toBe('grandchild')
  })

  it('queries by turn', () => {
    const c = new TraceLogCollector()
    c.add({ ...createTraceLogEntry('a', undefined, 'step1', 0, '', 0), turn: 1 })
    c.add({ ...createTraceLogEntry('b', undefined, 'step2', 0, '', 0), turn: 1 })
    c.add({ ...createTraceLogEntry('c', undefined, 'step3', 0, '', 0), turn: 2 })

    const turn1 = c.query({ turn: 1 })
    expect(turn1).toHaveLength(2)
    expect(turn1.map((e) => e.traceId).sort()).toEqual(['a', 'b'])
  })

  it('returns roots by turn', () => {
    const c = new TraceLogCollector()
    c.add({ ...createTraceLogEntry('root1', undefined, 'attack', 0, '', 0), turn: 1 })
    c.add({ ...createTraceLogEntry('child', 'root1', 'base', 0, '', 1), turn: 1 })
    c.add({ ...createTraceLogEntry('root2', undefined, 'skill', 0, '', 0), turn: 1 })

    const roots = c.getRootsByTurn(1)
    expect(roots).toHaveLength(2)
    expect(roots.map((r) => r.traceId).sort()).toEqual(['root1', 'root2'])
  })

  it('clears correctly', () => {
    const c = new TraceLogCollector()
    c.add(createTraceLogEntry('a', undefined, 'test', 0, '', 0))
    expect(c.size).toBe(1)
    c.clear()
    expect(c.size).toBe(0)
  })

  it('imports/exportAll roundtrip', () => {
    const c = new TraceLogCollector()
    c.add(createTraceLogEntry('x', undefined, 'test', 0, '', 0))
    const exported = c.exportAll()
    expect(exported).toHaveLength(1)

    const c2 = new TraceLogCollector()
    c2.importAll(exported)
    expect(c2.size).toBe(1)
    expect(c2.getTree('x')).not.toBeNull()
  })
})
