/**
 * 文件: BattleParticipantImpl.ts
 * 创建日期: 2026-02-12
 * 作者: CombatDebugStudio
 * 功能: 战斗参与者实现类
 * 描述: 使用 Class 替代对象字面量，方法在原型上共享，提升内存效率和代码可维护性
 * 版本: 2.0.0 - 添加属性缓存系统
 */

import type {
  BattleParticipant,
  StatusEffect,
  ParticipantSnapshot,
  BuffInstanceSnapshot,
} from '@/types/battle'
import { PARTICIPANT_SIDE, type ParticipantSide } from '@/types/battle'
import type { SkillConfig } from '@/types/skill'
import type {
  AttributeValue,
  ModifierDetail,
  AttributeName,
  IModifierProvider,
  IModifierStack,
  ModifierSourceType,
} from '@/types/attribute'
import { AttributeNames } from '@/types/attribute'
import type { Modifier, ModifierType, AttributeType } from '@/types/modifier'

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
export class BattleParticipantImpl implements BattleParticipant {
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
  private attributes: Map<AttributeName, AttributeValue> = new Map()

  /** 修饰符提供者引用（用于属性计算，解耦 BuffSystem） */
  private _modifierProvider: IModifierProvider | null = null

  /**
   * 构造函数
   * @param data - 初始化数据
   */
  constructor(data: ParticipantInitData) {
    this.id = data.id
    this.name = data.name
    this.level = data.level
    this.type = data.type
    this.team = data.team
    this.buffs = data.buffs ?? []
    this.statusEffects = data.statusEffects
    this.skills = data.skills ?? {}
    this.skillCooldowns = new Map<string, number>()

    this.initAttribute(AttributeNames.MAX_HP, data.maxHealth)
    this.initAttribute(AttributeNames.HP, data.currentHealth ?? data.maxHealth)
    this.initAttribute(AttributeNames.MAX_ENERGY, data.maxEnergy ?? 100)
    this.initAttribute(AttributeNames.ENERGY, data.currentEnergy ?? 25)
    this.initAttribute(
      AttributeNames.ATK,
      (data.minAttack + data.maxAttack) / 2,
    )
    this.initAttribute(AttributeNames.MIN_ATK, data.minAttack)
    this.initAttribute(AttributeNames.MAX_ATK, data.maxAttack)
    this.initAttribute(AttributeNames.DEF, data.defense)
    this.initAttribute(AttributeNames.SPD, data.speed)
    this.initAttribute(AttributeNames.CRIT_RATE, data.critRate ?? 10, true)
    this.initAttribute(AttributeNames.CRIT_DMG, data.critDamage ?? 125, true)
    this.initAttribute(AttributeNames.DMG_RED, data.damageReduction ?? 0, true)

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
    attr: AttributeName,
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
  markDirty(attr: AttributeName): void {
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
   * @param attr 属性名称
   */
  private recalcAttribute(attr: AttributeName): void {
    const attrData = this.attributes.get(attr)
    if (!attrData || !attrData.dirty) return

    const baseValue = attrData.base
    let finalValue = baseValue
    const modifierDetails: ModifierDetail[] = []

    let additive = 0
    let percentMultiplier = 1
    let independentMultiplier = 1
    let finalMultiplier = 1

    if (this._modifierProvider) {
      const modifierStack = this._modifierProvider.getModifierStack(this.id)
      if (modifierStack) {
        const modifiers = modifierStack.getModifiers(attr as AttributeType)

        let percentSum = 0
        for (const mod of modifiers) {
          if (mod.type === 'PERCENTAGE') {
            percentSum += mod.value
            modifierDetails.push({
              source:
                this._modifierProvider.getSourceName(mod.buffInstanceId) ||
                mod.buffInstanceId,
              sourceType: this._modifierProvider.getSourceType(
                mod.buffInstanceId,
              ),
              value: mod.value,
              type: 'percent',
            })
          }
        }
        if (percentSum !== 0) {
          percentMultiplier = 1 + percentSum
          finalValue += baseValue * percentSum
        }

        let addSum = 0
        for (const mod of modifiers) {
          if (mod.type === 'ADDITIVE') {
            addSum += mod.value
            modifierDetails.push({
              source:
                this._modifierProvider.getSourceName(mod.buffInstanceId) ||
                mod.buffInstanceId,
              sourceType: this._modifierProvider.getSourceType(
                mod.buffInstanceId,
              ),
              value: mod.value,
              type: 'add',
            })
          }
        }
        additive = addSum
        finalValue += addSum

        let multiplyFactor = 1
        for (const mod of modifiers) {
          if (mod.type === 'MULTIPLICATIVE') {
            multiplyFactor *= 1 + mod.value
            modifierDetails.push({
              source:
                this._modifierProvider.getSourceName(mod.buffInstanceId) ||
                mod.buffInstanceId,
              sourceType: this._modifierProvider.getSourceType(
                mod.buffInstanceId,
              ),
              value: mod.value,
              type: 'multiply',
            })
          }
        }
        independentMultiplier = multiplyFactor
        finalValue *= multiplyFactor

        let finalMulti = 1
        for (const mod of modifiers) {
          if (mod.type === 'FINAL') {
            finalMulti *= 1 + mod.value
            modifierDetails.push({
              source:
                this._modifierProvider.getSourceName(mod.buffInstanceId) ||
                mod.buffInstanceId,
              sourceType: this._modifierProvider.getSourceType(
                mod.buffInstanceId,
              ),
              value: mod.value,
              type: 'final',
            })
          }
        }
        finalMultiplier = finalMulti
        finalValue *= finalMulti
      }
    }

    if (attr === AttributeNames.HP) {
      const maxHp = this.getAttributeValue(AttributeNames.MAX_HP)
      finalValue = Math.max(0, Math.min(finalValue, maxHp))
    }
    if (attr === AttributeNames.ENERGY) {
      const maxEnergy = this.getAttributeValue(AttributeNames.MAX_ENERGY)
      finalValue = Math.max(0, Math.min(finalValue, maxEnergy))
    }

    attrData.value = finalValue
    attrData.modifiers = modifierDetails
    attrData.dirty = false

    if (this._modifierProvider?.isDebugMode()) {
      attrData.breakdown = {
        base: baseValue,
        additive,
        percentMultiplier,
        independentMultiplier,
        finalMultiplier,
      }
    } else {
      delete attrData.breakdown
    }
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
   * 获取属性值对象（包含详细信息）
   * @param attr 属性名称
   * @returns 属性值对象
   */
  getAttributeValue(attr: AttributeType | string): AttributeValue | undefined {
    const attrName = this.normalizeAttributeName(attr as string)
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
  getAttributeBase(attr: AttributeName): number {
    const attrData = this.attributes.get(attr)
    return attrData?.base ?? 0
  }

  /**
   * 设置属性基础值
   * @param attr 属性名称
   * @param value 基础值
   */
  setAttributeBase(attr: AttributeName, value: number): void {
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
    return this.getAttributeValue(AttributeNames.HP)
  }

  /**
   * 设置当前生命值
   */
  set currentHealth(value: number) {
    const attrData = this.attributes.get(AttributeNames.HP)
    if (attrData) {
      const maxHp = this.getAttributeValue(AttributeNames.MAX_HP)
      attrData.value = Math.max(0, Math.min(value, maxHp))
      attrData.dirty = false
    }
  }

  /**
   * 获取最大生命值
   */
  get maxHealth(): number {
    return this.getAttributeValue(AttributeNames.MAX_HP)
  }

  /**
   * 设置最大生命值
   */
  set maxHealth(value: number) {
    this.setAttributeBase(AttributeNames.MAX_HP, value)
  }

  /**
   * 获取当前能量值
   */
  get currentEnergy(): number {
    return this.getAttributeValue(AttributeNames.ENERGY)
  }

  /**
   * 设置当前能量值
   */
  set currentEnergy(value: number) {
    const attrData = this.attributes.get(AttributeNames.ENERGY)
    if (attrData) {
      const maxEnergy = this.getAttributeValue(AttributeNames.MAX_ENERGY)
      attrData.value = Math.max(0, Math.min(value, maxEnergy))
      attrData.dirty = false
    }
  }

  /**
   * 获取最大能量值
   */
  get maxEnergy(): number {
    return this.getAttributeValue(AttributeNames.MAX_ENERGY)
  }

  /**
   * 设置最大能量值
   */
  set maxEnergy(value: number) {
    this.setAttributeBase(AttributeNames.MAX_ENERGY, value)
  }

  /**
   * 获取速度值
   */
  get speed(): number {
    return this.getAttributeValue(AttributeNames.SPD)
  }

  /**
   * 设置速度值
   */
  set speed(value: number) {
    this.setAttributeBase(AttributeNames.SPD, value)
  }

  /**
   * 获取最小攻击力
   */
  get minAttack(): number {
    return this.getAttributeValue(AttributeNames.MIN_ATK)
  }

  /**
   * 设置最小攻击力
   */
  set minAttack(value: number) {
    this.setAttributeBase(AttributeNames.MIN_ATK, value)
  }

  /**
   * 获取最大攻击力
   */
  get maxAttack(): number {
    return this.getAttributeValue(AttributeNames.MAX_ATK)
  }

  /**
   * 设置最大攻击力
   */
  set maxAttack(value: number) {
    this.setAttributeBase(AttributeNames.MAX_ATK, value)
  }

  /**
   * 获取平均攻击力
   */
  get attack(): number {
    return this.getAttributeValue(AttributeNames.ATK)
  }

  /**
   * 设置平均攻击力
   */
  set attack(value: number) {
    this.setAttributeBase(AttributeNames.ATK, value)
  }

  /**
   * 获取防御力
   */
  get defense(): number {
    return this.getAttributeValue(AttributeNames.DEF)
  }

  /**
   * 设置防御力
   */
  set defense(value: number) {
    this.setAttributeBase(AttributeNames.DEF, value)
  }

  /**
   * 获取暴击率
   */
  get critRate(): number {
    return this.getAttributeValue(AttributeNames.CRIT_RATE)
  }

  /**
   * 设置暴击率
   */
  set critRate(value: number) {
    this.setAttributeBase(AttributeNames.CRIT_RATE, value)
  }

  /**
   * 获取暴击伤害
   */
  get critDamage(): number {
    return this.getAttributeValue(AttributeNames.CRIT_DMG)
  }

  /**
   * 设置暴击伤害
   */
  set critDamage(value: number) {
    this.setAttributeBase(AttributeNames.CRIT_DMG, value)
  }

  /**
   * 获取免伤率
   */
  get damageReduction(): number {
    return this.getAttributeValue(AttributeNames.DMG_RED)
  }

  /**
   * 设置免伤率
   */
  set damageReduction(value: number) {
    this.setAttributeBase(AttributeNames.DMG_RED, value)
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
   * 获取属性值
   * @param attribute - 属性名称
   * @returns 属性值
   */
  getAttribute(attribute: string): number {
    const attrName = this.normalizeAttributeName(attribute)
    return this.getAttributeValue(attrName)
  }

  /**
   * 标准化属性名称
   * @param attribute 原始属性名称
   * @returns 标准化后的属性名称
   */
  private normalizeAttributeName(attribute: string): AttributeName {
    const mapping: Record<string, AttributeName> = {
      HP: AttributeNames.HP,
      MAX_HP: AttributeNames.MAX_HP,
      ATK: AttributeNames.ATK,
      MIN_ATK: AttributeNames.MIN_ATK,
      MAX_ATK: AttributeNames.MAX_ATK,
      DEF: AttributeNames.DEF,
      SPD: AttributeNames.SPD,
      CRIT_RATE: AttributeNames.CRIT_RATE,
      CRIT_DMG: AttributeNames.CRIT_DMG,
      DMG_RED: AttributeNames.DMG_RED,
      energy: AttributeNames.ENERGY,
      max_energy: AttributeNames.MAX_ENERGY,
      attack: AttributeNames.ATK,
      defense: AttributeNames.DEF,
      speed: AttributeNames.SPD,
      critRate: AttributeNames.CRIT_RATE,
      critDamage: AttributeNames.CRIT_DMG,
      damageReduction: AttributeNames.DMG_RED,
    }
    return mapping[attribute] || (attribute as AttributeName)
  }

  /**
   * 获取随机攻击力（用于伤害计算）
   * 在minAttack和maxAttack之间随机取值
   * @returns 随机攻击力
   */
  getRandomAttack(): number {
    const minAtk = this.getAttributeValue(AttributeNames.MIN_ATK)
    const maxAtk = this.getAttributeValue(AttributeNames.MAX_ATK)
    return Math.floor(Math.random() * (maxAtk - minAtk + 1)) + minAtk
  }

  /**
   * 设置属性值
   * @param attribute - 属性名称
   * @param value - 属性值
   */
  setAttribute(attribute: string, value: number): void {
    const attrName = this.normalizeAttributeName(attribute)

    switch (attrName) {
      case AttributeNames.HP:
        this.currentHealth = value
        break
      case AttributeNames.ENERGY:
        this.currentEnergy = value
        break
      case AttributeNames.MAX_HP:
        this.maxHealth = value
        break
      case AttributeNames.MAX_ENERGY:
        this.maxEnergy = value
        break
      case AttributeNames.ATK:
        this.attack = value
        break
      case AttributeNames.MIN_ATK:
        this.minAttack = value
        break
      case AttributeNames.MAX_ATK:
        this.maxAttack = value
        break
      case AttributeNames.DEF:
        this.defense = value
        break
      case AttributeNames.SPD:
        this.speed = value
        break
      case AttributeNames.CRIT_RATE:
        this.critRate = value
        break
      case AttributeNames.CRIT_DMG:
        this.critDamage = value
        break
      case AttributeNames.DMG_RED:
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
   * @param amount - 能量值
   */
  gainEnergy(amount: number): void {
    this.currentEnergy = Math.min(this.currentEnergy + amount, this.maxEnergy)
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
  getSkills(): UISkills {
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
}
