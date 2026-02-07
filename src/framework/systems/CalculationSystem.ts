/**
 * 通用战斗框架 - 计算系统
 *
 * 功能：
 * 1. 统一的伤害和治疗计算接口
 * 2. 模块化的计算组件
 * 3. 可扩展的计算规则
 * 4. 性能优化的计算引擎
 */

import type {
  BattleParticipant,
  Skill,
  SkillEffect,
  StatusEffect,
  BattleAttributes,
} from '../core/interfaces'
import type { CalculationLog } from '@/types/battle-log'
import { FrameworkLogger } from '@/utils/logging'
import { PerformanceMonitor } from '../utils/PerformanceMonitor'

/**
 * 计算上下文接口
 */
export interface CalculationContext {
  source: BattleParticipant
  target: BattleParticipant
  skill?: Skill
  effects?: SkillEffect[]
  modifiers?: CalculationModifiers
  environment?: BattleEnvironment
}

/**
 * 计算修饰符接口
 */
export interface CalculationModifiers {
  criticalRate?: number
  criticalMultiplier?: number
  dodgeRate?: number
  accuracy?: number
  damageReduction?: number
  healingBonus?: number
  healingReduction?: number
}

/**
 * 战斗环境接口
 */
export interface BattleEnvironment {
  terrain?: string
  weather?: string
  timeOfDay?: string
  buffs?: string[]
}

/**
 * 计算结果接口
 */
export interface CalculationResult {
  value: number
  isCritical: boolean
  isDodged: boolean
  modifiers: CalculationModifiers
  details: CalculationDetails
}

/**
 * 计算详情接口
 */
export interface CalculationDetails {
  baseValue: number
  attributeBonus: number
  skillBonus: number
  statusBonus: number
  environmentBonus: number
  finalMultiplier: number
}

/**
 * 计算日志接口 - 使用统一类型定义
 */

/**
 * 计算系统接口
 */
export interface ICalculationSystem {
  calculateDamage(context: CalculationContext): CalculationResult
  calculateHeal(context: CalculationContext): CalculationResult
  calculateBuffEffect(context: CalculationContext): CalculationResult
  calculateDebuffEffect(context: CalculationContext): CalculationResult

  getCalculationLogs(): CalculationLog[]
  clearCalculationLogs(): void

  registerCalculator(type: string, calculator: Calculator): void
  unregisterCalculator(type: string): void
}

/**
 * 计算器接口
 */
export interface Calculator {
  calculate(context: CalculationContext): CalculationResult
  getSupportedTypes(): string[]
}

/**
 * 计算系统实现
 */
export class CalculationSystem implements ICalculationSystem {
  private logger: Logger
  private performanceMonitor: PerformanceMonitor
  private calculators: Map<string, Calculator> = new Map()
  private calculationLogs: CalculationLog[] = []
  private maxLogSize = 1000

  constructor() {
    this.logger = new Logger('CalculationSystem')
    this.performanceMonitor = new PerformanceMonitor()

    // 注册默认计算器
    this.registerDefaultCalculators()
  }

  /**
   * 计算伤害
   */
  public calculateDamage(context: CalculationContext): CalculationResult {
    return this.performanceMonitor.measure(
      'calculateDamage',
      () => this.calculateWithType('damage', context),
      { sourceId: context.source.id, targetId: context.target.id },
    )
  }

  /**
   * 计算治疗
   */
  public calculateHeal(context: CalculationContext): CalculationResult {
    return this.performanceMonitor.measure(
      'calculateHeal',
      () => this.calculateWithType('heal', context),
      { sourceId: context.source.id, targetId: context.target.id },
    )
  }

  /**
   * 计算增益效果
   */
  public calculateBuffEffect(context: CalculationContext): CalculationResult {
    return this.performanceMonitor.measure(
      'calculateBuffEffect',
      () => this.calculateWithType('buff', context),
      { sourceId: context.source.id, targetId: context.target.id },
    )
  }

