import type { BattleEntity } from '@/domain/battle/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { PARTICIPANT_SIDE } from '@/domain/battle/types'

export const defaultAttrs = {
  [ATTRIBUTE_CODE.attack]: { value: 100, base: 100, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.minAttack]: { value: 80, base: 80, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.maxAttack]: { value: 120, base: 120, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.defense]: { value: 50, base: 50, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.maxHealth]: { value: 1000, base: 1000, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.currentHealth]: { value: 800, base: 1000, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.speed]: { value: 100, base: 100, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.currentEnergy]: { value: 30, base: 30, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.maxEnergy]: { value: 200, base: 200, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.critRate]: { value: 10, base: 10, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.critDamage]: { value: 125, base: 125, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.dodge]: { value: 0, base: 0, modifiers: [], cachedVersion: 0 },
  [ATTRIBUTE_CODE.hit]: { value: 100, base: 100, modifiers: [], cachedVersion: 0 },
}

export function createMockEntity(overrides?: Partial<Record<string, unknown>>): BattleEntity {
  const attrs = { ...defaultAttrs }
  const hp = overrides?.maxHealth ?? 1000
  const curHp = overrides?.currentHealth ?? 800
  attrs[ATTRIBUTE_CODE.maxHealth] = { ...attrs[ATTRIBUTE_CODE.maxHealth], value: hp as number }
  attrs[ATTRIBUTE_CODE.currentHealth] = { ...attrs[ATTRIBUTE_CODE.currentHealth], value: curHp as number }

  return {
    id: 'test_entity',
    name: 'Test',
    level: 50,
    type: PARTICIPANT_SIDE.ALLY,
    team: PARTICIPANT_SIDE.ALLY,
    enabled: true,
    seatIndex: 0,
    statusEffects: [],
    skills: { small: [], passive: [], ultimate: [] },
    attributeValues: attrs as any,
    maxHealth: hp,
    currentHealth: curHp,
    getAttributeValue: (attr: string) => attrs[attr as ATTRIBUTE_CODE],
    getAttribute: (attr: string) => attrs[attr as ATTRIBUTE_CODE]?.value ?? 0,
    getAttr: (attr: string) => attrs[attr as ATTRIBUTE_CODE]?.value ?? 0,
    getAttrValue: (attr: string) => attrs[attr as ATTRIBUTE_CODE],
    recalcAll: () => {},
    setAttribute: () => {},
    recalculateAll: () => {},
    setModifierProvider: () => {},
    getBuffInstanceIds: () => [],
    hasBuff: () => false,
    getRandomAttackDemage: () => Math.floor(Math.random() * (attrs[ATTRIBUTE_CODE.maxAttack]?.value ?? 0 - attrs[ATTRIBUTE_CODE.minAttack]?.value ?? 0 + 1)) + (attrs[ATTRIBUTE_CODE.minAttack]?.value ?? 0),
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
