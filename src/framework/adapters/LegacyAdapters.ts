/**
 * 文件: LegacyAdapters.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 遗留系统适配器
 * 描述: 提供向后兼容的接口适配器，将现有系统迁移到新框架，确保现有测试用例继续工作，提供逐步迁移的路径
 * 版本: 1.0.0
 */

/**
 * 通用战斗框架 - 遗留系统适配器
 *
 * 功能：
 * 1. 提供向后兼容的接口适配器
 * 2. 将现有系统迁移到新框架
 * 3. 确保现有测试用例继续工作
 * 4. 提供逐步迁移的路径
 */

import type { ExtendedSkillStep } from '@/types/skill'
import type { BattleParticipant } from '@/types/battle'
import {
  calculationSystem,
  CalculationContext,
  CalculationResult,
} from '../systems/CalculationSystem'
import { FrameworkLogger } from '@/utils/logging'

/**
 * 计算日志接口（兼容原有格式）
 */
interface CalculationLog {
  timestamp: number
  stepType: 'DAMAGE' | 'HEAL'
  sourceId: string
  targetId: string
  baseValue: number
  extraValues: Array<{ attribute: string; value: number; ratio: number }>
  finalValue: number
  critical: boolean
  modifiers: Record<string, number>
}

/**
 * 遗留伤害计算器适配器
 * 保持与现有DamageCalculator相同的接口
 */
export class LegacyDamageCalculatorAdapter {
  private logger: Logger
  private calculationLogs: CalculationLog[] = []

  constructor() {
    this.logger = new Logger('LegacyDamageCalculatorAdapter')
  }

  /**
   * 计算伤害值（兼容现有接口）
   */
  public calculateDamage(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant,
  ): number {
    if (!step.calculation) {
      this.logger.warn('伤害步骤缺少计算配置')
      return 0
    }

    try {
      // 为了保持向后兼容性，暂时使用原有计算逻辑
      // 后续可以逐步迁移到新框架
      return this.calculateDamageLegacy(step, source, target)
    } catch (error) {
      this.logger.error('伤害计算出错:', { error: error.message })
      return 0
    }
  }

  /**
   * 应用伤害到目标（兼容现有接口）
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
   * 获取计算日志（兼容现有接口）
   */
  public getCalculationLogs(): CalculationLog[] {
    return [...this.calculationLogs]
  }

  /**
   * 清空计算日志（兼容现有接口）
   */
  public clearCalculationLogs(): void {
    this.calculationLogs = []
    this.logger.debug('计算日志已清空')
  }

  /**
   * 遗留伤害计算逻辑（保持与原有系统一致）
   */
  private calculateDamageLegacy(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant,
  ): number {
    // 1. 基础值
    let result = step.calculation!.baseValue
    const extraValues: Array<{
      attribute: string
      value: number
      ratio: number
    }> = []
    const modifiers: Record<string, number> = {}

    // 2. 额外值计算
    for (const extra of step.calculation!.extraValues) {
      const attributeValue = this.getAttributeValue(source, extra.attribute)
      const extraValue = attributeValue * extra.ratio
      result += extraValue
      extraValues.push({
        attribute: extra.attribute,
        value: attributeValue,
        ratio: extra.ratio,
      })
    }

    // 3. 攻击类型影响（防御效果）
    if (step.calculation!.attackType) {
      const defenseEffect = this.calculateDefenseEffect(
        step.calculation!.attackType,
        target,
      )
      result *= 1 - defenseEffect
      modifiers['defense'] = defenseEffect
    }

    // 4. 目标属性修正
    if (step.targetModifiers) {
      for (const [attr, modifier] of Object.entries(step.targetModifiers)) {
        const targetAttrValue = this.getAttributeValue(target, attr)
        const modifierEffect = (modifier * targetAttrValue) / 100
        result *= 1 + modifierEffect
        modifiers[attr] = modifierEffect
      }
    }

    // 5. 暴击判定
    let isCritical = false
    if (step.criticalConfig) {
      isCritical = Math.random() < step.criticalConfig.rate
      if (isCritical) {
        result *= step.criticalConfig.multiplier
        modifiers['critical'] = step.criticalConfig.multiplier
      }
    }

    // 确保非负整数
    const finalValue = Math.max(0, Math.floor(result))

    // 记录计算日志
    this.recordLegacyCalculationLog(step, source, target, {
      value: finalValue,
      isCritical: isCritical,
      details: {
        baseValue: step.calculation!.baseValue,
      },
      modifiers: modifiers,
    } as CalculationResult)

    return finalValue
  }

