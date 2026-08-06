/**
 * refNames 纯函数测试（AGENTS.md：纯逻辑必须留可运行检查）
 *
 * 覆盖：行级索引构建、elements 元素索引、单值/批量翻译、未命中回退、
 *       跨表合并（roles[].roleId → actors+enemies，单表翻译会漏）。
 *
 * 运行: npx vitest run tests/unit/fengshen-refnames.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  buildNameIndex,
  buildElementIndex,
  resolveRefName,
  resolveRefNames,
} from '@/domain/fengshen/refNames'

describe('buildNameIndex', () => {
  it('行级 id→name，name 缺失回退 id，空 id 跳过', () => {
    const index = buildNameIndex([
      { id: 'crane_wing', name: '鹤翼阵' },
      { id: 'growth_balanced' },
      { id: '' },
      { name: '无名' },
    ])
    expect(index['crane_wing']).toBe('鹤翼阵')
    expect(index['growth_balanced']).toBe('growth_balanced')
    expect(index['']).toBeUndefined()
  })

  it('重复 id 后者覆盖（跨表合并前的同 id 约定：guardian_* 在 actors/enemies 名字一致）', () => {
    const index = buildNameIndex([
      { id: 'guardian_fire', name: '火护法' },
      { id: 'guardian_fire', name: '火护法·改' },
    ])
    expect(index['guardian_fire']).toBe('火护法·改')
  })
})

describe('buildElementIndex', () => {
  it('从 elements 文档元素构建（fire→火），行级 id 不参与', () => {
    const doc = {
      id: 'elements',
      elements: [
        { id: 'fire', name: '火' },
        { id: 'metal', name: '金' },
      ],
    }
    const index = buildElementIndex(doc)
    expect(index['fire']).toBe('火')
    expect(index['metal']).toBe('金')
    expect(index['elements']).toBeUndefined()
  })

  it('null / 无元素文档返回空索引', () => {
    expect(buildElementIndex(null)).toEqual({})
    expect(buildElementIndex(undefined)).toEqual({})
    expect(buildElementIndex({ elements: undefined })).toEqual({})
  })
})

describe('resolveRefName / resolveRefNames', () => {
  it('命中返回中文名，未命中回退原 id（调试语义不丢）', () => {
    const index = { crane_wing: '鹤翼阵' }
    expect(resolveRefName('crane_wing', index)).toBe('鹤翼阵')
    expect(resolveRefName('missing_id', index)).toBe('missing_id')
  })

  it('批量翻译顺序保持，逐项回退', () => {
    const index = { skill_a: '花粉迷雾', skill_b: '青藤缠绕' }
    expect(resolveRefNames(['skill_a', 'skill_b', 'skill_c'], index)).toEqual([
      '花粉迷雾',
      '青藤缠绕',
      'skill_c',
    ])
  })

  it('跨表合并索引覆盖 actors+enemies（roles[].roleId 单表翻译会漏 enemy_*）', () => {
    const actors = buildNameIndex([{ id: 'guardian_fire', name: '火护法' }])
    const enemies = buildNameIndex([{ id: 'enemy_007', name: '花妖王' }])
    const merged = { ...actors, ...enemies }
    expect(resolveRefName('guardian_fire', merged)).toBe('火护法')
    expect(resolveRefName('enemy_007', merged)).toBe('花妖王')
  })
})
