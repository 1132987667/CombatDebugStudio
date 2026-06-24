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
} from '@/domain/battle/types'
import { PARTICIPANT_SIDE, type ParticipantSide } from '@/domain/battle/types'
import type { SkillSet } from '@/domain/skill/types'
import {
  AttributeValues,
  Modifier,
  type IModifierProvider,
} from '@/domain/attribute/types'
import {
  AttributeValue,
  createAttributeValue,
  createBaseAttributeValue,
  ATTRIBUTE_CODE,
  AttributeMetaMap,
  getAttributeMeta,
} from '@/domain/attribute/types'
import { ParticipantStats } from '@/domain/battle/entity/ParticipantStats'
import { ParticipantBuffs } from '@/domain/battle/entity/ParticipantBuffs'
import { ParticipantSkills } from '@/domain/battle/entity/ParticipantSkills'
import { triggerEventBus } from '@/domain/buff/TriggerEventBus'

export type BaseBattleParticipant = {
  id: string
  name: string
  level: number
  type: ParticipantSide
  team: ParticipantSide
  enabled?: boolean
  skills: SkillSet
  statusEffects?: StatusEffect[]
  buffs: Modifier[]
  attributeValues?: AttributeValues
}

export type BattleParticipantInitData = {
  id: string
  name: string
  level: number
  type: ParticipantSide
  team: ParticipantSide
  enabled: boolean
  skills: SkillSet
  statusEffects?: StatusEffect[]
  buffs?: Modifier[]
  attributeValues?: AttributeValues
}

/**
 * 战斗参与者实现类
 * 使用 Class 替代对象字面量，方法在原型上共享
 * 使用属性缓存系统管理属性值
 */
export class BattleParticipantImpl implements BattleEntity {
  id: string
  name: string
  level: number
  type: ParticipantSide
  team: ParticipantSide
  enabled: boolean
  buffs: Modifier[]
  statusEffects?: StatusEffect[]
  skills: SkillSet
  attributeValues: AttributeValues

  /** Buff 管理器 */
  private buffManager: ParticipantBuffs

  /** 技能管理器 */
  private skillManager: ParticipantSkills

  /** 属性缓存 Map */
  private stats = new ParticipantStats()

  /**
   * 构造函数
   * @param data - 初始化数据
   * @param modifierProvider - 修饰符提供者（可选，通常为 BuffSystem 实例）
   */
  constructor(
    data: BattleParticipantInitData,
    modifierProvider?: IModifierProvider
  ) {
    this.id = data.id
    this.name = data.name
    this.level = data.level
    this.type = data.type
    this.team = data.team
    this.enabled = data.enabled ?? true
    this.buffs = data.buffs ?? []
    this.statusEffects = data.statusEffects
    this.skills = data.skills
    this.buffManager = new ParticipantBuffs(this.buffs as unknown as string[], () => this.markAllDirty())
    this.skillManager = new ParticipantSkills(this.skills)

    if (modifierProvider) {
      this.stats.setModifierProvider(modifierProvider)
    }

    if (data.attributeValues) {
      this.stats.initAttributes(data.attributeValues as any)
    }
  }

  setModifierProvider(provider: IModifierProvider): void {
    this.stats.setModifierProvider(provider)
  }

  /**
   * 设置Buff系统引用（向后兼容）
   * @param buffSystem Buff系统实例
   * @deprecated 请使用 setModifierProvider 方法
   */
  setBuffSystem(buffSystem: IModifierProvider): void {
    if (buffSystem && typeof buffSystem.getModifierStack === 'function') {
      this.stats.setModifierProvider(buffSystem)
    }
  }

  private initAttribute(
    code: ATTRIBUTE_CODE,
    baseValue: number,
    isPercentage: boolean = false
  ): void {
    this.stats.initAttribute(code, baseValue, isPercentage)
  }

  private recalcAttribute(attr: ATTRIBUTE_CODE): void {
    this.stats.getAttributeValue(attr)
  }

  private getAllBaseAttributes(): Record<string, number> {
    return this.stats.getAllBaseAttributes()
  }

