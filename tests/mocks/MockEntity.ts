import type { BattleEntity } from '@/types/battle'
import { ATTRIBUTE_CODE } from '@/types/attribute'
import { PARTICIPANT_SIDE } from '@/types/battle'

export const defaultAttrs = {
  [ATTRIBUTE_CODE.attack]: { value: 100, base: 100, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.defense]: { value: 50, base: 50, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.maxHealth]: { value: 1000, base: 1000, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.currentHealth]: { value: 800, base: 1000, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.speed]: { value: 100, base: 100, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.energy]: { value: 100, base: 100, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.maxEnergy]: { value: 150, base: 150, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.critRate]: { value: 0.05, base: 0.05, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.critDamage]: { value: 1.5, base: 1.5, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.dodge]: { value: 0, base: 0, modifiers: [], dirty: false },
  [ATTRIBUTE_CODE.hit]: { value: 1, base: 1, modifiers: [], dirty: false },
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
    buffs: [],
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
    markDirty: () => {},
    markAllDirty: () => {},
    recalculateAll: () => {},
    setModifierProvider: () => {},
    addBuff: () => {},
    removeBuff: () => {},
    hasBuff: () => false,
    takeDamage: (n: number) => n,
    heal: (n: number) => n,
    isAlive: () => true,
    gainEnergy: () => {},
    spendEnergy: () => true,
    afterAction: () => {},
    isFullHealth: () => false,
    needsHealing: () => true,
    getSkillList: () => [],
    getSkillIds: () => [],
    hasSkill: () => false,
  } as unknown as BattleEntity
}
