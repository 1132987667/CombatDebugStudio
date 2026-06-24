import type { SkillSet } from '@/domain/skill/types'
import type { AttributeValues } from '@/domain/attribute/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { PARTICIPANT_SIDE } from '@/domain/battle/types'

export const EMPTY_SKILL_SET: SkillSet = {
  small: [],
  passive: [],
  ultimate: [],
}

export function makeDefaultAttributes(overrides?: Partial<AttributeValues>): AttributeValues {
  const defaults: AttributeValues = {
    [ATTRIBUTE_CODE.maxHealth]: { value: 1000, base: 1000, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.currentHealth]: { value: 1000, base: 1000, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.attack]: { value: 100, base: 100, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.defense]: { value: 50, base: 50, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.speed]: { value: 100, base: 100, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.energy]: { value: 100, base: 100, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.maxEnergy]: { value: 150, base: 150, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.critRate]: { value: 0.05, base: 0.05, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.critDamage]: { value: 1.5, base: 1.5, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.dodge]: { value: 0, base: 0, modifiers: [], dirty: false },
    [ATTRIBUTE_CODE.hit]: { value: 1, base: 1, modifiers: [], dirty: false },
  }
  return { ...defaults, ...overrides }
}

export const allyParticipantData = {
  id: 'ally_1',
  name: '测试角色',
  level: 50,
  type: PARTICIPANT_SIDE.ALLY,
  team: PARTICIPANT_SIDE.ALLY,
  enabled: true,
  skills: EMPTY_SKILL_SET,
  attributeValues: makeDefaultAttributes(),
}

export const allyParticipantData2 = {
  id: 'ally_2',
  name: '测试角色2',
  level: 50,
  type: PARTICIPANT_SIDE.ALLY,
  team: PARTICIPANT_SIDE.ALLY,
  enabled: true,
  skills: EMPTY_SKILL_SET,
  attributeValues: makeDefaultAttributes({ speed: { value: 80, base: 80, modifiers: [], dirty: false } }),
}

export const enemyParticipantData = {
  id: 'enemy_1',
  name: '测试敌人',
  level: 50,
  type: PARTICIPANT_SIDE.ENEMY,
  team: PARTICIPANT_SIDE.ENEMY,
  enabled: true,
  skills: EMPTY_SKILL_SET,
  attributeValues: makeDefaultAttributes({ maxHealth: { value: 500, base: 500, modifiers: [], dirty: false }, currentHealth: { value: 500, base: 500, modifiers: [], dirty: false } }),
}

export const enemyParticipantData2 = {
  id: 'enemy_2',
  name: '测试敌人2',
  level: 50,
  type: PARTICIPANT_SIDE.ENEMY,
  team: PARTICIPANT_SIDE.ENEMY,
  enabled: true,
  skills: EMPTY_SKILL_SET,
  attributeValues: makeDefaultAttributes({ maxHealth: { value: 500, base: 500, modifiers: [], dirty: false }, currentHealth: { value: 500, base: 500, modifiers: [], dirty: false } }),
}
