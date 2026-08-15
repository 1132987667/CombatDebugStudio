/**
 * school-system.test.ts — 流派系统闭环验证
 * 覆盖：skill_tree 数据挂载到 schools.nodes、属性注入（playerAttributes）、
 *       战斗技能注入（equippedPlayerSkills / buildBattleTeams 主角）、存档持久化（save-bridge）。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { usePackStore } from '@/presentation/stores/packStore'
import { xiyouSaveBridge } from '@/presentation/modules/yanjie/xiyou/save-bridge'
import { equippedPlayerSkills, schoolAttributeBonuses } from '@/presentation/modules/yanjie/xiyou/battle'
import {
  calcPureSchool,
  equippedSkills,
  pureSchoolBonus,
  schools,
  scenes,
  skillPoints,
} from '@/presentation/modules/yanjie/xiyou/xiyouData'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/** 清理全部流派运行时状态（beforeEach 调用，防测试间串扰） */
function resetSkillTree(): void {
  for (const s of schools) {
    s.selected = false
    for (const n of s.nodes) n.learned = false
  }
  skillPoints.spent = 0
  skillPoints.earned = 4
  skillPoints.totalPillsUsed = 0
  equippedSkills.passive = []
  equippedSkills.small = []
  equippedSkills.ultimate = null
  pureSchoolBonus.value = null
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetSkillTree()
})