  /**
   * 计算防御效果（原有逻辑）
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
   * 获取属性值（原有逻辑）
   */
  private getAttributeValue(
    participant: BattleParticipant,
    attribute: string,
  ): number {
    try {
      // 检查participant是否有getAttribute方法
      if (participant && typeof participant.getAttribute === 'function') {
        return participant.getAttribute(attribute) || 0
      }

      // 如果getAttribute不存在，尝试使用getAttributeValue
      if (participant && typeof participant.getAttributeValue === 'function') {
        return participant.getAttributeValue(attribute) || 0
      }

      // 如果都没有，返回默认值
      this.logger.warn(`无法获取属性值: ${attribute}，参与者缺少必要的方法`)
      return 0
    } catch (error) {
      this.logger.warn(`获取属性值失败: ${attribute}`, { error: error.message })
      return 0
    }
  }

  /**
   * 将遗留参与者转换为框架参与者
   */
  private convertToFrameworkParticipant(
    legacyParticipant: BattleParticipant,
  ): any {
    // 简化转换，实际项目中需要更完整的映射
    return {
      id: legacyParticipant.id,
      name: legacyParticipant.name,
      getCurrentHealth: () => legacyParticipant.currentHealth,
      getMaxHealth: () => legacyParticipant.maxHealth,
      attributes: {
        attack: legacyParticipant.getAttribute?.('ATK') || 10,
        defense: legacyParticipant.getAttribute?.('DEF') || 5,
        magicPower: legacyParticipant.getAttribute?.('MAGIC') || 8,
        criticalChance: 0.05,
        dodgeChance: 0.05,
      },
      statusEffects: [],
    }
  }

  /**
   * 从技能步骤中提取修饰符
   */
  private extractModifiersFromStep(step: ExtendedSkillStep): any {
    const modifiers: any = {}

    if (step.criticalConfig) {
      modifiers.criticalRate = step.criticalConfig.rate
      modifiers.criticalMultiplier = step.criticalConfig.multiplier
    }

    // 处理目标属性修正
    if (step.targetModifiers) {
      for (const [attr, modifier] of Object.entries(step.targetModifiers)) {
        modifiers[`target_${attr.toLowerCase()}`] = modifier
      }
    }

    return modifiers
  }

  /**
   * 记录遗留格式的计算日志
   */
  private recordLegacyCalculationLog(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant,
    result: CalculationResult,
  ): void {
    const log: CalculationLog = {
      timestamp: Date.now(),
      stepType: step.type === 'DAMAGE' ? 'DAMAGE' : 'HEAL',
      sourceId: source.id,
      targetId: target.id,
      baseValue: step.calculation!.baseValue,
      extraValues: [], // 简化处理
      finalValue: result.value,
      critical: result.isCritical,
      modifiers: result.modifiers,
    }

    this.calculationLogs.push(log)
    this.logger.debug('计算完成:', log)
  }
}

/**
 * 遗留治疗计算器适配器
 * 保持与现有HealCalculator相同的接口
 */
export class LegacyHealCalculatorAdapter {
  private logger: Logger
  private calculationLogs: CalculationLog[] = []

  constructor() {
    this.logger = new Logger('LegacyHealCalculatorAdapter')
  }

  /**
   * 计算治疗值（兼容现有接口）
   */
  public calculateHeal(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant,
  ): number {
    if (!step.calculation) {
      this.logger.warn('治疗步骤缺少计算配置')
      return 0
    }

    try {
      // 为了保持向后兼容性，暂时使用原有计算逻辑
      // 后续可以逐步迁移到新框架
      return this.calculateHealLegacy(step, source, target)
    } catch (error) {
      this.logger.error('治疗计算出错:', { error: error.message })
      return 0
    }
  }

  /**
   * 检查是否为单回合效果（兼容现有接口）
   */
  public isSingleTurnEffect(step: ExtendedSkillStep): boolean {
    return step.calculation?.isSingleTurn || false
  }

  /**
   * 获取计算日志（兼容现有接口）
   */
  public getCalculationLogs(): CalculationLog[] {
    return [...this.calculationLogs]
  }

  /**
   * 清空计算日志（兼容现有接口）
   */
  public clearCalculationLogs(): void {
    this.calculationLogs = []
    this.logger.debug('计算日志已清空')
  }

