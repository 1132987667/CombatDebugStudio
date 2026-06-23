import type { BuffConfig, BuffInstance } from '@/types/buff'
import type {
  TriggerAction,
  TriggerEventContext,
  TriggerRuntimeState,
} from '@/types/buff'
import type { CombatRecord } from '@/types/combat-record'
import type {
  IModifierProvider,
  IModifierStack,
  ModifierSourceType,
} from '@/types/attribute'
import { ATTRIBUTE_CODE } from '@/types/attribute'
import { StackRule, ControlType } from '@/types/buff'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BuffContext } from '@/domain/buff/BuffContext'
import { BuffContextPool } from '@/domain/buff/BuffContextPool'
import { ModifierStack } from '@/domain/buff/ModifierStack'
import { BuffErrorBoundary } from '@/domain/buff/BuffErrorBoundary'
import { TriggerEventBus, triggerEventBus } from '@/domain/buff/TriggerEventBus'
import { battleLogManager } from '@/infrastructure/adapters/logging'

export interface TriggerExecutionContext extends TriggerEventContext {
  instanceId?: string
  buffSystem?: BuffSystem
  params?: Record<string, unknown>
  currentTurn?: number
}

/**
 * Buff系统类
 * 负责管理Buff实例的生命周期、状态更新和修饰符堆栈
 * 实现 IModifierProvider 接口，支持依赖解耦
 * 集成触发器事件系统，支持阶段触发行为
 */
export class BuffSystem implements IModifierProvider {
  private buffInstances = new Map<string, BuffInstance>()
  private updateRequiredBuffs = new Set<string>()
  private modifierStacks = new Map<string, ModifierStack>()
  private characterTurns = new Map<string, number>()
  private readonly scriptRegistry: BuffScriptRegistry
  private readonly logger = battleLogManager
  private _debugMode: boolean = true
  private onAttributeChange?: (characterId: string) => void
  private readonly eventBus: TriggerEventBus
  private triggerStates = new Map<string, Map<number, TriggerRuntimeState>>()
  private triggerScripts = new Map<string, (context: TriggerExecutionContext) => void>()

  public constructor(
    scriptRegistry: BuffScriptRegistry,
    eventBus?: TriggerEventBus,
  ) {
    this.scriptRegistry = scriptRegistry
    this.eventBus = eventBus ?? triggerEventBus
    this.registerDefaultTriggerScripts()
  }

  private registerDefaultTriggerScripts(): void {
    this.registerTriggerScript('deal_damage', (ctx) => {
      this.dealDirectDamage(ctx.targetId ?? '', ctx.params?.damage ?? 0)
    })
    this.registerTriggerScript('apply_buff', (ctx) => {
      if (ctx.params?.buffId) {
        const buffId = ctx.params.buffId as string
        const config = this.scriptRegistry.getBuffConfig(buffId)
        if (config) {
          this.addBuff(
            ctx.targetId ?? '',
            buffId,
            config,
            ctx.currentTurn ?? 0,
          )
        }
      }
    })
    this.registerTriggerScript('heal', (ctx) => {
      this.healTarget(ctx.targetId ?? '', ctx.params?.amount ?? 0)
    })
  }

  // ponytail: stubs for trigger scripts — actual implementation lives in BattleSystem.
  // core/BuffSystem.ts also lacks real implementations; these are placeholders
  // until the trigger system is wired to BattleSystem for damage/heal delegation.
  private dealDirectDamage(targetId: string, damage: number): void {}
  private healTarget(targetId: string, amount: number): void {}

  public registerTriggerScript(
    scriptId: string,
    handler: (context: TriggerExecutionContext) => void,
  ): void {
    this.triggerScripts.set(scriptId, handler)
  }

  public setAttributeChangeCallback(callback: (characterId: string) => void): void {
    this.onAttributeChange = callback
  }

  private triggerAttributeChange(characterId: string): void {
    if (this.onAttributeChange) this.onAttributeChange(characterId)
  }

  public getEventBus(): TriggerEventBus {
    return this.eventBus
  }

  public addBuff(
    characterId: string,
    buffId: string,
    config: BuffConfig,
    currentTurn: number = 0,
    record?: CombatRecord,
  ): string {
    const script = this.scriptRegistry.get(buffId)
    if (!script) {
      console.warn(`Buff script ${buffId} not found, skipping buff`)
      return ''
    }

    const existingBuffs = this.getBuffInstances(characterId).filter(
      (instance) => instance.buffId === buffId,
    )

    switch (config.stackRule) {
      case StackRule.REFRESH:
        existingBuffs.forEach((instance) => this.removeBuff(instance.id))
        break
      case StackRule.LIMITED:
        if (existingBuffs.length >= config.maxStacks) return existingBuffs[0].id
        break
      case StackRule.INDEPENDENT:
        break
    }

    const instanceId = `${characterId}_${buffId}_${currentTurn}_${Math.floor(Math.random() * 10000)}`
    const context = BuffContextPool.borrow(characterId, instanceId, config, this)

    const buffInstance: BuffInstance = {
      id: instanceId,
      characterId,
      buffId,
      script,
      context,
      startTurn: currentTurn,
      duration: config.duration || -1,
      remainingTurns: config.duration,
      currentStacks: 1,
      isActive: true,
    }

    this.buffInstances.set(instanceId, buffInstance)

    if (!this.modifierStacks.has(characterId)) {
      this.modifierStacks.set(characterId, new ModifierStack())
    }

    BuffErrorBoundary.wrap(() => {
      script.onApply(context)
    })

    this.applyAttributeModifiers(characterId, instanceId, buffId)
    this.triggerAttributeChange(characterId)

    if (record) {
      record.effects.push({
        type: config.isDebuff ? 'debuff' : 'buff',
        targetId: characterId,
        buffId: config.id,
        instanceId,
        description: `${characterId} 获得 ${config.name}`,
      })
    }

    return instanceId
  }

