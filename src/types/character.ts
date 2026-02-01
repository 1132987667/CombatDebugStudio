import type { AttributeType } from './modifier'

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
    baseValue: number
  ): number

  getBaseValue(characterId: string, attribute: AttributeType): number
  setBaseValue(
    characterId: string,
    attribute: AttributeType,
    value: number
  ): void
}

export interface CharacterManager {
  getCharacter(characterId: string): Character | undefined
  createCharacter(data: Partial<Character>): Character
  removeCharacter(characterId: string): void
  getAllCharacters(): Character[]
}
