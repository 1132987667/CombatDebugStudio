/**
 * 文件: BattleParticipantImpl.ts
 * 创建日期: 2026-02-12
 * 作者: CombatDebugStudio
 * 功能: 战斗参与者实现类
 * 描述: 使用 Class 替代对象字面量，方法在原型上共享，提升内存效率和代码可维护性
 * 版本: 3.1.0 - 集成触发器事件系统
 */

import type {
  BattleParticipant,
  StatusEffect,
  ParticipantSnapshot,
  BuffInstanceSnapshot,
  BattleEntity,
} from '@/types/battle'
import { PARTICIPANT_SIDE, type ParticipantSide } from '@/types/battle'
import type { SkillConfig } from '@/types/skill'
import type {
  AttributeValue,
  ModifierDetail,
  AttributeCode,
  IModifierProvider,
  IModifierStack,
  ModifierSourceType,
  Modifier,
  ModifierType,
  AttributeType,
} from '@/types/attribute'
import {
  AttributeCodes,
  normalizeAttributeCode,
} from '@/types/attribute'
import { AttributeEngine } from '@/core/AttributeEngine'
import type { ModifierTemplate } from '@/types/modifier-template'
import { triggerEventBus } from '@/core/TriggerEventBus'

/**
 * 参与者初始化数据接口
 * 用于创建 BattleParticipant 实例的参数类型
 */
export interface ParticipantInitData {
  /** 参与者唯一标识符 */
  id: string
  /** 参与者名称 */
  name: string
  /** 参与者类型（我方/敌方） */
  type: ParticipantSide
  /** 队伍归属 */
  team: ParticipantSide
  /** 等级 */
  level: number
  /** 最大生命值 */
  maxHealth: number
  /** 当前生命值（默认等于最大生命值） */
  currentHealth?: number
  /** 最大能量值（默认150） */
  maxEnergy?: number
  /** 当前能量值（默认25） */
  currentEnergy?: number
  /** 最小攻击力 */
  minAttack: number
  /** 最大攻击力 */
  maxAttack: number
  /** 平均攻击力 */
  attack?: number
  /** 防御力 */
  defense: number
  /** 速度 */
  speed: number
  /** 暴击率（默认10） */
  critRate?: number
  /** 暴击伤害（默认125） */
  critDamage?: number
  /** 免伤率（默认0） */
  damageReduction?: number
  /** 气血加成（默认0） */
  healthBonus?: number
  /** 攻击加成（默认0） */
  attackBonus?: number
  /** 防御加成（默认0） */
  defenseBonus?: number
  /** 速度加成（默认0） */
  speedBonus?: number
  /** Buff列表（默认空数组） */
  buffs?: string[]
  /** 状态效果列表 */
  statusEffects?: StatusEffect[]
  /** 技能配置 */
  skills?: {
    small?: SkillConfig[]
    passive?: SkillConfig[]
    ultimate?: SkillConfig[]
  }
}

/**
 * 战斗参与者实现类
 * 使用 Class 替代对象字面量，方法在原型上共享
 * 使用属性缓存系统管理属性值
 */
export class BattleParticipantImpl implements BattleEntity {
  /** 参与者唯一标识符 */
  id: string
  /** 参与者名称 */
  name: string
  /** 等级 */
  level: number
  /** 参与者类型 */
  type: ParticipantSide
  /** 队伍归属 */
  team: ParticipantSide
  /** 是否启用 */
  enabled: boolean = true
  /** Buff列表 */
  buffs: string[]

  /** 技能配置 */
  skills: {
    small?: SkillConfig[]
    passive?: SkillConfig[]
    ultimate?: SkillConfig[]
  }
  /** 状态效果列表 */
  statusEffects?: StatusEffect[]
  /** 技能冷却状态映射，key为技能ID，value为剩余冷却回合数 */
  skillCooldowns: Map<string, number>

