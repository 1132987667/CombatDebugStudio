/**
 * 文件: HealCalculator.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 治疗计算器
 * 描述: 负责实现复杂的治疗计算逻辑，包括基础值、额外值、属性加成等机制
 * 版本: 1.0.0
 */

import type { ExtendedSkillStep, CalculationLog } from '@/types/skill'
import type { BattleEntity } from '@/types/battle'
import type { CombatRecord } from '@/types/combat-record'
import { ATTRIBUTE_CODE } from '@/types/attribute'
import { battleLogManager, LogLevel } from '@/utils/logging'

/**
 * 治疗计算器类
 * 负责实现复杂的治疗计算逻辑
 */
export class HealCalculator {
  private calculationLogs: CalculationLog[] = []

  /**
   * 解析公式字符串
   * @param formula 公式字符串，如 "attack*0.5"
   * @param source 施放者
   * @param target 目标
   * @returns 计算结果
   */
  private parseFormula(
    formula: string,
    source: BattleEntity,
    target: BattleEntity,
  ): number {
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
        expression = expression.replace(
          new RegExp(varName, 'g'),
          value.toString(),
        )
      }

      // 计算表达式
      // 使用 Function 构造函数来安全地执行表达式
      const calculate = new Function('return ' + expression)
      const result = calculate()

