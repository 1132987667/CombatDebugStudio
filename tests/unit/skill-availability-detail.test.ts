/**
 * ParticipantSkills.canExecuteSkill 的 detail 字段测试（P2/UI-1）
 * detail 格式约定：冷却用中文+数值，法力用 current/max，控制/沉默用状态名
 */
import { describe, it, expect } from 'vitest'
import { ParticipantSkills } from '@/domain/battle/entity/ParticipantSkills'
import { SkillBlockReason } from '@/domain/battle/type/types'
import type { BuffQuery } from '@/domain/buff/types'
import { SkillType, type SkillConfig, type SkillSet } from '@/domain/skill/types'

function makeSkill(id: string, energyCost = 0): SkillConfig {
  return {
    id,
    name: id,
    description: '',
    energyCost,
    cooldown: 0,
    selector: { faction: 'enemy', strategy: 'first', count: 1 },
    steps: [],
  }
}

function makeBuffQuery(overrides?: Partial<Pick<BuffQuery, 'isCharacterControlled' | 'canUseSkill'>>): BuffQuery {
  return {
    getBuffInstanceIds: () => [],
    hasBuff: () => false,
    hasBuffWithTag: () => false,
    isCharacterControlled: () => false,
    canUseSkill: () => true,
    getShieldValue: () => 0,
    setShieldValue: () => {},
    ...overrides,
  } as BuffQuery
}

function makeSkillSet(skills: SkillConfig[]): SkillSet {
  return { [SkillType.SMALL]: skills, [SkillType.PASSIVE]: [], [SkillType.ULTIMATE]: [] }
}

describe('canExecuteSkill detail', () => {
  it('可用时无 detail', () => {
    const ps = new ParticipantSkills(makeSkillSet([makeSkill('a', 50)]))
    const r = ps.canExecuteSkill('c1', 'a', 50, makeBuffQuery())
    expect(r).toEqual({ can: true, reason: SkillBlockReason.NONE })
    expect(r.detail).toBeUndefined()
  })

  it('被控制 → detail 为状态名', () => {
    const ps = new ParticipantSkills(makeSkillSet([makeSkill('a')]))
    const r = ps.canExecuteSkill('c1', 'a', 100, makeBuffQuery({ isCharacterControlled: () => true }))
    expect(r.can).toBe(false)
    expect(r.reason).toBe(SkillBlockReason.CONTROLLED)
    expect(r.detail).toBe('被控制')
  })

  it('被沉默 → detail 为状态名', () => {
    const ps = new ParticipantSkills(makeSkillSet([makeSkill('a')]))
    const r = ps.canExecuteSkill('c1', 'a', 100, makeBuffQuery({ canUseSkill: () => false }))
    expect(r.reason).toBe(SkillBlockReason.SILENCED)
    expect(r.detail).toBe('被沉默')
  })

  it('冷却中 → detail 含剩余回合数', () => {
    const ps = new ParticipantSkills(makeSkillSet([makeSkill('a')]), new Map([['a', 2]]))
    const r = ps.canExecuteSkill('c1', 'a', 100, makeBuffQuery())
    expect(r.reason).toBe(SkillBlockReason.COOLDOWN)
    expect(r.detail).toBe('还需 2 回合冷却')
  })

  it('法力不足 → detail 为 current/max', () => {
    const ps = new ParticipantSkills(makeSkillSet([makeSkill('a', 50)]))
    const r = ps.canExecuteSkill('c1', 'a', 30, makeBuffQuery())
    expect(r.reason).toBe(SkillBlockReason.ENERGY_SHORT)
    expect(r.detail).toBe('法力 30/50')
  })

  it('边界：法力恰好够 → 可用；冷却为 0 视为无冷却', () => {
    const ps = new ParticipantSkills(
      makeSkillSet([makeSkill('a', 50), makeSkill('b')]),
      new Map([['b', 0]]),
    )
    expect(ps.canExecuteSkill('c1', 'a', 50, makeBuffQuery()).can).toBe(true)
    expect(ps.canExecuteSkill('c1', 'b', 0, makeBuffQuery()).can).toBe(true)
  })

  it('边界：零消耗技能不检查法力', () => {
    const ps = new ParticipantSkills(makeSkillSet([makeSkill('free', 0)]))
    expect(ps.canExecuteSkill('c1', 'free', 0, makeBuffQuery()).can).toBe(true)
  })

  it('控制优先于冷却与法力', () => {
    const ps = new ParticipantSkills(makeSkillSet([makeSkill('a', 50)]), new Map([['a', 3]]))
    const r = ps.canExecuteSkill('c1', 'a', 0, makeBuffQuery({ isCharacterControlled: () => true }))
    expect(r.reason).toBe(SkillBlockReason.CONTROLLED)
  })

  it('多技能冷却互不影响', () => {
    const ps = new ParticipantSkills(
      makeSkillSet([makeSkill('a'), makeSkill('b')]),
      new Map([['a', 3]]),
    )
    expect(ps.canExecuteSkill('c1', 'a', 100, makeBuffQuery()).reason).toBe(SkillBlockReason.COOLDOWN)
    expect(ps.canExecuteSkill('c1', 'b', 100, makeBuffQuery()).can).toBe(true)
  })
})
