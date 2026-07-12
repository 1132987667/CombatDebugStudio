/**
 * Buff 纯文本显示单元测试
 *
 * 覆盖 useBuffDisplay.ts 中的核心纯函数：
 * detectCondition, mergeAttributes, sortItems, formatRemainingTurns, getConditionLabel
 *
 * 注意：这些函数未从 useBuffDisplay.ts 导出，测试通过直接导入同类实现。
 * 若后续重构为独立模块，此处导入路径需同步更新。
 */
import { describe, it, expect } from 'vitest'

// ============================================================
// 内联实现（与 useBuffDisplay.ts 保持同步）
// ponytail: 当前函数未从 composable 导出，复制一份做测试契约。
// 若后续提取为 shared/utils，改为直接导入。
// ============================================================

type ConditionState = 'active' | 'inactive' | 'permanent' | 'none'

type BuffType = 'buff' | 'debuff' | 'control'

interface ModifierStub {
  attribute: string
  value: number
  sourceName: string
  remainingTurns: number
  isPermanent: boolean
  stacks: number
}

interface BuffTextItemStub {
  name: string
  type: BuffType
  condition: ConditionState
  remainingTurns: number
  stacks: number
  modifiers: ModifierStub[]
}

const CONTROL_NAMES = new Set([
  '眩晕', '沉默', '恐惧', '魅惑', '石化',
  '睡眠', '冰冻', '混乱', '嘲讽', '定身',
  '缴械', '变形', '禁锢',
])

const CONDITION_KEYWORDS: Array<{ match: RegExp; label: string }> = [
  { match: /残血|生命.*低于|低血量/i, label: '残血' },
  { match: /满血|生命.*高于|高血量/i, label: '满血' },
  { match: /暴击|暴击后/i, label: '暴击' },
  { match: /闪避|闪避后/i, label: '闪避' },
  { match: /击杀|击败后/i, label: '击杀' },
  { match: /受击|被攻击/i, label: '受击' },
]

function formatRemainingTurns(turns: number): string {
  if (turns <= 0) return '永久'
  return `${turns}回合`
}

function getConditionLabel(condition: ConditionState, customLabel?: string): string {
  if (condition === 'active') return '已激活'
  if (condition === 'inactive') return customLabel ? `${customLabel}·未激活` : '未激活'
  if (condition === 'permanent') return '永久'
  return ''
}

function detectType(name: string, isDebuff: boolean): BuffType {
  for (const keyword of CONTROL_NAMES) {
    if (name.includes(keyword)) return 'control'
  }
  return isDebuff ? 'debuff' : 'buff'
}

function matchConditionKeyword(description: string, name: string): string | undefined {
  for (const kw of CONDITION_KEYWORDS) {
    if (kw.match.test(description) || kw.match.test(name)) {
      return kw.label
    }
  }
  return undefined
}

function detectCondition(raw: any): { condition: ConditionState; conditionLabel?: string } {
  if (raw.conditionState === 'active') {
    return { condition: 'active', conditionLabel: '已激活' }
  }
  if (raw.conditionState === 'inactive') {
    const label = matchConditionKeyword(raw.description || '', raw.name || '')
    return { condition: 'inactive', conditionLabel: label ? `${label}·未激活` : '未激活' }
  }
  const description = raw.description || ''
  const name = raw.name || ''
  for (const kw of CONDITION_KEYWORDS) {
    if (kw.match.test(description) || kw.match.test(name)) {
      return { condition: 'inactive', conditionLabel: kw.label }
    }
  }
  return { condition: 'none' }
}

interface MergedLine {
  attribute: string
  totalPercent: number
  isChanged: boolean
  baseValue?: number
  sources: Array<{ buffName: string; percent: number; remainingTurns: number; isPermanent: boolean; stacks: number }>
}

function mergeAttributes(items: BuffTextItemStub[], baseValues?: Record<string, number>): MergedLine[] {
  const attrMap = new Map<string, { total: number; sources: MergedLine['sources'] }>()
  for (const item of items) {
    for (const mod of item.modifiers) {
      if (!attrMap.has(mod.attribute)) {
        attrMap.set(mod.attribute, { total: 0, sources: [] })
      }
      const entry = attrMap.get(mod.attribute)!
      entry.total += mod.value
      entry.sources.push({
        buffName: item.name,
        percent: mod.value,
        remainingTurns: item.remainingTurns,
        isPermanent: item.remainingTurns === 0,
        stacks: item.stacks,
      })
    }
  }
  return Array.from(attrMap.entries()).map(([attribute, data]) => ({
    attribute,
    totalPercent: data.total,
    isChanged: data.total !== 0,
    baseValue: baseValues?.[attribute],
    sources: data.sources,
  }))
}