  /** 属性缓存 Map */
  private attributes: Map<AttributeCode, AttributeValue> = new Map()

  /** 修饰符提供者引用（用于属性计算，解耦 BuffSystem） */
  private _modifierProvider: IModifierProvider | null = null

  /**
   * 构造函数
   * @param data - 初始化数据
   * @param modifierProvider - 修饰符提供者（可选，通常为 BuffSystem 实例）
   */
  constructor(data: ParticipantInitData, modifierProvider?: IModifierProvider) {
    this.id = data.id
    this.name = data.name
    this.level = data.level
    this.type = data.type
    this.team = data.team
    this.buffs = data.buffs ?? []
    this.statusEffects = data.statusEffects
    this.skills = data.skills ?? {}
    this.skillCooldowns = new Map<string, number>()

    // 如果传入了 modifierProvider，则设置引用
    if (modifierProvider) {
      this._modifierProvider = modifierProvider
    }

    this.initAttribute(AttributeCodes.MAX_HP, data.maxHealth)
    this.initAttribute(AttributeCodes.HP, data.currentHealth ?? data.maxHealth)
    this.initAttribute(AttributeCodes.MAX_ENERGY, data.maxEnergy ?? 100)
    this.initAttribute(AttributeCodes.ENERGY, data.currentEnergy ?? 25)
    this.initAttribute(
      AttributeCodes.ATK,
      (data.minAttack + data.maxAttack) / 2,
    )
    this.initAttribute(AttributeCodes.MIN_ATK, data.minAttack)
    this.initAttribute(AttributeCodes.MAX_ATK, data.maxAttack)
    this.initAttribute(AttributeCodes.DEF, data.defense)
    this.initAttribute(AttributeCodes.SPD, data.speed)
    this.initAttribute(AttributeCodes.CRIT_RATE, data.critRate ?? 10, true)
    this.initAttribute(AttributeCodes.CRIT_DMG, data.critDamage ?? 125, true)
    this.initAttribute(AttributeCodes.DMG_REDUCTION, data.damageReduction ?? 0, true)

    this.markAllDirty()
  }

  /**
   * 设置修饰符提供者引用
   * @param provider 修饰符提供者实例
   */
  setModifierProvider(provider: IModifierProvider): void {
    this._modifierProvider = provider
    this.markAllDirty()
  }

  /**
   * 设置Buff系统引用（向后兼容）
   * @param buffSystem Buff系统实例
   * @deprecated 请使用 setModifierProvider 方法
   */
  setBuffSystem(buffSystem: any): void {
    if (buffSystem && typeof buffSystem.getModifierStack === 'function') {
      this._modifierProvider = buffSystem as IModifierProvider
      this.markAllDirty()
    }
  }

  /**
   * 初始化属性基础值
   * @param attr 属性名称
   * @param baseValue 基础值
   * @param isPercentage 是否为百分比属性
   */
  private initAttribute(
    attr: AttributeCode,
    baseValue: number,
    isPercentage: boolean = false,
  ): void {
    this.attributes.set(attr, {
      value: baseValue,
      base: baseValue,
      modifiers: [],
      isPercentage,
      dirty: true,
    })
  }

  /**
   * 标记单个属性为脏（需要重新计算）
   * @param attr 属性名称
   */
  markDirty(attr: AttributeCode): void {
    const attrData = this.attributes.get(attr)
    if (attrData) {
      attrData.dirty = true
    }
  }

  /**
   * 标记所有属性为脏（需要重新计算）
   */
  markAllDirty(): void {
    for (const attrData of this.attributes.values()) {
      attrData.dirty = true
    }
  }

