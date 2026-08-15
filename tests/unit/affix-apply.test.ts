/**
 * 词缀应用工具测试
 *
 * 覆盖：applyAffixToParticipant 修饰符注入、applyRandomAffixes 随机分配（确定性 rng）。
 * 运行: npx vitest run tests/unit/affix-apply.test.ts
 */
import { describe, it, expect, afterEach } from 'vitest'
import type { BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { ParticipantSide } from '@/domain/battle/type/types'
import {
  applyAffixToParticipant,
  applyRandomAffixes,
  applyRandomAffixesByPool,
  clearAffixesFromParticipant,
  resolveAffixPlan,
} from '@/shared/utils/affix'
import type { AffixData } from '@/domain/fengshen/types'
import type { Enemy } from '@/shared/types/enemy'
import type { SkillConfig } from '@/domain/skill/types'
import type { SceneData } from '@/shared/types/scene'
import type { IDataSource } from '@/domain/port/IDataSource'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { ConfigDataSource } from '@/shared/utils/ConfigDataSource'

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
    [ATTRIBUTE_CODE.critRate]: { value: 0, base: 0, modifiers: [], cachedVersion: 0 },
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

  it('isPercentage 属性未声明 type 时默认 ADDITIVE（防 base=0 时 PERCENTAGE 缩放无效）', () => {
    // critRate 为 isPercentage 属性，词缀未声明 type → 应默认 ADDITIVE（百分点直加，非相对缩放）
    const entity = makeEntity('e_pct')
    const affixCrit: AffixData = {
      id: 'affix_test_crit',
      name: '暴击',
      tier: 'yao_1',
      target: 'enemy',
      statModifiers: [{ attribute: 'critRate', percent: 20 }],
    }
    const ok = applyAffixToParticipant(entity, affixCrit)
    expect(ok).toBe(true)
    const mod = entity.getAttrValue('critRate')?.modifiers[0]
    expect(mod).toMatchObject({ type: ModifierType.ADDITIVE, value: 20 })
  })

  it('数值属性未声明 type 时默认 PERCENTAGE（相对缩放）', () => {
    // attack 为非 isPercentage 属性，未声明 type → 默认 PERCENTAGE
    const entity = makeEntity('e_atk')
    const ok = applyAffixToParticipant(entity, affixAttack)
    expect(ok).toBe(true)
    expect(entity.getAttrValue(ATTRIBUTE_CODE.attack)?.modifiers[0]).toMatchObject({
      type: ModifierType.PERCENTAGE,
      value: 20,
    })
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

  it('clearAffixesFromParticipant 清除全部词缀修饰符，非词缀修饰符保留', () => {
    const entity = makeEntity('e5')
    applyAffixToParticipant(entity, affixAttack)
    applyAffixToParticipant(entity, affixDefense)
    // 注入一个非词缀修饰符（模拟 base/bonus），验证不被误删
    const attrData = entity.getAttrValue(ATTRIBUTE_CODE.attack)!
    attrData.modifiers.push({
      sourceKey: 'passive:test',
      sourceType: 'talent',
      attribute: ATTRIBUTE_CODE.attack,
      value: 5,
      type: ModifierType.PERCENTAGE,
    })
    expect(attrData.modifiers.length).toBe(2)
    // 词缀修饰符同时在多个属性上：attack 1 个 + defense 1 个
    expect(entity.getAttrValue(ATTRIBUTE_CODE.defense)!.modifiers.length).toBe(1)

    const cleared = clearAffixesFromParticipant(entity)
    expect(cleared).toBe(true)
    expect(attrData.modifiers.length).toBe(1)
    expect(attrData.modifiers[0].sourceKey).toBe('passive:test')
    expect(entity.getAttrValue(ATTRIBUTE_CODE.defense)!.modifiers.length).toBe(0)
  })

  it('无词缀时 clearAffixesFromParticipant 返回 false 且不触发重算', () => {
    let recalculated = 0
    const entity = makeEntity('e6')
    const original = entity.recalcAll
    entity.recalcAll = () => {
      recalculated++
      original()
    }
    expect(clearAffixesFromParticipant(entity)).toBe(false)
    expect(recalculated).toBe(0)
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

describe('resolveAffixPlan', () => {
  const affixes: AffixData[] = [
    { id: 'affix_yao_2_001', name: '噬血', tier: 'yao_2', target: 'enemy',
      statModifiers: [{ attribute: 'lifestealRate', percent: 40, type: 'ADDITIVE' }] },
    { id: 'affix_yao_2_002', name: '猎杀', tier: 'yao_2', target: 'enemy',
      statModifiers: [{ attribute: 'damageToLowHp', percent: 40, type: 'ADDITIVE' }] },
    { id: 'affix_yao_3_001', name: '天罚', tier: 'yao_3', target: 'enemy',
      statModifiers: [{ attribute: 'attack', percent: 60 }] },
    { id: 'affix_jie_001', name: '破军', tier: 'jie', target: 'player',
      statModifiers: [{ attribute: 'attack', percent: -20 }] },
    { id: 'affix_mandate_001', name: '混世魔威', tier: 'mandate', target: 'enemy',
      statModifiers: [{ attribute: 'attack', percent: 60 }] },
  ]
  const mandateBindings = new Map<string, string>([['boss_king_niumo', 'affix_mandate_001']])

  it('buffTier 0 / 缺省 → null（无词缀）', () => {
    expect(resolveAffixPlan({ id: 'e1', affixPool: { buffTier: 0, count: 0 } }, affixes, mandateBindings)).toBeNull()
    expect(resolveAffixPlan({ id: 'e2' }, affixes, mandateBindings)).toBeNull()
  })

  it('buffTier 2 → 二档增益池，数量取 count', () => {
    const plan = resolveAffixPlan({ id: 'e3', affixPool: { buffTier: 2, count: 2 } }, affixes, mandateBindings)
    expect(plan).not.toBeNull()
    expect(plan!.pool.map((a) => a.id).sort()).toEqual(['affix_yao_2_001', 'affix_yao_2_002'])
    expect(plan!.count).toBe(2)
  })

  it('buffTier 3 → 三档池，不含劫数（jie）与天命（mandate）', () => {
    const plan = resolveAffixPlan({ id: 'e4', affixPool: { buffTier: 3 } }, affixes, mandateBindings)
    expect(plan).not.toBeNull()
    expect(plan!.pool.map((a) => a.id)).toEqual(['affix_yao_3_001'])
    expect(plan!.count).toBe(1)
  })

  it('buffTier 5 → 按 mandate_bindings 绑定附加，不可随机', () => {
    const plan = resolveAffixPlan({ id: 'boss_king_niumo', affixPool: { buffTier: 5 } }, affixes, mandateBindings)
    expect(plan).not.toBeNull()
    expect(plan!.pool.map((a) => a.id)).toEqual(['affix_mandate_001'])
    expect(plan!.count).toBe(1)
  })

  it('buffTier 非 5 但命中 mandate_bindings → 仍按绑定附加（绑定表优先于档位判定）', () => {
    // 数据两处维护：mandate_bindings 是权威，buffTier 即使不是 5 也应附加绑定天命
    const plan = resolveAffixPlan({ id: 'boss_king_niumo', affixPool: { buffTier: 2 } }, affixes, mandateBindings)
    expect(plan).not.toBeNull()
    expect(plan!.pool.map((a) => a.id)).toEqual(['affix_mandate_001'])
  })

  it('buffTier 5 且无绑定 → null（不随机天命）', () => {
    expect(resolveAffixPlan({ id: 'boss_unknown', affixPool: { buffTier: 5 } }, affixes, mandateBindings)).toBeNull()
  })

  it('档位池为空 → null', () => {
    expect(resolveAffixPlan({ id: 'e9', affixPool: { buffTier: 4 } }, affixes, mandateBindings)).toBeNull()
  })
})

describe('applyRandomAffixesByPool', () => {
  it('按每角色独立词缀池抽取，池解析失败的角色跳过', () => {
    const eEnemy = makeEntity('char_enemy')
    const eAlly = makeEntity('char_ally')
    const eNoPool = makeEntity('char_none')
    const poolA: AffixData[] = [
      { id: 'affix_yao_2_006', name: '蛮力·烈', tier: 'yao_2', target: 'enemy',
        statModifiers: [{ attribute: 'attack', percent: 40 }] },
    ]
    const poolB: AffixData[] = [
      { id: 'affix_yao_3_001', name: '天罚', tier: 'yao_3', target: 'enemy',
        statModifiers: [{ attribute: 'attack', percent: 60 }] },
    ]
    const resolvePool = (p: BattleEntity) => {
      if (p.id === 'char_enemy') return { pool: poolA, count: 1 }
      if (p.id === 'char_ally') return { pool: poolB, count: 2 }
      return null
    }
    const result = applyRandomAffixesByPool([eEnemy, eAlly, eNoPool], resolvePool, () => 0)
    expect(result.size).toBe(2)
    expect(result.get('char_enemy')).toEqual(['affix_yao_2_006'])
    // 池 B 仅 1 条，count=2 也不会越界
    expect(result.get('char_ally')).toEqual(['affix_yao_3_001'])
  })
})

describe('enemyToParticipant 自动应用词缀（W12 自动路径）', () => {
  const affixAtk: AffixData = {
    id: 'affix_auto_atk',
    name: '蛮力',
    tier: 'yao_1',
    target: 'enemy',
    statModifiers: [{ attribute: 'attack', percent: 20 }],
  }
  const affixHp: AffixData = {
    id: 'affix_auto_hp',
    name: '铜躯',
    tier: 'yao_1',
    target: 'enemy',
    statModifiers: [{ attribute: 'maxHealth', percent: 20 }],
  }
  const makeSource = (affixes: AffixData[]): IDataSource => ({
    getEnemies: () => [],
    getSkills: () => [] as SkillConfig[],
    getScenes: () => [] as SceneData[],
    getLineups: () => [],
    getAffixes: () => affixes,
  })
  const makeEnemy = (id: string, affixPool?: { buffTier?: number; count?: number }): Enemy => ({
    id,
    name: id,
    level: 1,
    stats: { currentHealth: 500, maxHealth: 500, attack: 100, defense: 50, speed: 30 },
    drops: [],
    skills: { small: [], passive: [], ultimate: [] },
    affixPool,
  })

  afterEach(() => {
    GameDataProcessor.setDataSource(new ConfigDataSource())
  })

  it('affixPool.buffTier>0 → 自动附加词缀修饰符并生效于属性', () => {
    GameDataProcessor.setDataSource(makeSource([affixAtk]))
    const p = GameDataProcessor.enemyToParticipant(
      makeEnemy('e_auto', { buffTier: 1, count: 1 }),
      ParticipantSide.ENEMY,
    )
    const atkMods = p.getAttrValue(ATTRIBUTE_CODE.attack)?.modifiers ?? []
    const affixMods = atkMods.filter((m) => m.sourceKey.startsWith('affix:'))
    expect(affixMods).toHaveLength(1)
    expect(affixMods[0].sourceType).toBe('affix')
    expect(p.getAttribute(ATTRIBUTE_CODE.attack)).toBe(120)
  })

  it('affixPool 缺省 / buffTier 0 → 不附加词缀', () => {
    GameDataProcessor.setDataSource(makeSource([affixAtk]))
    const plain = GameDataProcessor.enemyToParticipant(makeEnemy('e_plain'), ParticipantSide.ENEMY)
    expect(
      (plain.getAttrValue(ATTRIBUTE_CODE.attack)?.modifiers ?? []).some((m) => m.sourceKey.startsWith('affix:')),
    ).toBe(false)
    const zero = GameDataProcessor.enemyToParticipant(
      makeEnemy('e_zero', { buffTier: 0, count: 0 }),
      ParticipantSide.ENEMY,
    )
    expect(
      (zero.getAttrValue(ATTRIBUTE_CODE.attack)?.modifiers ?? []).some((m) => m.sourceKey.startsWith('affix:')),
    ).toBe(false)
  })

  it('词缀修正 maxHealth 后 currentHealth 同步为最终上限（满血，词缀在气血修正之后应用）', () => {
    GameDataProcessor.setDataSource(makeSource([affixAtk, affixHp]))
    const p = GameDataProcessor.enemyToParticipant(
      makeEnemy('e_hp', { buffTier: 1, count: 1 }),
      ParticipantSide.ENEMY,
    )
    // 池含 2 条、count=1，随机附加任意一条；无论命中 maxHealth 修正与否，
    // 词缀应用后 currentHealth 都应与最终 maxHealth 一致
    expect(p.getAttribute(ATTRIBUTE_CODE.currentHealth)).toBe(
      p.getAttribute(ATTRIBUTE_CODE.maxHealth),
    )
  })
})
