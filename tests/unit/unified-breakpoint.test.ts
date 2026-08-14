/**
 * 文件: unified-breakpoint.test.ts
 * 功能: 条件断点判定（checkBreakpointHit / checkAnyBreakpointHit）自检测试
 */
import { describe, it, expect } from 'vitest'
import {
  checkBreakpointHit,
  checkAnyBreakpointHit,
  findHitBreakpoints,
  type BreakpointConfig,
} from '@/domain/battle/replay/unified/unified-breakpoint'
import { createDemoArchive } from '@/domain/battle/replay/unified/demo-archive'

const DEMO = createDemoArchive()
const ev = (id: string) => DEMO.events.find((e) => e.id === id)!

const bp = (type: BreakpointConfig['type'], value?: number | string, enabled = true): BreakpointConfig => ({
  id: 't',
  type,
  value,
  enabled,
})

describe('checkBreakpointHit', () => {
  it('伤害 ≥ 阈值：命中与未命中', () => {
    const ev05 = ev('ev05') // damage result 113
    const ev03 = ev('ev03') // damage result 15
    expect(checkBreakpointHit(ev05, bp('damage', 50))).toBe(true)
    expect(checkBreakpointHit(ev03, bp('damage', 50))).toBe(false)
  })

  it('级别 / 随机值 / 单位行动', () => {
    const ev05 = ev('ev05')
    const ev18 = ev('ev18') // level warn
    expect(checkBreakpointHit(ev18, bp('level', 'warn'))).toBe(true)
    expect(checkBreakpointHit(ev05, bp('level', 'error'))).toBe(false)

    const ev06 = ev('ev06') // rolls hit rate .875 roll .913
    expect(checkBreakpointHit(ev06, bp('roll', 0.9))).toBe(true)
    expect(checkBreakpointHit(ev06, bp('roll', 0.99))).toBe(false)

    const ev04 = ev('ev04') // action_execution sourceId u1
    expect(checkBreakpointHit(ev04, bp('actor', 'u1'))).toBe(true)
    expect(checkBreakpointHit(ev04, bp('actor', 'u2'))).toBe(true) // targetId u2
  })

  it('none / 未启用 / 非法类型恒不命中', () => {
    const ev05 = ev('ev05')
    expect(checkBreakpointHit(ev05, bp('none'))).toBe(false)
    expect(checkBreakpointHit(ev05, bp('damage', 50, false))).toBe(false)
    expect(checkBreakpointHit(ev05, bp('damage', 50))).toBe(true)
  })
})

describe('checkAnyBreakpointHit（多断点列表）', () => {
  it('命中任一启用断点即返回 true', () => {
    const ev05 = ev('ev05') // damage result 113
    const list = [bp('level', 'error'), bp('damage', 50), bp('actor', 'ghost', false)]
    expect(checkAnyBreakpointHit(ev05, list)).toBe(true)
  })

  it('全部停用 / 空列表恒不命中', () => {
    const ev05 = ev('ev05')
    expect(checkAnyBreakpointHit(ev05, [bp('damage', 50, false), bp('level', 'warn', false)])).toBe(false)
    expect(checkAnyBreakpointHit(ev05, [])).toBe(false)
  })
})

describe('findHitBreakpoints（watch 模式：命中计数与暂停判定的数据源）', () => {
  it('返回所有命中断点，watch 与非 watch 都计入', () => {
    const ev05 = ev('ev05') // damage result 113
    const list = [
      { ...bp('damage', 50), id: 'a', watch: true },
      { ...bp('damage', 200), id: 'b', watch: false },
      { ...bp('level', 'error'), id: 'c', watch: true },
    ]
    expect(findHitBreakpoints(ev05, list).map((h) => h.id)).toEqual(['a'])
  })

  it('watch 不影响命中判定；未启用 / none 仍不命中', () => {
    const ev05 = ev('ev05')
    const list = [
      { ...bp('damage', 50), id: 'a', watch: true },
      { ...bp('damage', 50), id: 'b', watch: false, enabled: false },
      { ...bp('none'), id: 'c', watch: true },
    ]
    expect(findHitBreakpoints(ev05, list).map((h) => h.id)).toEqual(['a'])
  })
})