describe('skill_tree 数据挂载', () => {
  it('schools[].nodes 由 skill_tree.json 构建（含 effect/skillId 映射）', () => {
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
  it('已点亮 attribute 节点 effect 注入（攻击 +5% 按基础换算，跨流派累加）', () => {
    const store = usePlayerStore()
    const linghou = schools.find((s) => s.id === 'linghou')!
    const jinxing = schools.find((s) => s.id === 'jinxing')!
    linghou.nodes.find((n) => n.id === 'lh_node_1_1')!.learned = true // attack +5%
    jinxing.nodes.find((n) => n.id === 'jx_node_1_1')!.learned = true // critRate +3%
    const base = { attack: store.player.attackMax, defense: store.player.defense, speed: store.player.speed, maxHp: store.player.maxHp }
    const bonus = schoolAttributeBonuses(base)
    // 跨流派节点均注入（不需要选中流派）
    expect(bonus[ATTRIBUTE_CODE.attack]).toBe(Math.round(base.attack * 0.05))
    expect(bonus[ATTRIBUTE_CODE.critRate]).toBe(3)
    // playerAttributes 联动
    const attr = store.playerAttributes
    expect(attr[ATTRIBUTE_CODE.attack]).toBeGreaterThan(0)
  })

  it('纯流派加成：equipped 技能全同流派时注入（灵猴道 comboRate +10）', () => {
    const store = usePlayerStore()
    const linghou = schools.find((s) => s.id === 'linghou')!
    pureSchoolBonus.value = 'linghou'
    expect(store.playerAttributes[ATTRIBUTE_CODE.comboRate]).toBeCloseTo(10)
    // 基础 comboRate 之上 +10 百分点
    pureSchoolBonus.value = null
    expect(store.playerAttributes[ATTRIBUTE_CODE.comboRate]).toBeLessThan(10)
  })

  it('未知属性（skill_tree 设计层 tenacity/blockRate）不注入，避免引擎不识别的属性码', () => {
    const bonus = schoolAttributeBonuses({ attack: 100, defense: 50, speed: 20, maxHp: 500 })
    expect(bonus['tenacity']).toBeUndefined()
    expect(bonus['blockRate']).toBeUndefined()
  })

  it('磐石道 damageReduction 纯流派加成 + 已点亮节点效果叠加', () => {
    const store = usePlayerStore()
    const panshi = schools.find((s) => s.id === 'panshi')!
    panshi.nodes.find((n) => n.id === 'ps_node_3_1')!.learned = true // 铁壁功 damageReduction +3%
    pureSchoolBonus.value = 'panshi' // pureBonus damageReduction +10
    expect(store.playerAttributes[ATTRIBUTE_CODE.damageReduction]).toBe(13)
    expect(store.battleSnapshot.damageReduction).toBe(13)
  })
})

describe('战斗技能注入', () => {
  it('未装备技能返回空技能桶（普攻兜底）', () => {
    expect(equippedPlayerSkills()).toEqual({ small: [], passive: [], ultimate: [] })
  })

  it('装备槽中的技能按类型分桶（节点 id → 技能配置 id）', () => {
    const linghou = schools.find((s) => s.id === 'linghou')!
    linghou.nodes.find((n) => n.id === 'lh_node_2_3')!.learned = true // 疾风步 small
    linghou.nodes.find((n) => n.id === 'lh_node_3_4')!.learned = true // 千影绝杀 ultimate
    linghou.nodes.find((n) => n.id === 'lh_node_1_3')!.learned = true // 迅捷连击 passive
    equippedSkills.small = ['lh_node_2_3']
    equippedSkills.ultimate = 'lh_node_3_4'
    equippedSkills.passive = ['lh_node_1_3']
    const skills = equippedPlayerSkills()
    expect(skills.small).toContain('skill_xiyou_swift_step')
    expect(skills.ultimate).toContain('skill_xiyou_thousand_shadow')
    expect(skills.passive).toContain('skill_xiyou_swift_combo')
  })

  it('纯流派判定（calcPureSchool）：同流派装备返回流派 id，混搭返回 null', () => {
    const linghou = schools.find((s) => s.id === 'linghou')!
    const panshi = schools.find((s) => s.id === 'panshi')!
    const ult = linghou.nodes.find((n) => n.id === 'lh_node_3_4')!.id
    const psUlt = panshi.nodes.find((n) => n.id === 'ps_node_2_4')!.id
    expect(calcPureSchool({ passive: [], small: [], ultimate: ult })).toBe('linghou')
    expect(calcPureSchool({ passive: [], small: [], ultimate: psUlt })).toBe('panshi')
    expect(calcPureSchool({ passive: [], small: [], ultimate: null })).toBeNull()
    // 混搭（灵猴道被动 + 磐石道大招）→ null
    expect(calcPureSchool({ passive: ['lh_node_1_3'], small: [], ultimate: psUlt })).toBeNull()
  })
})

describe('存档持久化闭环', () => {
  it('collect 写入流派状态（含技能点/装备槽），restore 还原', async () => {
    const pack = usePackStore()
    await pack.init()
    const linghou = schools.find((s) => s.id === 'linghou')!
    linghou.nodes.find((n) => n.id === 'lh_node_2_3')!.learned = true
    skillPoints.spent = 3
    skillPoints.earned = 7
    skillPoints.totalPillsUsed = 1
    equippedSkills.small = ['lh_node_2_3']

    const data = await xiyouSaveBridge.collect({ currentSceneId: scenes[0].id })
    expect(data.school).toEqual({
      selected: null,
      learned: ['lh_node_2_3'],
      spent: 3,
      earned: 7,
      totalPillsUsed: 1,
      equipped: { passive: [], small: ['lh_node_2_3'], ultimate: null },
    })

    // 清空运行时状态，restore 应还原
    resetSkillTree()
    await xiyouSaveBridge.restore(data)
    const after = schools.find((s) => s.id === 'linghou')!
    expect(after.nodes.find((n) => n.id === 'lh_node_2_3')?.learned).toBe(true)
    expect(skillPoints.spent).toBe(3)
    expect(skillPoints.earned).toBe(7)
    expect(skillPoints.totalPillsUsed).toBe(1)
    expect(equippedSkills.small).toEqual(['lh_node_2_3'])
  })

  it('旧档（无 earned/equipped 字段）恢复兜底：earned >= spent，装备槽清空', async () => {
    const pack = usePackStore()
    await pack.init()
    const data = await xiyouSaveBridge.collect({ currentSceneId: scenes[0].id })
    const legacy = data.school!
    delete legacy.earned
    delete legacy.totalPillsUsed
    delete legacy.equipped
    legacy.spent = 9

    resetSkillTree()
    await xiyouSaveBridge.restore({ ...data, school: legacy })
    expect(skillPoints.spent).toBe(9)
    expect(skillPoints.earned).toBeGreaterThanOrEqual(9)
    expect(skillPoints.totalPillsUsed).toBe(0)
    expect(equippedSkills.small).toEqual([])
  })

  it('restore 装备槽过滤未解锁/类型不匹配的节点引用', async () => {
    const pack = usePackStore()
    await pack.init()
    const data = await xiyouSaveBridge.collect({ currentSceneId: scenes[0].id })
    data.school = {
      selected: null,
      learned: [],
      spent: 0,
      earned: 4,
      totalPillsUsed: 0,
      equipped: {
        passive: ['lh_node_1_3'], // 未解锁 → 过滤
        small: ['ghost'], // 不存在 → 过滤
        ultimate: 'lh_node_2_3', // small 技能放 ultimate 槽 → 过滤
      },
    }
    resetSkillTree()
    await xiyouSaveBridge.restore(data)
    expect(equippedSkills.passive).toEqual([])
    expect(equippedSkills.small).toEqual([])
    expect(equippedSkills.ultimate).toBeNull()
  })
})
