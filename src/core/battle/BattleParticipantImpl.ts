/**
 * 文件: BattleParticipantImpl.ts
 * 创建日期: 2026-02-12
 * 作者: CombatDebugStudio
 * 功能: 战斗参与者实现类
 * 描述: 使用 Class 替代对象字面量，方法在原型上共享，提升内存效率和代码可维护性
 * 版本: 1.0.0
 */

import type { BattleParticipant, StatusEffect } from '@/types/battle'
import { PARTICIPANT_SIDE, type ParticipantSide } from '@/types/battle'
import type { SkillConfig } from '@/types/skill'
import type { UIBattleCharacter, UISkills } from '@/types/UI/UIBattleCharacter'

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
    small?: SkillConfig[]
    passive?: SkillConfig[]
    ultimate?: SkillConfig[]
  }
  /** 技能冷却状态映射，key为技能ID，value为剩余冷却回合数 */
  skillCooldowns: Map<string, number>

  /**
   * 从UI角色创建战斗参与者实例
   * @param uiCharacter - UI角色数据
   * @param isAlly - 是否为我方角色
   * @param index - 角色在队伍中的索引
   * @returns BattleParticipantImpl 实例
   */
  static fromUICharacter(
    uiCharacter: UIBattleCharacter,
    isAlly: boolean,
    index: number,
  ): BattleParticipantImpl {
    const side = isAlly ? PARTICIPANT_SIDE.ALLY : PARTICIPANT_SIDE.ENEMY

    const getValue = (
      attr: { value?: number } | number | undefined,
      defaultValue: number,
    ): number => {
      if (attr === undefined || attr === null) return defaultValue
      if (typeof attr === 'number') return attr
      if (typeof attr === 'object' && 'value' in attr)
        return attr.value ?? defaultValue
      return defaultValue
    }

    const maxHp = getValue(uiCharacter.maxHp, 0)
    const maxEnergy = getValue(uiCharacter.maxEnergy, 100)
    const currentEnergy = getValue(uiCharacter.currentEnergy, 25)
    const attack = getValue(uiCharacter.attack, 0)
    const defense = getValue(uiCharacter.defense, 0)
    const speed = getValue(uiCharacter.speed, 0)
    const critRate = getValue(uiCharacter.critRate, 10)
    const critDamage = getValue(uiCharacter.critDamage, 125)
    const damageReduction = getValue(uiCharacter.damageReduction, 0)
    const healthBonus = getValue(uiCharacter.healthBonus, 0)
    const attackBonus = getValue(uiCharacter.attackBonus, 0)
    const speedBonus = getValue(uiCharacter.speedBonus, 0)
    const minAttack = getValue(uiCharacter.minAttack, attack)
    const maxAttack = getValue(uiCharacter.maxAttack, attack)

    const instanceId = uiCharacter.id || `${isAlly ? 'ally' : 'enemy'}_${Date.now()}_${index}`

    const statusEffects: StatusEffect[] = (uiCharacter.buffs || []).map(buff => ({
      id: buff.id,
      name: buff.name,
      type: buff.isPositive ? 'buff' as const : 'debuff' as const,
      duration: buff.duration,
      remainingTurns: buff.duration
    }))

    return new BattleParticipantImpl({
      id: instanceId,
      name: uiCharacter.name || `${isAlly ? 'Ally' : 'Enemy'} ${index + 1}`,
      type: side,
      team: side,
      level: uiCharacter.level || 1,
      maxHealth: maxHp,
      currentHealth: getValue(uiCharacter.currentHp, maxHp),
      maxEnergy,
      currentEnergy,
      minAttack,
      maxAttack,
      attack,
      defense,
      speed,
      critRate,
      critDamage,
      damageReduction,
      healthBonus,
      attackBonus,
      speedBonus,
      skills: uiCharacter.skills || {},
      statusEffects,
    })
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
    this.team = data.team
    this.maxHealth = data.maxHealth
    this.currentHealth = data.currentHealth ?? data.maxHealth
    this.maxEnergy = data.maxEnergy ?? 100
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
    this.skillCooldowns = new Map<string, number>()
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
        return this.getRandomAttack()
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
   * 获取随机攻击力（用于伤害计算）
   * 在minAttack和maxAttack之间随机取值
   * @returns 随机攻击力
   */
  getRandomAttack(): number {
    return Math.floor(Math.random() * (this.maxAttack - this.minAttack + 1)) + this.minAttack
  }

  /**
   * 设置属性值
   * @param attribute - 属性名称
   * @param value - 属性值
   */
  setAttribute(attribute: string, value: number): void {
    switch (attribute) {
      case 'HP':
        this.currentHealth = Math.max(0, Math.min(value, this.maxHealth))
        break
      case 'energy':
        this.currentEnergy = Math.max(0, Math.min(value, this.maxEnergy))
        break
      case 'MAX_HP':
        this.maxHealth = Math.max(0, value)
        break
      case 'max_energy':
        this.maxEnergy = Math.max(0, value)
        break
      case 'ATK':
      case 'attack':
        this.attack = value
        break
      case 'MIN_ATK':
        this.minAttack = value
        break
      case 'MAX_ATK':
        this.maxAttack = value
        break
      case 'DEF':
      case 'defense':
        this.defense = value
        break
      case 'SPD':
      case 'speed':
        this.speed = value
        break
      case 'CRIT_RATE':
      case 'critRate':
        this.critRate = value
        break
      case 'CRIT_DMG':
      case 'critDamage':
        this.critDamage = value
        break
      case 'DMG_RED':
      case 'damageReduction':
        this.damageReduction = value
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

    // 触发受击时的被动技能
    // 注意：这里需要通过某种方式获取PassiveSkillManager实例
    // 由于依赖注入的限制，我们暂时不在这里直接触发
    // 而是在BattleSystem的伤害处理中触发

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
}
