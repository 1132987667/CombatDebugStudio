// @vitest-environment happy-dom
/**
 * playerProfile.test.ts — 玩家属性创建与计算（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 基础+成长计算、加点换算、经验表/封顶、mock.ts 展示快照随加点实时反映
 */
import { describe, expect, it } from 'vitest'
import {
  computePlayerBase,
  computeStatBonuses,
  createPlayerProfile,
  expNeedForLevel,
} from '@/presentation/modules/yanjie/games/xiyou/data/playerProfile'
import { player, playerAttributes, statPoints } from '@/presentation/modules/yanjie/games/xiyou/data/mock'

describe('playerProfile 玩家属性创建', () => {
  it('level 5 档位对齐演示数值', () => {
    const p = createPlayerProfile({ level: 5, exp: 360 })
    expect(p.maxHp).toBe(420)
    expect(p.attackMin).toBe(12)
    expect(p.attackMax).toBe(20)
    expect(p.defense).toBe(8)
    expect(p.speed).toBe(15)
    expect(p.maxEnergy).toBe(150)
    expect(p.critRate).toBe(7.5)
    expect(p.hitRate).toBe(90)
    expect(p.dodgeRate).toBe(10)
    expect(p.expNeed).toBe(1500)
    expect(p.hp).toBe(p.maxHp)
  })

  it('level 1 为纯基础属性', () => {
    const b = computePlayerBase(1)
    expect(b.maxHp).toBe(300)
    expect(b.attackMin).toBe(8)
    expect(b.attackMax).toBe(16)
    expect(b.defense).toBe(4)
    expect(b.speed).toBe(11)
  })

  it('加点换算按 statBonuses 计算', () => {
    const bonus = computeStatBonuses({ available: 0, strength: 3, vitality: 2, agility: 1, spirit: 4 })
    expect(bonus.attack).toBe(3)
    expect(bonus.maxHealth).toBe(20)
    expect(bonus.speed).toBe(1)
    expect(bonus.maxEnergy).toBe(20)
  })

  it('createPlayerProfile 满血创建且含加点加成', () => {
    const p = createPlayerProfile({ level: 1, stats: { available: 0, strength: 2, vitality: 0, agility: 0, spirit: 0 } })
    expect(p.attackMin).toBe(10)
    expect(p.attackMax).toBe(18)
  })

  it('经验表缺档封顶', () => {
    expect(expNeedForLevel(1)).toBe(300)
    expect(expNeedForLevel(5)).toBe(1500)
    expect(expNeedForLevel(99)).toBe(Infinity)
  })

  it('mock.ts 展示快照随加点实时反映', () => {
    expect(playerAttributes.value.attack).toBe(player.attackMax)
    statPoints.strength += 2
    expect(playerAttributes.value.attack).toBe(player.attackMax + 2)
    statPoints.strength -= 2
    expect(playerAttributes.value.attack).toBe(player.attackMax)
  })
})
