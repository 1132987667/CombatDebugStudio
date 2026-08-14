/**
 * 词缀应用工具测试
 *
 * 覆盖：applyAffixToParticipant 修饰符注入、applyRandomAffixes 随机分配（确定性 rng）。
 * 运行: npx vitest run tests/unit/affix-apply.test.ts
 */
import { describe, it, expect } from 'vitest'
import type { BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { ParticipantSide } from '@/domain/battle/type/types'
import {
  applyAffixToParticipant,
  applyRandomAffixes,
} from '@/shared/utils/affix'
import type { AffixData } from '@/domain/fengshen/types'

/** 构造独立 BattleEntity（属性对象各自独立，避免 MockEntity 共享 modifiers 引用导致的测试间污染） */
function makeEntity(id: string): BattleEntity {
  const attrs: Record<string, { value: number; base: number; modifiers: unknown[]; cachedVersion: number }> = {
    [ATTRIBUTE_CODE.attack]: { value: 63, base: 63, modifiers: [], cachedVersion: 0 },
    [ATTRIBUTE_CODE.defense]: { value: 15, base: 15, modifiers: [], cachedVersion: 0 },
    [ATTRIBUTE_CODE.maxHealth]: { value: 350, base: 350, modifiers: [], cachedVersion: 0 },
    [ATTRIBUTE_CODE.currentHealth]: { value: 350, base: 350, modifiers: [], cachedVersion: 0 },
    [ATTRIBUTE_CODE.speed]: { value: 35, base: 35, modifiers: [], cachedVersion: 0 },
    [ATTRIBUTE_CODE.fireRes]: { value: 0, base: 0, modifiers: [], cachedVersion: 0 },
    [ATTRIBUTE_CODE.earthRes]: { value: 0, base: 0, modifiers: [], cachedVersion: 0 },
  }
  return {
    id,
    name: id,
    level: 50,
    team: ParticipantSide.ALLY,
    enabled: true,
    seatIndex: 0,
    statusEffects: [],
    skills: { small: [], passive: [], ultimate: [] },
    maxHealth: 350,
    currentHealth: 350,
    getAttrVal: (attr: string) => attrs[attr],
    getAttribute: (attr: string) => attrs[attr]?.value ?? 0,
    getAttr: (attr: string) => attrs[attr]?.value ?? 0,
    getAttrValue: (attr: string) => attrs[attr],
    recalcAll: () => {},
    setAttribute: () => {},
    recalculateAll: () => {},
    setModifierProvider: () => {},
    getBuffInstanceIds: () => [],
    hasBuff: () => false,
    takeDamage: (n: number) => n,
    heal: (n: number) => n,
    isAlive: () => true,
    gainEnergy: () => {},
    spendEnergy: () => true,
    afterAction: () => {},
    resetEnergyHitCount: () => {},
    isFullHealth: () => false,
    needsHealing: () => true,
    getSkillList: () => [],
    getSkillIds: () => [],
    hasSkill: () => false,
  } as unknown as BattleEntity
}

const affixAttack: AffixData = {
  id: 'affix_yao_1_001',
  name: '蛮力',
  tier: 'yao_1',
  target: 'enemy',
  statModifiers: [{ attribute: 'attack', percent: 20 }],
  description: '敌人攻击力+20%',
}

const affixDefense: AffixData = {
  id: 'affix_yao_1_002',
  name: '铁躯',
  tier: 'yao_1',
  target: 'enemy',
  statModifiers: [{ attribute: 'defense', percent: 40 }],
  description: '敌人防御力+40%',
}

const affixMulti: AffixData = {
  id: 'affix_yao_2_006',
  name: '蛮力·烈',
  tier: 'yao_2',
  target: 'enemy',
  statModifiers: [
    { attribute: 'attack', percent: 10 },
    { attribute: 'speed', percent: 15 },
  ],
  description: '攻击+10%，速度+15%',
}

describe('applyAffixToParticipant', () => {
  it('注入 PERCENTAGE 修饰符到目标属性，并触发 recalcAll', () => {
    let recalculated = 0
    const entity = makeEntity('e1')
    const originalRecalc = entity.recalcAll
    entity.recalcAll = () => {
      recalculated++
      originalRecalc()
    }

    const ok = applyAffixToParticipant(entity, affixAttack)
    expect(ok).toBe(true)

    const attackVal = entity.getAttrValue(ATTRIBUTE_CODE.attack)
    expect(attackVal?.modifiers.length).toBe(1)
    expect(attackVal?.modifiers[0]).toMatchObject({
      sourceKey: 'affix:affix_yao_1_001',
      sourceType: 'affix',
      attribute: 'attack',
      value: 20,
      type: ModifierType.PERCENTAGE,
    })
    expect(recalculated).toBe(1)
  })

  it('多 statModifier 词缀一次注入多个属性修饰符', () => {
    const entity = makeEntity('e2')
    const ok = applyAffixToParticipant(entity, affixMulti)
    expect(ok).toBe(true)
    expect(entity.getAttrValue(ATTRIBUTE_CODE.attack)?.modifiers.length).toBe(1)
    expect(entity.getAttrValue(ATTRIBUTE_CODE.speed)?.modifiers.length).toBe(1)
  })

  it('目标属性不存在时跳过，返回 false 且不触发重算', () => {
    let recalculated = 0
    const entity = makeEntity('e3')
    const original = entity.recalcAll
    entity.recalcAll = () => {
      recalculated++
      original()
    }
    const affixBad: AffixData = {
      id: 'affix_bad',
      name: '不存在属性',
      tier: 'yao_1',
      target: 'enemy',
      statModifiers: [{ attribute: 'notExistAttr', percent: 20 }],
    }
    const ok = applyAffixToParticipant(entity, affixBad)
    expect(ok).toBe(false)
    expect(recalculated).toBe(0)
  })

  it('重复应用同一词缀不报错（修饰符按词缀 ID 累积）', () => {
    const entity = makeEntity('e4')
    applyAffixToParticipant(entity, affixAttack)
    applyAffixToParticipant(entity, affixAttack)
    expect(entity.getAttrValue(ATTRIBUTE_CODE.attack)?.modifiers.length).toBe(2)
  })
})

describe('applyRandomAffixes', () => {
  const affixes: AffixData[] = [affixAttack, affixDefense, affixMulti]

  it('词缀池为空时返回空结果', () => {
    const entity = makeEntity('e5')
    const result = applyRandomAffixes([entity], [])
    expect(result.size).toBe(0)
  })

  it('确定性 rng：为每个角色随机附加 countRange 内词缀', () => {
    const e1 = makeEntity('char_a')
    const e2 = makeEntity('char_b')
    // rng 返回 0：randInt(1,3)=1，每个角色附加 1 个词缀（具体取池中哪个由洗牌顺序决定）
    const fixedRng = () => 0
    const result = applyRandomAffixes([e1, e2], affixes, [1, 3], fixedRng)
    expect(result.size).toBe(2)
    const poolIds = affixes.map((a) => a.id)
    const e1Ids = result.get(e1.id) ?? []
    const e2Ids = result.get(e2.id) ?? []
    expect(e1Ids).toHaveLength(1)
    expect(e2Ids).toHaveLength(1)
    expect(poolIds).toContain(e1Ids[0])
    expect(poolIds).toContain(e2Ids[0])
  })

  it('countRange 上限不超过词缀池大小', () => {
    const e1 = makeEntity('char_c')
    // rng 接近 1 → randInt(1,5) = 5，但池只有 3 个 → 最多 3
    const highRng = () => 0.99
    const result = applyRandomAffixes([e1], affixes, [1, 5], highRng)
    expect(result.get(e1.id)?.length).toBe(3)
  })

  it('每个角色附加的词缀不重复', () => {
    const e1 = makeEntity('char_d')
    const highRng = () => 0.99
    const result = applyRandomAffixes([e1], affixes, [1, 5], highRng)
    const ids = result.get(e1.id) ?? []
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('同一 conflict_group 的词缀不共存（五行单抗互斥）', () => {
    const wuxingPool: AffixData[] = [
      { id: 'affix_yao_3_011', name: '火灵护体', tier: 'yao_3', target: 'enemy',
        conflict_group: 'wuxing_single', statModifiers: [{ attribute: 'fireRes', percent: 60 }] },
      { id: 'affix_yao_3_015', name: '土灵护体', tier: 'yao_3', target: 'enemy',
        conflict_group: 'wuxing_single', statModifiers: [{ attribute: 'earthRes', percent: 60 }] },
      { id: 'affix_yao_3_016', name: '五行轮转', tier: 'yao_3', target: 'enemy',
        conflict_group: 'wuxing_all', statModifiers: [{ attribute: 'fireRes', percent: 30 }] },
      { id: 'affix_yao_3_001', name: '天罚', tier: 'yao_3', target: 'enemy',
        statModifiers: [{ attribute: 'attack', percent: 60 }] },
    ]
    // rng 接近 1 → 附加 5 个，但池仅 4 个；且 3 个五行词缀分属两个互斥组，实际最多 3 条（2 单抗互斥 + 1 全抗互斥 + 天罚）
    const highRng = () => 0.99
    const e = makeEntity('wuxing')
    const result = applyRandomAffixes([e], wuxingPool, [1, 5], highRng)
    const ids = result.get(e.id) ?? []
    const selected = wuxingPool.filter((a) => ids.includes(a.id))
    const selectedGroups = new Set(selected.map((a) => a.conflict_group).filter(Boolean))
    // 同组词缀最多一条
    for (const g of ['wuxing_single', 'wuxing_all']) {
      expect(selected.filter((a) => a.conflict_group === g).length).toBeLessThanOrEqual(1)
    }
    expect(selectedGroups.size).toBeGreaterThan(0)
  })
})
