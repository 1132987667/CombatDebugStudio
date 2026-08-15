// @vitest-environment happy-dom
/**
 * playerProfile.test.ts — 玩家属性创建与计算（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 基础+成长计算、加点换算、经验表/封顶、playerStore 展示快照随加点实时反映、
 *       战斗主角数据源（buildBattleTeams/equipBonuses 取玩家实时属性）
 */
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  computePlayerBase,
  computeStatBonuses,
  createPlayerProfile,
  expNeedForLevel,
} from '@/presentation/modules/yanjie/xiyou/data/playerProfile'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { buildBattleTeams, equipBonuses, type XiyouScene } from '@/presentation/modules/yanjie/xiyou/data/mock'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

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

  it('playerStore 展示快照随加点实时反映', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    expect(store.playerAttributes.attack).toBe(store.player.attackMax)
    store.statPoints.strength += 2
    expect(store.playerAttributes.attack).toBe(store.player.attackMax + 2)
    store.statPoints.strength -= 2
    expect(store.playerAttributes.attack).toBe(store.player.attackMax)
  })
})

describe('战斗主角数据源（playerStore → buildBattleTeams / equipBonuses）', () => {
  const scene: XiyouScene = {
    id: 'scene_test',
    regionId: 'aolai',
    name: '测试关',
    desc: '',
    enemies: [{ name: '花妖', level: 1 }],
    unlocked: true,
    difficulty: 'easy',
    stars: 0,
    maxStars: 3,
  }

  it('battleSnapshot 取玩家实时属性，加点加成反映到攻击', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    expect(store.battleSnapshot.attack).toBe(store.player.attackMax)
    store.statPoints.strength += 2
    expect(store.battleSnapshot.attack).toBe(store.player.attackMax + 2)
    store.statPoints.strength -= 2
  })

  it('buildBattleTeams 主角属性取玩家实时值，伙伴保持 playerParty 固定值', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    const { ally } = buildBattleTeams(scene, undefined, store.battleSnapshot)
    // 主角：玩家真实属性（attackMax 20、maxHp 420、critRate 7.5）
    expect(ally[0].getAttribute(ATTRIBUTE_CODE.attack)).toBe(store.player.attackMax)
    expect(ally[0].getAttribute(ATTRIBUTE_CODE.maxHealth)).toBe(store.player.maxHp)
    expect(ally[0].getAttribute(ATTRIBUTE_CODE.critRate)).toBe(store.player.critRate)
    // 伙伴（sun）：playerParty 固定 attack 22，不受玩家属性影响
    expect(ally[1].getAttribute(ATTRIBUTE_CODE.attack)).toBe(22)
  })

  it('buildBattleTeams 缺省 protagonist 回退 playerParty[0] 演示值', () => {
    setActivePinia(createPinia())
    const { ally } = buildBattleTeams(scene)
    expect(ally[0].getAttribute(ATTRIBUTE_CODE.attack)).toBe(18)
  })

  it('equipBonuses percent 以主角快照为基准折算', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    const bonuses = equipBonuses(
      [{ attribute: 'attack', modifierType: 'percent' as const, value: 10 }],
      store.battleSnapshot,
    )
    // round(attackMax 20 × 10%) = 2
    expect(bonuses.attack).toBe(2)
  })
})
