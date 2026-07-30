import type { BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { ParticipantSide } from '@/domain/battle/type/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { getEnemyConfig } from '@tests/fixtures/loadTestData'

export const defaultAttrs = {
  [ATTRIBUTE_CODE.attack]: {
    value: 63,
    base: 63,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.minAttack]: {
    value: 50,
    base: 50,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.maxAttack]: {
    value: 75,
    base: 75,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.defense]: {
    value: 15,
    base: 15,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.maxHealth]: {
    value: 350,
    base: 350,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.currentHealth]: {
    value: 350,
    base: 350,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.speed]: {
    value: 35,
    base: 35,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.currentEnergy]: {
    value: 30,
    base: 30,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.maxEnergy]: {
    value: 200,
    base: 200,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.critRate]: {
    value: 10,
    base: 10,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.critDamage]: {
    value: 125,
    base: 125,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.dodge]: {
    value: 0,
    base: 0,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.hit]: {
    value: 100,
    base: 100,
    modifiers: [],
    cachedVersion: 0,
  },
}

export function createMockEntity(
  overrides?: Partial<Record<string, unknown>>,
): BattleEntity {
  const attrs = { ...defaultAttrs }
  const hp = overrides?.maxHealth ?? 350
  const curHp = overrides?.currentHealth ?? 350
  attrs[ATTRIBUTE_CODE.maxHealth] = {
    ...attrs[ATTRIBUTE_CODE.maxHealth],
    value: hp as number,
  }
  attrs[ATTRIBUTE_CODE.currentHealth] = {
    ...attrs[ATTRIBUTE_CODE.currentHealth],
    value: curHp as number,
  }

  return {
    id: 'test_entity',
    name: 'Test',
    level: 50,
    team: ParticipantSide.ALLY,
    enabled: true,
    seatIndex: 0,
    statusEffects: [],
    skills: { small: [], passive: [], ultimate: [] },
    maxHealth: hp,
    currentHealth: curHp,
    getAttrVal: (attr: string) => attrs[attr as ATTRIBUTE_CODE],
    getAttribute: (attr: string) => attrs[attr as ATTRIBUTE_CODE]?.value ?? 0,
    getAttr: (attr: string) => attrs[attr as ATTRIBUTE_CODE]?.value ?? 0,
    getAttrValue: (attr: string) => attrs[attr as ATTRIBUTE_CODE],
    recalcAll: () => {},
    setAttribute: () => {},
    recalculateAll: () => {},
    setModifierProvider: () => {},
    getBuffInstanceIds: () => [],
    hasBuff: () => false,
    getRandomAttackDamage: () =>
      Math.floor(
        Math.random() *
          ((attrs[ATTRIBUTE_CODE.maxAttack]?.value ?? 0) -
            (attrs[ATTRIBUTE_CODE.minAttack]?.value ?? 0) +
            1),
      ) + (attrs[ATTRIBUTE_CODE.minAttack]?.value ?? 0),
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

// ═══════════════════════════════════════════════
//  基于真实 JSON 配置的 Mock 创建函数（新增）
// ═══════════════════════════════════════════════

/**
 * 从真实敌人配置创建 Mock 实体。
 * 使用 GameDataProcessor.enemyToParticipant 生成完整 BattleParticipantImpl，
 * 再提取结构给调用方。返回 { participant, ...attrs } 以便测试同时访问实体和属性值。
 */
export function createMockEntityFromConfig(
  enemyId: string,
  side: ParticipantSide = ParticipantSide.ALLY,
) {
  const enemy = getEnemyConfig(enemyId)
  if (!enemy) return undefined
  const participant = GameDataProcessor.enemyToParticipant(enemy, side)
  return { participant, id: enemy.id, name: enemy.name, level: enemy.level }
}
