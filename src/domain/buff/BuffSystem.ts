import type { BuffConfig, BuffInstance, BuffQuery, IBuffScript } from '@/domain/buff/types'
import type {
  TriggerEventContext,
} from '@/domain/buff/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import type {
  IModifierProvider,
  ModifierSourceType,
} from '@/domain/attribute/types'
import {
  ATTRIBUTE_CODE,
  type IModifierProvider,
  ModifierSourceType,
} from '@/domain/attribute/types'
import { StackRule, ControlType } from '@/domain/buff/types'
import { SkillStepType } from '@/domain/skill/types'
import { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
import { BuffContextPool } from '@/domain/buff/BuffContextPool'
import { ModifierStack } from '@/domain/buff/ModifierStack'
import { BuffErrorBoundary } from '@/domain/buff/BuffErrorBoundary'
import { TriggerEventBus, triggerEventBus } from '@/infrastructure/adapters/event/TriggerEventBus'
import { battleLogManager } from '@/infrastructure/adapters/logging'

/** 无操作脚本占位：用于有配置无脚本的 buff */
const NOOP_BUFF_SCRIPT: IBuffScript = {
  onApply: () => {},
  onRemove: () => {},
  onUpdate: () => {},
  onRefresh: () => {},
}

export interface TriggerExecutionContext extends TriggerEventContext {
  instanceId?: string
  buffSystem?: BuffSystem
  params?: Record<string, number | string>
  currentTurn?: number
}

/**
 * Buff系统类
 * 负责管理Buff实例的生命周期、状态更新和修饰符堆栈
 * 实现 IModifierProvider 接口，支持依赖解耦
 * 集成触发器事件系统，支持阶段触发行为
 */
export class BuffSystem implements IModifierProvider, BuffQuery {
  private buffInstances = new Map<string, BuffInstance>()
  private modifierStacks = new Map<string, ModifierStack>()
  private readonly scriptRegistry: BuffScriptRegistry
  private readonly logger = battleLogManager
  private _debugMode: boolean = true
  private onAttributeChange?: (characterId: string) => void
  private readonly eventBus: TriggerEventBus
  private triggerScripts = new Map<string, (context: TriggerExecutionContext) => void>()

  /** 角色免疫标签注册表（初始化时由被动技能填充，运行时可查询） */
  private characterImmunities = new Map<string, Set<string>>()

  /** 注册角色的免疫标签 */
  registerCharacterImmunities(characterId: string, tags: string[]): void {
    if (!this.characterImmunities.has(characterId)) {
      this.characterImmunities.set(characterId, new Set())
    }
    const set = this.characterImmunities.get(characterId)!
    for (const tag of tags) {
      set.add(tag.toLowerCase())
    }
  }

  /** 获取角色的免疫标签 */
  getCharacterImmunities(characterId: string): string[] {
    return [...(this.characterImmunities.get(characterId) ?? [])]
  }

  public constructor(
    scriptRegistry: BuffScriptRegistry,
    eventBus?: TriggerEventBus,
  ) {
    this.scriptRegistry = scriptRegistry
    this.eventBus = eventBus ?? triggerEventBus
    this.registerDefaultTriggerScripts()
  }

  private registerDefaultTriggerScripts(): void {
    this.registerTriggerScript(SkillStepType.DEAL_DAMAGE, (ctx: TriggerExecutionContext) => {
      this.dealDirectDamage(ctx.targetId ?? '', ctx.params?.damage as number ?? 0)
    })
    this.registerTriggerScript(SkillStepType.APPLY_BUFF, (ctx: TriggerExecutionContext) => {
      if (ctx.params?.buffId) {
        const buffId = ctx.params.buffId as string
        const data = this.scriptRegistry.getBuffConfig(buffId)
        if (data) {
          this.addBuff(
            ctx.targetId ?? '',
            buffId,
            {
              id: data.id,
              name: data.name ?? data.id,
              description: '',
              duration: data.duration ?? 1,
              maxStacks: data.maxStacks ?? 1,
              cooldown: 0,
              stackRule: StackRule.LIMITED,
              controlType: ControlType.NONE,
              controlPriority: 0,
            },
            ctx.currentTurn ?? 0,
          )
        }
      }
    })
    this.registerTriggerScript(SkillStepType.HEAL, (ctx: TriggerExecutionContext) => {
      this.healTarget(ctx.targetId ?? '', ctx.params?.amount as number ?? 0)
    })
  }

  // ponytail: 当前无配置触发 deal_damage/heal 存根。后续如有灼烧/中毒等每回合触发器需要实现，
  // 应通过 BattleSystem 注册的 onAttributeChange 回调委托到 BattleParticipantImpl.takeDamage。
  private dealDirectDamage(targetId: string, damage: number): void { }
  
  private healTarget(targetId: string, amount: number): void { }

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
    let script = this.scriptRegistry.get(buffId)
    if (!script) {
      const def = this.scriptRegistry.resolve(buffId)
      if (!def?.config) {
        console.warn(`Buff ${buffId} not found — no script or config registered, skipping`)
        return ''
      }
      // ponytail: 有 buffs.json 配置但无脚本，用 no-op 占位。
      // applyAttributeModifiers 仍然会从配置读取属性修饰符并生效。
      script = NOOP_BUFF_SCRIPT
    }

    // ponytail: 免疫检查 — 若目标对该控制类型或 buffId 免疫则跳过施加
    const targetImmunities = this.characterImmunities.get(characterId)
    if (targetImmunities && targetImmunities.size > 0) {
      const controlTag = config.controlType && config.controlType !== 'NONE'
        ? config.controlType.toLowerCase()
        : null
      const buffTag = buffId.replace(/^buff_/i, '')
      if ((controlTag && targetImmunities.has(controlTag)) || targetImmunities.has(buffTag)) {
        return ''
      }
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
      // ponytail: normalize the attribute key so JSON keys like 'ATK' → 'attack',
      // matching the keys used by BattleParticipantImpl.syncModifiersFromProvider
      const normalizedAttr = attr as ATTRIBUTE_CODE
      modifierStack.addModifier(instanceId, normalizedAttr, parsed.value, parsed.type)
      this.logger.addDebugLog(`应用属性修饰符: ${attr} → ${normalizedAttr} = ${valueStr} (${parsed.type}) 到角色 ${characterId}`)
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

  public updatePerTurn(characterId: string): void {
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

  public getBuffInstanceIds(characterId: string): string[] {
    return this.getBuffInstances(characterId).map((i) => i.id)
  }

  public hasBuff(characterId: string, buffId: string): boolean {
    for (const instance of this.buffInstances.values()) {
      if (instance.characterId === characterId && instance.isActive && instance.buffId === buffId) return true
    }
    return false
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

  /** 获取最高优先级的控制效果 */
  public getHighestPriorityControlEffect(characterId: string): ControlType {
    let highestPriority = -1
    let highestControlType = ControlType.NONE
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return
      const config = instance.context.config
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

  public update(deltaTime: number): void { }

  public getBuffNameByInstanceId(instanceId: string): string | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) return null
    const config = this.scriptRegistry.getBuffConfig(instance.buffId)
    return config?.name || instance.buffId
  }

  public getBuffConfigByInstanceId(instanceId: string): BuffConfig | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) return null
    const data = this.scriptRegistry.getBuffConfig(instance.buffId)
    if (!data) return null
    return {
      id: data.id,
      name: data.name ?? data.id,
      description: '',
      duration: data.duration ?? 1,
      maxStacks: data.maxStacks ?? 1,
      cooldown: 0,
      stackRule: StackRule.LIMITED,
      controlType: ControlType.NONE,
      controlPriority: 0,
    }
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
