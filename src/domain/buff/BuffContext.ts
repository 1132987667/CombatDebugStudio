import type { BuffConfig } from '@/domain/buff/types'
import type { Character } from '@/domain/character/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

export class BuffContext {
  public characterId: string = ''
  public instanceId: string = ''
  public config: BuffConfig = {} as BuffConfig
  public startTime: number = 0
  public variables = new Map<string, any>()
  private _buffSystem: BuffSystem | null = null

  constructor(characterId?: string, instanceId?: string, config?: BuffConfig, buffSystem?: BuffSystem) {
    if (buffSystem) this._buffSystem = buffSystem
    if (characterId && instanceId && config) this.initialize(characterId, instanceId, config)
  }

  private get buffSystem(): BuffSystem {
    if (!this._buffSystem) console.warn('BuffSystem not injected')
    return this._buffSystem!
  }

  public initialize(characterId: string, instanceId: string, config: BuffConfig, buffSystem?: BuffSystem): void {
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
    modifierStack.addModifier(this.instanceId, attribute as ATTRIBUTE_CODE, value, type)
    if (attribute === 'speed') console.log(`Speed modifier added for character ${this.characterId}`)
  }

  public removeModifiers(attribute?: string): void {
    const system = this.buffSystem
    if (!system) { console.warn('BuffSystem not injected, cannot remove modifiers'); return }
    const modifierStack = system.getModifierStack(this.characterId)
    modifierStack.removeModifier(this.instanceId, attribute as ATTRIBUTE_CODE | undefined)
  }

  // TODO: 实现从 BuffSystem 或外部注入的 Character 缓存中获取角色实例
  public getCharacter(): Character | undefined {
    return undefined
  }

  public getAttributeValue(attribute: string): number {
    const character = this.getCharacter()
    return character ? character.getAttribute(attribute as ATTRIBUTE_CODE) : 0
  }

  public triggerEvent(eventName: string, data?: any): void {
    const system = this._buffSystem
    if (system) {
      system.executeTriggerScript(this.instanceId, this.characterId, eventName, data)
    } else {
      console.warn(`BuffSystem not injected, cannot trigger event: ${eventName}`, data)
    }
  }
}