  /**
   * 重新计算单个属性（应用所有修饰符）
   * 
   * 重构说明：
   * - 使用 AttributeEngine.compute() 统一计算逻辑
   * - 自动记录 trace 信息用于调试面板
   * - 保持与原有 ModifierProvider 的兼容性
   * 
   * @param attr 属性名称
   */
  private recalcAttribute(attr: AttributeCode): void {
    const attrData = this.attributes.get(attr)
    if (!attrData || !attrData.dirty) return

    const baseValue = attrData.base

    // 从 ModifierProvider 获取修饰符并转换为 ModifierTemplate 格式
    const templates: ModifierTemplate[] = []
    if (this._modifierProvider) {
      const modifierStack = this._modifierProvider.getModifierStack(this.id)
      if (modifierStack) {
        const modifiers = modifierStack.getModifiers(attr as AttributeType)
        for (const mod of modifiers) {
          templates.push({
            id: mod.buffInstanceId,
            sourceName: this._modifierProvider.getSourceName(mod.buffInstanceId) || mod.buffInstanceId,
            sourceType: this._modifierProvider.getSourceType(mod.buffInstanceId),
            targetAttribute: attr as AttributeType,
            type: mod.type,
            value: mod.value,
          })
        }
      }
    }

    // 使用 AttributeEngine 计算属性值
    const result = AttributeEngine.compute(baseValue, templates, {
      attributes: this.getAllBaseAttributes(),
      params: { participantId: this.id },
    })

    // 应用计算结果
    let finalValue = result.finalValue

    // 特殊属性约束
    if (attr === AttributeCodes.HP) {
      const maxHp = this.getAttribute(AttributeCodes.MAX_HP)
      finalValue = Math.max(0, Math.min(finalValue, maxHp))
    }
    if (attr === AttributeCodes.ENERGY) {
      const maxEnergy = this.getAttribute(AttributeCodes.MAX_ENERGY)
      finalValue = Math.max(0, Math.min(finalValue, maxEnergy))
    }

    // 更新属性数据
    attrData.value = finalValue
    attrData.modifiers = result.steps.map((step) => ({
      source: step.sourceName,
      sourceType: 'buff' as ModifierSourceType,
      value: step.appliedValue,
      type: step.type === 'ADDITIVE' ? 'add' : 
            step.type === 'PERCENTAGE' ? 'percent' : 
            step.type === 'MULTIPLICATIVE' ? 'multiply' : 'final' as ModifierDetail['type'],
    }))
    attrData.dirty = false

    // 记录调试信息
    if (this._modifierProvider?.isDebugMode()) {
      attrData.breakdown = result.breakdown
      attrData.trace = result
    } else {
      delete attrData.breakdown
      delete attrData.trace
    }
  }

  /**
   * 获取所有基础属性值（用于动态值计算上下文）
   * @returns 属性名到基础值的映射
   */
  private getAllBaseAttributes(): Record<string, number> {
    const result: Record<string, number> = {}
    this.attributes.forEach((attrData, attrCode) => {
      result[attrCode] = attrData.base
    })
    return result
  }

  /**
   * 获取属性最终值（自动触发重新计算）
   * @param attr 属性名称
   * @returns 属性最终值
   */
  getAttribute(attr: AttributeType | string): number {
    const attrValue = this.getAttributeValue(attr)
    return attrValue?.value ?? 0
  }

  /**
   * 快捷获取属性最终值（number）
   * @param attr 属性名称（如 'HP', 'ATK'）
   * @returns 属性最终值
   */
  getAttr(attr: AttributeType): number {
    return this.getAttribute(attr)
  }

  /**
   * 快捷获取属性值对象（包含基础值、修饰符等）
   * @param attr 属性名称
   * @returns 属性值对象
   */
  getAttrValue(attr: AttributeType): AttributeValue | undefined {
    return this.getAttributeValue(attr)
  }

  /**
   * 批量预计算所有属性（回合开始时调用）
   */
  recalcAll(): void {
    this.recalculateAll()
  }

