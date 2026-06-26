import type { BuffConfig } from '@/domain/buff/types'
import type { Character } from '@/domain/character/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { normalizeAttributeCode, ModifierType } from '@/domain/attribute/types'

export class BuffContext {
  public characterId: string = ''
  public instanceId: string = ''
  public config: BuffConfig = {} as BuffConfig
  public startTime: number = 0
  public variables = new Map<string, any>()
  private _buffSystem: any = null

  constructor(characterId?: string, instanceId?: string, config?: BuffConfig, buffSystem?: any) {
    if (buffSystem) this._buffSystem = buffSystem
    if (characterId && instanceId && config) this.initialize(characterId, instanceId, config)
  }

  private get buffSystem(): any {
    if (!this._buffSystem) console.warn('BuffSystem not injected')
    return this._buffSystem
  }

  public initialize(characterId: string, instanceId: string, config: BuffConfig, buffSystem?: any): void {
    this.characterId = characterId
    this.instanceId = instanceId
    this.config = config
    this.startTime = Date.now()
    this.variables.clear()
    if (buffSystem) this._buffSystem = buffSystem
  }

  public reset(): void {
    this.characterId = ''
    this.instanceId = ''
    this.config = {} as BuffConfig
    this.startTime = 0
    this.variables.clear()
    this._buffSystem = null
  }

  public getElapsedTime(): number {
    return Date.now() - this.startTime
  }

  public getRemainingTime(): number {
    if (this.config.duration <= 0) return -1
    return Math.max(0, this.config.duration - this.getElapsedTime())
  }

  public setVariable(key: string, value: any): void {
    this.variables.set(key, value)
  }

  public getVariable<T>(key: string): T | undefined {
    return this.variables.get(key) as T
  }

  public removeVariable(key: string): void {
    this.variables.delete(key)
  }

  public addModifier(
    attribute: string,
    value: number,
    type: ModifierType,
  ): void {
    const system = this.buffSystem
    if (!system) { console.warn('BuffSystem not injected, cannot add modifier'); return }
    const modifierStack = system.getModifierStack(this.characterId)
    modifierStack.addModifier(this.instanceId, normalizeAttributeCode(attribute), value, type)
    if (attribute === 'SPD') console.log(`Speed modifier added for character ${this.characterId}`)
  }

  public removeModifiers(): void {
    const system = this.buffSystem
    if (!system) { console.warn('BuffSystem not injected, cannot remove modifiers'); return }
    const modifierStack = system.getModifierStack(this.characterId)
    modifierStack.removeModifier(this.instanceId)
  }

  public getCharacter(): Character | undefined {
    return undefined
  }

  public getAttributeValue(attribute: string): number {
    const character = this.getCharacter()
    return character ? character.getAttribute(normalizeAttributeCode(attribute)) : 0
  }

  public triggerEvent(eventName: string, data?: any): void {
    console.log(`Buff event triggered: ${eventName}`, data)
  }
}
