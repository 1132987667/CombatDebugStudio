/**
 * 属性权威字典不变量测试
 *
 * 锁定三条契约，防止 attributes.json 或字典单边漂移：
 *  1. 字典覆盖 attributes.json 的每个 code，且不含多余 code；
 *  2. 核心数值属性恰为 64 项（PRD §9）；
 *  3. 层级分布对齐 PRD §9：L1=24 / L2=25 / L3=11 / L4=4。
 *
 * 运行: npx vitest run tests/unit/fengshen-attribute-dictionary.test.ts
 */
import { describe, it, expect } from 'vitest'
import attributesData from '@configs/attributes/attributes.json'
import {
  ATTRIBUTE_DICTIONARY,
  getCoreAttributes,
  getAttributeDict,
} from '@/domain/fengshen/attribute-dictionary'

const jsonCodes = (attributesData as Array<{ code: string }>).map((r) => r.code)

describe('属性权威字典', () => {
  it('与 attributes.json 的 code 集合完全一致（无遗漏、无多余）', () => {
    const dictCodes = ATTRIBUTE_DICTIONARY.map((e) => e.code)
    expect(new Set(dictCodes)).toEqual(new Set(jsonCodes))
    // 每个 code 只登记一次
    expect(dictCodes.length).toBe(new Set(dictCodes).size)
  })

  it('核心数值属性恰为 64 项', () => {
    expect(getCoreAttributes().length).toBe(64)
  })

  it('核心属性层级分布对齐 PRD §9', () => {
    const dist = getCoreAttributes().reduce<Record<string, number>>((a, e) => {
      a[e.tier] = (a[e.tier] || 0) + 1
      return a
    }, {})
    expect(dist).toEqual({ L1: 24, L2: 25, L3: 11, L4: 4 })
  })

  it('六维基础属性按 PRD 命名，且为 L1', () => {
    const six: Record<string, string> = {
      maxHealth: '气血',
      attack: '攻击',
      defense: '防御',
      hitValue: '命中',
      dodgeValue: '闪避',
      speed: '速度',
    }
    for (const [code, name] of Object.entries(six)) {
      const e = getAttributeDict(code)
      expect(e?.name).toBe(name)
      expect(e?.tier).toBe('L1')
      expect(e?.numeric).toBe(true)
    }
  })

  it('运行时与剔除项不进入数值体系（numeric=false）', () => {
    for (const code of ['currentHealth', 'currentEnergy', 'shield', 'maxEnergy', 'damageTakenIncrease']) {
      expect(getAttributeDict(code)?.numeric).toBe(false)
    }
    // 易伤唯一权威归 vulnerability，damageTakenIncrease 归档为重复投放
    expect(getAttributeDict('vulnerability')?.numeric).toBe(true)
    expect(getAttributeDict('damageTakenIncrease')?.category).toBe('重复投放')
  })
})