  /**
   * 计算减益效果
   */
  public calculateDebuffEffect(context: CalculationContext): CalculationResult {
    return this.performanceMonitor.measure(
      'calculateDebuffEffect',
      () => this.calculateWithType('debuff', context),
      { sourceId: context.source.id, targetId: context.target.id },
    )
  }

  /**
   * 获取计算日志
   */
  public getCalculationLogs(): CalculationLog[] {
    return [...this.calculationLogs]
  }

  /**
   * 清空计算日志
   */
  public clearCalculationLogs(): void {
    this.calculationLogs = []
    this.logger.debug('Calculation logs cleared')
  }

  /**
   * 注册计算器
   */
  public registerCalculator(type: string, calculator: Calculator): void {
    this.calculators.set(type, calculator)
    this.logger.info('Calculator registered', {
      type,
      supportedTypes: calculator.getSupportedTypes(),
    })
  }

  /**
   * 卸载计算器
   */
  public unregisterCalculator(type: string): void {
    const existed = this.calculators.delete(type)
    if (existed) {
      this.logger.info('Calculator unregistered', { type })
    }
  }

  /**
   * 根据类型计算
   */
  private calculateWithType(
    type: string,
    context: CalculationContext,
  ): CalculationResult {
    const calculator = this.calculators.get(type)
    if (!calculator) {
      this.logger.warn('No calculator found for type', { type })
      return this.createEmptyResult()
    }

    try {
      const result = calculator.calculate(context)

      // 记录计算日志
      this.recordCalculationLog(type, context, result)

      return result
    } catch (error) {
      this.logger.error('Calculation error', { type, error: error.message })
      return this.createEmptyResult()
    }
  }

  /**
   * 记录计算日志
   */
  private recordCalculationLog(
    type: 'damage' | 'heal' | 'buff' | 'debuff',
    context: CalculationContext,
    result: CalculationResult,
  ): void {
    const log: CalculationLog = {
      timestamp: Date.now(),
      type,
      sourceId: context.source.id,
      targetId: context.target.id,
      skillId: context.skill?.id,
      result,
      context,
    }

    this.calculationLogs.push(log)

    // 限制日志大小
    if (this.calculationLogs.length > this.maxLogSize) {
      this.calculationLogs = this.calculationLogs.slice(-this.maxLogSize)
    }

    this.logger.debug('Calculation completed', {
      type,
      source: context.source.name,
      target: context.target.name,
      value: result.value,
    })
  }

  /**
   * 创建空结果
   */
  private createEmptyResult(): CalculationResult {
    return {
      value: 0,
      isCritical: false,
      isDodged: false,
      modifiers: {},
      details: {
        baseValue: 0,
        attributeBonus: 0,
        skillBonus: 0,
        statusBonus: 0,
        environmentBonus: 0,
        finalMultiplier: 1,
      },
    }
  }

  /**
   * 注册默认计算器
   */
  private registerDefaultCalculators(): void {
    this.registerCalculator('damage', new DamageCalculator())
    this.registerCalculator('heal', new HealCalculator())
    this.registerCalculator('buff', new BuffCalculator())
    this.registerCalculator('debuff', new DebuffCalculator())

    this.logger.info('Default calculators registered')
  }
}

/**
 * 伤害计算器实现
 */
export class DamageCalculator implements Calculator {
  private logger = new Logger('DamageCalculator')

  public calculate(context: CalculationContext): CalculationResult {
    const { source, target, modifiers = {}, environment = {} } = context

    // 1. 基础伤害值
    const baseValue = this.calculateBaseDamage(source, context)

    // 2. 属性加成
    const attributeBonus = this.calculateAttributeBonus(source, target)

    // 3. 技能加成
    const skillBonus = this.calculateSkillBonus(context)

    // 4. 状态效果加成
    const statusBonus = this.calculateStatusBonus(source, target)

    // 5. 环境加成
    const environmentBonus = this.calculateEnvironmentBonus(environment)

    // 6. 计算总值
    let totalValue =
      baseValue + attributeBonus + skillBonus + statusBonus + environmentBonus

    // 7. 应用防御效果
    totalValue = this.applyDefense(totalValue, target)

    // 8. 暴击判定
    const isCritical = this.checkCriticalHit(source, modifiers)
    if (isCritical) {
      totalValue *= modifiers.criticalMultiplier || 1.5
    }

    // 9. 闪避判定
    const isDodged = this.checkDodge(target, modifiers)
    if (isDodged) {
      totalValue = 0
    }

    // 10. 确保非负值
    totalValue = Math.max(0, Math.floor(totalValue))

    return {
      value: totalValue,
      isCritical,
      isDodged,
      modifiers,
      details: {
        baseValue,
        attributeBonus,
        skillBonus,
        statusBonus,
        environmentBonus,
        finalMultiplier: isCritical ? modifiers.criticalMultiplier || 1.5 : 1,
      },
    }
  }