  /**
   * 获取属性值对象（包含详细信息）
   * @param attr 属性名称
   * @returns 属性值对象
   */
  getAttributeValue(attr: AttributeType | string): AttributeValue | undefined {
    const attrName = this.normalizeAttributeCode(attr as string)
    const attrData = this.attributes.get(attrName)
    if (!attrData) return undefined

    if (attrData.dirty) {
      this.recalcAttribute(attrName)
    }

    return attrData
  }

  /**
   * 批量预计算所有属性（推荐在回合开始前/战斗结算前调用）
   * 集中遍历所有 dirty 属性，计算复杂度与属性数量线性相关
   */
  recalculateAll(): void {
    this.attributes.forEach((_, type) => this.recalcAttribute(type))
  }

  /**
   * 获取属性基础值
   * @param attr 属性名称
   * @returns 属性基础值
   */
  getAttributeBase(attr: AttributeCode): number {
    const attrData = this.attributes.get(attr)
    return attrData?.base ?? 0
  }

  /**
   * 设置属性基础值
   * @param attr 属性名称
   * @param value 基础值
   */
  setAttributeBase(attr: AttributeCode, value: number): void {
    const attrData = this.attributes.get(attr)
    if (attrData) {
      attrData.base = value
      attrData.dirty = true
    }
  }

  /**
   * 获取当前生命值
   */
  get currentHealth(): number {
    return this.getAttribute(AttributeCodes.HP)
  }

  /**
   * 设置当前生命值
   */
  set currentHealth(value: number) {
    const attrData = this.attributes.get(AttributeCodes.HP)
    if (attrData) {
      const maxHp = this.getAttribute(AttributeCodes.MAX_HP)
      attrData.value = Math.max(0, Math.min(value, maxHp))
      attrData.dirty = false
    }
  }

  /**
   * 获取最大生命值
   */
  get maxHealth(): number {
    return this.getAttribute(AttributeCodes.MAX_HP)
  }

  /**
   * 设置最大生命值
   */
  set maxHealth(value: number) {
    this.setAttributeBase(AttributeCodes.MAX_HP, value)
  }

  /**
   * 获取当前能量值
   */
  get currentEnergy(): number {
    return this.getAttribute(AttributeCodes.ENERGY)
  }

  /**
   * 设置当前能量值
   */
  set currentEnergy(value: number) {
    const attrData = this.attributes.get(AttributeCodes.ENERGY)
    if (attrData) {
      const maxEnergy = this.getAttribute(AttributeCodes.MAX_ENERGY)
      attrData.value = Math.max(0, Math.min(value, maxEnergy))
      attrData.dirty = false
    }
  }

  /**
   * 获取最大能量值
   */
  get maxEnergy(): number {
    return this.getAttribute(AttributeCodes.MAX_ENERGY)
  }

  /**
   * 设置最大能量值
   */
  set maxEnergy(value: number) {
    this.setAttributeBase(AttributeCodes.MAX_ENERGY, value)
  }

  /**
   * 获取速度值
   */
  get speed(): number {
    return this.getAttribute(AttributeCodes.SPD)
  }

  /**
   * 设置速度值
   */
  set speed(value: number) {
    this.setAttributeBase(AttributeCodes.SPD, value)
  }

  /**
   * 获取最小攻击力
   */
  get minAttack(): number {
    return this.getAttribute(AttributeCodes.MIN_ATK)
  }

  /**
   * 设置最小攻击力
   */
  set minAttack(value: number) {
    this.setAttributeBase(AttributeCodes.MIN_ATK, value)
  }

  /**
   * 获取最大攻击力
   */
  get maxAttack(): number {
    return this.getAttribute(AttributeCodes.MAX_ATK)
  }

  /**
   * 设置最大攻击力
   */
  set maxAttack(value: number) {
    this.setAttributeBase(AttributeCodes.MAX_ATK, value)
  }

  /**
   * 获取平均攻击力
   */
  get attack(): number {
    return this.getAttribute(AttributeCodes.ATK)
  }

