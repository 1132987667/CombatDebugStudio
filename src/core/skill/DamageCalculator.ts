/**
 * 文件: DamageCalculator.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 伤害计算器
 * 描述: 负责实现复杂的伤害计算逻辑，包括暴击、防御、属性加成等机制
 * 版本: 1.0.0
 */

import type { ExtendedSkillStep, CalculationLog } from '@/types/skill'
import type { BattleParticipant } from '@/types/battle'
import { battleLogManager } from '@/utils/logging'

/**
 * 伤害计算配置接口
 */
export interface DamageCalculationConfig {
  /** 是否启用暴击系统 */
  criticalEnabled: boolean
  /** 默认暴击率 */
  defaultCriticalRate: number
  /** 默认暴击倍率 */
  defaultCriticalMultiplier: number
  /** 是否启用防御系统 */
  defenseEnabled: boolean
  /** 伤害最小化阈值 */
  minDamageThreshold: number
  /** 伤害最大化阈值 */
  maxDamageThreshold: number
}

/**
 * 伤害修饰器接口
 */
export interface DamageModifier {
  /** 修饰器名称 */
  name: string
  /** 应用修饰器 */
  apply(
    source: BattleParticipant,
    target: BattleParticipant,
    baseDamage: number,
  ): number
  /** 修饰器优先级 */
  priority: number
}

/**
 * 伤害计算结果接口
 */
export interface DamageCalculationResult {
  /** 最终伤害值 */
  damage: number
  /** 是否闪避 */
  isMiss: boolean
  /** 是否暴击 */
  isCritical: boolean
}

/**
 * 伤害计算器类
 * 负责实现复杂的伤害计算逻辑
 */
export class DamageCalculator {
  private logger = battleLogManager
  private calculationLogs: CalculationLog[] = []
  private modifiers: DamageModifier[] = []
  private config: DamageCalculationConfig = {
    criticalEnabled: true,
    defaultCriticalRate: 0.05,
    defaultCriticalMultiplier: 1.5,
    defenseEnabled: true,
    minDamageThreshold: 1,
    maxDamageThreshold: 9999,
  }

  /**
   * 设置伤害计算配置
   */
  public setConfig(config: Partial<DamageCalculationConfig>): void {
    this.config = { ...this.config, ...config }
    this.logger.info('伤害计算配置已更新', this.config)
  }

  /**
   * 获取当前配置
   */
  public getConfig(): DamageCalculationConfig {
    return { ...this.config }
  }

  /**
   * 添加伤害修饰器
   */
  public addModifier(modifier: DamageModifier): void {
    this.modifiers.push(modifier)
    // 按优先级排序
    this.modifiers.sort((a, b) => b.priority - a.priority)
    this.logger.debug(
      `添加伤害修饰器: ${modifier.name}, 优先级: ${modifier.priority}`,
    )
  }

  /**
   * 移除伤害修饰器
   */
  public removeModifier(modifierName: string): void {
    this.modifiers = this.modifiers.filter((m) => m.name !== modifierName)
    this.logger.debug(`移除伤害修饰器: ${modifierName}`)
  }

  /**
   * 解析公式字符串
   * @param formula 公式字符串，如 "attack*0.8"
   * @param source 施放者
   * @param target 目标
   * @returns 计算结果
   */
  private parseFormula(formula: string, source: BattleParticipant, target: BattleParticipant): number {
    try {
      // 简单的公式解析和计算
      // 支持的变量：attack, defense, speed, maxHealth, currentHealth, level
      const variables: Record<string, number> = {
        attack: this.getAttributeValue(source, 'ATK') || 0,
        defense: this.getAttributeValue(target, 'DEF') || 0,
        speed: this.getAttributeValue(source, 'speed') || 0,
        maxHealth: this.getAttributeValue(target, 'MAX_HP') || 0,
        currentHealth: this.getAttributeValue(target, 'HP') || 0,
        level: source.level || 1,
        damage: 0, // 用于后续计算，初始为0
      }

      // 替换变量为实际值
      let expression = formula
      for (const [varName, value] of Object.entries(variables)) {
        expression = expression.replace(new RegExp(varName, 'g'), value.toString())
      }

      // 计算表达式
      // 使用 Function 构造函数来安全地执行表达式
      const calculate = new Function('return ' + expression)
      const result = calculate()

      return typeof result === 'number' ? result : 0
    } catch (error) {
      this.logger.error('公式解析出错:', error)
      return 0
    }
  }

