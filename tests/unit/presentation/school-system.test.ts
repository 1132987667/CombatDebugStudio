/**
 * school-system.test.ts — 流派系统闭环验证（连战·连击流体系）
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
  schoolsLayers,
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
  for (const layer of schoolsLayers) {
    for (const n of layer.nodes) n.learned = false
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
  it('schools[].nodes 由 skill_tree.json 构建（连战流派，3 分支 24 节点，含 effect/skillId 映射）', () => {
    expect(schools.length).toBe(1) // 当前仅连战（斗战·连击）配置了技能树
    const lianzhan = schools[0]!
    expect(lianzhan.id).toBe('lianji')
    expect(lianzhan.nodes.length).toBe(24)
    expect(new Set(lianzhan.nodes.map((n) => n.branch))).toEqual(new Set(['fengsuo', 'fengshi', 'liejia']))
    // 属性节点带 effect（裂甲破甲 +2 加法）
    const armorNode = lianzhan.nodes.find((n) => n.id === 'lianji_liejia_attr2')
    expect(armorNode?.effect).toMatchObject({ attribute: 'armorBreak', value: 2, calc: 'additive' })
    // 技能节点 skillId 已映射为 configs/skills 实际 id（组合被动为逗号分隔配置串）
    const core = lianzhan.nodes.find((n) => n.id === 'lianji_fengsuo_core')
    expect(core?.skillId).toBe('school_fengsuo_bounce,school_fengsuo_bind,school_fengsuo_fengzhu')
    const whip = lianzhan.nodes.find((n) => n.id === 'lianji_fufengbian')
    expect(whip?.skillId).toBe('skill_school_fufengbian')
    // 连战纯流派加成（连击率 +10%）
    expect(lianzhan.pureBonus).toMatchObject({ attribute: 'comboRate', value: 10 })
  })
})

describe('流派属性注入', () => {
  it('已点亮 attribute 节点 effect 注入（加法属性直接累加）', () => {
    const store = usePlayerStore()
    const lianzhan = schools[0]!
    lianzhan.nodes.find((n) => n.id === 'lianji_liejia_attr2')!.learned = true // 破甲 +2（additive）
    const bonus = schoolAttributeBonuses({ attack: 100, defense: 50, speed: 20, maxHp: 500 })
    expect(bonus[ATTRIBUTE_CODE.armorBreak]).toBe(2)
    // playerAttributes 联动
    const attr = store.playerAttributes
    expect(attr[ATTRIBUTE_CODE.armorBreak]).toBeGreaterThanOrEqual(2)
  })

  it('纯流派加成：equipped 技能全同流派时注入（连战 comboRate +10）', () => {
    const store = usePlayerStore()
    pureSchoolBonus.value = 'lianji'
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
})

describe('战斗技能注入', () => {
  it('未装备技能返回空技能桶（普攻兜底）', () => {
    expect(equippedPlayerSkills()).toEqual({ small: [], passive: [], ultimate: [] })
  })

  it('装备槽中的技能按类型分桶（节点 id → 技能配置 id，组合被动展开）', () => {
    const lianzhan = schools[0]!
    lianzhan.nodes.find((n) => n.id === 'lianji_fufengbian')!.learned = true // 缚风鞭 small
    lianzhan.nodes.find((n) => n.id === 'lianji_tianwang')!.learned = true // 风锁天网 ultimate
    lianzhan.nodes.find((n) => n.id === 'lianji_fengsuo_core')!.learned = true // 风锁连环 passive
    equippedSkills.small = ['lianji_fufengbian']
    equippedSkills.ultimate = 'lianji_tianwang'
    equippedSkills.passive = ['lianji_fengsuo_core']
    const skills = equippedPlayerSkills()
    expect(skills.small).toContain('skill_school_fufengbian')
    expect(skills.ultimate).toContain('skill_school_fengsuotianwang')
    // 组合被动展开为多条配置
    expect(skills.passive).toContain('school_fengsuo_bounce')
    expect(skills.passive).toContain('school_fengsuo_bind')
    expect(skills.passive).toContain('school_fengsuo_fengzhu')
  })

  it('纯流派判定（calcPureSchool）：同流派装备返回流派 id，空装备返回 null', () => {
    const lianzhan = schools[0]!
    const ult = lianzhan.nodes.find((n) => n.id === 'lianji_tianwang')!.id
    expect(calcPureSchool({ passive: [], small: [], ultimate: ult })).toBe('lianji')
    expect(calcPureSchool({ passive: [], small: [], ultimate: null })).toBeNull()
    // 单流派体系下混搭场景不存在（破军/不动/幻影节点未配置）
  })
})

describe('天赋树学习格注入（schools.json skillIds）', () => {
  it('点亮连战学习格后，技能配置自动注入出战桶（组合被动展开）', () => {
    const layer1 = schoolsLayers.find((l) => l.layer === 1)!
    const passiveCell = layer1.nodes.find((n) => n.school === 'lianzhan' && n.skillKind === '被动')!
    expect(passiveCell.skillIds).toEqual(['school_fengsuo_bounce,school_fengsuo_bind,school_fengsuo_fengzhu'])
    passiveCell.learned = true
    const layer6 = schoolsLayers.find((l) => l.layer === 6)!
    const ultCell = layer6.nodes.find((n) => n.school === 'lianzhan' && n.skillKind === '大技能')!
    ultCell.learned = true
    const skills = equippedPlayerSkills()
    expect(skills.passive).toContain('school_fengsuo_bounce')
    expect(skills.passive).toContain('school_fengsuo_fengzhu')
    expect(skills.ultimate).toContain('skill_school_fengsuotianwang')
    // 未点亮的小技能格不注入
    expect(skills.small).toEqual([])
  })
})

describe('存档持久化闭环', () => {
  it('collect 写入流派状态（含技能点/装备槽），restore 还原', async () => {
    const pack = usePackStore()
    await pack.init()
    const lianzhan = schools[0]!
    lianzhan.nodes.find((n) => n.id === 'lianji_fufengbian')!.learned = true
    skillPoints.spent = 3
    skillPoints.earned = 7
    skillPoints.totalPillsUsed = 1
    equippedSkills.small = ['lianji_fufengbian']

    const data = await xiyouSaveBridge.collect({ currentSceneId: scenes[0].id })
    expect(data.school).toEqual({
      selected: null,
      learned: ['lianji_fufengbian'],
      spent: 3,
      earned: 7,
      totalPillsUsed: 1,
      equipped: { passive: [], small: ['lianji_fufengbian'], ultimate: null },
    })

    // 清空运行时状态，restore 应还原
    resetSkillTree()
    await xiyouSaveBridge.restore(data)
    const after = schools[0]!
    expect(after.nodes.find((n) => n.id === 'lianji_fufengbian')?.learned).toBe(true)
    expect(skillPoints.spent).toBe(3)
    expect(skillPoints.earned).toBe(7)
    expect(skillPoints.totalPillsUsed).toBe(1)
    expect(equippedSkills.small).toEqual(['lianji_fufengbian'])
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
        passive: ['lianji_fengsuo_core'], // 未解锁 → 过滤
        small: ['ghost'], // 不存在 → 过滤
        ultimate: 'lianji_fufengbian', // small 技能放 ultimate 槽 → 过滤
      },
    }
    resetSkillTree()
    await xiyouSaveBridge.restore(data)
    expect(equippedSkills.passive).toEqual([])
    expect(equippedSkills.small).toEqual([])
    expect(equippedSkills.ultimate).toBeNull()
  })
})
