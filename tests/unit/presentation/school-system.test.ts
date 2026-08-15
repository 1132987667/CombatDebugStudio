/**
 * school-system.test.ts — 流派系统闭环验证
 * 覆盖：skill_tree 数据挂载到 schools.nodes、属性注入（playerAttributes）、
 *       战斗技能注入（learnedPlayerSkills / buildBattleTeams 主角）、存档持久化（save-bridge）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { usePackStore } from '@/presentation/stores/packStore'
import { xiyouSaveBridge } from '@/presentation/modules/yanjie/xiyou/data/save-bridge'
import { learnedPlayerSkills, schoolAttributeBonuses, schools, scenes, skillPoints } from '@/presentation/modules/yanjie/xiyou/data/mock'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('skill_tree 数据挂载', () => {
  it('schools[].nodes 由 skill_tree.json.json 构建（含 effect/skillId 映射）', () => {
    expect(schools.length).toBe(3)
    for (const s of schools) {
      expect(s.nodes.length).toBeGreaterThan(0)
      expect(s.branches.length).toBe(3)
    }
    // 灵猴道：连击分支属性节点带 effect
    const linghou = schools.find((s) => s.id === 'linghou')!
    const atkNode = linghou.nodes.find((n) => n.id === 'lh_node_1_1')
    expect(atkNode?.effect).toMatchObject({ attribute: 'attack', value: 5, calc: 'percentage' })
    // 技能节点 skillId 已映射为 configs/skills 实际 id（命名体系对齐）
    const combo = linghou.nodes.find((n) => n.id === 'lh_node_1_3')
    expect(combo?.skillId).toBe('skill_xiyou_swift_combo')
    expect(combo?.energyCost).toBe(0)
    const gale = linghou.nodes.find((n) => n.id === 'lh_node_2_3')
    expect(gale?.skillId).toBe('skill_xiyou_swift_step')
    expect(gale?.energyCost).toBe(50)
  })
})

describe('流派属性注入', () => {
  it('选中流派后 pureBonus 注入 playerAttributes', () => {
    const store = usePlayerStore()
    // 金行道 pureBonus: critRate +10
    schools.forEach((s) => (s.selected = false))
    schools.find((s) => s.id === 'jinxing')!.selected = true
    // Pinia setup store 的 computed 已解包，直接读属性
    const crit = store.playerAttributes[ATTRIBUTE_CODE.critRate]
    // critRate 基础 7.5 + 10
    expect(crit).toBeCloseTo(17.5)
    schools.forEach((s) => (s.selected = false))
  })

  it('已点亮 attribute 节点 effect 注入（攻击 +5% 按基础换算）', () => {
    const store = usePlayerStore()
    schools.forEach((s) => (s.selected = false))
    const linghou = schools.find((s) => s.id === 'linghou')!
    linghou.selected = true
    linghou.nodes.forEach((n) => (n.learned = false))
    linghou.nodes.find((n) => n.id === 'lh_node_1_1')!.learned = true // attack +5%
    const attr = store.playerAttributes
    // base attack 与加点后叠加流派：无装备/加点下 player.attackMax 为攻击基准
    expect(attr[ATTRIBUTE_CODE.attack]).toBeGreaterThan(0)
    // 与 schoolAttributeBonuses 的增量一致（数值属性按基础 5% 换算）
    const base = { attack: store.player.attackMax, defense: store.player.defense, speed: store.player.speed, maxHp: store.player.maxHp }
    const bonus = schoolAttributeBonuses(base)
    expect(bonus[ATTRIBUTE_CODE.attack]).toBe(Math.round(base.attack * 0.05))
    linghou.selected = false
    linghou.nodes.forEach((n) => (n.learned = false))
  })

  it('未知属性（skill_tree 设计层 tenacity/blockRate）不注入，避免引擎不识别的属性码', () => {
    const bonus = schoolAttributeBonuses({ attack: 100, defense: 50, speed: 20, maxHp: 500 })
    expect(bonus['tenacity']).toBeUndefined()
    expect(bonus['blockRate']).toBeUndefined()
  })

  it('磐石道 blockRate 已映射为 damageReduction（引擎消费的免伤率），纯流派加成与铁壁功生效', () => {
    const store = usePlayerStore()
    schools.forEach((s) => (s.selected = false))
    const panshi = schools.find((s) => s.id === 'panshi')!
    panshi.selected = true
    panshi.nodes.forEach((n) => (n.learned = false))
    panshi.nodes.find((n) => n.id === 'ps_node_3_1')!.learned = true // 铁壁功 damageReduction +3%
    // pureBonus damageReduction +10（百分点） + 节点 +3 → 13
    expect(store.playerAttributes[ATTRIBUTE_CODE.damageReduction]).toBe(13)
    expect(store.battleSnapshot.damageReduction).toBe(13)
    panshi.selected = false
    panshi.nodes.forEach((n) => (n.learned = false))
  })

  it('critDamage / dodge 流派加成透传到 battleSnapshot（面板与战斗同源）', () => {
    const store = usePlayerStore()
    schools.forEach((s) => (s.selected = false))
    const linghou = schools.find((s) => s.id === 'linghou')!
    linghou.selected = true
    linghou.nodes.forEach((n) => (n.learned = false))
    linghou.nodes.find((n) => n.id === 'lh_node_2_2')!.learned = true // 轻身术 dodge +3
    // battleSnapshot 的 critDamage 应取 playerAttributes（含流派），dodge 含节点加成
    expect(store.battleSnapshot.dodge).toBe(store.playerAttributes[ATTRIBUTE_CODE.dodge])
    expect(store.battleSnapshot.critDamage).toBe(store.playerAttributes[ATTRIBUTE_CODE.critDamage])
    linghou.selected = false
    linghou.nodes.forEach((n) => (n.learned = false))
  })
})

describe('战斗技能注入', () => {
  it('未选流派返回空技能桶', () => {
    schools.forEach((s) => (s.selected = false))
    expect(learnedPlayerSkills()).toEqual({ small: [], passive: [], ultimate: [] })
  })

  it('选中流派并点亮技能节点后，技能按类型分桶', () => {
    schools.forEach((s) => (s.selected = false))
    const linghou = schools.find((s) => s.id === 'linghou')!
    linghou.selected = true
    linghou.nodes.forEach((n) => (n.learned = false))
    linghou.nodes.find((n) => n.id === 'lh_node_2_3')!.learned = true // 疾风步 small
    linghou.nodes.find((n) => n.id === 'lh_node_3_4')!.learned = true // 千影绝杀 ultimate
    const skills = learnedPlayerSkills()
    expect(skills.small).toContain('skill_xiyou_swift_step')
    expect(skills.ultimate).toContain('skill_xiyou_thousand_shadow')
    linghou.selected = false
    linghou.nodes.forEach((n) => (n.learned = false))
  })
})

describe('存档持久化闭环', () => {
  it('collect 写入流派状态，restore 还原（选择 + 点亮 + 技能点）', async () => {
    const pack = usePackStore()
    await pack.init()

    // 构造运行时状态
    schools.forEach((s) => (s.selected = false))
    const linghou = schools.find((s) => s.id === 'linghou')!
    linghou.selected = true
    linghou.nodes.forEach((n) => (n.learned = false))
    linghou.nodes.find((n) => n.id === 'lh_node_2_3')!.learned = true
    skillPoints.spent = linghou.nodes.find((n) => n.id === 'lh_node_2_3')!.points

    const data = await xiyouSaveBridge.collect({ currentSceneId: scenes[0].id })
    expect(data.school).toEqual({
      selected: 'linghou',
      learned: ['lh_node_2_3'],
      spent: 3,
    })

    // 清空运行时状态，restore 应还原
    schools.forEach((s) => (s.selected = false))
    linghou.nodes.forEach((n) => (n.learned = false))
    skillPoints.spent = 0

    await xiyouSaveBridge.restore(data)
    const after = schools.find((s) => s.id === 'linghou')!
    expect(after.selected).toBe(true)
    expect(after.nodes.find((n) => n.id === 'lh_node_2_3')?.learned).toBe(true)
    expect(skillPoints.spent).toBe(3)
  })
})
