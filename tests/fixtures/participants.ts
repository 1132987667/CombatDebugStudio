import type { SkillSet } from '@/domain/skill/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { ParticipantSide } from '@/domain/battle/type/types'
import type { BattleParticipantImpl } from '@/domain/battle/entity/BattleParticipantImpl'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { getEnemyConfig } from '@tests/fixtures/loadTestData'

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

// ═══════════════════════════════════════════════
//  基于真实 JSON 配置的参与者创建函数（新增）
// ═══════════════════════════════════════════════

let _counter = 0

/**
 * 从敌人 JSON 配置创建参与者实例。
 * 使用 GameDataProcessor.enemyToParticipant 走完整转换流程，
 * 确保测试用参与者与真实游戏逻辑一致。
 */
export function createParticipantFromEnemy(
  enemyId: string,
  side: ParticipantSide = ParticipantSide.ENEMY,
): BattleParticipantImpl | undefined {
  const enemy = getEnemyConfig(enemyId)
  if (!enemy) return undefined
  _counter++
  return GameDataProcessor.enemyToParticipant(enemy, side, _counter)
}

/**
 * 创建一套标准对战参与者（2v2，基于真实敌人配置）。
 * 默认用 guardian_fire vs guardian_gold 的测试守护者组合。
 */
export function createTestParticipantsFromConfig(
  allyIds: string[] = ['guardian_fire'],
  enemyIds: string[] = ['guardian_gold'],
): { allies: BattleParticipantImpl[]; enemies: BattleParticipantImpl[] } {
  const allies = allyIds
    .map((id) => createParticipantFromEnemy(id, ParticipantSide.ALLY))
    .filter((p): p is BattleParticipantImpl => p !== undefined)
  const enemies = enemyIds
    .map((id) => createParticipantFromEnemy(id, ParticipantSide.ENEMY))
    .filter((p): p is BattleParticipantImpl => p !== undefined)
  return { allies, enemies }
}
