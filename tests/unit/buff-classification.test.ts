/**
 * 文件: buff-classification.test.ts
 * 功能: classifyBuff v2 单元测试 — 三个维度严格解耦
 */
import { describe, it, expect } from 'vitest'
import {
  classifyBuff,
  deriveBuffFacets,
  getBuffCategoryBadge,
  BUFF_CATEGORY,
  BUFF_POLARITY,
} from '@/shared/types/buff-classification'

// ==================== deriveBuffFacets ====================

describe('deriveBuffFacets', () => {
  it('detects modifier from attributes', () => {
    const f = deriveBuffFacets({ attributes: { attack: '+10%' } })
    expect(f).toEqual([BUFF_CATEGORY.MODIFIER])
  })

  it('detects trigger from triggers array', () => {
    const f = deriveBuffFacets({ triggers: [{ phase: 'ON_HIT', scriptId: 'x' }] })
    expect(f).toEqual([BUFF_CATEGORY.TRIGGER])
  })

  it('detects aura from aura field', () => {
    const f = deriveBuffFacets({ aura: { targetSelector: 'allies', modifiers: [] } })
    expect(f).toEqual([BUFF_CATEGORY.AURA])
  })

  it('detects shield from shield field', () => {
    const f = deriveBuffFacets({ shield: { valueFormula: 'x' } })
    expect(f).toEqual([BUFF_CATEGORY.SHIELD])
  })

  it('detects control from controlType', () => {
    const f = deriveBuffFacets({ controlType: 'stun' })
    expect(f).toEqual([BUFF_CATEGORY.CONTROL])
  })

  it('detects immunity from immunities array', () => {
    const f = deriveBuffFacets({ immunities: ['stun'] })
    expect(f).toEqual([BUFF_CATEGORY.IMMUNITY])
  })

  it('returns multiple facets for hybrid buff', () => {
    const f = deriveBuffFacets({
      attributes: { attack: '+15%' },
      triggers: [{ phase: 'ON_HIT', scriptId: 'apply_poison' }],
    })
    expect(f).toEqual([BUFF_CATEGORY.MODIFIER, BUFF_CATEGORY.TRIGGER])
  })

  it('does NOT detect dot from tags (tags are game-design category, not facet)', () => {
    const f = deriveBuffFacets({ tags: ['dot', 'debuff'] })
    expect(f).toEqual([BUFF_CATEGORY.OTHER]) // empty config → token/other
  })

  it('returns OTHER for empty config (token buff)', () => {
    const f = deriveBuffFacets({})
    expect(f).toEqual([BUFF_CATEGORY.OTHER])
  })
})

// ==================== classifyBuff ====================

describe('classifyBuff (v2 strict)', () => {
  // --- polarity ---
  it('uses polarity directly for isNegative', () => {
    const r = classifyBuff({ polarity: 'negative' })
    expect(r.isNegative).toBe(true)
    expect(r.polarity).toBe(BUFF_POLARITY.NEGATIVE)
  })

  it('uses polarity positive', () => {
    const r = classifyBuff({ polarity: 'positive' })
    expect(r.isNegative).toBe(false)
    expect(r.polarity).toBe(BUFF_POLARITY.POSITIVE)
  })

  it('polarity takes priority over isDebuff', () => {
    const r = classifyBuff({ polarity: 'positive', isDebuff: true })
    expect(r.isNegative).toBe(false)
  })

  // --- isDebuff fallback ---
  it('falls back to isDebuff for backwards compat', () => {
    const r = classifyBuff({ isDebuff: true })
    expect(r.isNegative).toBe(true)
  })

  // --- category (透传 raw) ---
  it('category passes through from raw config.category', () => {
    const r = classifyBuff({ category: 'aura', aura: { targetSelector: 'allies', modifiers: [] } })
    expect(r.category).toBe(BUFF_CATEGORY.AURA) // 来自 raw category，不是从 facets 猜的
    expect(r.facets).toEqual([BUFF_CATEGORY.AURA])
  })

  it('category falls back to facets[0] when config has no category', () => {
    const r = classifyBuff({ attributes: { attack: '+10%' } })
    expect(r.category).toBe(BUFF_CATEGORY.MODIFIER) // 从 facets[0] 兜底
    expect(r.facets).toEqual([BUFF_CATEGORY.MODIFIER])
  })

  it('category is OTHER for null/undefined', () => {
    expect(classifyBuff(null).category).toBe(BUFF_CATEGORY.OTHER)
    expect(classifyBuff(undefined).category).toBe(BUFF_CATEGORY.OTHER)
  })

  // --- facets 自动派生 ---
  it('derives multiple facets from structure', () => {
    const r = classifyBuff({
      attributes: { attack: '+10%' },
      triggers: [{ phase: 'ON_HIT', scriptId: 'x' }],
    })
    expect(r.facets).toEqual([BUFF_CATEGORY.MODIFIER, BUFF_CATEGORY.TRIGGER])
  })

  // --- polarity 兜底 ---
  it('guesses negative from control facet', () => {
    const r = classifyBuff({ controlType: 'stun' })
    expect(r.isNegative).toBe(true)
  })

  it('v1 compat: raw category string still works for polarity guess', () => {
    const r = classifyBuff({ category: 'dot' })
    expect(r.isNegative).toBe(true)
  })
})

// ==================== getBuffCategoryBadge ====================

describe('getBuffCategoryBadge', () => {
  it('shows single facet label', () => {
    const r = classifyBuff({ attributes: { attack: '+10%' } })
    expect(getBuffCategoryBadge(r)).toBe('属性')
  })

  it('shows multiple facets joined by +', () => {
    const r = classifyBuff({
      attributes: { attack: '+15%' },
      triggers: [{ phase: 'ON_HIT', scriptId: 'apply_poison' }],
    })
    expect(getBuffCategoryBadge(r)).toBe('属性+触发')
  })

  it('shows control prefix for single control facet', () => {
    const r = classifyBuff({ controlType: 'stun' })
    expect(getBuffCategoryBadge(r)).toBe('控制 · 控制')
  })

  it('shows OTHER for empty buff', () => {
    const r = classifyBuff({})
    expect(getBuffCategoryBadge(r)).toBe('其他')
  })
})