  /**
   * 遗留治疗计算逻辑（保持与原有系统一致）
   */
  private calculateHealLegacy(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant,
  ): number {
    // 1. 基础值
    let result = step.calculation!.baseValue
    const extraValues: Array<{
      attribute: string
      value: number
      ratio: number
    }> = []

    // 2. 额外值计算
    for (const extra of step.calculation!.extraValues) {
      const attributeValue = this.getAttributeValue(source, extra.attribute)
      const extraValue = attributeValue * extra.ratio
      result += extraValue
      extraValues.push({
        attribute: extra.attribute,
        value: attributeValue,
        ratio: extra.ratio,
      })
    }

    // 3. 处理负面状态对治疗的影响
    if (
      target.buffs &&
      target.buffs.some((buff) => buff.includes('debuff_reduce_heal'))
    ) {
      result *= 0.8 // 减少20%治疗效果
    }

    // 4. 应用治疗上限
    result = this.applyHealingCap(result, target)

    // 确保非负整数
    const finalValue = Math.max(0, Math.floor(result))

    // 记录计算日志
    this.recordLegacyCalculationLog(step, source, target, {
      value: finalValue,
      isCritical: false,
      details: {
        baseValue: step.calculation!.baseValue,
      },
      modifiers: {},
    } as CalculationResult)

    return finalValue
  }

  /**
   * 应用治疗上限
   */
  private applyHealingCap(heal: number, target: BattleParticipant): number {
    const currentHealth = target.currentHealth
    const maxHealth = target.maxHealth
    const missingHealth = maxHealth - currentHealth

    // 治疗量不能超过缺失的生命值
    return Math.min(heal, missingHealth)
  }

  /**
   * 将遗留参与者转换为框架参与者
   */
  private convertToFrameworkParticipant(
    legacyParticipant: BattleParticipant,
  ): any {
    // 简化转换，实际项目中需要更完整的映射
    return {
      id: legacyParticipant.id,
      name: legacyParticipant.name,
      getCurrentHealth: () => legacyParticipant.currentHealth,
      getMaxHealth: () => legacyParticipant.maxHealth,
      attributes: {
        magicPower: legacyParticipant.getAttribute?.('MAGIC') || 8,
        wisdom: legacyParticipant.getAttribute?.('WISDOM') || 6,
      },
      statusEffects: [],
    }
  }

  /**
   * 记录遗留格式的计算日志
   */
  private recordLegacyCalculationLog(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant,
    result: CalculationResult,
  ): void {
    const log: CalculationLog = {
      timestamp: Date.now(),
      stepType: 'HEAL',
      sourceId: source.id,
      targetId: target.id,
      baseValue: result.details.baseValue,
      extraValues: [], // 简化处理
      finalValue: result.value,
      critical: false, // 治疗没有暴击
      modifiers: {},
    }

    this.calculationLogs.push(log)
    this.logger.debug('治疗计算完成:', log)
  }
}

/**
 * 遗留战斗管理器适配器
 * 保持与现有BattleManager相同的接口
 */
export class LegacyBattleManagerAdapter {
  private logger: Logger

  constructor() {
    this.logger = new Logger('LegacyBattleManagerAdapter')
  }

  /**
   * 创建战斗（兼容现有接口）
   */
  public createBattle(participantsInfo: any[]): any {
    this.logger.info('创建战斗（通过适配器）', {
      participantCount: participantsInfo.length,
    })

    // 简化实现，实际项目中需要完整的映射
    return {
      battleId: `battle_${Date.now()}`,
      participants: new Map(participantsInfo.map((p) => [p.id, p])),
      actions: [],
      turnOrder: participantsInfo.map((p) => p.id),
      currentTurn: 0,
      isActive: true,
      startTime: Date.now(),
    }
  }

  /**
   * 处理回合（兼容现有接口）
   */
  public async processTurn(battleId: string): Promise<void> {
    this.logger.debug('处理回合', { battleId })
    // 简化实现
  }

  /**
   * 执行动作（兼容现有接口）
   */
  public async executeAction(action: any): Promise<any> {
    this.logger.debug('执行动作', { actionId: action.id })
    // 简化实现
    return action
  }

  /**
   * 获取战斗状态（兼容现有接口）
   */
  public getBattleState(battleId: string): any {
    this.logger.debug('获取战斗状态', { battleId })
    // 简化实现
    return null
  }

  /**
   * 结束战斗（兼容现有接口）
   */
  public endBattle(battleId: string, winner: string): void {
    this.logger.info('结束战斗', { battleId, winner })
  }
}

/**
 * 全局适配器实例（用于逐步迁移）
 */
export const legacyAdapters = {
  DamageCalculator: new LegacyDamageCalculatorAdapter(),
  HealCalculator: new LegacyHealCalculatorAdapter(),
  BattleManager: new LegacyBattleManagerAdapter(),
}

/**
 * 导出兼容的类名（用于无缝替换）
 */
export const DamageCalculator = LegacyDamageCalculatorAdapter
export const HealCalculator = LegacyHealCalculatorAdapter
export const BattleManager = LegacyBattleManagerAdapter
