import { describe, it, expect } from 'vitest'
import {
  BalancedAIPriorityStrategy,
  DefensiveAIPriorityStrategy,
} from '@/domain/battle/ai/AIPriorityStrategy'
import { createMockEntity } from '@tests/mocks/MockEntity'
import type { BattleEntity, BattleState } from '@/domain/battle/type/types'
import type { Skill } from '@/domain/skill/types'
import { SkillType } from '@/domain/skill/types'
import { ParticipantSide } from '@/domain/battle/type/types'

/** 构造最小可用的技能配置 */
function createSkill(overrides: Partial<Skill>): Skill {
  return {
    id: 'test_skill',
    name: 'Test Skill',
    type: SkillType.SMALL,
    description: '',
    ...overrides,
  } as Skill
}

function createBattleState(
  participants: Map<string, BattleEntity>,
): BattleState {
  return {
    battleId: 'battle-test',
    participants,
    actions: [],
    turnOrder: [],
    currentTurn: 1,
    battleState: 'ongoing' as BattleState['battleState'],
    startTime: 0,
  }
}

describe('AIPriorityStrategy breakdown（§4.3 数值化权重贡献）', () => {
  const strategy = new BalancedAIPriorityStrategy()

  it('基础权重按技能类型给出逐项 breakdown', () => {
    const me = createMockEntity()
    const battleState = createBattleState(
      new Map([[me.id, me]]),
    )
    const skills = [
      createSkill({ id: 's1', type: SkillType.ULTIMATE }),
      createSkill({ id: 's2', type: SkillType.PASSIVE }),
    ]

    const weights = strategy.calculateSkillWeights(battleState, me, skills)

    expect(weights[0].breakdown).toEqual([
      { label: '基础', value: 50 },
      { label: '终结技', value: 30 },
    ])
    // 被动技能权重为 0，且只有"被动"一项
    const passive = weights.find((w) => w.skillId === 's2')!
    expect(passive.weight).toBe(0)
    expect(passive.breakdown).toEqual([{ label: '被动', value: 0 }])
  })

  it('低血量队友场景：治疗技能贡献 +40（验收故事 B 的核心数据）', () => {
    const me = createMockEntity()
    const lowHpAlly = createMockEntity({ currentHealth: 30, maxHealth: 300 })
    const battleState = createBattleState(
      new Map([
        [me.id, me],
        [lowHpAlly.id, lowHpAlly],
      ]),
    )
    const healSkill = createSkill({ id: 'heal', heal: 100 })

    const weights = strategy.calculateSkillWeights(battleState, me, [healSkill])

    expect(weights[0].breakdown).toContainEqual({ label: '低血量队友', value: 40 })
    // 数值守恒：breakdown 各项之和 == weight（基础 50 + 低血量队友 40）
    const sum = weights[0].breakdown.reduce((acc, i) => acc + i.value, 0)
    expect(weights[0].weight).toBe(sum)
    expect(weights[0].reason).toContain('低血量队友+40')
  })

  it('能量不足时贡献 -50 且 reason 反映负值', () => {
    const me = createMockEntity({ currentEnergy: 0, maxEnergy: 100 })
    const battleState = createBattleState(new Map([[me.id, me]]))
    const skill = createSkill({ id: 'costly', energyCost: 80 })

    const weights = strategy.calculateSkillWeights(battleState, me, [skill])

    expect(weights[0].breakdown).toContainEqual({ label: '能量不足', value: -50 })
    expect(weights[0].reason).toContain('能量不足-50')
  })

  it('防御策略覆写：低气血时治疗技能获得（0.5-hp）*100 且并入 breakdown', () => {
    const me = createMockEntity({ currentHealth: 100, maxHealth: 400 })
    const battleState = createBattleState(new Map([[me.id, me]]))
    const healSkill = createSkill({ id: 'heal', heal: 100 })
    const defensive = new DefensiveAIPriorityStrategy()

    const weights = defensive.calculateSkillWeights(battleState, me, [healSkill])

    // healthPercent = 0.25 → 低气血治疗贡献 (0.5-0.25)*100 = 25
    expect(weights[0].breakdown).toContainEqual({ label: '治疗加成', value: 30 })
    expect(weights[0].breakdown).toContainEqual({
      label: '低气血治疗',
      value: 25,
    })
    const sum = weights[0].breakdown.reduce((acc, i) => acc + i.value, 0)
    expect(weights[0].weight).toBe(sum)
  })
})
