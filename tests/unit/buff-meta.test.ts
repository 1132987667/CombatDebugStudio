/**
 * 文件: buff-meta.test.ts
 * 功能: 存档 Buff 元数据反查测试（问题 3：回放 Buff 只有名字没有内容）
 * 覆盖: 按中文名反查正负/属性明细；未知 buff 回退空对象
 */
import { describe, it, expect } from 'vitest'
import { resolveBuffMeta } from '@/shared/utils/buff-meta'

describe('resolveBuffMeta（存档 Buff → 正负/属性明细）', () => {
  it('按中文名反查：减益 buff 标 isNegative 且带属性明细', () => {
    // 破甲打击：guardian_buff_armor_break，defense -20% PERCENTAGE，negative
    const meta = resolveBuffMeta('破甲打击')
    expect(meta.isNegative).toBe(true)
    expect(meta.attributes?.defense).toMatchObject({ value: -20, type: 'PERCENTAGE' })
  })

  it('按 id 反查：正向 buff 不标 isNegative', () => {
    // 复仇怒火：guardian_buff_revenge_rage，attack +5%/层，positive
    const meta = resolveBuffMeta('guardian_buff_revenge_rage')
    expect(meta.isNegative).toBe(false)
    expect(meta.attributes?.attack).toMatchObject({ value: 5, type: 'PERCENTAGE' })
  })

  it('减益控制类：窒息（dot）标 negative', () => {
    const meta = resolveBuffMeta('窒息')
    expect(meta.isNegative).toBe(true)
  })

  it('未知 buff 回退空对象（不抛错）', () => {
    const meta = resolveBuffMeta('不存在的buffxyz')
    expect(meta.isNegative).toBeUndefined()
    expect(meta.attributes).toBeUndefined()
    // 空串同样安全
    expect(resolveBuffMeta('')).toEqual({})
  })

  it('无属性修正的占位 buff（如免疫类）不产出空 attributes', () => {
    const meta = resolveBuffMeta('金刚不坏')
    // 该 buff 无 effects 属性修正 → attributes 应为 undefined
    expect(meta.attributes).toBeUndefined()
  })
})