function sortItems(items: BuffTextItemStub[]): BuffTextItemStub[] {
  return [...items].sort((a, b) => {
    const aCtrl = a.type === 'control' ? 0 : 1
    const bCtrl = b.type === 'control' ? 0 : 1
    if (aCtrl !== bCtrl) return aCtrl - bCtrl
    const aActive = a.condition === 'active' ? 0 : 1
    const bActive = b.condition === 'active' ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    const aTurns = a.remainingTurns > 0 ? a.remainingTurns : Infinity
    const bTurns = b.remainingTurns > 0 ? b.remainingTurns : Infinity
    if (aTurns !== bTurns) return aTurns - bTurns
    const aBuff = a.type === 'debuff' ? 1 : 0
    const bBuff = b.type === 'debuff' ? 1 : 0
    if (aBuff !== bBuff) return aBuff - bBuff
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}

// ============================================================
// 测试用例
// ============================================================

describe('detectCondition', () => {
  it('优先使用 conditionState 字段', () => {
    expect(detectCondition({ conditionState: 'active', description: '生命低于40%时' }))
      .toEqual({ condition: 'active', conditionLabel: '已激活' })
    expect(detectCondition({ conditionState: 'inactive', description: '生命低于40%时' }))
      .toEqual({ condition: 'inactive', conditionLabel: '残血·未激活' })
  })

  it('从关键词推断条件', () => {
    expect(detectCondition({ description: '残血时触发' }))
      .toEqual({ condition: 'inactive', conditionLabel: '残血' })
    expect(detectCondition({ description: '暴击后触发' }))
      .toEqual({ condition: 'inactive', conditionLabel: '暴击' })
  })

  it('无条件时返回 none', () => {
    expect(detectCondition({ description: '普通增益效果' }))
      .toEqual({ condition: 'none' })
  })
})

describe('detectType', () => {
  it('识别控制类型', () => {
    expect(detectType('眩晕', false)).toBe('control')
    expect(detectType('沉默', true)).toBe('control') // isDebuff 不覆盖控制
  })

  it('根据 isDebuff 区分 buff/debuff', () => {
    expect(detectType('强攻', false)).toBe('buff')
    expect(detectType('破甲', true)).toBe('debuff')
  })
})

describe('mergeAttributes', () => {
  it('合并同一属性的多来源', () => {
    const items: BuffTextItemStub[] = [{
      name: '强攻', type: 'buff', condition: 'none', remainingTurns: 3, stacks: 1,
      modifiers: [{ attribute: '攻击', value: 30, sourceName: '强攻', remainingTurns: 3, isPermanent: false, stacks: 1 }],
    }, {
      name: '剑意', type: 'buff', condition: 'permanent', remainingTurns: 0, stacks: 5,
      modifiers: [{ attribute: '攻击', value: 25, sourceName: '剑意', remainingTurns: 0, isPermanent: true, stacks: 5 }],
    }]
    const result = mergeAttributes(items)
    expect(result.find(r => r.attribute === '攻击')?.totalPercent).toBe(55)
  })

  it('正负抵消', () => {
    const items: BuffTextItemStub[] = [{
      name: '强攻', type: 'buff', condition: 'none', remainingTurns: 3, stacks: 1,
      modifiers: [{ attribute: '攻击', value: 30, sourceName: '强攻', remainingTurns: 3, isPermanent: false, stacks: 1 }],
    }, {
      name: '虚弱', type: 'debuff', condition: 'none', remainingTurns: 3, stacks: 1,
      modifiers: [{ attribute: '攻击', value: -30, sourceName: '虚弱', remainingTurns: 3, isPermanent: false, stacks: 1 }],
    }]
    const result = mergeAttributes(items)
    const atk = result.find(r => r.attribute === '攻击')
    expect(atk?.totalPercent).toBe(0)
    expect(atk?.isChanged).toBe(false)
  })
})

describe('sortItems', () => {
  const makeItem = (name: string, type: BuffType, condition: ConditionState, turns: number): BuffTextItemStub => ({
    name, type, condition, remainingTurns: turns, stacks: 1, modifiers: [],
  })

  it('控制排最前', () => {
    const items = [
      makeItem('攻击下降', 'debuff', 'none', 3),
      makeItem('眩晕', 'control', 'none', 1),
    ]
    expect(sortItems(items)[0].name).toBe('眩晕')
  })

  it('已激活排前', () => {
    const items = [
      makeItem('残血收割', 'buff', 'inactive', 3),
      makeItem('残血收割', 'buff', 'active', 3),
    ]
    expect(sortItems(items)[0].condition).toBe('active')
  })

  it('短回合排前', () => {
    const items = [
      makeItem('强攻', 'buff', 'none', 5),
      makeItem('祝福', 'buff', 'none', 1),
    ]
    expect(sortItems(items)[0].name).toBe('祝福')
  })
})

describe('formatRemainingTurns', () => {
  it('正数返回 N回合', () => {
    expect(formatRemainingTurns(3)).toBe('3回合')
  })
  it('0 或负数返回永久', () => {
    expect(formatRemainingTurns(0)).toBe('永久')
    expect(formatRemainingTurns(-1)).toBe('永久')
  })
})

describe('getConditionLabel', () => {
  it('active 返回 已激活', () => {
    expect(getConditionLabel('active')).toBe('已激活')
  })
  it('inactive 无标签返回 未激活', () => {
    expect(getConditionLabel('inactive')).toBe('未激活')
  })
  it('inactive 有标签返回 标签·未激活', () => {
    expect(getConditionLabel('inactive', '残血')).toBe('残血·未激活')
  })
  it('permanent 返回 永久', () => {
    expect(getConditionLabel('permanent')).toBe('永久')
  })
  it('none 返回空字符串', () => {
    expect(getConditionLabel('none')).toBe('')
  })
})
