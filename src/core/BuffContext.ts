import type { BuffConfig } from '@/types/buff'
import type { Character } from '@/types/character'
import { BuffSystem } from './BuffSystem'

/**
 * Buff上下文类
 * 为Buff实例提供运行环境和上下文信息
 * 包含Buff的配置、状态、变量管理等功能
 */
export class BuffContext {
  /** 角色ID */
  public readonly characterId: string
  /** Buff实例ID */
  public readonly instanceId: string
  /** Buff配置信息 */
  public readonly config: BuffConfig
  /** Buff开始时间戳 */
  public readonly startTime: number
  /** 变量映射，用于存储Buff运行时的临时数据 */
  public variables = new Map<string, any>()

  /**
   * 构造函数
   * @param characterId 角色ID
   * @param instanceId Buff实例ID
   * @param config Buff配置信息
   */
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

  /**
   * 获取Buff已持续的时间
   * @returns 已持续时间（毫秒）
   */
  public getElapsedTime(): number {
    return Date.now() - this.startTime
  }

  /**
   * 获取Buff剩余的时间
   * @returns 剩余时间（毫秒），-1表示永久Buff
   */
  public getRemainingTime(): number {
    if (this.config.duration <= 0) {
      return -1
    }
    return Math.max(0, this.config.duration - this.getElapsedTime())
  }

  /**
   * 设置变量
   * @param key 变量键
   * @param value 变量值
   */
  public setVariable(key: string, value: any): void {
    this.variables.set(key, value)
  }

  /**
   * 获取变量
   * @param key 变量键
   * @returns 变量值，不存在则返回undefined
   */
  public getVariable<T>(key: string): T | undefined {
    return this.variables.get(key) as T
  }

  /**
   * 移除变量
   * @param key 变量键
   */
  public removeVariable(key: string): void {
    this.variables.delete(key)
  }

  /**
   * 添加属性修饰符
   * @param attribute 属性名称
   * @param value 修饰值
   * @param type 修饰类型：ADDITIVE（加法）、MULTIPLICATIVE（乘法）、PERCENTAGE（百分比）
   */
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

  /**
   * 移除所有修饰符
   */
  public removeModifiers(): void {
    const system = BuffSystem.getInstance()
    const modifierStack = system.getModifierStack(this.characterId)
    modifierStack.removeModifier(this.instanceId)
  }

  /**
   * 获取角色实例
   * @returns 角色实例，不存在则返回undefined
   */
  public getCharacter(): Character | undefined {
    // 这里应该从角色系统获取角色实例
    // 暂时返回 undefined，实际实现需要集成角色系统
    return undefined
  }

  /**
   * 获取属性值
   * @param attribute 属性名称
   * @returns 属性值，获取失败则返回0
   */
  public getAttributeValue(attribute: string): number {
    const character = this.getCharacter()
    if (character) {
      return character.getAttribute(attribute as any)
    }
    return 0
  }

  /**
   * 触发事件
   * @param eventName 事件名称
   * @param data 事件数据（可选）
   */
  public triggerEvent(eventName: string, data?: any): void {
    // 这里应该触发游戏事件系统
    console.log(`Buff event triggered: ${eventName}`, data)
  }
}