      return typeof result === 'number' ? result : 0
    } catch (error) {
      battleLogManager.addDebugLog(
        '公式解析出错:',
        LogLevel.ERROR,
        null,
        '',
        error,
      )
      return 0
    }
  }

  /**
   * 计算最终治疗值
   */
  public calculateHeal(
    step: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): number {
    const intermediateSteps: Array<{
      type: 'damage' | 'heal'
      description: string
      input?: Record<string, any>
      output: number
      formula?: string
    }> = []
    try {
      // 1. 计算基础治疗值
      let result = 0
      const extraValues: Array<{
        attribute: string
        value: number
        ratio: number
      }> = []
      const modifiers: Record<string, number> = {}

      if (step.calculation) {
        result = step.calculation.baseValue

        battleLogManager.addDebugLog(`治疗计算开始: 基础值=${result}`)

        intermediateSteps.push({
          type: 'heal',
          description: '基础治疗',
          output: result,
        })

        // 2. 额外值计算
        step.calculation.extraValues.forEach((extra) => {
          const attributeValue = this.getAttributeValue(source, extra.attribute)
          const extraValue = attributeValue * extra.ratio
          result += extraValue
          extraValues.push({
            attribute: extra.attribute,
            value: attributeValue,
            ratio: extra.ratio,
          })
          battleLogManager.addDebugLog(
            `额外值计算: ${extra.attribute}=${attributeValue} * ${extra.ratio} = ${extraValue}, 当前结果=${result}`,
          )
          intermediateSteps.push({
            type: 'heal',
            description: `${extra.attribute} 加成`,
            input: { attributeValue, ratio: extra.ratio },
            output: result,
          })
        })
      } else if (step.formula) {
        result = this.parseFormula(step.formula, source, target)
        modifiers['formula'] = 1
        battleLogManager.addDebugLog(`治疗计算开始: 公式计算结果=${result}`)
        intermediateSteps.push({
          type: 'heal',
          description: '公式计算',
          formula: step.formula,
          output: result,
        })
      } else {
        battleLogManager.addDebugLog('治疗步骤缺少计算配置和公式')
        return 0
      }

      // 3. 目标属性修正
      if (
        step.targetModifiers &&
        Object.keys(step.targetModifiers).length > 0
      ) {
        Object.entries(step.targetModifiers).forEach(([attr, modifier]) => {
          const targetAttrValue = this.getAttributeValue(target, attr)
          const modifierEffect = (modifier * targetAttrValue) / 100
          result *= 1 + modifierEffect
          modifiers[attr] = modifierEffect
          battleLogManager.addDebugLog(
            `目标属性修正: ${attr}=${targetAttrValue} * ${modifier}/100 = ${modifierEffect}, 当前结果=${result}`,
          )
        })
      } else {
        battleLogManager.addDebugLog(`无目标属性修正, 当前结果=${result}`)
      }

      // 4. 治疗上限检查
      const maxHeal = target.maxHealth - target.currentHealth
      if (result > maxHeal) {
        modifiers['heal_cap'] = maxHeal / result
        result = maxHeal
        battleLogManager.addDebugLog(
          `治疗上限检查: 最大治疗=${maxHeal}, 当前结果=${result}`,
        )
      } else {
        battleLogManager.addDebugLog(
          `治疗上限检查: 当前结果=${result} <= 最大治疗=${maxHeal}`,
        )
      }

      // 5. 负面状态影响
      const debuffEffect = this.calculateDebuffEffect(target)
      if (debuffEffect > 0) {
        result *= 1 - debuffEffect
        modifiers['debuff'] = debuffEffect
        battleLogManager.addDebugLog(
          `负面状态影响: debuffEffect=${debuffEffect}, 当前结果=${result}`,
        )
      } else {
        battleLogManager.addDebugLog(`无负面状态影响, 当前结果=${result}`)
      }

      // 确保非负整数
      const finalValue = Math.max(0, Math.floor(result))
      battleLogManager.addDebugLog(`最终治疗值: ${finalValue}`)

      // 记录计算日志
      this.recordCalculationLog({
        timestamp: Date.now(),
        stepType: 'HEAL',
        sourceId: source.id,
        targetId: target.id,
        baseValue: step.calculation?.baseValue || 0,
        extraValues,
        finalValue,
        critical: false, // 治疗无暴击
        modifiers,
      })

      if (record) {
        record.effects.push({
          type: 'heal',
          targetId: target.id,
          value: finalValue,
          description: `恢复 ${finalValue} 点生命值`,
        })
        record.heal += finalValue

        if (record.hasDetail) {
          this.initializeRecordDetail(record)
          record.detail!.steps.push(...intermediateSteps)
          record.detail!.critical = false
          record.detail!.miss = false
          record.detail!.modifiers = { ...modifiers }
          record.detail!.finalValue = finalValue
        }
      }

      return finalValue
    } catch (error) {
      battleLogManager.addDebugLog(
        '治疗计算出错:',
        LogLevel.ERROR,
        null,
        '',
        error,
      )
      return 0
    }
  }

  /**
   * 计算负面状态影响
   */
  private calculateDebuffEffect(target: BattleEntity): number {
    // 检查目标是否有降低治疗效果的debuff
    const healingReductionBuffs = [
      'buff_heal_reduction',
      'buff_poison',
      'buff_curse',
    ]
    let debuffEffect = 0

    healingReductionBuffs.forEach((buffId) => {
      if (target.hasBuff(buffId)) {
        debuffEffect += 0.2 // 每个debuff降低20%治疗效果
      }
    })

    return Math.min(debuffEffect, 0.8) // 最多降低80%治疗效果
  }

  /**
   * 旧版大写属性码到 ATTRIBUTE_CODE 的映射
   */
  private static readonly LEGACY_ATTR_MAP: Record<string, ATTRIBUTE_CODE> = {
    ATK: ATTRIBUTE_CODE.attack,
    DEF: ATTRIBUTE_CODE.defense,
    SPD: ATTRIBUTE_CODE.speed,
    HP: ATTRIBUTE_CODE.currentHealth,
    MAX_HP: ATTRIBUTE_CODE.maxHealth,
    ENERGY: ATTRIBUTE_CODE.energy,
    MAX_ENERGY: ATTRIBUTE_CODE.maxEnergy,
    CRIT_RATE: ATTRIBUTE_CODE.critRate,
    CRIT_DMG: ATTRIBUTE_CODE.critDamage,
    DMG_RED: ATTRIBUTE_CODE.damageReduction,
    MDEF: ATTRIBUTE_CODE.defense,
    HP_BONUS: ATTRIBUTE_CODE.healthBonus,
    ATK_BONUS: ATTRIBUTE_CODE.attackBonus,
    DEF_BONUS: ATTRIBUTE_CODE.defenseBonus,
    SPD_BONUS: ATTRIBUTE_CODE.speedBonus,
  }

  /**
   * 获取属性值
   * 支持新旧两种属性码格式：'ATK'/'attack'/'maxHealth'/'MAX_HP' 等
   */
  private getAttributeValue(
    participant: BattleEntity,
    attribute: string,
  ): number {
    try {
      const mappedCode = HealCalculator.LEGACY_ATTR_MAP[attribute]
      const resolvedAttr = mappedCode || attribute
      return participant.getAttribute(resolvedAttr) || 0
    } catch (error) {
      battleLogManager.addDebugLog(`获取属性值失败: ${attribute}`, error)
      return 0
    }
  }

  /**
   * 记录计算日志
   */
  private recordCalculationLog(log: CalculationLog): void {
    this.calculationLogs.push(log)
    battleLogManager.addDebugLog('治疗计算完成:', log)
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
   * 应用治疗到目标
   */
  public applyHeal(target: BattleEntity, heal: number): number {
    if (!target.isAlive()) {
      battleLogManager.addDebugLog('目标已死亡，无法进行治疗')
      return 0
    }

    if (target.isFullHealth()) {
      battleLogManager.addDebugLog('目标生命值已满，无需治疗')
      return 0
    }

    const actualHeal = target.heal(heal)
    battleLogManager.addDebugLog(
      `应用治疗: ${target.name} 恢复 ${actualHeal} 生命值`,
    )
    return actualHeal
  }

  /**
   * 初始化记录详情对象
   */
  private initializeRecordDetail(record: CombatRecord): void {
    if (!record.detail) {
      record.detail = {
        steps: [],
        finalValue: 0,
        critical: false,
        miss: false,
        modifiers: {},
      }
    }
  }

  /**
   * 检查是否为单回合效果
   */
  public isSingleTurnEffect(step: ExtendedSkillStep): boolean {
    return step.calculation?.isSingleTurn === true
  }
}
