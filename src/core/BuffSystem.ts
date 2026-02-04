import { reactive } from 'vue'
import type { BuffConfig, BuffInstance } from '@/types/buff'
import { BuffScriptRegistry } from './BuffScriptRegistry'
import { BuffContext } from './BuffContext'
import { ModifierStack } from './ModifierStack'
import { BuffErrorBoundary } from './BuffErrorBoundary'

/**
 * Buff系统类
 * 负责管理Buff实例的生命周期、状态更新和修饰符堆栈
 * 使用单例模式确保系统全局唯一
 * 使用Vue的reactive函数使状态具有响应性
 */
export class BuffSystem {
  /** 单例实例 */
  private static instance: BuffSystem
  /** Buff实例映射，以实例ID为键，使用reactive确保响应性 */
  private buffInstances = reactive<Map<string, BuffInstance>>(
    new Map()
  )
  /** 修饰符堆栈映射，以角色ID为键，使用reactive确保响应性 */
  private modifierStacks = reactive<Map<string, ModifierStack>>(
    new Map()
  )

  /**
   * 私有构造函数
   * 防止外部直接实例化，确保单例模式
   */
  private constructor() {}

  /**
   * 获取单例实例
   * @returns Buff系统实例
   */
  public static getInstance(): BuffSystem {
    if (!BuffSystem.instance) {
      BuffSystem.instance = new BuffSystem()
    }
    return BuffSystem.instance
  }

  /**
   * 添加Buff
   * @param characterId 角色ID
   * @param buffId Buff ID
   * @param config Buff配置
   * @returns Buff实例ID
   */
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

  /**
   * 移除Buff
   * @param instanceId Buff实例ID
   * @returns 是否成功移除
   */
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

  /**
   * 刷新Buff
   * @param instanceId Buff实例ID
   * @returns 是否成功刷新
   */
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

  /**
   * 更新Buff状态
   * @param deltaTime 时间增量（毫秒）
   */
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

  /**
   * 获取角色的Buff实例列表
   * @param characterId 角色ID
   * @returns Buff实例数组
   */
  public getBuffInstances(characterId: string): BuffInstance[] {
    const instances: BuffInstance[] = []
    this.buffInstances.forEach((instance) => {
      if (instance.characterId === characterId && instance.isActive) {
        instances.push(instance)
      }
    })
    return instances
  }

  /**
   * 获取角色的修饰符堆栈
   * @param characterId 角色ID
   * @returns 修饰符堆栈实例
   */
  public getModifierStack(characterId: string): ModifierStack {
    if (!this.modifierStacks.has(characterId)) {
      this.modifierStacks.set(characterId, new ModifierStack())
    }
    return this.modifierStacks.get(characterId) as ModifierStack  
  }

  /**
   * 清除角色的所有Buff
   * @param characterId 角色ID
   */
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