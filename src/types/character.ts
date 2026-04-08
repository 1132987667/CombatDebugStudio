import type { AttributeType } from '@/types/modifier'

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
  /** 当前生命值 */
  currentHp: number
  /** 最大生命值 */
  maxHp: number
  /** 当前魔法值 */
  currentEnergy: number
  /** 最大魔法值 */
  maxEnergy: number
  /** 攻击力 */
  attack: number
  /** 防御力 */
  defense: number
  /** 速度 */
  speed: number
  /** 暴击率 */
  critRate: number
  /** 暴击伤害 */
  critDamage: number
  /** 命中率 */
  accuracy: number
  /** 闪避率 */
  evade: number
  /** 吸血 */
  lifeSteal: number
  /** 生命回复 */
  regeneration: number
  /** 魔法回复 */
  manaRegen: number
  /** 伤害提升 */
  damageBoost: number
  /** 伤害减免 */
  damageReduce: number
  /** 是否启用 */
  enabled: boolean
  /** buff列表 */
  buffs?: any[]
}

/**
 * 角色接口
 * 定义角色的基础属性和方法
 * 注意：BattleEntity 是角色在战斗中的特化版本，提供了更丰富的战斗相关方法
 */
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
