import { reactive } from 'vue'
import type { BuffConfig, BuffInstance } from '@/types/buff'
import { BuffScriptRegistry } from './BuffScriptRegistry'
import { BuffContext } from './BuffContext'
import { ModifierStack } from './ModifierStack'
import { BuffErrorBoundary } from './BuffErrorBoundary'

export class BuffSystem {
  private static instance: BuffSystem
  private buffInstances = reactive<Map<string, BuffInstance>>(
    new Map()
  )
  private modifierStacks = reactive<Map<string, ModifierStack>>(
    new Map()
  )

  private constructor() {}

  public static getInstance(): BuffSystem {
    if (!BuffSystem.instance) {
      BuffSystem.instance = new BuffSystem()
    }
    return BuffSystem.instance
  }

  public addBuff(
    characterId: string,
    buffId: string,
    config: BuffConfig
  ): string {
    const script = BuffScriptRegistry.getInstance().get(buffId)
    if (!script) {
      throw new Error(`Buff script ${buffId} not found`)
    }

    const instanceId = `${characterId}_${buffId}_${Date.now()}`
    const context = new BuffContext(characterId, instanceId, config)
    
    const buffInstance: BuffInstance = {
      id: instanceId,
      characterId,
      buffId,
      script,
      context,
      startTime: Date.now(),
      duration: config.duration || -1,
      isActive: true
    }

    this.buffInstances.set(instanceId, buffInstance)
    
    if (!this.modifierStacks.has(characterId)) {
      this.modifierStacks.set(characterId, new ModifierStack())
    }

    BuffErrorBoundary.wrap(() => {
      script.onApply(context)
    })

    return instanceId
  }

  public removeBuff(instanceId: string): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) {
      return false
    }

    BuffErrorBoundary.wrap(() => {
      instance.script.onRemove(instance.context)
    })

    instance.isActive = false
    this.buffInstances.delete(instanceId)

    return true
  }

  public refreshBuff(instanceId: string): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) {
      return false
    }

    BuffErrorBoundary.wrap(() => {
      instance.script.onRefresh(instance.context)
    })

    instance.startTime = Date.now()
    return true
  }

  public update(deltaTime: number): void {
    const toRemove: string[] = []

    this.buffInstances.forEach((instance) => {
      if (!instance.isActive) return

      BuffErrorBoundary.wrap(() => {
        instance.script.onUpdate(instance.context, deltaTime)
      })

      if (instance.duration > 0 && Date.now() - instance.startTime >= instance.duration) {
        toRemove.push(instance.id)
      }
    })

    toRemove.forEach((instanceId) => this.removeBuff(instanceId))
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

  public getModifierStack(characterId: string): ModifierStack {
    if (!this.modifierStacks.has(characterId)) {
      this.modifierStacks.set(characterId, new ModifierStack())
    }
    return this.modifierStacks.get(characterId) as ModifierStack  
  }

  public clearAllBuffs(characterId: string): void {
    const toRemove: string[] = []
    this.buffInstances.forEach((instance) => {
      if (instance.characterId === characterId) {
        toRemove.push(instance.id)
      }
    })
    toRemove.forEach((instanceId) => this.removeBuff(instanceId))
    this.modifierStacks.delete(characterId)
  }
}