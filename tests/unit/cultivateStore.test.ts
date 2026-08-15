// @vitest-environment happy-dom
/**
 * cultivateStore.test.ts — 技能树运行时 Store 验证（需求 §5.11）
 * 覆盖：解锁/前置校验/点数校验/大招上限、装备槽（上限/替换/卸下）、
 *       洗点（金钱消耗/清空返还）、纯流派加成判定、悟道丹/升级技能点、getCombatSkills。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useCultivateStore } from '@/presentation/stores/cultivateStore'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { equippedSkills, pureSchoolBonus, schools, skillPoints } from '@/presentation/modules/yanjie/xiyou/xiyouData'

/** 清理全部流派运行时状态 */
function resetSkillTree(): void {
  for (const s of schools) {
    s.selected = false
    for (const n of s.nodes) n.learned = false
  }
  skillPoints.spent = 0
  skillPoints.earned = 20
  skillPoints.totalPillsUsed = 0
  equippedSkills.passive = []
  equippedSkills.small = []
  equippedSkills.ultimate = null
  pureSchoolBonus.value = null
}

/** 解锁灵猴道一条完整链：连击 passive + 身法/灵能小技能 + 灵能大招（含前置） */
function unlockLinghouChain(): void {
  const c = useCultivateStore()
  skillPoints.earned = 50
  for (const id of [
    'lh_node_1_1', 'lh_node_1_2', 'lh_node_1_3', // 连击链 → 迅捷连击 passive
    'lh_node_2_1', 'lh_node_2_2', 'lh_node_2_3', 'lh_node_2_4', // 身法链 → 疾风步/乱舞 small
    'lh_node_3_1', 'lh_node_3_2', 'lh_node_3_3', 'lh_node_3_4', // 灵能链 → 分身斩/千影绝杀
  ]) {
    c.unlockNode(id)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
  resetSkillTree()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('unlockNode 解锁', () => {
  it('前置未满足返回 false；第 1 层无前置可直接点亮', () => {
    const c = useCultivateStore()
    expect(c.unlockNode('lh_node_1_2')).toBe(false) // 前置 lh_node_1_1 未点亮
    expect(c.unlockNode('lh_node_1_1')).toBe(true)
    expect(c.unlockNode('lx_node_ghost')).toBe(false) // 不存在
  })

  it('点数不足返回 false', () => {
    const c = useCultivateStore()
    skillPoints.earned = 0
    expect(c.unlockNode('lh_node_3_4')).toBe(false) // 大招 5 点
  })

  it('解锁成功：spent 增加、available 减少、节点点亮；不可重复点亮', () => {
    const c = useCultivateStore()
    const before = c.availablePoints
    expect(c.unlockNode('lh_node_1_1')).toBe(true)
    expect(c.spentPoints).toBe(1)
    expect(c.availablePoints).toBe(before - 1)
    expect(c.isNodeUnlocked('lh_node_1_1')).toBe(true)
    expect(c.unlockNode('lh_node_1_1')).toBe(false)
  })

  it('大招解锁上限 2 个（设计稿 §6.3）', () => {
    const c = useCultivateStore()
    skillPoints.earned = 40
    for (const id of ['lh_node_3_1', 'lh_node_3_2', 'lh_node_3_3', 'lh_node_3_4']) {
      expect(c.unlockNode(id)).toBe(true) // 千影绝杀（大招 1）
    }
    for (const id of ['jx_node_3_1', 'jx_node_3_2', 'jx_node_3_3', 'jx_node_3_4']) {
      expect(c.unlockNode(id)).toBe(true) // 天罡斩（大招 2）
    }
    for (const id of ['ps_node_2_1', 'ps_node_2_2', 'ps_node_2_3']) {
      expect(c.unlockNode(id)).toBe(true)
    }
    expect(c.unlockNode('ps_node_2_4')).toBe(false) // 第 3 个大招被限制
  })
})

describe('equipSkill / unequipSkill 装备槽', () => {
  it('未解锁节点不可装备', () => {
    const c = useCultivateStore()
    expect(c.equipSkill('lh_node_1_3', 'passive')).toBe(false)
  })

  it('类型不匹配的槽位不可装备', () => {
    const c = useCultivateStore()
    unlockLinghouChain()
    expect(c.equipSkill('lh_node_1_3', 'small')).toBe(false) // passive 进 small 槽
    expect(c.equipSkill('lh_node_2_3', 'passive')).toBe(false) // small 进 passive 槽
  })

  it('装备成功：被动 2 / 小技能 2 / 大招 1，槽满替换最早装备', () => {
    const c = useCultivateStore()
    unlockLinghouChain()
    expect(c.equipSkill('lh_node_1_3', 'passive')).toBe(true)
    expect(c.equippedSkills.passive).toEqual(['lh_node_1_3'])
    // 小技能 2 个
    expect(c.equipSkill('lh_node_2_3', 'small')).toBe(true)
    expect(c.equipSkill('lh_node_3_3', 'small')).toBe(true)
    expect(c.equippedSkills.small).toEqual(['lh_node_2_3', 'lh_node_3_3'])
    // 第三个小技能 → 替换最早装备的 lh_node_2_3
    expect(c.equipSkill('lh_node_2_4', 'small')).toBe(true)
    expect(c.equippedSkills.small).toEqual(['lh_node_3_3', 'lh_node_2_4'])
    // 大招唯一（再次装备直接替换）
    expect(c.equipSkill('lh_node_3_4', 'ultimate')).toBe(true)
    expect(c.equippedSkills.ultimate).toBe('lh_node_3_4')
  })

  it('同一节点已在槽中则幂等；unequipSkill 卸下', () => {
    const c = useCultivateStore()
    unlockLinghouChain()
    c.equipSkill('lh_node_2_3', 'small')
    expect(c.equipSkill('lh_node_2_3', 'small')).toBe(true)
    expect(c.equippedSkills.small).toEqual(['lh_node_2_3'])
    expect(c.unequipSkill('lh_node_2_3')).toBe(true)
    expect(c.equippedSkills.small).toEqual([])
    expect(c.unequipSkill('lh_node_2_3')).toBe(false)
  })

  it('getCombatSkills 返回装备槽技能配置 id（节点 id → 技能配置 id）', () => {
    const c = useCultivateStore()
    unlockLinghouChain()
    c.equipSkill('lh_node_1_3', 'passive')
    c.equipSkill('lh_node_2_3', 'small')
    c.equipSkill('lh_node_3_4', 'ultimate')
    expect(c.combatSkills).toEqual({
      passive: ['skill_xiyou_swift_combo'],
      small: ['skill_xiyou_swift_step'],
      ultimate: 'skill_xiyou_thousand_shadow',
    })
  })

  it('纯流派加成：装备全同流派时 recalcPureBonus 生效，混搭清除', () => {
    const c = useCultivateStore()
    unlockLinghouChain()
    c.equipSkill('lh_node_1_3', 'passive')
    c.equipSkill('lh_node_2_3', 'small')
    c.equipSkill('lh_node_3_4', 'ultimate')
    expect(c.pureSchoolBonus).toBe('linghou')
    // 换装磐石道大招 → 混搭 → null
    c.unequipSkill('lh_node_3_4')
    const panshi = schools.find((s) => s.id === 'panshi')!
    for (const id of ['ps_node_2_1', 'ps_node_2_2', 'ps_node_2_3', 'ps_node_2_4']) {
      c.unlockNode(id)
    }
    c.equipSkill('ps_node_2_4', 'ultimate')
    expect(c.pureSchoolBonus).toBeNull()
  })
})

describe('resetNodes 洗点', () => {
  it('消耗金钱 500×已分配点数，清空节点与装备槽', () => {
    const c = useCultivateStore()
    const player = usePlayerStore()
    unlockLinghouChain()
    c.equipSkill('lh_node_1_3', 'passive')
    const cost = c.resetCost()
    const before = player.currency.copper
    expect(cost).toBeGreaterThan(0)
    expect(c.resetNodes()).toBe(true)
    expect(player.currency.copper).toBe(before - cost)
    expect(c.spentPoints).toBe(0)
    expect(c.unlockedCount).toBe(0)
    expect(c.equippedSkills.passive).toEqual([])
  })

  it('金钱不足返回 false 且状态不变', () => {
    const c = useCultivateStore()
    const player = usePlayerStore()
    unlockLinghouChain()
    const spent = c.spentPoints
    player.currency.copper = 0
    expect(c.resetNodes()).toBe(false)
    expect(c.spentPoints).toBe(spent)
    expect(c.unlockedCount).toBeGreaterThan(0)
  })

  it('无已分配点数时不可洗点', () => {
    const c = useCultivateStore()
    expect(c.resetCost()).toBe(0)
    expect(c.resetNodes()).toBe(false)
  })
})

describe('技能点获取', () => {
  it('升级 +1 技能点；等级点（earned - totalPillsUsed）达 50 后不再增加', () => {
    const c = useCultivateStore()
    skillPoints.earned = 0
    skillPoints.totalPillsUsed = 0
    c.grantLevelPoint()
    expect(skillPoints.earned).toBe(1)
    skillPoints.earned = 50
    c.grantLevelPoint()
    expect(skillPoints.earned).toBe(50)
  })

  it('悟道丹 +1 技能点，全档最多 10 颗', () => {
    const c = useCultivateStore()
    skillPoints.earned = 0
    skillPoints.totalPillsUsed = 0
    for (let i = 0; i < 10; i++) expect(c.grantPillPoint()).toBe(true)
    expect(skillPoints.earned).toBe(10)
    expect(skillPoints.totalPillsUsed).toBe(10)
    expect(c.grantPillPoint()).toBe(false)
  })

  it('总上限 60：earned 不超 max', () => {
    const c = useCultivateStore()
    skillPoints.earned = 59
    skillPoints.totalPillsUsed = 9
    expect(c.grantPillPoint()).toBe(true)
    expect(skillPoints.earned).toBe(60)
    expect(c.grantPillPoint()).toBe(false)
  })
})
