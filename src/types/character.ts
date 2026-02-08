import type { AttributeType } from './modifier'

/**
 * 角色属性接口
 * 定义角色的基础属性值
 */
export interface CharacterStats {
  /** 原始角色ID */
  originalId: string
  /** 角色ID */
  id: string
  /** 角色名称 */
  name: string
  /** 角色等级 */
  level: number
  /** 生命值 */
  HP: number
  /** 最大生命值 */
  MAX_HP: number
  /** 魔法值 */
  MP: number
  /** 攻击力 */
  ATK: number
  /** 防御力 */
  DEF: number
  /** 速度 */
  SPD: number
  /** 暴击率 */
  CRIT_RATE: number
  /** 暴击伤害 */
  CRIT_DMG: number
  /** 命中率 */
  ACCURACY: number
  /** 闪避率 */
  EVADE: number
  /** 吸血 */
  LIFESTEAL: number
  /** 生命回复 */
  REGENERATION: number
  /** 魔法回复 */
  MANA_REGEN: number
  /** 伤害提升 */
  DAMAGE_BOOST: number
  /** 伤害减免 */
  DAMAGE_REDUCE: number
  /** 是否启用 */
  enabled: boolean
}

export interface Character {
  id: string
  name: string
  level: number
  attributes: Record<AttributeType, number>
  buffs: string[]

  getAttribute(attribute: AttributeType): number
  setAttribute(attribute: AttributeType, value: number): void
  addBuff(buffInstanceId: string): void
  removeBuff(buffInstanceId: string): void
  hasBuff(buffId: string): boolean
}

export interface AttributeSystem {
  calculateFinalValue(
    characterId: string,
    attribute: AttributeType,
    baseValue: number,
  ): number

  getBaseValue(characterId: string, attribute: AttributeType): number
  setBaseValue(
    characterId: string,
    attribute: AttributeType,
    value: number,
  ): void
}

export interface CharacterManager {
  getCharacter(characterId: string): Character | undefined
  createCharacter(data: Partial<Character>): Character
  removeCharacter(characterId: string): void
  getAllCharacters(): Character[]
}
