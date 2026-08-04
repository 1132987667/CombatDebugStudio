/**
 * 文件: unified-breakpoint.test.ts
 * 功能: 条件断点判定（checkBreakpointHit）自检测试
 */
import { describe, it, expect } from 'vitest'
import { checkBreakpointHit } from '@/domain/battle/replay/unified/unified-breakpoint'
import { createDemoArchive } from '@/domain/battle/replay/unified/demo-archive'

const DEMO = createDemoArchive()
const ev = (id: string) => DEMO.events.find((e) => e.id === id)!

describe('checkBreakpointHit', () => {
  it('伤害 ≥ 阈值：命中与未命中', () => {
    const ev05 = ev('ev05') // damage result 113
    const ev03 = ev('ev03') // damage result 15
    expect(checkBreakpointHit(ev05, { type: 'damage', value: 50 }, true)).toBe(true)
    expect(checkBreakpointHit(ev03, { type: 'damage', value: 50 }, true)).toBe(false)
  })

  it('级别 / 随机值 / 单位行动', () => {
    const ev05 = ev('ev05')
    const ev18 = ev('ev18') // level warn
    expect(checkBreakpointHit(ev18, { type: 'level', value: 'warn' }, true)).toBe(true)
    expect(checkBreakpointHit(ev05, { type: 'level', value: 'error' }, true)).toBe(false)

    const ev06 = ev('ev06') // rolls hit rate .875 roll .913
    expect(checkBreakpointHit(ev06, { type: 'roll', value: 0.9 }, true)).toBe(true)
    expect(checkBreakpointHit(ev06, { type: 'roll', value: 0.99 }, true)).toBe(false)

    const ev04 = ev('ev04') // action_execution sourceId u1
    expect(checkBreakpointHit(ev04, { type: 'actor', value: 'u1' }, true)).toBe(true)
    expect(checkBreakpointHit(ev04, { type: 'actor', value: 'u2' }, true)).toBe(true) // targetId u2
  })

  it('none / 未 armed / 非法类型恒不命中', () => {
    const ev05 = ev('ev05')
    expect(checkBreakpointHit(ev05, { type: 'none' }, true)).toBe(false)
    expect(checkBreakpointHit(ev05, { type: 'damage', value: 150 }, false)).toBe(false)
    expect(checkBreakpointHit(ev05, { type: 'damage', value: 50 }, true)).toBe(true)
  })
})