  /**
   * 设置平均攻击力
   */
  set attack(value: number) {
    this.setAttributeBase(AttributeCodes.ATK, value)
  }

  /**
   * 获取防御力
   */
  get defense(): number {
    return this.getAttribute(AttributeCodes.DEF)
  }

  /**
   * 设置防御力
   */
  set defense(value: number) {
    this.setAttributeBase(AttributeCodes.DEF, value)
  }

  /**
   * 获取暴击率
   */
  get critRate(): number {
    return this.getAttribute(AttributeCodes.CRIT_RATE)
  }

  /**
   * 设置暴击率
   */
  set critRate(value: number) {
    this.setAttributeBase(AttributeCodes.CRIT_RATE, value)
  }

  /**
   * 获取暴击伤害
   */
  get critDamage(): number {
    return this.getAttribute(AttributeCodes.CRIT_DMG)
  }

  /**
   * 设置暴击伤害
   */
  set critDamage(value: number) {
    this.setAttributeBase(AttributeCodes.CRIT_DMG, value)
  }

  /**
   * 获取免伤率
   */
  get damageReduction(): number {
    return this.getAttribute(AttributeCodes.DMG_REDUCTION)
  }

  /**
   * 设置免伤率
   */
  set damageReduction(value: number) {
    this.setAttributeBase(AttributeCodes.DMG_REDUCTION, value)
  }

  /**
   * 获取气血加成
   */
  get healthBonus(): number {
    return 0
  }

  /**
   * 设置气血加成
   */
  set healthBonus(value: number) {
    // 保留兼容性
  }

  /**
   * 获取攻击加成
   */
  get attackBonus(): number {
    return 0
  }

  /**
   * 设置攻击加成
   */
  set attackBonus(value: number) {
    // 保留兼容性
  }

  /**
   * 获取防御加成
   */
  get defenseBonus(): number {
    return 0
  }

  /**
   * 设置防御加成
   */
  set defenseBonus(value: number) {
    // 保留兼容性
  }

  /**
   * 获取速度加成
   */
  get speedBonus(): number {
    return 0
  }

  /**
   * 设置速度加成
   */
  set speedBonus(value: number) {
    // 保留兼容性
  }

  /**
   * 标准化属性名称
   * @param attribute 原始属性名称
   * @returns 标准化后的属性名称
   */
  private normalizeAttributeCode(attribute: string): AttributeCode {
    return normalizeAttributeCode(attribute) as AttributeCode
  }

  /**
   * 获取随机攻击力（用于伤害计算）
   * 在minAttack和maxAttack之间随机取值
   * @returns 随机攻击力
   */
  getRandomAttack(): number {
    const minAtk = this.getAttribute(AttributeCodes.MIN_ATK)
    const maxAtk = this.getAttribute(AttributeCodes.MAX_ATK)
    return Math.floor(Math.random() * (maxAtk - minAtk + 1)) + minAtk
  }

  /**
   * 设置属性值
   * @param attribute - 属性名称
   * @param value - 属性值
   */
  setAttribute(attribute: string, value: number): void {
    const attrName = this.normalizeAttributeCode(attribute)

    switch (attrName) {
      case AttributeCodes.HP:
        this.currentHealth = value
        break
      case AttributeCodes.ENERGY:
        this.currentEnergy = value
        break
      case AttributeCodes.MAX_HP:
        this.maxHealth = value
        break
      case AttributeCodes.MAX_ENERGY:
        this.maxEnergy = value
        break
      case AttributeCodes.ATK:
        this.attack = value
        break
      case AttributeCodes.MIN_ATK:
        this.minAttack = value
        break
      case AttributeCodes.MAX_ATK:
        this.maxAttack = value
        break
      case AttributeCodes.DEF:
        this.defense = value
        break
      case AttributeCodes.SPD:
        this.speed = value
        break
      case AttributeCodes.CRIT_RATE:
        this.critRate = value
        break
      case AttributeCodes.CRIT_DMG:
        this.critDamage = value
        break
      case AttributeCodes.DMG_REDUCTION:
        this.damageReduction = value
        break
      default:
        this.setAttributeBase(attrName, value)
        break
    }
  }

