import type { SkillSet } from '@/domain/skill/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { ParticipantSide } from '@/domain/battle/type/types'

export const EMPTY_SKILL_SET: SkillSet = {
  small: [],
  passive: [],
  ultimate: [],
}

export function makeDefaultAttributes(overrides?: Partial<Record<ATTRIBUTE_CODE, number>>): Partial<Record<ATTRIBUTE_CODE, number>> {
  const defaults: Partial<Record<ATTRIBUTE_CODE, number>> = {
    [ATTRIBUTE_CODE.maxHealth]: 1000,
    [ATTRIBUTE_CODE.currentHealth]: 1000,
    [ATTRIBUTE_CODE.attack]: 100,
    [ATTRIBUTE_CODE.defense]: 50,
    [ATTRIBUTE_CODE.speed]: 100,
    [ATTRIBUTE_CODE.currentEnergy]: 30,
    [ATTRIBUTE_CODE.maxEnergy]: 200,
    [ATTRIBUTE_CODE.critRate]: 0.05,
    [ATTRIBUTE_CODE.critDamage]: 1.5,
    [ATTRIBUTE_CODE.dodge]: 0,
    [ATTRIBUTE_CODE.hit]: 1,
  }
  return { ...defaults, ...overrides }
}

export const allyParticipantData = {
  id: 'ally_1',
  name: '测试角色',
  level: 50,
  team: ParticipantSide.ALLY,
  enabled: true,
  skills: EMPTY_SKILL_SET,
  attributeValues: makeDefaultAttributes(),
}

export const allyParticipantData2 = {
  id: 'ally_2',
  name: '测试角色2',
  level: 50,
  team: ParticipantSide.ALLY,
  enabled: true,
  skills: EMPTY_SKILL_SET,
  attributeValues: makeDefaultAttributes({ [ATTRIBUTE_CODE.speed]: 80 }),
}

export const enemyParticipantData = {
  id: 'enemy_1',
  name: '测试敌人',
  level: 50,
  team: ParticipantSide.ENEMY,
  enabled: true,
  skills: EMPTY_SKILL_SET,
  attributeValues: makeDefaultAttributes({ [ATTRIBUTE_CODE.maxHealth]: 500, [ATTRIBUTE_CODE.currentHealth]: 500 }),
}

export const enemyParticipantData2 = {
  id: 'enemy_2',
  name: '测试敌人2',
  level: 50,
  team: ParticipantSide.ENEMY,
  enabled: true,
  skills: EMPTY_SKILL_SET,
  attributeValues: makeDefaultAttributes({ [ATTRIBUTE_CODE.maxHealth]: 500, [ATTRIBUTE_CODE.currentHealth]: 500 }),
}
