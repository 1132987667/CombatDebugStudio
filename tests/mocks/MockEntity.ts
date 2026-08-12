import type { BattleEntity } from '@/domain/battle/type/types'
import { ParticipantSide } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

export const defaultAttrs = {
  [ATTRIBUTE_CODE.attack]: {
    value: 63,
    base: 63,
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
  [ATTRIBUTE_CODE.hitValue]: {
    value: 100,
    base: 100,
    modifiers: [],
    cachedVersion: 0,
  },
  [ATTRIBUTE_CODE.dodgeValue]: {
    value: 0,
    base: 0,
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
