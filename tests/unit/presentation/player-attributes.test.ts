/**
 * player-attributes.test.ts — playerAttributes 快照数据同源验证：
 * 1. 流派增量全键合并（此前逐键 withSchool 丢弃 armorBreak 等进阶属性节点增量）；
 * 2. 装备词缀口径（equipBonuses），角色面板数值与战斗主角（BattleZen/BattleRoster）同源。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { usePlayerStore } from '@/presentation/stores/playerStore'
import { collapseLayeredBonusKeys, equipBonuses, schoolAttributeBonuses } from '@/presentation/modules/yanjie/xiyou/battle'
import { nodeValueAtRank, pureSchoolBonus, schools, schoolsLayers } from '@/presentation/modules/yanjie/xiyou/xiyouData'
import { computePlayerBase, computeStatBonuses } from '@/presentation/modules/yanjie/xiyou/playerProfile'
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

describe('加点单次计入（回归：升级重建 profile 后快照不双算加点）', () => {
  it('分配点数并升级后，快照 = 纯基础成长（computePlayerBase）+ 加点转化，恰好一次', () => {
    const player = usePlayerStore()
    player.statPoints.atk = 3
    player.statPoints.hp = 2
    player.gainExp(10000) // 连续升级触发 profile 重建（旧实现把加点写进 attackMax/maxHp 后再叠加一次）
    const base = computePlayerBase(player.player.level)
    const bonus = computeStatBonuses(player.statPoints)
    expect(player.playerAttributes[ATTRIBUTE_CODE.attack]).toBe(base.attackMax + (bonus[ATTRIBUTE_CODE.attack] ?? 0))
    expect(player.playerAttributes[ATTRIBUTE_CODE.maxHealth]).toBe(base.maxHp + (bonus[ATTRIBUTE_CODE.maxHealth] ?? 0))
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

  it('六维加成/系数词条按主属性基准折算绝对增量并消费原键（回归：面板/战斗/悬浮不再漏算 L2/L3 词条）', () => {
    const protagonist = { ...usePlayerStore().battleSnapshot, maxHp: 1000, attack: 200, hitValue: 50 }
    const out = equipBonuses(
      [
        { attribute: 'healthBonus', modifierType: 'percent', value: 10 },
        { attribute: 'healthCoefficient', modifierType: 'percent', value: 5 },
        { attribute: 'attackCoefficient', modifierType: 'percent', value: 20 },
        { attribute: 'hitCoefficient', modifierType: 'percent', value: 8 },
      ],
      protagonist,
    )
    expect(out.maxHealth).toBe(150) // 10% + 5% × 基准 1000
    expect(out.attack).toBe(40) // 20% × 200
    expect(out.hitValue).toBe(4) // 8% × 50
    expect(out.healthBonus).toBeUndefined()
    expect(out.healthCoefficient).toBeUndefined()
    expect(out.attackCoefficient).toBeUndefined()
    expect(out.hitCoefficient).toBeUndefined()
  })

  it('流派树六维加成/系数键归一:折算进主属性且不残留独立键(回归:点而无效的另一半)', () => {
    const store = usePlayerStore()
    const coefNode = schoolsLayers.flatMap((l) => l.nodes).find(
      (n) => n.type === 'attribute' && n.code === 'speedCoefficient',
    )
    if (!coefNode) return // 配置无此节点则跳过（护住配置重构）
    const baseSpeed = store.playerAttributes[ATTRIBUTE_CODE.speed] ?? 0
    coefNode.ranks = 1
    try {
      const inc = nodeValueAtRank(coefNode, 1)
      const expected = baseSpeed + Math.round((baseSpeed * inc) / 100)
      expect(store.playerAttributes[ATTRIBUTE_CODE.speed]).toBe(expected)
      expect(store.playerAttributes[ATTRIBUTE_CODE.speedCoefficient]).toBeUndefined()
    } finally {
      coefNode.ranks = 0
    }
  })

  it('collapseLayeredBonusKeys:六维加成/系数键折算主属性基准,非六维键原样保留(共享纯函数)', () => {
    const out = collapseLayeredBonusKeys(
      { speedCoefficient: 4, attackBonus: 10, lifestealRate: 5 },
      { speed: 300, attack: 200 },
    )
    expect(out.speed).toBe(12) // 4% × 300
    expect(out.attack).toBe(20) // 10% × 200
    expect(out.lifestealRate).toBe(5) // 非六维键透传
    expect(out.speedCoefficient).toBeUndefined()
    expect(out.attackBonus).toBeUndefined()
  })
})
