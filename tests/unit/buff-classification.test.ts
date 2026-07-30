/**
 * 文件: buff-classification.test.ts
 * 功能: classifyBuff v2 单元测试 — 三个维度严格解耦
 */
import { describe, it, expect } from 'vitest'
import {
  classifyBuff,
  deriveBuffFacets,
  getStatusCategoryBadge,
  BuffPolarity,
} from '@/shared/types/buff-classification'
import { StatusCategory } from '@/shared/types/status-meta'

// ==================== deriveBuffFacets ====================

describe('deriveBuffFacets', () => {
  it('detects modifier from attributes', () => {
    const f = deriveBuffFacets({ attributes: { attack: '+10%' } })
    expect(f).toEqual([StatusCategory.MODIFIER])
  })

  it('detects trigger from triggers array', () => {
    const f = deriveBuffFacets({ triggers: [{ phase: 'ON_HIT', scriptId: 'x' }] })
    expect(f).toEqual([StatusCategory.TRIGGER])
  })

  it('detects aura from aura field', () => {
    const f = deriveBuffFacets({ aura: { targetSelector: 'allies', modifiers: [] } })
    expect(f).toEqual([StatusCategory.AURA])
  })

  it('detects shield from shield field', () => {
    const f = deriveBuffFacets({ shield: { valueFormula: 'x' } })
    expect(f).toEqual([StatusCategory.SHIELD])
  })

  it('detects control from controlType', () => {
    const f = deriveBuffFacets({ controlType: 'stun' })
    expect(f).toEqual([StatusCategory.CONTROL])
  })

  it('detects immunity from immunities array', () => {
    const f = deriveBuffFacets({ immunities: ['stun'] })
    expect(f).toEqual([StatusCategory.IMMUNITY])
  })

  it('returns multiple facets for hybrid buff', () => {
    const f = deriveBuffFacets({
      attributes: { attack: '+15%' },
      triggers: [{ phase: 'ON_HIT', scriptId: 'apply_poison' }],
    })
    expect(f).toEqual([StatusCategory.MODIFIER, StatusCategory.TRIGGER])
  })

  it('does NOT detect dot from tags (tags are game-design category, not facet)', () => {
    const f = deriveBuffFacets({ tags: ['dot', 'debuff'] })
    expect(f).toEqual([StatusCategory.OTHER]) // empty config → token/other
  })

  it('returns OTHER for empty config (token buff)', () => {
    const f = deriveBuffFacets({})
    expect(f).toEqual([StatusCategory.OTHER])
  })
})

// ==================== classifyBuff ====================

describe('classifyBuff (v2 strict)', () => {
  // --- polarity ---
  it('uses polarity directly for isNegative', () => {
    const r = classifyBuff({ polarity: 'negative' })
    expect(r.isNegative).toBe(true)
    expect(r.polarity).toBe(BuffPolarity.NEGATIVE)
  })

  it('uses polarity positive', () => {
    const r = classifyBuff({ polarity: 'positive' })
    expect(r.isNegative).toBe(false)
    expect(r.polarity).toBe(BuffPolarity.POSITIVE)
  })

  it('polarity takes priority over isDebuff', () => {
    const r = classifyBuff({ polarity: 'positive', isDebuff: true })
    expect(r.isNegative).toBe(false)
  })

  // --- category (透传 raw) ---
  it('category passes through from raw config.category', () => {
    const r = classifyBuff({ category: 'aura', aura: { targetSelector: 'allies', modifiers: [] } })
    expect(r.category).toBe(StatusCategory.AURA) // 来自 raw category，不是从 facets 猜的
    expect(r.facets).toEqual([StatusCategory.AURA])
  })

  it('category falls back to facets[0] when config has no category', () => {
    const r = classifyBuff({ attributes: { attack: '+10%' } })
    expect(r.category).toBe(StatusCategory.MODIFIER) // 从 facets[0] 兜底
    expect(r.facets).toEqual([StatusCategory.MODIFIER])
  })

  it('category is OTHER for null/undefined', () => {
    expect(classifyBuff(null).category).toBe(StatusCategory.OTHER)
    expect(classifyBuff(undefined).category).toBe(StatusCategory.OTHER)
  })

  // --- facets 自动派生 ---
  it('derives multiple facets from structure', () => {
    const r = classifyBuff({
      attributes: { attack: '+10%' },
      triggers: [{ phase: 'ON_HIT', scriptId: 'x' }],
    })
    expect(r.facets).toEqual([StatusCategory.MODIFIER, StatusCategory.TRIGGER])
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

// ==================== getStatusCategoryBadge ====================

describe('getStatusCategoryBadge', () => {
  it('shows single facet label', () => {
    const r = classifyBuff({ attributes: { attack: '+10%' } })
    expect(getStatusCategoryBadge(r)).toBe('属性')
  })

  it('shows multiple facets joined by +', () => {
    const r = classifyBuff({
      attributes: { attack: '+15%' },
      triggers: [{ phase: 'ON_HIT', scriptId: 'apply_poison' }],
    })
    expect(getStatusCategoryBadge(r)).toBe('属性+触发')
  })

  it('shows control prefix for single control facet', () => {
    const r = classifyBuff({ controlType: 'stun' })
    expect(getStatusCategoryBadge(r)).toBe('控制 · 控制')
  })

  it('shows OTHER for empty buff', () => {
    const r = classifyBuff({})
    expect(getStatusCategoryBadge(r)).toBe('其他')
  })
})
