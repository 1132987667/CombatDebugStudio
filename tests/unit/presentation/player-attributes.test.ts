/**
 * player-attributes.test.ts — playerAttributes 快照数据同源验证：
 * 1. 流派增量全键合并（此前逐键 withSchool 丢弃 armorBreak 等进阶属性节点增量）；
 * 2. 装备词缀口径（equipBonuses），角色面板数值与战斗主角（BattleZen/BattleRoster）同源。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { equipBonuses, schoolAttributeBonuses } from '@/presentation/modules/yanjie/xiyou/battle'
import { pureSchoolBonus, schools } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/** 重置流派运行时状态（防测试间串扰，同 school-system.test.ts） */
function resetSkillTree(): void {
  for (const s of schools) {
    s.selected = false
    for (const n of s.nodes) n.learned = false
  }
  pureSchoolBonus.value = null
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetSkillTree()
})

describe('playerAttributes 流派增量全键合并', () => {
  it('点亮 additive 进阶属性节点（破甲 armorBreak +2）后快照携带该键（此前被丢弃）', () => {
    const player = usePlayerStore()
    expect(player.playerAttributes[ATTRIBUTE_CODE.armorBreak]).toBeUndefined()
    const node = schools.find((s) => s.id === 'lianji')!.nodes.find((n) => n.id === 'lianji_liejia_attr2')!
    node.learned = true
    expect(player.playerAttributes[ATTRIBUTE_CODE.armorBreak]).toBe(2)
  })

  it('核心属性 additive 增量保持同语义（attack +3 直接叠加）', () => {
    const player = usePlayerStore()
    const before = player.playerAttributes[ATTRIBUTE_CODE.attack] ?? 0
    const node = schools.find((s) => s.id === 'lianji')!.nodes.find((n) => n.id === 'lianji_liejia_attr1')!
    node.learned = true
    expect(player.playerAttributes[ATTRIBUTE_CODE.attack]).toBe(before + 3)
  })

  it('全键合并覆盖 schoolAttributeBonuses 输出的全部非零键', () => {
    const player = usePlayerStore()
    const before: Partial<Record<string, number>> = { ...player.playerAttributes }
    for (const n of schools.find((s) => s.id === 'lianji')!.nodes) {
      if (n.effect && n.effect.calc === 'additive') n.learned = true
    }
    const school = schoolAttributeBonuses({
      attack: before[ATTRIBUTE_CODE.attack] ?? 0,
      defense: before[ATTRIBUTE_CODE.defense] ?? 0,
      speed: before[ATTRIBUTE_CODE.speed] ?? 0,
      maxHp: player.player.maxHp,
    })
    expect(Object.keys(school).length).toBeGreaterThan(0)
    for (const [attr, inc] of Object.entries(school)) {
      if (!inc) continue
      expect(player.playerAttributes[attr as ATTRIBUTE_CODE]).toBe((before[attr] ?? 0) + inc)
    }
  })
})

describe('装备词缀面板口径（equipBonuses）', () => {
  it('flat 直接相加、percent 百分比属性加百分点、数值属性按主角基准换算', () => {
    const protagonist = { ...usePlayerStore().battleSnapshot, attack: 100, critRate: 10 }
    const out = equipBonuses(
      [
        { attribute: 'attack', modifierType: 'flat', value: 10 },
        { attribute: 'attack', modifierType: 'percent', value: 10 },
        { attribute: 'critRate', modifierType: 'percent', value: 5 },
      ],
      protagonist,
    )
    expect(out.attack).toBe(20) // flat 10 + percent 10% × 基准 100
    expect(out.critRate).toBe(5) // isPercentage：百分点直接相加
  })
})