  private applyAttributeModifiers(
    characterId: string,
    instanceId: string,
    buffId: string,
  ): void {
    const attributes = this.scriptRegistry.getBuffAttributes(buffId)
    if (!attributes || Object.keys(attributes).length === 0) return

    const modifierStack = this.getModifierStack(characterId)
    for (const [attr, valueStr] of Object.entries(attributes)) {
      const parsed = this.scriptRegistry.parseAttributeValue(valueStr)
      modifierStack.addModifier(instanceId, attr as ATTRIBUTE_CODE, parsed.value, parsed.type)
      this.logger.addDebugLog(`应用属性修饰符: ${attr} = ${valueStr} (${parsed.type}) 到角色 ${characterId}`)
    }
  }

  public removeBuff(instanceId: string): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) return false

    BuffErrorBoundary.wrap(() => {
      instance.script.onRemove(instance.context)
    })

    instance.isActive = false
    this.buffInstances.delete(instanceId)

    const modifierStack = this.getModifierStack(instance.characterId)
    modifierStack.removeModifier(instanceId)
    BuffContextPool.return(instance.context)
    this.triggerAttributeChange(instance.characterId)
    return true
  }

  public refreshBuff(instanceId: string, currentTurn: number): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) return false

    BuffErrorBoundary.wrap(() => {
      instance.script.onRefresh(instance.context)
    })

    instance.startTurn = currentTurn
    instance.remainingTurns = instance.duration
    return true
  }

  public updatePerTurn(characterId: string, currentTurn: number): void {
    const toRemove: string[] = []
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return
      instance.remainingTurns--
      BuffErrorBoundary.wrap(() => {
        instance.script.onUpdate(instance.context, 0)
      })
      if (instance.duration > 0 && instance.remainingTurns <= 0) {
        toRemove.push(instance.id)
      }
    })
    toRemove.forEach((instanceId) => {
      this.removeBuff(instanceId)
      this.updateRequiredBuffs.delete(instanceId)
    })
  }

  public getBuffInstances(characterId: string): BuffInstance[] {
    const instances: BuffInstance[] = []
    this.buffInstances.forEach((instance) => {
      if (instance.characterId === characterId && instance.isActive) {
        instances.push(instance)
      }
    })
    return instances
  }

  public getScriptRegistry(): BuffScriptRegistry {
    return this.scriptRegistry
  }

  public getModifierStack(characterId: string): ModifierStack {
    if (!this.modifierStacks.has(characterId)) {
      this.modifierStacks.set(characterId, new ModifierStack())
    }
    return this.modifierStacks.get(characterId) as ModifierStack
  }

  public clearAllBuffs(characterId: string): void {
    const toRemove: string[] = []
    this.buffInstances.forEach((instance) => {
      if (instance.characterId === characterId) toRemove.push(instance.id)
    })
    toRemove.forEach((instanceId) => this.removeBuff(instanceId))
    this.modifierStacks.delete(characterId)
  }

  public getHighestPriorityControlEffect(characterId: string): ControlType {
    let highestPriority = -1
    let highestControlType = ControlType.NONE
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return
      const config = instance.context.getConfig()
      if (config.controlType !== ControlType.NONE && config.controlPriority > highestPriority) {
        highestPriority = config.controlPriority
        highestControlType = config.controlType
      }
    })
    return highestControlType
  }

  public isCharacterControlled(characterId: string): boolean {
    return this.getHighestPriorityControlEffect(characterId) !== ControlType.NONE
  }

  public canUseSkill(characterId: string): boolean {
    const controlType = this.getHighestPriorityControlEffect(characterId)
    return controlType !== ControlType.STUN && controlType !== ControlType.SILENCE
  }

  public canAct(characterId: string): boolean {
    return this.getHighestPriorityControlEffect(characterId) === ControlType.NONE
  }

  public update(deltaTime: number): void {}

  public getBuffNameByInstanceId(instanceId: string): string | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) return null
    const config = this.scriptRegistry.getBuffConfig(instance.buffId)
    return config?.name || instance.buffId
  }

  public getBuffConfigByInstanceId(instanceId: string): BuffConfig | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) return null
    return (this.scriptRegistry.getBuffConfig(instance.buffId) || null) as BuffConfig | null
  }

  public getSourceName(sourceId: string): string | null {
    return this.getBuffNameByInstanceId(sourceId)
  }

  public getSourceType(sourceId: string): ModifierSourceType {
    return 'buff'
  }

  public isDebugMode(): boolean {
    return this._debugMode
  }

  public setDebugMode(enabled: boolean): void {
    this._debugMode = enabled
  }
}