  /**
   * 判断是否存活
   * @returns 是否存活
   */
  isAlive(): boolean {
    return this.currentHealth > 0
  }

  /**
   * 判断是否满血
   * @returns 是否满血
   */
  isFullHealth(): boolean {
    return this.currentHealth >= this.maxHealth
  }

  /**
   * 判断是否需要治疗
   * @returns 是否需要治疗（血量低于50%）
   */
  needsHealing(): boolean {
    return this.currentHealth / this.maxHealth < 0.5
  }

  /**
   * 受到伤害
   * @param amount - 伤害值
   * @returns 实际受到的伤害值
   */
  takeDamage(amount: number): number {
    if (!this.isAlive()) {
      return 0
    }

    const damage = Math.max(0, amount)
    this.currentHealth = Math.max(0, this.currentHealth - damage)
    this.gainEnergy(15)

    return damage
  }

  /**
   * 治疗
   * @param amount - 治疗值
   * @returns 实际治疗量
   */
  heal(amount: number): number {
    const healAmount = Math.max(0, amount)
    const originalHealth = this.currentHealth
    this.currentHealth = Math.min(
      this.currentHealth + healAmount,
      this.maxHealth,
    )
    return this.currentHealth - originalHealth
  }

  /**
   * 获得能量
   * 集成触发器事件系统，触发能量获取事件
   * @param amount - 能量值
   */
  gainEnergy(amount: number): void {
    const previousEnergy = this.currentEnergy
    this.currentEnergy = Math.min(this.currentEnergy + amount, this.maxEnergy)
    const actualGain = this.currentEnergy - previousEnergy

    // 触发能量获取事件
    if (actualGain > 0) {
      triggerEventBus.emit('ON_ENERGY_GAINED', {
        phase: 'ON_ENERGY_GAINED',
        sourceId: this.id,
        value: actualGain,
      })
    }
  }

  /**
   * 消耗能量
   * @param amount - 能量值
   * @returns 是否成功消耗
   */
  spendEnergy(amount: number): boolean {
    if (this.currentEnergy >= amount) {
      this.currentEnergy -= amount
      return true
    }
    return false
  }

  /**
   * 行动后处理
   */
  afterAction(): void {
    this.gainEnergy(25)
  }

  /**
   * 获取所有技能配置
   * @returns 技能配置对象
   */
  getSkills(): {
    small?: SkillConfig[]
    passive?: SkillConfig[]
    ultimate?: SkillConfig[]
  } {
    return this.skills
  }

  getSkillList(): SkillConfig[] {
    return [
      ...(this.skills.small || []),
      ...(this.skills.passive || []),
      ...(this.skills.ultimate || []),
    ]
  }

  /**
   * 获取技能ID
   * @param filter - 技能类型过滤：'all'返回所有，'active'返回主动技能，'passive'返回被动技能
   * @returns 技能ID数组
   */
  getSkillIds(filter: 'all' | 'active' | 'passive' = 'all'): string[] {
    const allSkills: string[] = []
    const activeSkills: string[] = []
    const passiveSkills: string[] = []

    if (this.skills.small) {
      const smallIds = this.skills.small.map((skill) => skill.id)
      allSkills.push(...smallIds)
      activeSkills.push(...smallIds)
    }
    if (this.skills.passive) {
      const passiveIds = this.skills.passive.map((skill) => skill.id)
      allSkills.push(...passiveIds)
      passiveSkills.push(...passiveIds)
    }
    if (this.skills.ultimate) {
      const ultimateIds = this.skills.ultimate.map((skill) => skill.id)
      allSkills.push(...ultimateIds)
      activeSkills.push(...ultimateIds)
    }

    switch (filter) {
      case 'active':
        return activeSkills
      case 'passive':
        return passiveSkills
      default:
        return allSkills
    }
  }

