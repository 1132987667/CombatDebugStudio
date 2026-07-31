import type { BuffConfig } from '@/domain/buff/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { ATTRIBUTE_CODE, ModifierType } from '@/domain/attribute/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'

export class BuffContext {
  public characterId: string = ''
  public instanceId: string = ''
  public config: BuffConfig = {} as BuffConfig
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
    // NOTE: 不在此处清除 variables——池化路径由 ObjectPool.reset()（归还时）清空并
    //       经 borrow 的 validate 保证为空，直接构造路径 variables 天然为空。避免重复清除。
    if (buffSystem) this._buffSystem = buffSystem
  }

  public reset(): void {
    this.characterId = ''
    this.instanceId = ''
    this.config = {} as BuffConfig
    this.variables.clear()
    this._buffSystem = null
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
    attribute: ATTRIBUTE_CODE,
    value: number,
    type: ModifierType,
  ): void {
    const system = this.buffSystem
    if (!system) {
      LoggerProvider.logger.addDebugLog('BuffSystem not injected, cannot add modifier', { level: LogLevel.WARN })
      return
    }
    const modifierStack = system.getModifierStack(this.characterId)
    modifierStack.addModifier(this.instanceId, attribute, value, type)
  }

  public removeModifiers(attribute?: ATTRIBUTE_CODE): void {
    const system = this.buffSystem
    if (!system) {
      LoggerProvider.logger.addDebugLog('BuffSystem not injected, cannot remove modifiers', { level: LogLevel.WARN })
      return
    }
    const modifierStack = system.getModifierStack(this.characterId)
    modifierStack.removeModifier(this.instanceId, attribute)
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
      LoggerProvider.logger.addDebugLog(`BuffSystem not injected, cannot trigger event: ${eventName}`, { level: LogLevel.WARN })
    }
  }
}
