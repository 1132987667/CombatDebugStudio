import { describe, it, expect, beforeEach } from 'vitest'
import { formatDisplayNumber, COMBAT_PRECISION } from '@/shared/utils/math'
import { processExtraValues } from '@/domain/skill/calculation-utils'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { ModifierStack } from '@/domain/buff/ModifierStack'
import { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { projectSkillLog } from '@/domain/battle/logs/BattleLogProjector'
import { ParticipantSide, type BattleEntity } from '@/domain/battle/type/types'
import { createAllyParticipant } from '@tests/factories/ParticipantFactory'

/**
 * 数值精度口径回归（documents/功能文档/数值精度规范.md）
 * 症状起源：战斗日志出现「119.80000000000001 → 91.80000000000001」——
 * 百分比效果算出的二进制浮点尾数一路进入状态与显示。
 */

/** 小位数（'119.8' → 1；整数 → 0） */
function decimals(n: number): number {
  return (String(n).split('.')[1] ?? '').length
}

describe('formatDisplayNumber — 显示层单源清洗', () => {
  it('消除二进制浮点尾数', () => {
    expect(formatDisplayNumber(119.80000000000001)).toBe('119.8')
    expect(formatDisplayNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatDisplayNumber(1.2 * 100)).toBe('120')
  })

  it('默认不截断真实精度，maxDecimals 才截', () => {
    expect(formatDisplayNumber(119.85)).toBe('119.85')
    expect(formatDisplayNumber(119.856, 2)).toBe('119.86')
    expect(formatDisplayNumber((1 / 3) * 100, 2)).toBe('33.33')
  })

  it('边界值不抛异常：0 / 负数 / 非有限值原样输出', () => {
    expect(formatDisplayNumber(0)).toBe('0')
    expect(formatDisplayNumber(-0.30000000000000004)).toBe('-0.3')
    expect(formatDisplayNumber(Number.MAX_VALUE)).toBe(String(Number.MAX_VALUE))
    expect(formatDisplayNumber(NaN)).toBe('NaN')
    expect(formatDisplayNumber(Infinity)).toBe('Infinity')
  })
})

describe('气血 / 能量状态量量化到 1 位小数', () => {
  beforeEach(() => {
    // 能量增减会发触发器事件，单元测试只需事件总线存在
    BattleParticipantImpl.eventBus = { emit: () => {} } as never
  })

  it('百分比写入气血时尾数不进入状态', () => {
    const p = createAllyParticipant({ id: 'vital_hp' })
    p.setAttribute(ATTRIBUTE_CODE.currentHealth, 119.80000000000001)
    expect(p.currentHealth).toBe(119.8)
  })

  it('能量累加（受击回能多次）不产生尾数', () => {
    const p = createAllyParticipant({ id: 'vital_energy' })
    p.setAttribute(ATTRIBUTE_CODE.currentEnergy, 0)
    for (let i = 0; i < 3; i++) p.gainEnergy(0.1)
    expect(p.currentEnergy).toBe(0.3)
  })

  it('takeDamage / heal 后仍满足精度不变量', () => {
    const p = createAllyParticipant({ id: 'vital_roundtrip' })
    p.setAttribute(ATTRIBUTE_CODE.currentHealth, 1000)
    p.takeDamage(119.80000000000001)
    expect(decimals(p.currentHealth)).toBeLessThanOrEqual(COMBAT_PRECISION)
    p.heal(33.333333)
    expect(decimals(p.currentHealth)).toBeLessThanOrEqual(COMBAT_PRECISION)
  })

  it('最大气血经百分比修饰符重算后不超 1 位小数', () => {
    const p = createAllyParticipant({ id: 'vital_max' })
    const stack = new ModifierStack()
    p.setModifierProvider({
      getModifierStack: () => stack,
      getSourceName: () => null,
      getSourceType: () => null,
    })
    stack.addModifier(
      'buff_precision',
      ATTRIBUTE_CODE.maxHealth,
      20.1333,
      ModifierType.PERCENTAGE,
    )
    p.recalcAll('test')
    // 1000 × 1.201333 = 1201.333 → 量化 1201.3（原实现留 2 位）
    expect(p.maxHealth).toBe(1201.3)
  })
})

describe('processExtraValues — 伤害链尾数在源头掐断', () => {
  it('属性×系数 的结果量化到战斗精度', () => {
    const { total, contributions } = processExtraValues(
      [{ attribute: ATTRIBUTE_CODE.attack, ratio: 0.7986 }],
      () => 24,
    )
    // 24 × 0.7986 = 19.1664 → 19.2
    expect(contributions[0].value).toBe(19.2)
    expect(total).toBe(19.2)
  })

  it('多条加成累加不产生尾数', () => {
    const { total } = processExtraValues(
      [
        { attribute: ATTRIBUTE_CODE.attack, ratio: 1 },
        { attribute: ATTRIBUTE_CODE.defense, ratio: 1 },
      ],
      (attr) => (attr === ATTRIBUTE_CODE.attack ? 0.1 : 0.2),
    )
    expect(total).toBe(0.3)
  })
})

describe('战斗日志文本不含浮点尾数（症状级回归）', () => {
  it('HP 变化箭头按 1 位小数呈现，不出现 119.80000000000001', () => {
    const source = fakeEntity('ally_p1', '孙小圣', ParticipantSide.ALLY)
    const target = fakeEntity('enemy_p1', '桃林守卫', ParticipantSide.ENEMY)
    const { subs } = projectSkillLog(
      {
        type: 'skill',
        source,
        targets: [target],
        skillName: '普通攻击',
        isMiss: false,
        isCrit: false,
        totalDamage: 28,
        totalHeal: 0,
        results: [
          {
            target,
            hpBefore: 119.80000000000001,
            hpAfter: 91.80000000000001,
            damage: 28,
            heal: 0,
            rawDamage: 28,
          },
        ],
      },
      3,
    )
    expect(subs[0].message).toContain('119.8 → 91.8')
    expect(subs[0].message).not.toMatch(/\.\d{6,}/)
  })
})

/** 日志投影只用到 id / name / team / isAlive，用最小替身避开战斗系统装配 */
function fakeEntity(id: string, name: string, team: ParticipantSide): BattleEntity {
  return { id, name, team, isAlive: () => true } as unknown as BattleEntity
}
