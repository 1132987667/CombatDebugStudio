/**
 * statFilter 纯函数测试
 *
 * 锁定刷装筛选/排序的四条契约：
 *  1. makeStatTarget 按「属性码 + 口径」求和坍缩（同码多条合并，flat/pct 不混）；
 *  2. has/gte/lte 求值边界（缺该属性一律判否，等号取到）；
 *  3. 排序缺值恒排最后（升序不把「没该词条」的顶到最前）+ 多键稳定；
 *  4. 预设读写对脏数据静默降级（localStorage 属外部输入）。
 *
 * 运行: npx vitest run tests/unit/statFilter.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  collectStatOptions,
  filterStatTargets,
  loadStatPresets,
  makeStatTarget,
  matchStatConditions,
  presetKeyOf,
  saveStatPresets,
  sortStatTargets,
  statLabel,
  statValue,
  type StatCondition,
  type StatFilterPreset,
  type StatSortKey,
  type StatTarget,
} from '@/presentation/modules/yanjie/xiyou/statFilter'

/** 造一个目标：rows 传 [属性, 口径, 值] 三元组 */
function target(
  id: string,
  rows: ReadonlyArray<[string, 'flat' | 'percent', number]>,
  opts: { name?: string; quality?: number } = {},
): StatTarget {
  return makeStatTarget({
    id,
    name: opts.name ?? id,
    quality: opts.quality ?? 1,
    rows: rows.map(([attribute, modifierType, value]) => ({ attribute, modifierType, value })),
  })
}

describe('makeStatTarget 求和坍缩', () => {
  it('同「属性码 + 口径」多行求和合并为一条', () => {
    const t = target('g1', [
      ['attack', 'flat', 10],
      ['attack', 'flat', 5],
      ['critRate', 'percent', 3],
    ])
    expect(t.stats).toHaveLength(2)
    expect(statValue(t, 'attack', 'flat')).toBe(15)
  })

  it('同属性不同口径不合并（flat 与 pct 各成一条）', () => {
    const t = target('g2', [
      ['attack', 'flat', 10],
      ['attack', 'percent', 8],
    ])
    expect(t.stats).toHaveLength(2)
    expect(statValue(t, 'attack', 'flat')).toBe(10)
    expect(statValue(t, 'attack', 'pct')).toBe(8)
  })

  it('未知属性返回 undefined；重复属性按首次出现顺序排列', () => {
    const t = target('g3', [
      ['critRate', 'percent', 1],
      ['attack', 'flat', 2],
      ['critRate', 'percent', 1],
    ])
    expect(statValue(t, 'dodge', 'pct')).toBeUndefined()
    expect(t.stats.map((s) => s.attribute)).toEqual(['critRate', 'attack'])
  })
})

describe('matchStatConditions 求值边界', () => {
  const t = target('g', [
    ['attack', 'flat', 100],
    ['critRate', 'percent', 5],
  ])

  it('has 只判存在（值与运算符数值无关）', () => {
    expect(matchStatConditions(t, [{ attribute: 'attack', flavor: 'flat', op: 'has', value: 999 }])).toBe(true)
    expect(matchStatConditions(t, [{ attribute: 'dodge', flavor: 'pct', op: 'has', value: 0 }])).toBe(false)
  })

  it('gte / lte 取等号边界；缺该属性一律判否', () => {
    expect(matchStatConditions(t, [{ attribute: 'attack', flavor: 'flat', op: 'gte', value: 100 }])).toBe(true)
    expect(matchStatConditions(t, [{ attribute: 'attack', flavor: 'flat', op: 'lte', value: 100 }])).toBe(true)
    expect(matchStatConditions(t, [{ attribute: 'attack', flavor: 'flat', op: 'gte', value: 101 }])).toBe(false)
    // 缺该属性时，即使 lte 一个很大的数也判否（不是「默认 0」）
    expect(matchStatConditions(t, [{ attribute: 'dodge', flavor: 'pct', op: 'lte', value: 999 }])).toBe(false)
  })

  it('多条件为 AND；空条件恒成立', () => {
    const both: StatCondition[] = [
      { attribute: 'attack', flavor: 'flat', op: 'gte', value: 50 },
      { attribute: 'critRate', flavor: 'pct', op: 'gte', value: 5 },
    ]
    expect(matchStatConditions(t, both)).toBe(true)
    expect(matchStatConditions(t, [both[0], { ...both[1], value: 6 }])).toBe(false)
    expect(matchStatConditions(t, [])).toBe(true)
  })
})

