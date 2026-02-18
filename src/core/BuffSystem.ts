/**
 * 文件: BuffSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: Buff系统
 * 描述: 负责管理Buff实例的生命周期、状态更新和修饰符堆栈，使用单例模式确保系统全局唯一
 * 版本: 1.0.0
 */

import { reactive } from 'vue'
import type { BuffConfig, BuffInstance } from '@/types/buff'
import { StackRule, ControlType } from '@/types/buff'
import { BuffScriptRegistry } from '@/core/BuffScriptRegistry'
import { BuffContext } from '@/core/BuffContext'
import { ModifierStack } from '@/core/ModifierStack'
import { BuffErrorBoundary } from '@/core/BuffErrorBoundary'

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
  private buffInstances = reactive<Map<string, BuffInstance>>(new Map())
  /** 需要更新的Buff实例ID集合，只包含有实际更新逻辑的Buff */
  private updateRequiredBuffs = new Set<string>()
  /** 修饰符堆栈映射，以角色ID为键，使用reactive确保响应性 */
  private modifierStacks = reactive<Map<string, ModifierStack>>(new Map())
  /** 角色当前回合数映射 */
  private characterTurns = new Map<string, number>()

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
   * @param currentTurn 当前回合数
   * @returns Buff实例ID
   */
  public addBuff(
    characterId: string,
    buffId: string,
    config: BuffConfig,
    currentTurn: number = 0,
  ): string {
    const script = BuffScriptRegistry.getInstance().get(buffId)
    if (!script) {
      throw new Error(`Buff script ${buffId} not found`)
    }

    // 检查是否已存在同类型Buff，根据叠加规则处理
    const existingBuffs = this.getBuffInstances(characterId).filter(
      instance => instance.buffId === buffId
    )

    // 根据叠加规则处理
    switch (config.stackRule) {
      case StackRule.REFRESH:
        // 刷新模式：移除旧Buff，添加新Buff
        existingBuffs.forEach(instance => this.removeBuff(instance.id))
        break
      case StackRule.LIMITED:
        // 限制层数模式：检查是否达到最大层数
        if (existingBuffs.length >= config.maxStacks) {
          return existingBuffs[0].id // 返回现有Buff实例ID
        }
        break
      case StackRule.INDEPENDENT:
        // 独立叠加模式：直接添加新Buff
        break
    }

    // 生成唯一的实例ID，添加随机数以防止在快速循环中重复
    const instanceId = `${characterId}_${buffId}_${currentTurn}_${Math.floor(Math.random() * 10000)}`
    let context
    try {
      const { container } = require('@/core/di/Container')
      // 由于BuffContext是一个需要动态参数的类，我们仍然直接创建它
      context = new BuffContext(characterId, instanceId, config)
    } catch (error) {
      // 如果依赖注入容器不可用，则直接创建实例
      context = new BuffContext(characterId, instanceId, config)
    }

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
      let modifierStack
      try {
        const { container } = require('@/core/di/Container')
        // 由于ModifierStack是一个需要与特定角色关联的类，我们仍然直接创建它
        modifierStack = new ModifierStack()
      } catch (error) {
        // 如果依赖注入容器不可用，则直接创建实例
        modifierStack = new ModifierStack()
      }
      this.modifierStacks.set(characterId, modifierStack)
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
   * @param currentTurn 当前回合数
   * @returns 是否成功刷新
   */
  public refreshBuff(instanceId: string, currentTurn: number): boolean {
    const instance = this.buffInstances.get(instanceId)
    if (!instance || !instance.isActive) {
      return false
    }

    BuffErrorBoundary.wrap(() => {
      instance.script.onRefresh(instance.context)
    })

    instance.startTurn = currentTurn
    instance.remainingTurns = instance.duration
    return true
  }

  /**
   * 基于回合更新Buff状态
   * @param characterId 角色ID
   * @param currentTurn 当前回合数
   */
  public updatePerTurn(characterId: string, currentTurn: number): void {
    const toRemove: string[] = []

    // 遍历角色的所有Buff实例
    this.buffInstances.forEach((instance) => {
      if (!instance.isActive || instance.characterId !== characterId) return

      // 减少剩余回合数
      instance.remainingTurns--

      // 执行每回合更新逻辑
      BuffErrorBoundary.wrap(() => {
        instance.script.onUpdate(instance.context, 0) // deltaTime为0，因为基于回合
      })

      // 检查是否过期
      if (instance.duration > 0 && instance.remainingTurns <= 0) {
        toRemove.push(instance.id)
      }
    })

    // 移除过期的Buff
    toRemove.forEach((instanceId) => {
      this.removeBuff(instanceId)
      this.updateRequiredBuffs.delete(instanceId)
    })
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
   * 检查角色是否可以使用技能
   * @param characterId 角色ID
   * @returns 是否可以使用技能
   */
  public canUseSkill(characterId: string): boolean {
    const buffInstances = this.getBuffInstances(characterId)
    
    // 检查是否有阻止使用技能的Buff（如沉默）
    for (const instance of buffInstances) {
      // 这里需要根据实际的Buff类型和效果来判断
      // 暂时假设包含'silence'或'stun'的Buff会阻止使用技能
      if (instance.buffId.includes('silence') || instance.buffId.includes('stun')) {
        return false
      }
    }
    
    return true
  }

  /**
   * 获取角色的修饰符堆栈
   * @param characterId 角色ID
   * @returns 修饰符堆栈实例
   */
  public getModifierStack(characterId: string): ModifierStack {
    if (!this.modifierStacks.has(characterId)) {
      let modifierStack
      try {
        const { container } = require('@/core/di/Container')
        // 由于ModifierStack是一个需要与特定角色关联的类，我们仍然直接创建它
        modifierStack = new ModifierStack()
      } catch (error) {
        // 如果依赖注入容器不可用，则直接创建实例
        modifierStack = new ModifierStack()
      }
      this.modifierStacks.set(characterId, modifierStack)
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

  /**
   * 获取角色当前最高优先级的控制效果
   * @param characterId 角色ID
   * @returns 控制效果类型
   */
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

  /**
   * 检查角色是否处于控制状态
   * @param characterId 角色ID
   * @returns 是否处于控制状态
   */
  public isCharacterControlled(characterId: string): boolean {
    const controlType = this.getHighestPriorityControlEffect(characterId)
    return controlType !== ControlType.NONE
  }

  /**
   * 检查角色是否可以使用技能
   * @param characterId 角色ID
   * @returns 是否可以使用技能
   */
  public canUseSkill(characterId: string): boolean {
    const controlType = this.getHighestPriorityControlEffect(characterId)
    return controlType !== ControlType.STUN && controlType !== ControlType.SILENCE
  }

  /**
   * 检查角色是否可以进行任何行动
   * @param characterId 角色ID
   * @returns 是否可以进行任何行动
   */
  public canAct(characterId: string): boolean {
    const controlType = this.getHighestPriorityControlEffect(characterId)
    return controlType === ControlType.NONE
  }

  /**
   * 向后兼容：基于时间的更新方法
   * @param deltaTime 时间增量（毫秒）
   */
  public update(deltaTime: number): void {
    // 向后兼容，实际逻辑已移至updatePerTurn
    // 这里可以留空，或者添加警告信息
  }
}