  /**
   * 计算最终伤害值
   */
  public calculateDamage(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant,
  ): DamageCalculationResult {
    try {
      // 1. 闪避判定
      const dodgeRate = this.getAttributeValue(target, 'dodgeRate') || 0
      const isMiss = Math.random() < dodgeRate
      
      if (isMiss) {
        // 记录闪避日志
        this.recordCalculationLog({
          timestamp: Date.now(),
          stepType: 'DAMAGE',
          sourceId: source.id,
          targetId: target.id,
          baseValue: 0,
          extraValues: [],
          finalValue: 0,
          critical: false,
          modifiers: { miss: 1 },
        })
        
        return { damage: 0, isMiss: true, isCritical: false }
      }

      // 2. 计算基础伤害
      let result = 0
      const extraValues: Array<{
        attribute: string
        value: number
        ratio: number
      }> = []
      const modifiers: Record<string, number> = {}

      if (step.calculation) {
        // 使用 calculation 对象
        result = step.calculation.baseValue

        // 3. 额外值计算
        step.calculation.extraValues.forEach((extra) => {
          const attributeValue = this.getAttributeValue(source, extra.attribute)
          const extraValue = attributeValue * extra.ratio
          result += extraValue
          extraValues.push({
            attribute: extra.attribute,
            value: attributeValue,
            ratio: extra.ratio,
          })
        })

        // 4. 攻击类型影响（防御效果）
        if (step.calculation.attackType && this.config.defenseEnabled) {
          const defenseEffect = this.calculateDefenseEffect(
            step.calculation.attackType,
            target,
          )
          result *= 1 - defenseEffect
          modifiers['defense'] = defenseEffect
        }
      } else if (step.formula) {
        // 使用 formula 字符串
        result = this.parseFormula(step.formula, source, target)
        modifiers['formula'] = 1
      } else {
        this.logger.warn('伤害步骤缺少计算配置和公式')
        return { damage: 0, isMiss: false, isCritical: false }
      }

      // 5. 目标属性修正
      if (step.targetModifiers) {
        Object.entries(step.targetModifiers).forEach(([attr, modifier]) => {
          const targetAttrValue = this.getAttributeValue(target, attr)
          const modifierEffect = (modifier * targetAttrValue) / 100
          result *= 1 + modifierEffect
          modifiers[attr] = modifierEffect
        })
      }

      // 6. 暴击判定
      let isCritical = false
      let criticalMultiplier = 1

      if (this.config.criticalEnabled) {
        if (step.criticalConfig) {
          isCritical = Math.random() < step.criticalConfig.rate
          criticalMultiplier = isCritical ? step.criticalConfig.multiplier : 1
        } else {
          // 使用默认暴击配置
          isCritical = Math.random() < this.config.defaultCriticalRate
          criticalMultiplier = isCritical
            ? this.config.defaultCriticalMultiplier
            : 1
        }

        if (isCritical) {
          result *= criticalMultiplier
          modifiers['critical'] = criticalMultiplier
        }
      }

      // 7. 应用伤害修饰器
      let finalResult = result
      for (const modifier of this.modifiers) {
        const originalValue = finalResult
        finalResult = modifier.apply(source, target, finalResult)
        modifiers[modifier.name] = finalResult / originalValue
      }

      // 8. 应用伤害阈值限制
      finalResult = Math.max(
        this.config.minDamageThreshold,
        Math.min(this.config.maxDamageThreshold, finalResult),
      )

      // 确保非负整数
      const finalValue = Math.max(0, Math.floor(finalResult))

      // 记录计算日志
      this.recordCalculationLog({
        timestamp: Date.now(),
        stepType: 'DAMAGE',
        sourceId: source.id,
        targetId: target.id,
        baseValue: step.calculation?.baseValue || 0,
        extraValues,
        finalValue,
        critical: isCritical,
        modifiers,
      })

      return { damage: finalValue, isMiss: false, isCritical }
    } catch (error) {
      this.logger.error('伤害计算出错:', error)
      return { damage: 0, isMiss: false, isCritical: false }
    }
  }

  /**
   * 计算防御效果
   */
  private calculateDefenseEffect(
    attackType: 'normal' | 'magic' | 'physical' | 'true',
    target: BattleParticipant,
  ): number {
    switch (attackType) {
      case 'true':
        return 0 // 真实伤害无视防御
      case 'physical':
        return this.getAttributeValue(target, 'DEF') * 0.01 // 物理防御
      case 'magic':
        return this.getAttributeValue(target, 'MDEF') * 0.01 // 魔法防御
      case 'normal':
      default:
        return (
          (this.getAttributeValue(target, 'DEF') +
            this.getAttributeValue(target, 'MDEF')) *
          0.005
        ) // 综合防御
    }
  }

  /**
   * 获取属性值
   */
  private getAttributeValue(
    participant: BattleParticipant,
    attribute: string,
  ): number {
    try {
      return participant.getAttribute(attribute) || 0
    } catch (error) {
      this.logger.warn(`获取属性值失败: ${attribute}`, error)
      return 0
    }
  }

  /**
   * 记录计算日志
   */
  private recordCalculationLog(log: CalculationLog): void {
    this.calculationLogs.push(log)
    this.logger.debug('伤害计算完成:', log)
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
  }

  /**
   * 应用伤害到目标
   */
  public applyDamage(target: BattleParticipant, damage: number): number {
    if (!target.isAlive()) {
      this.logger.warn('目标已死亡，无法造成伤害')
      return 0
    }

    const actualDamage = target.takeDamage(damage)
    this.logger.info(`应用伤害: ${target.name} 受到 ${actualDamage} 伤害`)
    return actualDamage
  }

  /**
   * 创建内置伤害修饰器
   */
  public static createBuiltinModifiers(): DamageModifier[] {
    return [
      {
        name: 'elemental_advantage',
        priority: 100,
        apply: (source, target, damage) => {
          // 简单的元素优势计算（示例）
          const sourceElement = source.getAttribute('element') || 0
          const targetElement = target.getAttribute('element') || 0
          const advantage = sourceElement - targetElement
          return damage * (1 + advantage * 0.1)
        },
      },
      {
        name: 'level_difference',
        priority: 50,
        apply: (source, target, damage) => {
          // 等级差异修正
          const levelDiff = source.level - target.level
          return damage * (1 + levelDiff * 0.02)
        },
      },
      {
        name: 'random_variance',
        priority: 10,
        apply: (source, target, damage) => {
          // 随机波动（±10%）
          const variance = 0.9 + Math.random() * 0.2
          return damage * variance
        },
      },
    ]
  }

  /**
   * 初始化内置修饰器
   */
  public initializeBuiltinModifiers(): void {
    const builtinModifiers = DamageCalculator.createBuiltinModifiers()
    builtinModifiers.forEach((modifier) => this.addModifier(modifier))
    this.logger.info('内置伤害修饰器初始化完成')
  }
}