describe('filterStatTargets', () => {
  it('条件为空返回副本（不返回原数组引用）', () => {
    const list = [target('a', [['attack', 'flat', 1]])]
    const out = filterStatTargets(list, [])
    expect(out).toEqual(list)
    expect(out).not.toBe(list)
  })

  it('按条件保留命中项', () => {
    const list = [
      target('a', [['critRate', 'percent', 10]]),
      target('b', [['critRate', 'percent', 2]]),
    ]
    const out = filterStatTargets(list, [{ attribute: 'critRate', flavor: 'pct', op: 'gte', value: 5 }])
    expect(out.map((t) => t.id)).toEqual(['a'])
  })
})

describe('sortStatTargets', () => {
  const list = [
    target('low', [['attack', 'flat', 10]], { name: '乙', quality: 1 }),
    target('none', [['critRate', 'percent', 1]], { name: '丙', quality: 5 }),
    target('high', [['attack', 'flat', 30]], { name: '甲', quality: 3 }),
  ]
  const byAttackDesc: StatSortKey[] = [{ kind: 'stat', attribute: 'attack', flavor: 'flat', dir: 'desc' }]
  const byAttackAsc: StatSortKey[] = [{ kind: 'stat', attribute: 'attack', flavor: 'flat', dir: 'asc' }]

  it('按属性降序 / 升序排列', () => {
    expect(sortStatTargets(list, byAttackDesc).map((t) => t.id)).toEqual(['high', 'low', 'none'])
    expect(sortStatTargets(list, byAttackAsc).map((t) => t.id)).toEqual(['low', 'high', 'none'])
  })

  it('缺失该属性的实体在升序与降序下都排最后', () => {
    expect(sortStatTargets(list, byAttackAsc).at(-1)?.id).toBe('none')
    expect(sortStatTargets(list, byAttackDesc).at(-1)?.id).toBe('none')
  })

  it('多键排序：主键相等才看次键', () => {
    const rows = [
      target('x', [['attack', 'flat', 10]], { quality: 1 }),
      target('y', [['attack', 'flat', 10]], { quality: 5 }),
      target('z', [['attack', 'flat', 20]], { quality: 1 }),
    ]
    const sorts: StatSortKey[] = [
      { kind: 'stat', attribute: 'attack', flavor: 'flat', dir: 'desc' },
      { kind: 'quality', dir: 'desc' },
    ]
    expect(sortStatTargets(rows, sorts).map((t) => t.id)).toEqual(['z', 'y', 'x'])
  })

  it('稳定：同键保持传入顺序', () => {
    const tie = [
      target('first', [['attack', 'flat', 10]]),
      target('second', [['attack', 'flat', 10]]),
      target('third', [['attack', 'flat', 10]]),
    ]
    expect(sortStatTargets(tie, byAttackDesc).map((t) => t.id)).toEqual(['first', 'second', 'third'])
  })

  it('按名称 / 品质排序，且不改动入参数组', () => {
    const snapshot = list.map((t) => t.id)
    const named = [
      target('n1', [], { name: 'beta' }),
      target('n2', [], { name: 'alpha' }),
      target('n3', [], { name: 'gamma' }),
    ]
    expect(sortStatTargets(named, [{ kind: 'name', dir: 'asc' }]).map((t) => t.id)).toEqual(['n2', 'n1', 'n3'])
    expect(sortStatTargets(list, [{ kind: 'quality', dir: 'desc' }]).map((t) => t.id)).toEqual(['none', 'high', 'low'])
    expect(list.map((t) => t.id)).toEqual(snapshot)
  })

  it('排序键为空返回副本', () => {
    const out = sortStatTargets(list, [])
    expect(out).toEqual(list)
    expect(out).not.toBe(list)
  })
})

