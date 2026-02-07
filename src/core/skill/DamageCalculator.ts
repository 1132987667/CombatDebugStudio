import type { ExtendedSkillStep, CalculationLog } from '@/types/skill'
import type { BattleParticipant } from '@/types/battle'
import { logger } from '@/utils/logging'

/**
 * 伤害计算器类
 * 负责实现复杂的伤害计算逻辑
 */
export class DamageCalculator {
  private logger = logger
  private calculationLogs: CalculationLog[] = []

  /**
   * 计算最终伤害值
   */
  public calculateDamage(
    step: ExtendedSkillStep,
    source: BattleParticipant,
    target: BattleParticipant
  ): number {
    if (!step.calculation) {
      this.logger.warn('伤害步骤缺少计算配置')
      return 0
    }

    try {
      // 1. 基础值
      let result = step.calculation.baseValue
      const extraValues: Array<{ attribute: string; value: number; ratio: number }> = []
      const modifiers: Record<string, number> = {}

      // 2. 额外值计算
      step.calculation.extraValues.forEach(extra => {
        const attributeValue = this.getAttributeValue(source, extra.attribute)
        const extraValue = attributeValue * extra.ratio
        result += extraValue
        extraValues.push({
          attribute: extra.attribute,
          value: attributeValue,
          ratio: extra.ratio
        })
      })

      // 3. 攻击类型影响（防御效果）
      if (step.calculation.attackType) {
        const defenseEffect = this.calculateDefenseEffect(step.calculation.attackType, target)
        result *= (1 - defenseEffect)
        modifiers['defense'] = defenseEffect
      }

      // 4. 目标属性修正
      if (step.targetModifiers) {
        Object.entries(step.targetModifiers).forEach(([attr, modifier]) => {
          const targetAttrValue = this.getAttributeValue(target, attr)
          const modifierEffect = modifier * targetAttrValue / 100
          result *= (1 + modifierEffect)
          modifiers[attr] = modifierEffect
        })
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
      this.recordCalculationLog({
        timestamp: Date.now(),
        stepType: 'DAMAGE',
        sourceId: source.id,
        targetId: target.id,
        baseValue: step.calculation.baseValue,
        extraValues,
        finalValue,
        critical: isCritical,
        modifiers
      })

      return finalValue
    } catch (error) {
      this.logger.error('伤害计算出错:', error)
      return 0
    }
  }

  /**
   * 计算防御效果
   */
  private calculateDefenseEffect(
    attackType: 'normal' | 'magic' | 'physical' | 'true',
    target: BattleParticipant
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
        return (this.getAttributeValue(target, 'DEF') + this.getAttributeValue(target, 'MDEF')) * 0.005 // 综合防御
    }
  }

  /**
   * 获取属性值
   */
  private getAttributeValue(participant: BattleParticipant, attribute: string): number {
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
}