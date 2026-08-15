/**
 * Buff 纯文本显示单元测试
 *
 * 覆盖 useBuffDisplay.ts 中的核心纯函数，直接从源文件导入。
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import {
  detectCondition,
  mergeAttributes,
  sortItems,
  formatRemainingTurns,
  getConditionLabel,
  useBuffDisplay,
} from '@/presentation/composables/useBuffDisplay'
import type { BuffRawItem } from '@/shared/types/buff-display'

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

// ============================================================
// 测试用例
// ============================================================

describe('detectCondition', () => {
  it('优先使用 conditionState 字段', () => {
    expect(
      detectCondition({
        conditionState: 'active',
        description: '气血低于40%时',
      } as any),
    ).toEqual({ condition: 'active', conditionLabel: '已激活' })
    expect(
      detectCondition({
        conditionState: 'inactive',
        conditionLabel: '残血',
        description: '残血时触发',
      } as any),
    ).toEqual({ condition: 'inactive', conditionLabel: '残血·未激活' })
    expect(
      detectCondition({
        conditionState: 'inactive',
        description: '残血时触发',
      } as any),
    ).toEqual({ condition: 'inactive', conditionLabel: '未激活' })
  })

  it('无条件时返回 none', () => {
    expect(detectCondition({ description: '普通增益效果' } as any)).toEqual({
      condition: 'none',
    })
  })
})

describe('mergeAttributes', () => {
  it('合并同一属性的多来源', () => {
    const items: BuffTextItemStub[] = [
      {
        name: '强攻',
        type: 'buff',
        condition: 'none',
        remainingTurns: 3,
        stacks: 1,
        modifiers: [
          {
            attribute: '攻击',
            value: 30,
            sourceName: '强攻',
            remainingTurns: 3,
            isPermanent: false,
            stacks: 1,
          },
        ],
      },
      {
        name: '剑意',
        type: 'buff',
        condition: 'permanent',
        remainingTurns: 0,
        stacks: 5,
        modifiers: [
          {
            attribute: '攻击',
            value: 25,
            sourceName: '剑意',
            remainingTurns: 0,
            isPermanent: true,
            stacks: 5,
          },
        ],
      },
    ]
    const result = mergeAttributes(items as any)
    expect(result.find((r) => r.attribute === '攻击')?.totalPercent).toBe(55)
  })

  it('正负抵消', () => {
    const items: BuffTextItemStub[] = [
      {
        name: '强攻',
        type: 'buff',
        condition: 'none',
        remainingTurns: 3,
        stacks: 1,
        modifiers: [
          {
            attribute: '攻击',
            value: 30,
            sourceName: '强攻',
            remainingTurns: 3,
            isPermanent: false,
            stacks: 1,
          },
        ],
      },
      {
        name: '虚弱',
        type: 'debuff',
        condition: 'none',
        remainingTurns: 3,
        stacks: 1,
        modifiers: [
          {
            attribute: '攻击',
            value: -30,
            sourceName: '虚弱',
            remainingTurns: 3,
            isPermanent: false,
            stacks: 1,
          },
        ],
      },
    ]
    const result = mergeAttributes(items as any)
    const atk = result.find((r) => r.attribute === '攻击')
    expect(atk?.totalPercent).toBe(0)
    expect(atk?.isChanged).toBe(false)
  })
})

describe('sortItems', () => {
  const makeItem = (
    name: string,
    type: BuffType,
    condition: ConditionState,
    turns: number,
  ): BuffTextItemStub => ({
    name,
    type,
    condition,
    remainingTurns: turns,
    stacks: 1,
    modifiers: [],
  })

  it('控制排最前', () => {
    const items = [
      makeItem('攻击下降', 'debuff', 'none', 3),
      makeItem('眩晕', 'control', 'none', 1),
    ]
    expect(sortItems(items as any)[0].name).toBe('眩晕')
  })

  it('已激活排前', () => {
    const items = [
      makeItem('残血收割', 'buff', 'inactive', 3),
      makeItem('残血收割', 'buff', 'active', 3),
    ]
    expect(sortItems(items as any)[0].condition).toBe('active')
  })

  it('短回合排前', () => {
    const items = [
      makeItem('强攻', 'buff', 'none', 5),
      makeItem('祝福', 'buff', 'none', 1),
    ]
    expect(sortItems(items as any)[0].name).toBe('祝福')
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

describe('perStack 语义透传', () => {
  const baseItem = (over: Partial<BuffRawItem>): BuffRawItem => ({
    id: 'b1',
    buffId: 'test_buff',
    name: '测试',
    isAura: false,
    ...over,
  })

  it('perStack=true（缺省）按层数缩放', () => {
    const state = useBuffDisplay(
      ref([baseItem({ attributes: { attack: { value: 30, type: 'PERCENTAGE' } }, currentStacks: 3 })]),
      'p1',
    )
    const mod = state.value.items[0].modifiers[0]
    expect(mod.value).toBe(90)
  })

  it('perStack=false 叠层不放大', () => {
    const state = useBuffDisplay(
      ref([
        baseItem({
          attributes: { attack: { value: -30, type: 'PERCENTAGE', perStack: false } },
          currentStacks: 3,
        }),
      ]),
      'p1',
    )
    const mod = state.value.items[0].modifiers[0]
    expect(mod.value).toBe(-30)
  })
})
