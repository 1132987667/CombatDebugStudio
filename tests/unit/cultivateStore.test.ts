// @vitest-environment happy-dom
/**
 * cultivateStore.test.ts — 技能树运行时 Store 验证（连战·连击流体系）
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

/** 风锁链 6 层（属性/被动/小技能交替，layer4~6 依赖 branch 归属子流派后的逐层前置） */
const FENGSUO_CHAIN = [
  'lianji_fengsuo_attr1', // layer1 属性
  'lianji_fengsuo_core', // layer1 核心被动
  'lianji_fufengbian', // layer2 小技能
  'lianji_fengsuo_attr2', // layer3 属性
  'lianji_fenghen_a', // layer4 被动
  'lianji_yufeng', // layer5 被动
  'lianji_tianwang', // layer6 大招
]

/** 解锁风锁链全 6 层（含属性节点与风锁天网大招） */
function unlockFengsuoChain(): void {
  const c = useCultivateStore()
  skillPoints.earned = 50
  for (const id of FENGSUO_CHAIN) {
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
    expect(c.unlockNode('lianji_fufengbian')).toBe(false) // layer2 前置（layer1）未点亮
    expect(c.unlockNode('lianji_fengsuo_core')).toBe(true)
    expect(c.unlockNode('lianji_node_ghost')).toBe(false) // 不存在
  })

  it('点数不足返回 false', () => {
    const c = useCultivateStore()
    skillPoints.earned = 0
    expect(c.unlockNode('lianji_fengsuo_core')).toBe(false) // 核心被动 2 点
  })

  it('解锁成功：spent 增加、available 减少、节点点亮；不可重复点亮', () => {
    const c = useCultivateStore()
    const before = c.availablePoints
    expect(c.unlockNode('lianji_fengsuo_core')).toBe(true)
    expect(c.spentPoints).toBe(2)
    expect(c.availablePoints).toBe(before - 2)
    expect(c.isNodeUnlocked('lianji_fengsuo_core')).toBe(true)
    expect(c.unlockNode('lianji_fengsuo_core')).toBe(false)
  })

  it('大招解锁上限 2 个（设计稿 §6.3）：连战三条链的第 3 个大招被限制', () => {
    const c = useCultivateStore()
    skillPoints.earned = 60
    // 三条链的最小解锁路径：layer1 核心 + 逐层推进到 layer6 大招
    const chains: string[][] = [
      ['lianji_fengsuo_core', 'lianji_fufengbian', 'lianji_fengsuo_attr2', 'lianji_fenghen_a', 'lianji_yufeng', 'lianji_tianwang'],
      ['lianji_fengshi_core', 'lianji_xunfengji', 'lianji_fengshi_attr2', 'lianji_fengyibaofa', 'lianji_qishi', 'lianji_kuangfeng'],
      ['lianji_liejia_core', 'lianji_liejiaji', 'lianji_liejia_attr2', 'lianji_liejiabaofa', 'lianji_baolie', 'lianji_tianbeng'],
    ]
    for (const chain of chains) {
      for (const id of chain) {
        c.unlockNode(id)
      }
    }
    expect(c.isNodeUnlocked('lianji_tianwang')).toBe(true) // 大招 1
    expect(c.isNodeUnlocked('lianji_kuangfeng')).toBe(true) // 大招 2
    expect(c.isNodeUnlocked('lianji_tianbeng')).toBe(false) // 第 3 个大招被限制
  })
})