  public getSupportedTypes(): string[] {
    return ['damage']
  }

  private calculateBaseDamage(
    source: BattleParticipant,
    context: CalculationContext,
  ): number {
    // 基础伤害基于源参与者的攻击属性
    const attack =
      source.attributes.attack || source.getAttribute?.('ATK') || 10
    return attack * (context.skill ? 1.2 : 1.0) // 技能伤害加成
  }

  private calculateAttributeBonus(
    source: BattleParticipant,
    target: BattleParticipant,
  ): number {
    // 基于属性差异的加成
    const sourceAttack = source.attributes.attack || 10
    const targetDefense = target.attributes.defense || 5
    return Math.max(0, sourceAttack - targetDefense) * 0.5
  }

  private calculateSkillBonus(context: CalculationContext): number {
    if (!context.skill) return 0

    // 技能基础伤害加成
    return context.skill.effects.reduce((sum, effect) => {
      if (effect.type === 'damage') {
        return sum + effect.value
      }
      return sum
    }, 0)
  }

  private calculateStatusBonus(
    source: BattleParticipant,
    target: BattleParticipant,
  ): number {
    let bonus = 0

    // 源参与者的增益效果
    source.statusEffects?.forEach((effect) => {
      if (effect.type === 'buff' && effect.name.includes('attack')) {
        bonus += effect.duration * 0.1 // 简单的增益计算
      }
    })

    // 目标参与者的减益效果
    target.statusEffects?.forEach((effect) => {
      if (effect.type === 'debuff' && effect.name.includes('defense')) {
        bonus += effect.duration * 0.1
      }
    })

    return bonus
  }

  private calculateEnvironmentBonus(environment: BattleEnvironment): number {
    let bonus = 0

    // 环境因素影响
    if (environment.weather === 'rain') bonus -= 0.1 // 雨天减少伤害
    if (environment.terrain === 'mountain') bonus += 0.2 // 山地增加伤害

    return bonus
  }

  private applyDefense(damage: number, target: BattleParticipant): number {
    const defense = target.attributes.defense || 5
    const defenseMultiplier = Math.max(0.1, 1 - defense * 0.01) // 防御减免
    return damage * defenseMultiplier
  }

  private checkCriticalHit(
    source: BattleParticipant,
    modifiers: CalculationModifiers,
  ): boolean {
    const baseRate = source.attributes.criticalChance || 0.05
    const finalRate = baseRate + (modifiers.criticalRate || 0)
    return Math.random() < finalRate
  }

  private checkDodge(
    target: BattleParticipant,
    modifiers: CalculationModifiers,
  ): boolean {
    const baseRate = target.attributes.dodgeChance || 0.05
    const finalRate = baseRate + (modifiers.dodgeRate || 0)
    return Math.random() < finalRate
  }
}

/**
 * 治疗计算器实现
 */
export class HealCalculator implements Calculator {
  private logger = new Logger('HealCalculator')