  /**
   * 判断是否拥有指定技能
   * @param skillId - 技能ID
   * @returns 是否拥有
   */
  hasSkill(skillId: string): boolean {
    return this.getSkillIds().includes(skillId)
  }

  /**
   * 添加Buff
   * @param buffInstanceId - Buff实例ID
   */
  addBuff(buffInstanceId: string): void {
    if (!this.buffs.includes(buffInstanceId)) {
      this.buffs.push(buffInstanceId)
      this.markAllDirty()
    }
  }

  /**
   * 移除Buff
   * @param buffInstanceId - Buff实例ID
   */
  removeBuff(buffInstanceId: string): void {
    const index = this.buffs.indexOf(buffInstanceId)
    if (index !== -1) {
      this.buffs.splice(index, 1)
      this.markAllDirty()
    }
  }

  /**
   * 判断是否拥有指定Buff
   * @param buffId - Buff ID
   * @returns 是否拥有
   */
  hasBuff(buffId: string): boolean {
    return this.buffs.some((id) => id.includes(buffId))
  }

  /**
   * 检查技能是否可用（未冷却）
   * @param skillId - 技能ID
   * @returns 是否可用
   */
  isSkillAvailable(skillId: string): boolean {
    const cooldown = this.skillCooldowns.get(skillId)
    return cooldown === undefined || cooldown <= 0
  }

  /**
   * 设置技能冷却
   * @param skillId - 技能ID
   * @param cooldown - 冷却回合数
   */
  setSkillCooldown(skillId: string, cooldown: number): void {
    if (cooldown > 0) {
      this.skillCooldowns.set(skillId, cooldown)
    } else {
      this.skillCooldowns.delete(skillId)
    }
  }

  /**
   * 减少所有技能的冷却回合数
   */
  reduceSkillCooldowns(): void {
    for (const [skillId, cooldown] of this.skillCooldowns.entries()) {
      const newCooldown = cooldown - 1
      if (newCooldown <= 0) {
        this.skillCooldowns.delete(skillId)
      } else {
        this.skillCooldowns.set(skillId, newCooldown)
      }
    }
  }

  /**
   * 获取技能剩余冷却回合数
   * @param skillId - 技能ID
   * @returns 剩余冷却回合数，0表示无冷却
   */
  getSkillCooldown(skillId: string): number {
    return this.skillCooldowns.get(skillId) || 0
  }

  /**
   * 重置所有技能冷却
   */
  resetSkillCooldowns(): void {
    this.skillCooldowns.clear()
  }

  /**
   * 创建参与者快照
   * @param buffSnapshots - Buff实例快照列表
   * @returns 参与者快照数据
   */
  toSnapshot(buffSnapshots: BuffInstanceSnapshot[] = []): ParticipantSnapshot {
    const skillCooldowns: Record<string, number> = {}
    this.skillCooldowns.forEach((value, key) => {
      skillCooldowns[key] = value
    })

    return {
      id: this.id,
      name: this.name,
      type: this.type,
      team: this.team,
      hp: this.currentHealth,
      maxHp: this.maxHealth,
      energy: this.currentEnergy,
      maxEnergy: this.maxEnergy,
      buffs: buffSnapshots,
      skillCooldowns,
      statusEffects: this.statusEffects ? [...this.statusEffects] : [],
      attributes: {
        attack: this.attack,
        defense: this.defense,
        speed: this.speed,
        critRate: this.critRate,
        critDamage: this.critDamage,
      },
    }
  }

  public markAllAttributesDirty(): void {
    for (const attr of Object.values(AttributeCodes)) {
      const valueObj = this.attributes.get(attr)
      if (valueObj) {
        valueObj.dirty = true
      }
    }
    // 触发重新计算（可延迟至下次获取属性时）
  }
}
