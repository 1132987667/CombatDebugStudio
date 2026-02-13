/**
 * 文件: BattleParticipantImpl.ts
 * 创建日期: 2026-02-12
 * 作者: CombatDebugStudio
 * 功能: 战斗参与者实现类
 * 描述: 使用 Class 替代对象字面量，方法在原型上共享，提升内存效率和代码可维护性
 * 版本: 1.0.0
 */

import type {
  BattleParticipant,
  StatusEffect,
  ParticipantSide,
} from '@/types/battle'

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
    small?: string[]
    passive?: string[]
    ultimate?: string[]
  }
}

/**
 * 战斗参与者实现类
 * 使用 Class 替代对象字面量，方法在原型上共享
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
  /** 当前生命值 */
  currentHealth: number
  /** 最大生命值 */
  maxHealth: number
  /** 当前能量值 */
  currentEnergy: number
  /** 最大能量值 */
  maxEnergy: number
  /** Buff列表 */
  buffs: string[]

  /** 速度值 */
  speed: number
  /** 最小攻击力 */
  minAttack: number
  /** 最大攻击力 */
  maxAttack: number
  /** 平均攻击力 */
  attack: number
  /** 防御力 */
  defense: number
  /** 暴击率 */
  critRate: number
  /** 暴击伤害 */
  critDamage: number
  /** 免伤率 */
  damageReduction: number
  /** 气血加成 */
  healthBonus: number
  /** 攻击加成 */
  attackBonus: number
  /** 防御加成 */
  defenseBonus: number
  /** 速度加成 */
  speedBonus: number
  /** 状态效果列表 */
  statusEffects?: StatusEffect[]
  /** 技能配置 */
  skills: {
    small?: string[]
    passive?: string[]
    ultimate?: string[]
  }

  /**
   * 构造函数
   * @param data - 初始化数据
   */
  constructor(data: ParticipantInitData) {
    this.id = data.id
    this.name = data.name
    this.level = data.level
    this.type = data.type
    this.maxHealth = data.maxHealth
    this.currentHealth = data.currentHealth ?? data.maxHealth
    this.maxEnergy = data.maxEnergy ?? 150
    this.currentEnergy = data.currentEnergy ?? 25
    this.buffs = data.buffs ?? []

    this.speed = data.speed
    this.minAttack = data.minAttack
    this.maxAttack = data.maxAttack
    this.attack = (data.minAttack + data.maxAttack) / 2
    this.defense = data.defense
    this.critRate = data.critRate ?? 10
    this.critDamage = data.critDamage ?? 125
    this.damageReduction = data.damageReduction ?? 0
    this.healthBonus = data.healthBonus ?? 0
    this.attackBonus = data.attackBonus ?? 0
    this.defenseBonus = data.defenseBonus ?? 0
    this.speedBonus = data.speedBonus ?? 0
    this.statusEffects = data.statusEffects
    this.skills = data.skills ?? {}
  }

  /**
   * 获取属性值
   * @param attribute - 属性名称
   * @returns 属性值
   */
  getAttribute(attribute: string): number {
    switch (attribute) {
      case 'HP':
        return this.currentHealth
      case 'MAX_HP':
        return this.maxHealth
      case 'ATK':
        return this.attack
      case 'MIN_ATK':
        return this.minAttack
      case 'MAX_ATK':
        return this.maxAttack
      case 'DEF':
        return this.defense
      case 'SPD':
        return this.speed
      case 'CRIT_RATE':
        return this.critRate
      case 'CRIT_DMG':
        return this.critDamage
      case 'DMG_RED':
        return this.damageReduction
      case 'energy':
        return this.currentEnergy
      case 'max_energy':
        return this.maxEnergy
      default:
        return 0
    }
  }

  /**
   * 设置属性值
   * @param attribute - 属性名称
   * @param value - 属性值
   */
  setAttribute(attribute: string, value: number): void {
    if (attribute === 'HP') {
      this.currentHealth = Math.max(0, Math.min(value, this.maxHealth))
    } else if (attribute === 'energy') {
      this.currentEnergy = Math.max(0, Math.min(value, this.maxEnergy))
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
    this.currentHealth = Math.min(this.currentHealth + healAmount, this.maxHealth)
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
    this.gainEnergy(10)
  }

  /**
   * 获取所有技能ID
   * @returns 技能ID数组
   */
  getSkills(): string[] {
    const allSkills: string[] = []
    if (this.skills.small) allSkills.push(...this.skills.small)
    if (this.skills.passive) allSkills.push(...this.skills.passive)
    if (this.skills.ultimate) allSkills.push(...this.skills.ultimate)
    return allSkills
  }

  /**
   * 判断是否拥有指定技能
   * @param skillId - 技能ID
   * @returns 是否拥有
   */
  hasSkill(skillId: string): boolean {
    return this.getSkills().includes(skillId)
  }

  /**
   * 添加Buff
   * @param buffInstanceId - Buff实例ID
   */
  addBuff(buffInstanceId: string): void {
    if (!this.buffs.includes(buffInstanceId)) {
      this.buffs.push(buffInstanceId)
    }
  }

  /**
   * 移除Buff
   * @param buffInstanceId - Buff实例ID
   */
  removeBuff(buffInstanceId: string): void {
    this.buffs = this.buffs.filter((id) => id !== buffInstanceId)
  }

  /**
   * 判断是否拥有指定Buff
   * @param buffId - Buff ID
   * @returns 是否拥有
   */
  hasBuff(buffId: string): boolean {
    return this.buffs.some((id) => id.includes(buffId))
  }
}
