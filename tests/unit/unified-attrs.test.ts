/**
 * 文件: unified-attrs.test.ts
 * 功能: 属性快照推演测试（问题 6：角色属性面板只看初始快照）
 * 覆盖: attribute_recalc 事件（真实 after.final 形态 + demo fields 形态）沿时间推演属性
 */
import { describe, it, expect } from 'vitest'
import { createDemoArchive } from '@/domain/battle/replay/unified/demo-archive'
import { buildArchiveIndices } from '@/domain/battle/replay/unified/unified-indices'
import { deriveAttrsAt, extractAttrPatches } from '@/domain/battle/replay/unified/unified-attrs'

const DEMO = createDemoArchive()
const { evs } = buildArchiveIndices(DEMO)

describe('deriveAttrsAt（沿 attribute_recalc 推演当前属性）', () => {
  it('t=0 时点：仅初始快照，未应用任何重算', () => {
    const attrs = deriveAttrsAt(DEMO, evs, 0)
    expect(attrs.get('u1')).toMatchObject({ attack: 65, defense: 20 })
    expect(attrs.get('u2')).toMatchObject({ attack: 58, defense: 32 })
  })

  it('t 在 ev14 之后：u1 的 ATK 已从 65 覆盖为 72（demo fields 形态）', () => {
    const attrs = deriveAttrsAt(DEMO, evs, 2500) // ev14 timestamp=2440
    expect(attrs.get('u1')).toMatchObject({ attack: 72 })
  })

  it('t 在 ev14 之前：仍是初始值 65', () => {
    const attrs = deriveAttrsAt(DEMO, evs, 2000) // ev14 timestamp=2440
    expect(attrs.get('u1')).toMatchObject({ attack: 65 })
  })

  it('不修改初始快照（derive 返回副本）', () => {
    const attrs = deriveAttrsAt(DEMO, evs, 2500)
    expect(attrs.get('u1')?.attack).toBe(72)
    // 初始快照仍为 65
    expect(DEMO.initialState.participants.find((p) => p.id === 'u1')!.attributes!.attack).toBe(65)
  })
})

describe('extractAttrPatches（两种发射形态）', () => {
  it('真实发射端（ParticipantStats）：attribute + after.final', () => {
    const patches = extractAttrPatches({
      id: 'x', phase: 'attribute_recalc', correlationId: 'c', timestamp: 0,
      payload: { attribute: 'speed', after: { base: 10, additive: 5, percent: 1.1, final: 16.5 }, triggeredBy: 'field_effect' },
      summary: '属性重算',
    })
    expect(patches).toEqual([{ code: 'speed', value: 16.5 }])
  })

  it('demo 形态：fields[{k,from,to}] 大写缩写映射小写 code', () => {
    const patches = extractAttrPatches({
      id: 'y', phase: 'attribute_recalc', correlationId: 'c', timestamp: 0,
      payload: { fields: [{ k: 'ATK', from: 65, to: 72 }], reason: 'x' },
      summary: 'x',
    })
    expect(patches).toEqual([{ code: 'attack', value: 72 }])
  })

  it('非 attribute_recalc 事件返回空', () => {
    expect(extractAttrPatches({ id: 'z', phase: 'damage_calculation', correlationId: 'c', timestamp: 0, payload: {}, summary: 'x' })).toEqual([])
  })
})