describe('collectStatOptions', () => {
  it('按属性字典展示序排列，同属性 flat 在 pct 前；label 带百分比后缀', () => {
    const list = [
      target('a', [
        ['attack', 'flat', 1],
        ['maxHealth', 'flat', 1],
        ['attack', 'percent', 1],
      ]),
      target('b', [['attack', 'flat', 1]]),
    ]
    const options = collectStatOptions(list)
    // maxHealth 在字典中排在 attack 之前
    expect(options.map((o) => o.attribute)).toEqual(['maxHealth', 'attack', 'attack'])
    expect(options.at(-2)?.flavor).toBe('flat')
    expect(options.at(-1)?.flavor).toBe('pct')
    expect(options.at(-1)?.label).toBe(`${statLabel('attack', 'pct')}`)
    expect(options.at(-1)?.label.endsWith('%')).toBe(true)
    // count = 命中该「属性+口径」的实体数
    expect(options.at(-2)?.count).toBe(2)
    expect(options.at(-1)?.count).toBe(1)
  })
})

describe('筛选预设读写', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  /** 安装内存 localStorage 桩（node 环境无原生实现）；seed 写入指定作用域的键 */
  function installLocalStorage(seed?: string, scope = 'gear'): Map<string, string> {
    const store = new Map<string, string>()
    if (seed !== undefined) store.set(presetKeyOf(scope), seed)
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    })
    return store
  }

  afterEach(() => {
    if (originalDescriptor) Object.defineProperty(globalThis, 'localStorage', originalDescriptor)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('存 → 读 往返一致', () => {
    installLocalStorage()
    const preset: StatFilterPreset = {
      name: '暴击流',
      conditions: [{ attribute: 'critRate', flavor: 'pct', op: 'gte', value: 5 }],
      sorts: [{ kind: 'stat', attribute: 'critRate', flavor: 'pct', dir: 'desc' }],
    }
    saveStatPresets('gear', [preset])
    expect(loadStatPresets('gear')).toEqual([preset])
  })

  it('预设按面板作用域分桶：互不可见、互不覆盖', () => {
    installLocalStorage()
    saveStatPresets('gear', [{ name: '暴击流', conditions: [], sorts: [] }])
    expect(loadStatPresets('gear')).toHaveLength(1)
    // 装备预设不该出现在灵宠面板（属性池不同，套用后条件恒不成立）
    expect(loadStatPresets('pet')).toEqual([])
    saveStatPresets('pet', [{ name: '输出流', conditions: [], sorts: [] }])
    expect(loadStatPresets('gear').map((p) => p.name)).toEqual(['暴击流'])
    expect(loadStatPresets('pet').map((p) => p.name)).toEqual(['输出流'])
  })

  it('损坏 JSON / 非数组 / 非法条目 一律降级为空或过滤掉', () => {
    installLocalStorage('{ not json')
    expect(loadStatPresets('gear')).toEqual([])

    installLocalStorage(JSON.stringify({ name: 'x' }))
    expect(loadStatPresets('gear')).toEqual([])

    installLocalStorage(JSON.stringify([{ name: 'ok', conditions: [], sorts: [] }, { name: 1 }, null]))
    expect(loadStatPresets('gear').map((p) => p.name)).toEqual(['ok'])
  })

  it('无 localStorage 时静默降级（不抛异常）', () => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    expect(loadStatPresets('gear')).toEqual([])
    expect(() => saveStatPresets('gear', [{ name: 'x', conditions: [], sorts: [] }])).not.toThrow()
  })
})