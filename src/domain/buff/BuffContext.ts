import type { BuffConfig } from '@/domain/buff/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'

export class BuffContext {
  public characterId: string = ''
  public instanceId: string = ''
  public config: BuffConfig = {} as BuffConfig
  public startTime: number = 0
  public variables = new Map<string, string | number | boolean>()
  /** 当前回合号（由 updatePerTurn 注入，供脚本 onUpdate 读取） */
  public currentTurn: number = 0
  private _buffSystem: BuffSystem | null = null

  constructor(characterId?: string, instanceId?: string, config?: BuffConfig, buffSystem?: BuffSystem) {
    if (buffSystem) this._buffSystem = buffSystem
    if (characterId && instanceId && config) this.initialize(characterId, instanceId, config)
  }

  private get buffSystem(): BuffSystem {
    if (!this._buffSystem) {
      throw new Error('[BuffContext] BuffSystem not injected. Ensure initialize() was called.')
    }
    return this._buffSystem
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

  /**
   * 获取流逝时间（毫秒）
   * 用于 Buff 脚本中基于实时时间的逻辑（如 DOT 每 2 秒触发一次）。
   * ponytail: 回合制系统的主要计时由 `updatePerTurn` 驱动（回合递减），
   *           但部分持续效果（毒/hot）使用实时时间实现平滑触发。两套体系并存。
   */
  public getElapsedTime(): number {
    return Date.now() - this.startTime
  }

  public setVariable(key: string, value: string | number | boolean): void {
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

  /**
   * 获取角色实例
   * 通过 BuffSystem 注入的 CharacterResolver 解析
   */
  public getCharacter(): BattleEntity | undefined {
    return this._buffSystem?.resolveCharacter(this.characterId)
  }

  /** 获取 BuffSystem 实例，供 Buff 脚本注册护盾值等运行时状态 */
  public getBuffSystem(): BuffSystem | undefined {
    return this._buffSystem ?? undefined
  }

  public getAttrVal(attribute: string): number {
    const character = this.getCharacter()
    return character ? character.getAttribute(attribute) : 0
  }

  public triggerEvent(eventName: string, data?: unknown): void {
    const system = this._buffSystem
    if (system) {
      system.executeTriggerScript(this.instanceId, this.characterId, eventName, data as Record<string, unknown> | undefined)
    } else {
      console.warn(`BuffSystem not injected, cannot trigger event: ${eventName}`, data)
    }
  }
}