describe('equipSkill / unequipSkill 装备槽', () => {
  it('未解锁节点不可装备', () => {
    const c = useCultivateStore()
    expect(c.equipSkill('lianji_fenghen_a', 'passive')).toBe(false)
  })

  it('类型不匹配的槽位不可装备', () => {
    const c = useCultivateStore()
    unlockFengsuoChain()
    expect(c.equipSkill('lianji_fengsuo_core', 'small')).toBe(false) // passive 进 small 槽
    expect(c.equipSkill('lianji_fufengbian', 'passive')).toBe(false) // small 进 passive 槽
  })

  it('装备成功：被动 2 / 小技能 2 / 大招 1，槽满替换最早装备', () => {
    const c = useCultivateStore()
    unlockFengsuoChain()
    expect(c.equipSkill('lianji_fengsuo_core', 'passive')).toBe(true)
    expect(c.equippedSkills.passive).toEqual(['lianji_fengsuo_core'])
    // 被动 2 个（风痕羁绊 + 驭风之力）
    expect(c.equipSkill('lianji_fenghen_a', 'passive')).toBe(true)
    expect(c.equippedSkills.passive).toEqual(['lianji_fengsuo_core', 'lianji_fenghen_a'])
    // 第三个被动 → 替换最早装备的核心被动
    expect(c.equipSkill('lianji_yufeng', 'passive')).toBe(true)
    expect(c.equippedSkills.passive).toEqual(['lianji_fenghen_a', 'lianji_yufeng'])
    // 小技能 + 大招
    expect(c.equipSkill('lianji_fufengbian', 'small')).toBe(true)
    expect(c.equippedSkills.small).toEqual(['lianji_fufengbian'])
    expect(c.equipSkill('lianji_tianwang', 'ultimate')).toBe(true)
    expect(c.equippedSkills.ultimate).toBe('lianji_tianwang')
  })

  it('同一节点已在槽中则幂等；unequipSkill 卸下', () => {
    const c = useCultivateStore()
    unlockFengsuoChain()
    c.equipSkill('lianji_fufengbian', 'small')
    expect(c.equipSkill('lianji_fufengbian', 'small')).toBe(true)
    expect(c.equippedSkills.small).toEqual(['lianji_fufengbian'])
    expect(c.unequipSkill('lianji_fufengbian')).toBe(true)
    expect(c.equippedSkills.small).toEqual([])
    expect(c.unequipSkill('lianji_fufengbian')).toBe(false)
  })

  it('getCombatSkills 返回装备槽技能配置 id（组合被动映射为逗号分隔配置串）', () => {
    const c = useCultivateStore()
    unlockFengsuoChain()
    c.equipSkill('lianji_fengsuo_core', 'passive')
    c.equipSkill('lianji_fufengbian', 'small')
    c.equipSkill('lianji_tianwang', 'ultimate')
    expect(c.combatSkills).toEqual({
      passive: ['school_fengsuo_bounce,school_fengsuo_bind,school_fengsuo_fengzhu'],
      small: ['skill_school_fufengbian'],
      ultimate: 'skill_school_fengsuotianwang',
    })
  })

  it('纯流派加成：装备全同流派（连战）时 recalcPureBonus 生效', () => {
    const c = useCultivateStore()
    unlockFengsuoChain()
    c.equipSkill('lianji_fengsuo_core', 'passive')
    c.equipSkill('lianji_fufengbian', 'small')
    c.equipSkill('lianji_tianwang', 'ultimate')
    // 当前仅连战流派开放（破军/不动/幻影节点未配置），全部装备必然同属连战
    expect(c.pureSchoolBonus).toBe('lianji')
    expect(c.pureSchoolBonus).toBe(schools[0]?.id)
  })
})

describe('resetNodes 洗点', () => {
  it('消耗金钱 500×已分配点数，清空节点与装备槽', () => {
    const c = useCultivateStore()
    const player = usePlayerStore()
    unlockFengsuoChain()
    c.equipSkill('lianji_fengsuo_core', 'passive')
    const cost = c.resetCost()
    const before = player.currency.money
    expect(cost).toBeGreaterThan(0)
    expect(c.resetNodes()).toBe(true)
    expect(player.currency.money).toBe(before - cost)
    expect(c.spentPoints).toBe(0)
    expect(c.unlockedCount).toBe(0)
    expect(c.equippedSkills.passive).toEqual([])
  })

  it('金钱不足返回 false 且状态不变', () => {
    const c = useCultivateStore()
    const player = usePlayerStore()
    unlockFengsuoChain()
    const spent = c.spentPoints
    player.currency.money = 0
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