  public calculate(context: CalculationContext): CalculationResult {
    const { source, target, modifiers = {}, environment = {} } = context

    // 1. 基础治疗值
    const baseValue = this.calculateBaseHeal(source, context)

    // 2. 属性加成
    const attributeBonus = this.calculateAttributeBonus(source)

    // 3. 技能加成
    const skillBonus = this.calculateSkillBonus(context)

    // 4. 状态效果加成
    const statusBonus = this.calculateStatusBonus(source, target)

    // 5. 环境加成
    const environmentBonus = this.calculateEnvironmentBonus(environment)

    // 6. 计算总值
    let totalValue =
      baseValue + attributeBonus + skillBonus + statusBonus + environmentBonus

    // 7. 应用治疗上限
    totalValue = this.applyHealingCap(totalValue, target)

    // 8. 确保非负值
    totalValue = Math.max(0, Math.floor(totalValue))

    return {
      value: totalValue,
      isCritical: false, // 治疗通常没有暴击
      isDodged: false, // 治疗通常不会被闪避
      modifiers,
      details: {
        baseValue,
        attributeBonus,
        skillBonus,
        statusBonus,
        environmentBonus,
        finalMultiplier: 1,
      },
    }
  }

  public getSupportedTypes(): string[] {
    return ['heal']
  }

  private calculateBaseHeal(
    source: BattleParticipant,
    context: CalculationContext,
  ): number {
    // 基础治疗基于源参与者的魔法属性
    const magicPower =
      source.attributes.magicPower || source.getAttribute?.('MAGIC') || 8
    return magicPower * (context.skill ? 1.5 : 1.0) // 技能治疗加成
  }

  private calculateAttributeBonus(source: BattleParticipant): number {
    // 基于魔法属性的加成
    const magicPower = source.attributes.magicPower || 8
    return magicPower * 0.3
  }

  private calculateSkillBonus(context: CalculationContext): number {
    if (!context.skill) return 0

    // 技能基础治疗加成
    return context.skill.effects.reduce((sum, effect) => {
      if (effect.type === 'heal') {
        return sum + effect.value
      }
      return sum
    }, 0)
  }

  private calculateStatusBonus(
    source: BattleParticipant,
    target: BattleParticipant,
  ): number {
    let bonus = 0

    // 源参与者的增益效果
    source.statusEffects?.forEach((effect) => {
      if (effect.type === 'buff' && effect.name.includes('heal')) {
        bonus += effect.duration * 0.15
      }
    })

    // 目标参与者的减益效果
    target.statusEffects?.forEach((effect) => {
      if (effect.type === 'debuff' && effect.name.includes('heal_reduction')) {
        bonus -= effect.duration * 0.1
      }
    })

    return bonus
  }

  private calculateEnvironmentBonus(environment: BattleEnvironment): number {
    let bonus = 0

    // 环境因素影响
    if (environment.weather === 'sunny') bonus += 0.1 // 晴天增加治疗
    if (environment.terrain === 'forest') bonus += 0.15 // 森林增加治疗

    return bonus
  }

  private applyHealingCap(heal: number, target: BattleParticipant): number {
    const currentHealth = target.getCurrentHealth()
    const maxHealth = target.getMaxHealth()
    const missingHealth = maxHealth - currentHealth

    // 治疗量不能超过缺失的生命值
    return Math.min(heal, missingHealth)
  }
}

/**
 * 增益效果计算器（简化实现）
 */
export class BuffCalculator implements Calculator {
  public calculate(context: CalculationContext): CalculationResult {
    // 简化实现
    return {
      value: 10, // 固定增益值
      isCritical: false,
      isDodged: false,
      modifiers: {},
      details: {
        baseValue: 10,
        attributeBonus: 0,
        skillBonus: 0,
        statusBonus: 0,
        environmentBonus: 0,
        finalMultiplier: 1,
      },
    }
  }

  public getSupportedTypes(): string[] {
    return ['buff']
  }
}

/**
 * 减益效果计算器（简化实现）
 */
export class DebuffCalculator implements Calculator {
  public calculate(context: CalculationContext): CalculationResult {
    // 简化实现
    return {
      value: -5, // 固定减益值
      isCritical: false,
      isDodged: false,
      modifiers: {},
      details: {
        baseValue: -5,
        attributeBonus: 0,
        skillBonus: 0,
        statusBonus: 0,
        environmentBonus: 0,
        finalMultiplier: 1,
      },
    }
  }

  public getSupportedTypes(): string[] {
    return ['debuff']
  }
}

/**
 * 全局计算系统实例
 */
export const calculationSystem = new CalculationSystem()
