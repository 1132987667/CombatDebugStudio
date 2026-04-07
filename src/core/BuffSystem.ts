/**
 * 文件: BuffSystem.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: Buff系统
 * 描述: 负责管理Buff实例的生命周期、状态更新和修饰符堆栈，使用单例模式确保系统全局唯一
 * 版本: 2.0.0 - 实现 IModifierProvider 接口
 */

import type { BuffConfig, BuffInstance } from '@/types/buff'
import type { CombatRecord } from '@/types/combat-record'
import type {
  IModifierProvider,
  IModifierStack,
  ModifierSourceType,
} from '@/types/attribute'
import { StackRule, ControlType } from '@/types/buff'
import { BuffScriptRegistry } from '@/core/BuffScriptRegistry'
import { BuffContext } from '@/core/BuffContext'
import { BuffContextPool } from '@/utils/BuffContextPool'
import { ModifierStack } from '@/core/ModifierStack'
import { BuffErrorBoundary } from '@/core/BuffErrorBoundary'
import { battleLogManager } from '@/utils/logging'

/**
 * Buff系统类
 * 负责管理Buff实例的生命周期、状态更新和修饰符堆栈
 * 使用单例模式确保系统全局唯一
 * 实现 IModifierProvider 接口，支持依赖解耦
 * 注意：不再使用Vue的reactive，避免在纯业务逻辑层引入不必要的响应式开销
 */
export class BuffSystem implements IModifierProvider {
  /** Buff实例映射，以实例ID为键 */
  private buffInstances = new Map<string, BuffInstance>()
  /** 需要更新的Buff实例ID集合，只包含有实际更新逻辑的Buff */
  private updateRequiredBuffs = new Set<string>()
  /** 修饰符堆栈映射，以角色ID为键 */
  private modifierStacks = new Map<string, ModifierStack>()
  /** 角色当前回合数映射 */
  private characterTurns = new Map<string, number>()
  /** Buff脚本注册表实例（通过构造函数注入） */
  private readonly scriptRegistry: BuffScriptRegistry
  /** 日志记录器 */
  private readonly logger = battleLogManager
  /** 调试模式标志 */
  private _debugMode: boolean = false

  /**
   * 构造函数
   * @param scriptRegistry Buff脚本注册表实例
   */
  public constructor(scriptRegistry: BuffScriptRegistry) {
    this.scriptRegistry = scriptRegistry
  }

  /**
   * 添加Buff
   * @param characterId 角色ID
   * @param buffId Buff ID
   * @param config Buff配置
   * @param currentTurn 当前回合数
   * @param record 战斗记录对象（可选）
   * @returns Buff实例ID
   */
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

    // 检查是否已存在同类型Buff，根据叠加规则处理
    const existingBuffs = this.getBuffInstances(characterId).filter(
      (instance) => instance.buffId === buffId,
    )

    // 根据叠加规则处理
    switch (config.stackRule) {
      case StackRule.REFRESH:
        // 刷新模式：移除旧Buff，添加新Buff
        existingBuffs.forEach((instance) => this.removeBuff(instance.id))
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
    // 从对象池获取 BuffContext
    const context = BuffContextPool.borrow(
      characterId,
      instanceId,
      config,
      this,
    )

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
      // 直接创建ModifierStack实例，避免模块系统兼容性问题
      const modifierStack = new ModifierStack()
      this.modifierStacks.set(characterId, modifierStack)
    }

    BuffErrorBoundary.wrap(() => {
      script.onApply(context)
    })

    // 解析并应用属性修饰符
    this.applyAttributeModifiers(characterId, instanceId, buffId)

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

  /**
   * 应用属性修饰符
   * 从Buff配置中解析attributes并添加到修饰符堆栈
   * @param characterId 角色ID
   * @param instanceId Buff实例ID
   * @param buffId Buff ID
   */
  private applyAttributeModifiers(
    characterId: string,
    instanceId: string,
    buffId: string,
  ): void {
    const attributes = this.scriptRegistry.getBuffAttributes(buffId)
    if (!attributes || Object.keys(attributes).length === 0) {
      return
    }

    const modifierStack = this.getModifierStack(characterId)

    for (const [attr, valueStr] of Object.entries(attributes)) {
      const normalizedAttr = this.scriptRegistry.normalizeAttributeName(attr)
      const parsed = this.scriptRegistry.parseAttributeValue(valueStr)

      modifierStack.addModifier(
        instanceId,
        normalizedAttr as any,
        parsed.value,
        parsed.type,
      )

      this.logger.addDebugLog(
        `应用属性修饰符: ${attr} = ${valueStr} (${parsed.type}) 到角色 ${characterId}`,
      )
    }
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

    const modifierStack = this.getModifierStack(instance.characterId)
    modifierStack.removeModifier(instanceId)

    BuffContextPool.return(instance.context)

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

  public getScriptRegistry(): BuffScriptRegistry {
    return this.scriptRegistry
  }

  /**
   * 获取角色的修饰符堆栈
   * @param characterId 角色ID
   * @returns 修饰符堆栈实例
   */
  public getModifierStack(characterId: string): ModifierStack {
    if (!this.modifierStacks.has(characterId)) {
      // 直接创建ModifierStack实例，避免模块系统兼容性问题
      const modifierStack = new ModifierStack()
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
      if (
        config.controlType !== ControlType.NONE &&
        config.controlPriority > highestPriority
      ) {
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
    return (
      controlType !== ControlType.STUN && controlType !== ControlType.SILENCE
    )
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

  /**
   * 根据Buff实例ID获取Buff名称
   * @param instanceId Buff实例ID
   * @returns Buff名称，如果不存在则返回null
   */
  public getBuffNameByInstanceId(instanceId: string): string | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) {
      return null
    }
    const config = this.scriptRegistry.getBuffConfig(instance.buffId)
    return config?.name || instance.buffId
  }

  /**
   * 根据Buff实例ID获取Buff配置
   * @param instanceId Buff实例ID
   * @returns Buff配置，如果不存在则返回null
   */
  public getBuffConfigByInstanceId(instanceId: string): BuffConfig | null {
    const instance = this.buffInstances.get(instanceId)
    if (!instance) {
      return null
    }
    return this.scriptRegistry.getBuffConfig(instance.buffId) || null
  }

  /**
   * 获取修饰符来源名称（IModifierProvider 接口实现）
   * @param sourceId 来源ID（如 buffInstanceId）
   * @returns 来源名称，不存在则返回 null
   */
  public getSourceName(sourceId: string): string | null {
    return this.getBuffNameByInstanceId(sourceId)
  }

  /**
   * 获取修饰符来源类型（IModifierProvider 接口实现）
   * @param sourceId 来源ID
   * @returns 来源类型
   */
  public getSourceType(sourceId: string): ModifierSourceType {
    const instance = this.buffInstances.get(sourceId)
    if (instance) {
      const config = this.scriptRegistry.getBuffConfig(instance.buffId)
      if (config?.isDebuff) {
        return 'buff'
      }
      return 'buff'
    }
    return 'buff'
  }

  /**
   * 检查是否处于调试模式（IModifierProvider 接口实现）
   * @returns 是否处于调试模式
   */
  public isDebugMode(): boolean {
    return this._debugMode
  }

  /**
   * 设置调试模式
   * @param enabled 是否启用调试模式
   */
  public setDebugMode(enabled: boolean): void {
    this._debugMode = enabled
  }
}
