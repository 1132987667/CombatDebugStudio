import type { BuffConfig } from '@/types/buff'
import type { Character } from '@/types/character'
import { BuffSystem } from './BuffSystem'

export class BuffContext {
  public readonly characterId: string
  public readonly instanceId: string
  public readonly config: BuffConfig
  public readonly startTime: number
  public variables = new Map<string, any>()

  constructor(
    characterId: string,
    instanceId: string,
    config: BuffConfig
  ) {
    this.characterId = characterId
    this.instanceId = instanceId
    this.config = config
    this.startTime = Date.now()
  }

  public getElapsedTime(): number {
    return Date.now() - this.startTime
  }

  public getRemainingTime(): number {
    if (this.config.duration <= 0) {
      return -1
    }
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
    type: 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE'
  ): void {
    const system = BuffSystem.getInstance()
    const modifierStack = system.getModifierStack(this.characterId)
    modifierStack.addModifier(
      this.instanceId,
      attribute as any,
      value,
      type
    )
  }

  public removeModifiers(): void {
    const system = BuffSystem.getInstance()
    const modifierStack = system.getModifierStack(this.characterId)
    modifierStack.removeModifier(this.instanceId)
  }

  public getCharacter(): Character | undefined {
    // 这里应该从角色系统获取角色实例
    // 暂时返回 undefined，实际实现需要集成角色系统
    return undefined
  }

  public getAttributeValue(attribute: string): number {
    const character = this.getCharacter()
    if (character) {
      return character.getAttribute(attribute as any)
    }
    return 0
  }

  public triggerEvent(eventName: string, data?: any): void {
    // 这里应该触发游戏事件系统
    console.log(`Buff event triggered: ${eventName}`, data)
  }
}
