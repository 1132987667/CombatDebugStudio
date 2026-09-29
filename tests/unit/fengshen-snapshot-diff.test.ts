/**
 * snapshot-diff 纯函数单测（B2 交付闭环：快照对比 / 包 diff / 漂移检查共用口径）
 *
 * 运行: npx vitest run tests/unit/fengshen-snapshot-diff.test.ts
 */
import { describe, it, expect } from 'vitest'
import { diffTableSets, type TableRows } from '@/domain/fengshen/snapshot-diff'

const rows = (entries: Record<string, unknown>): TableRows => entries as TableRows

describe('diffTableSets 表集差异', () => {
  it('新增 / 删除 / 变更三类齐全', () => {
    const before = {
      params: rows({
        a: { id: 'a', value: 1 },
        b: { id: 'b', value: 2 },
        c: { id: 'c', value: 3 },
      }),
    }
    const after = {
      params: rows({
        a: { id: 'a', value: 10 },
        c: { id: 'c', value: 3 },
        d: { id: 'd', value: 4 },
      }),
    }
    const result = diffTableSets(before, after)
    expect(result.added).toEqual([{ table: 'params', id: 'd' }])
    expect(result.removed).toEqual([{ table: 'params', id: 'b' }])
    expect(result.changed).toHaveLength(1)
    expect(result.changed[0]).toMatchObject({ table: 'params', id: 'a', field: 'value', before: 1, after: 10 })
  })

  it('updatedAt 是存储时间戳，不参与比较', () => {
    const before = { params: rows({ a: { id: 'a', value: 1, updatedAt: '2026-01-01' } }) }
    const after = { params: rows({ a: { id: 'a', value: 1, updatedAt: '2026-09-29' } }) }
    expect(diffTableSets(before, after).changed).toHaveLength(0)
  })

  it('deltaPercent：数值字段算百分比，before=0 或非数值为 null', () => {
    const before = {
      params: rows({
        grow: { id: 'grow', value: 100 },
        zero: { id: 'zero', value: 0 },
        label: { id: 'label', name: '甲' },
      }),
    }
    const after = {
      params: rows({
        grow: { id: 'grow', value: 108 },
        zero: { id: 'zero', value: 5 },
        label: { id: 'label', name: '乙' },
      }),
    }
    const changed = diffTableSets(before, after).changed
    const byId = new Map(changed.map((c) => [c.id, c]))
    expect(byId.get('grow')?.deltaPercent).toBeCloseTo(8, 10)
    expect(byId.get('zero')?.deltaPercent).toBeNull()
    expect(byId.get('label')?.deltaPercent).toBeNull()
    expect(byId.get('label')).toMatchObject({ field: 'name', before: '甲', after: '乙' })
  })

  it('负增长输出负百分比', () => {
    const result = diffTableSets(
      { params: rows({ a: { id: 'a', value: 200 } }) },
      { params: rows({ a: { id: 'a', value: 150 } }) },
    )
    expect(result.changed[0]?.deltaPercent).toBeCloseTo(-25, 10)
  })

  it('对象 / 数组字段按内容比较（JSON 口径）', () => {
    const result = diffTableSets(
      { params: rows({ a: { id: 'a', data: { buy: 200 } } }) },
      { params: rows({ a: { id: 'a', data: { buy: 200 } } }) },
    )
    expect(result.changed).toHaveLength(0)
    const changed = diffTableSets(
      { params: rows({ a: { id: 'a', data: { buy: 200 } } }) },
      { params: rows({ a: { id: 'a', data: { buy: 180 } } }) },
    )
    expect(changed.changed).toHaveLength(1)
    expect(changed.changed[0]?.deltaPercent).toBeNull() // 非数值（对象）字段不算百分比
  })

  it('跨表行按表名字典序稳定排序', () => {
    const before = {
      skills: rows({ s2: { id: 's2', v: 1 } }),
      params: rows({ p1: { id: 'p1', v: 1 } }),
    }
    const after = {
      params: rows({ p1: { id: 'p1', v: 2 } }),
      buffs: rows({ b9: { id: 'b9', v: 1 }, b1: { id: 'b1', v: 1 } }),
    }
    const result = diffTableSets(before, after)
    expect(result.added.map((r) => `${r.table}/${r.id}`)).toEqual(['buffs/b1', 'buffs/b9'])
    expect(result.removed.map((r) => `${r.table}/${r.id}`)).toEqual(['skills/s2'])
    expect(result.changed.map((r) => `${r.table}/${r.id}/${r.field}`)).toEqual(['params/p1/v'])
  })

  it('两边同表但字段集合不一致：只报差异字段，不误报全字段', () => {
    const result = diffTableSets(
      { params: rows({ a: { id: 'a', v: 1 } }) },
      { params: rows({ a: { id: 'a', v: 1, extra: 'x' } }) },
    )
    expect(result.changed).toHaveLength(1)
    expect(result.changed[0]).toMatchObject({ field: 'extra', before: undefined, after: 'x' })
  })

  it('空输入输出空结果', () => {
    expect(diffTableSets({}, {})).toEqual({ added: [], removed: [], changed: [] })
  })
})
