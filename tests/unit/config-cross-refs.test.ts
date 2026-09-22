/**
 * config-cross-refs.test.ts — configs 交叉引用一致性回归锁
 *
 * 守住：技能/Buff 配置中所有 buff 引用必须能在 buffs.json ∪ effects.json 中解析。
 * 背景：2026-09-20 测试评估时此状态无回归保护；配置改坏导致的引用断裂会在战斗运行期
 *       以静默跳过（addBuff 返回 ''）或 BuffConfigResolver 抛错形式爆发。
 * 覆盖面：
 *   1. configs/skills/*.json 的 buffId / effectId / applyBuffId 字段与 buffIds 数组
 *   2. configs/buffs/buffs.json 条目内部的跨 buff 引用（排除展示字段）
 *   3. SkillExecutor.ts 源码中单引号字面量引用的 buff id（代码硬编码断链更隐蔽）
 *   4. KNOWN_BUFF_IDS 常量
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import buffsJson from '@configs/buffs/buffs.json'
import effectsJson from '@configs/effects/effects.json'
import { KNOWN_BUFF_IDS } from '@/domain/buff/types'

interface BuffRow { id: string }

/** 兼容顶层数组与 { buffs/effects: [...] } 包裹形式（buffs.json 为前者，effects.json 为后者） */
function asBuffList(raw: unknown): BuffRow[] {
  const value = raw as BuffRow[] | { buffs?: BuffRow[]; effects?: BuffRow[] }
  if (Array.isArray(value)) return value
  return value.buffs ?? value.effects ?? []
}

// NOTE: 可解析域 = buffs.json ∪ effects.json——BuffScriptRegistry 两表合载
// （effects 条目经 effectsEntryToBuffConfig 归一为 buff 配置，如 buff_flower_bloom）
const buffIds = new Set([
  ...asBuffList(buffsJson).map((b) => b.id),
  ...asBuffList(effectsJson).map((e) => e.id),
])

/** 配置目录与源码根：以本文件位置为锚，不依赖 cwd */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

/** 视为"buff 引用"的字段名（递归收集其字符串值） */
const REF_KEYS = new Set(['buffId', 'effectId', 'applyBuffId', 'sourceBuffId'])

/** 递归收集 JSON 对象中所有 buff 引用（字段名驱动，不扫描述文本） */
function collectBuffRefs(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectBuffRefs(item, out)
    return
  }
  if (node === null || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    // 空串是显式"无 buff"哨兵（如 applyBuffId: "" 表示引爆后不转化层数），不构成引用
    if (REF_KEYS.has(key) && typeof value === 'string' && value !== '') out.add(value)
    if (key === 'buffIds' && Array.isArray(value)) {
      for (const v of value) if (typeof v === 'string' && v !== '') out.add(v)
    }
    collectBuffRefs(value, out)
  }
}

/** 断言 refs 全部已注册，返回断链清单（source → ref）供失败时输出可读信息 */
function findBrokenRefs(source: string, refs: Set<string>): string[] {
  const broken: string[] = []
  for (const ref of refs) {
    if (!buffIds.has(ref)) broken.push(`${source} → ${ref}`)
  }
  return broken
}

describe('skills 配置的 buff 引用一致性', () => {
  const skillDir = `${repoRoot}configs/skills`
  const files = readdirSync(skillDir).filter((f) => f.endsWith('.json'))

  it('至少加载到全部技能配置文件（防目录改名导致空跑）', () => {
    expect(files.length).toBeGreaterThanOrEqual(8)
  })

  for (const file of files) {
    it(`${file} 中引用的 buffId 均存在于 buffs.json`, () => {
      const json = JSON.parse(readFileSync(`${skillDir}/${file}`, 'utf8'))
      const refs = new Set<string>()
      collectBuffRefs(json, refs)
      expect(findBrokenRefs(file, refs)).toEqual([])
    })
  }
})

describe('buffs.json 内部跨 buff 引用一致性', () => {
  /** 展示性字段不参与引用收集（描述文本可能提到别的 buff 名但不构成引擎引用） */
  const DISPLAY_KEYS = new Set(['name', 'description', 'conditionLabel', 'effectLines', 'text'])

  function stripDisplay(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(stripDisplay)
    if (node === null || typeof node !== 'object') return node
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (DISPLAY_KEYS.has(key)) continue
      result[key] = stripDisplay(value)
    }
    return result
  }

  it('各 buff 条目引用的 buffId 均已注册', () => {
    const broken: string[] = []
    for (const buff of asBuffList(buffsJson)) {
      const refs = new Set<string>()
      collectBuffRefs(stripDisplay(buff), refs)
      broken.push(...findBrokenRefs(buff.id, refs))
    }
    expect(broken).toEqual([])
  })
})

describe('代码硬编码 buff 引用一致性', () => {
  it("SkillExecutor.ts 单引号字面量 'buff_*' 均存在于 buffs.json", () => {
    const src = readFileSync(
      `${repoRoot}src/domain/skill/SkillExecutor.ts`,
      'utf8',
    )
    // 只匹配代码中的单引号字符串字面量（模板串 `${}` 与注释天然不命中）
    const refs = new Set<string>()
    for (const m of src.matchAll(/'(buff_[A-Za-z0-9_]+)'/g)) refs.add(m[1])
    expect(refs.size).toBeGreaterThan(0)
    expect(findBrokenRefs('SkillExecutor.ts', refs)).toEqual([])
  })

  it('KNOWN_BUFF_IDS 常量均已注册', () => {
    const refs = new Set<string>(Object.values(KNOWN_BUFF_IDS))
    expect(findBrokenRefs('KNOWN_BUFF_IDS', refs)).toEqual([])
  })
})

describe('引用收集器负例（校验逻辑自身的可运行检查）', () => {
  it('能同时收集字段引用与 buffIds 数组，并报告断链', () => {
    const fakeSkill = {
      id: 'skill_fake',
      steps: [
        { type: 'apply_buff', buffId: 'buff_not_exist' },
        { type: 'custom', parameters: { applyBuffId: 'buff_also_missing', buffIds: ['buff_guaranteed_crit', 'buff_nope'] } },
      ],
    }
    const refs = new Set<string>()
    collectBuffRefs(fakeSkill, refs)
    // 真 id 混在其中也会被收集，但断链清单只含不存在的
    expect(refs).toEqual(
      new Set(['buff_not_exist', 'buff_also_missing', 'buff_guaranteed_crit', 'buff_nope']),
    )
    expect(findBrokenRefs('skill_fake', refs)).toEqual([
      'skill_fake → buff_not_exist',
      'skill_fake → buff_also_missing',
      'skill_fake → buff_nope',
    ])
  })

  it('描述字段中的 buff 名不构成引用（buffs 内部扫描不误报）', () => {
    const refs = new Set<string>()
    collectBuffRefs({ description: '引爆 buff_fengshi 层', name: 'x' }, refs)
    expect(refs.size).toBe(0)
  })
})
