// @vitest-environment happy-dom
/**
 * playerProfile.test.ts — 玩家属性创建与计算（AGENTS.md：非琐碎逻辑留可运行检查）
 * 覆盖: 基础+成长计算、加点换算、经验表/封顶、playerStore 展示快照随加点实时反映、
 *       战斗主角数据源（buildBattleTeams/equipBonuses 取玩家实时属性）
 */
import { describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  BREAK_NODES,
  breakNodeLabel,
  computePlayerBase,
  computeStatBonuses,
  createPlayerProfile,
  expNeedForLevel,
  isBreakBlocked,
  nextBreakNode,
} from '@/presentation/modules/yanjie/xiyou/playerProfile'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { buildBattleTeams, equipBonuses, xianyuanForEnemyIds } from '@/presentation/modules/yanjie/xiyou/battle'
import { mates } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import type { XiyouScene } from '@/presentation/modules/yanjie/xiyou/types'
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

  it('突破节点表（§20）：五阶 10/20/30/40/50 级，丹与阶位金钱对应', () => {
    expect(BREAK_NODES.map((n) => n.level)).toEqual([10, 20, 30, 40, 50])
    expect(BREAK_NODES.map((n) => n.money)).toEqual([500, 1000, 2000, 4000, 8000])
    expect(BREAK_NODES.map((n) => n.pillId)).toEqual([
      'break_pill_1',
      'break_pill_2',
      'break_pill_3',
      'break_pill_4',
      'break_pill_5',
    ])
    expect(nextBreakNode(0)?.stage).toBe(1)
    expect(nextBreakNode(4)?.stage).toBe(5)
    expect(nextBreakNode(5)).toBeNull()
    expect(breakNodeLabel(1)).toBe('壹')
    expect(breakNodeLabel(5)).toBe('伍')
  })

  it('突破卡级判定：10 的倍数级需对应阶次，其余等级畅通', () => {
    expect(isBreakBlocked(10, 0)).toBe(true)
    expect(isBreakBlocked(10, 1)).toBe(false)
    expect(isBreakBlocked(11, 1)).toBe(false)
    expect(isBreakBlocked(19, 1)).toBe(false)
    expect(isBreakBlocked(20, 1)).toBe(true)
    expect(isBreakBlocked(20, 2)).toBe(false)
    expect(isBreakBlocked(50, 4)).toBe(true)
    expect(isBreakBlocked(50, 5)).toBe(false)
    expect(isBreakBlocked(51, 5)).toBe(false)
    expect(isBreakBlocked(30, 0)).toBe(true)
  })

  it('profile 快照带突破阶次（缺省 0，升级链透传不被重置）', () => {
    expect(createPlayerProfile({ level: 5 }).breakStage).toBe(0)
    expect(createPlayerProfile({ level: 25, breakStage: 2 }).breakStage).toBe(2)
  })

  it('加点换算按 statBonuses 计算（SAP 六维：1 点 = 12 气血 = 2 攻 = 2 速度）', () => {
    const bonus = computeStatBonuses({ available: 0, hp: 2, atk: 3, def: 0, hit: 0, dodge: 0, speed: 1 })
    expect(bonus.attack).toBe(6)
    expect(bonus.maxHealth).toBe(24)
    expect(bonus.speed).toBe(2)
  })

  it('createPlayerProfile 满血创建且含加点加成', () => {
    const p = createPlayerProfile({ level: 1, stats: { available: 0, hp: 0, atk: 2, def: 0, hit: 0, dodge: 0, speed: 0 } })
    // 2 点 × 2 攻/点 = +4
    expect(p.attackMin).toBe(12)
    expect(p.attackMax).toBe(20)
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
    store.statPoints.atk += 2
    // 2 点 × 2 攻/点 = +4
    expect(store.playerAttributes.attack).toBe(store.player.attackMax + 4)
    store.statPoints.atk -= 2
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
    store.statPoints.atk += 2
    expect(store.battleSnapshot.attack).toBe(store.player.attackMax + 4)
    store.statPoints.atk -= 2
  })

  it('buildBattleTeams 主角属性取玩家实时值，默认阵容 = 主角 + mate.json 默认上阵伙伴', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    const { ally } = buildBattleTeams(scene, undefined, store.battleSnapshot)
    // mate.json 前 3 名伙伴默认上阵（新档即 4v4，兜住 1v4 开局），主角在首位
    expect(ally).toHaveLength(4)
    expect(ally[0].getAttribute(ATTRIBUTE_CODE.attack)).toBe(store.player.attackMax)
    expect(ally[0].getAttribute(ATTRIBUTE_CODE.maxHealth)).toBe(store.player.maxHp)
    expect(ally[0].getAttribute(ATTRIBUTE_CODE.critRate)).toBe(store.player.critRate)
    // 伙伴按 mate.json stats × 等级成长系数派生（孙小圣 lv5：230 × 1.6 = 368）
    const mate = mates.find((m) => m.name === '孙小圣')!
    expect(mate.active).toBe(true)
    expect(ally[1].getAttribute(ATTRIBUTE_CODE.maxHealth)).toBe(368)
    // 下阵后收缩（伙伴面板上阵交互；此处直改运行时验证编队链路）
    mate.active = false
    const { ally: withoutMate } = buildBattleTeams(scene, undefined, store.battleSnapshot)
    expect(withoutMate).toHaveLength(3)
    mate.active = true
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

  it('equipBonuses isPercentage 词条按百分点直接相加（dodge/critDamage/hit 不静默失效）', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    const bonuses = equipBonuses(
      [
        { attribute: 'dodge', modifierType: 'percent' as const, value: 6 },
        { attribute: 'critDamage', modifierType: 'percent' as const, value: 15 },
        { attribute: 'hit', modifierType: 'percent' as const, value: 8 },
      ],
      store.battleSnapshot,
    )
    // isPercentage 属性 value 即百分点，直接相加；此前按 baseByAttr（无 dodge/critDamage/hit）恒算 0
    expect(bonuses.dodge).toBe(6)
    expect(bonuses.critDamage).toBe(15)
    expect(bonuses.hit).toBe(8)
  })

  it('buildBattleTeams 全量注入装备加成（含 dodge/critDamage/hit 等词条属性）', () => {
    setActivePinia(createPinia())
    const store = usePlayerStore()
    const { ally } = buildBattleTeams(
      scene,
      { dodge: 6, critDamage: 15, hit: 8, attack: 2 },
      store.battleSnapshot,
    )
    const hero = ally[0]
    // 主角基础 dodge 10 + 6 = 16；critDamage 125 + 15 = 140；hit 90 + 8 = 98
    expect(hero.getAttribute(ATTRIBUTE_CODE.dodge)).toBe(store.battleSnapshot.dodge + 6)
    expect(hero.getAttribute(ATTRIBUTE_CODE.critDamage)).toBe(store.battleSnapshot.critDamage + 15)
    expect(hero.getAttribute(ATTRIBUTE_CODE.hit)).toBe(store.player.hitRate + 8)
    expect(hero.getAttribute(ATTRIBUTE_CODE.attack)).toBe(store.player.attackMax + 2)
  })
})