  /**
   * 获取属性最终值（自动触发重新计算）
   * @param attr 属性名称
   * @returns 属性最终值
   */
  getAttribute(attr: ATTRIBUTE_CODE | string): number {
    const attrValue = this.getAttributeValue(attr)
    return attrValue?.value ?? 0
  }

  /**
   * 快捷获取属性最终值（number）
   * @param attr 属性名称（如 'HP', 'ATK'）
   * @returns 属性最终值
   */
  getAttr(attr: ATTRIBUTE_CODE): number {
    return this.getAttribute(attr)
  }

  getAttributeValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
    return this.stats.getAttributeValue(attr)
  }

  getAttrValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
    return this.stats.getAttrValue(attr)
  }

  getAttributeBase(attr: ATTRIBUTE_CODE): number {
    return this.stats.getAttributeBase(attr)
  }

  setAttributeBase(attr: ATTRIBUTE_CODE, value: number): void {
    this.stats.setAttributeBase(attr, value)
  }

  recalcAll(): void {
    this.stats.recalculateAll()
  }

  markDirty(attr: ATTRIBUTE_CODE): void {
    this.stats.markDirty(attr)
  }

  markAllDirty(): void {
    this.stats.markAllDirty()
  }

  recalculateAll(): void {
    this.stats.recalculateAll()
  }

  /**
   * 获取当前生命值
   */
  get currentHealth(): number {
    return this.getAttribute(ATTRIBUTE_CODE.currentHealth)
  }

  /**
   * 设置当前生命值
   */
  set currentHealth(value: number) {
    const maxHp = this.getAttribute(ATTRIBUTE_CODE.maxHealth)
    this.stats.setAttributeValue(ATTRIBUTE_CODE.currentHealth, Math.max(0, Math.min(value, maxHp)))
  }

  /**
   * 获取最大生命值
   */
  get maxHealth(): number {
    return this.getAttribute(ATTRIBUTE_CODE.maxHealth)
  }

  /**
   * 设置最大生命值
   */
  set maxHealth(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.maxHealth, value)
  }

  /**
   * 获取当前能量值
   */
  get currentEnergy(): number {
    return this.getAttribute(ATTRIBUTE_CODE.energy)
  }

  /**
   * 设置当前能量值
   */
  set currentEnergy(value: number) {
    const maxEnergy = this.getAttribute(ATTRIBUTE_CODE.maxEnergy)
    this.stats.setAttributeValue(ATTRIBUTE_CODE.energy, Math.max(0, Math.min(value, maxEnergy)))
  }

  /**
   * 获取最大能量值
   */
  get maxEnergy(): number {
    return this.getAttribute(ATTRIBUTE_CODE.maxEnergy)
  }

  /**
   * 设置最大能量值
   */
  set maxEnergy(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.maxEnergy, value)
  }

  /**
   * 获取速度值
   */
  get speed(): number {
    return this.getAttribute(ATTRIBUTE_CODE.speed)
  }

  /**
   * 设置速度值
   */
  set speed(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.speed, value)
  }

  /**
   * 获取最小攻击力
   */
  get minAttack(): number {
    return this.getAttribute(ATTRIBUTE_CODE.minAttack)
  }

  /**
   * 设置最小攻击力
   */
  set minAttack(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.minAttack, value)
  }

  /**
   * 获取最大攻击力
   */
  get maxAttack(): number {
    return this.getAttribute(ATTRIBUTE_CODE.maxAttack)
  }

  /**
   * 设置最大攻击力
   */
  set maxAttack(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.maxAttack, value)
  }

  /**
   * 获取平均攻击力
   */
  get attack(): number {
    return this.getAttribute(ATTRIBUTE_CODE.attack)
  }

  /**
   * 设置平均攻击力
   */
  set attack(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.attack, value)
  }

  /**
   * 获取防御力
   */
  get defense(): number {
    return this.getAttribute(ATTRIBUTE_CODE.defense)
  }

  /**
   * 设置防御力
   */
  set defense(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.defense, value)
  }

  /**
   * 获取暴击率
   */
  get critRate(): number {
    return this.getAttribute(ATTRIBUTE_CODE.critRate)
  }

  /**
   * 设置暴击率
   */
  set critRate(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.critRate, value)
  }

  /**
   * 获取暴击伤害
   */
  get critDamage(): number {
    return this.getAttribute(ATTRIBUTE_CODE.critDamage)
  }

  /**
   * 设置暴击伤害
   */
  set critDamage(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.critDamage, value)
  }

  /**
   * 获取免伤率
   */
  get damageReduction(): number {
    return this.getAttribute(ATTRIBUTE_CODE.damageReduction)
  }

  /**
   * 设置免伤率
   */
  set damageReduction(value: number) {
    this.setAttributeBase(ATTRIBUTE_CODE.damageReduction, value)
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
   * 获取随机攻击力（用于伤害计算）
   * 在minAttack和maxAttack之间随机取值
   * @returns 随机攻击力
   */
  getRandomAttack(): number {
    const minAtk = this.getAttribute(ATTRIBUTE_CODE.minAttack)
    const maxAtk = this.getAttribute(ATTRIBUTE_CODE.maxAttack)
    return Math.floor(Math.random() * (maxAtk - minAtk + 1)) + minAtk
  }

  /**
   * 设置属性值
   * @param attribute - 属性名称
   * @param value - 属性值
   */
  setAttribute(attribute: ATTRIBUTE_CODE, value: number): void {
    switch (attribute) {
      case ATTRIBUTE_CODE.currentHealth:
        this.currentHealth = value
        break
      case ATTRIBUTE_CODE.energy:
        this.currentEnergy = value
        break
      case ATTRIBUTE_CODE.maxHealth:
        this.maxHealth = value
        break
      case ATTRIBUTE_CODE.maxEnergy:
        this.maxEnergy = value
        break
      case ATTRIBUTE_CODE.attack:
        this.attack = value
        break
      case ATTRIBUTE_CODE.minAttack:
        this.minAttack = value
        break
      case ATTRIBUTE_CODE.maxAttack:
        this.maxAttack = value
        break
      case ATTRIBUTE_CODE.defense:
        this.defense = value
        break
      case ATTRIBUTE_CODE.speed:
        this.speed = value
        break
      case ATTRIBUTE_CODE.critRate:
        this.critRate = value
        break
      case ATTRIBUTE_CODE.critDamage:
        this.critDamage = value
        break
      case ATTRIBUTE_CODE.damageReduction:
        this.damageReduction = value
        break
      default:
        this.setAttributeBase(attribute, value)
        break
    }
  }

  /**
   * 判断是否存活
   * @returns 是否存活
   */
  isAlive(): boolean {
    // 使用严格比较确保死亡判定准确
    // HP <= 0 即视为死亡，避免 epsilon 导致的"锁血"问题
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
      this.maxHealth
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
  getSkills(): SkillSet {
    return this.skillManager.getSkills()
  }

  getSkillList(): SkillConfig[] {
    return this.skillManager.getSkillList()
  }

  /**
   * 获取技能ID
   * @param filter - 技能类型过滤：'all'返回所有，'active'返回主动技能，'passive'返回被动技能
   * @returns 技能ID数组
   */
  getSkillIds(filter: 'all' | 'active' | 'passive' = 'all'): string[] {
    return this.skillManager.getSkillIds(filter)
  }

  /**
   * 判断是否拥有指定技能
   * @param skillId - 技能ID
   * @returns 是否拥有
   */
  hasSkill(skillId: string): boolean {
    return this.skillManager.hasSkill(skillId)
  }

  /**
   * 添加Buff
   * @param buffInstanceId - Buff实例ID
   */
  addBuff(buffInstanceId: string): void {
    this.buffManager.addBuff(buffInstanceId)
  }

  /**
   * 移除Buff
   * @param buffInstanceId - Buff实例ID
   */
  removeBuff(buffInstanceId: string): void {
    this.buffManager.removeBuff(buffInstanceId)
  }

  /**
   * 判断是否拥有指定Buff
   * @param buffId - Buff ID
   * @returns 是否拥有
   */
  hasBuff(buffId: string): boolean {
    return this.buffManager.hasBuff(buffId)
  }

  /**
   * 检查技能是否可用（未冷却）
   * @param skillId - 技能ID
   * @returns 是否可用
   */
  isSkillAvailable(skillId: string): boolean {
    return this.skillManager.isSkillAvailable(skillId)
  }

  /**
   * 设置技能冷却
   * @param skillId - 技能ID
   * @param cooldown - 冷却回合数
   */
  setSkillCooldown(skillId: string, cooldown: number): void {
    this.skillManager.setSkillCooldown(skillId, cooldown)
  }

  /**
   * 减少所有技能的冷却回合数
   */
  reduceSkillCooldowns(): void {
    this.skillManager.reduceSkillCooldowns()
  }

  /**
   * 获取技能剩余冷却回合数
   * @param skillId - 技能ID
   * @returns 剩余冷却回合数，0表示无冷却
   */
  getSkillCooldown(skillId: string): number {
    return this.skillManager.getSkillCooldown(skillId)
  }

  /**
   * 重置所有技能冷却
   */
  resetSkillCooldowns(): void {
    this.skillManager.resetSkillCooldowns()
  }

  /**
   * 创建参与者快照
   * @param buffSnapshots - Buff实例快照列表
   * @returns 参与者快照数据
   */
  toSnapshot(buffSnapshots: BuffInstanceSnapshot[] = []): ParticipantSnapshot {
    const skillCooldowns = this.skillManager.exportCooldownSnapshot()

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
    this.stats.markAllDirty()
  }

  /**
   * 导出所有属性详情（含基础值、最终值、修饰符、计算公式）
   * @returns 属性详情列表
   */
  exportAttributes(): Array<{
    code: string
    name: string
    displayName: string
    description: string
    range: string
    impact: string
    isPercentage: boolean
    baseValue: number
    finalValue: number
    modifiers: Array<{
      source: string
      sourceType: string
      value: number
      type: string
      description?: string
    }>
    formula: string
    breakdown?: {
      base: number
      additive: number
      percentMultiplier: number
      independentMultiplier: number
      finalMultiplier: number
    }
  }> {
    this.recalculateAll()
    const result: any[] = []

    for (const attrCode of Object.values(ATTRIBUTE_CODE)) {
      const attrValue = this.stats.getAttributeValue(attrCode)
      if (!attrValue) continue

      const meta = getAttributeMeta(attrCode)
      const isPercentage = meta?.isPercentage ?? attrValue.isPercentage
      const parts: string[] = [`基础值(${attrValue.base})`]
      for (const mod of attrValue.modifiers) {
        const sign = mod.value >= 0 ? '+' : '-'
        const absVal = Math.abs(mod.value)
        const valStr = isPercentage ? `${absVal}%` : `${absVal}`
        switch (mod.type) {
          case 'ADDITIVE': parts.push(`${sign}${valStr}[${mod.source}]`); break
          case 'PERCENTAGE': parts.push(`${sign}${valStr}%[${mod.source}]`); break
          case 'MULTIPLICATIVE': parts.push(`×${1 + mod.value}[${mod.source}]`); break
          case 'FINAL': parts.push(`×${1 + mod.value}(最终)[${mod.source}]`); break
          default: parts.push(`${sign}${valStr}[${mod.source}]`)
        }
      }

      result.push({
        code: attrCode,
        name: meta?.name ?? attrCode,
        displayName: meta?.displayName ?? attrCode,
        description: meta?.description ?? '',
        range: meta?.range ?? '',
        impact: meta?.impact ?? '',
        isPercentage,
        baseValue: attrValue.base,
        finalValue: attrValue.value,
        modifiers: attrValue.modifiers.map((m: any) => ({
          source: m.source, sourceType: m.sourceType, value: m.value, type: m.type, description: m.description,
        })),
        formula: parts.join(' → '),
        breakdown: attrValue.breakdown,
      })
    }
    return result
  }
}