describe('xianyuanForEnemyIds 战胜仙缘聚合（完整项目说明 §10.1）', () => {
  it('按敌人分级聚合：小妖 2 / 妖徒 10 / 妖魁·妖王 50 / 妖尊 150', () => {
    expect(xianyuanForEnemyIds(['enemy_s1_1_a'])).toBe(2) // xiaoyao 花妖幼芽
    expect(xianyuanForEnemyIds(['enemy_s1_1_g'])).toBe(10) // yaotu 桃林守卫
    expect(xianyuanForEnemyIds(['boss_minor_taoyao'])).toBe(50) // yaokui
    expect(xianyuanForEnemyIds(['boss_major_huayaowang'])).toBe(50) // yaowang
    expect(xianyuanForEnemyIds(['boss_achieve_huayaowang'])).toBe(150) // yaozun
  })

  it('多敌节点求和；未知 id 与未知分级兜底 0', () => {
    // 普通节点（3 小妖 + 1 妖徒）≈ §10.1 校验口径 16
    expect(xianyuanForEnemyIds(['enemy_s1_1_a', 'enemy_s1_1_a', 'enemy_s1_1_a', 'enemy_s1_1_g'])).toBe(16)
    expect(xianyuanForEnemyIds(['enemy_ghost'])).toBe(0)
    expect(xianyuanForEnemyIds([])).toBe(0)
  })
})
