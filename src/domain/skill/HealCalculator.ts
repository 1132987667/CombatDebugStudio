import type { ExtendedSkillStep, LegacyStepFields } from '@/domain/skill/types'
import type { CalculationLog } from '@/shared/types/battle-log'
import type { BattleEntity } from '@/domain/battle/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { ATTRIBUTE_CODE, LEGACY_ATTR_MAP } from '@/domain/attribute/types'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'

export class HealCalculator {
  calculationLogs: CalculationLog[] = []

  /** 清空计算日志 */
  clearCalculationLogs(): void {
    this.calculationLogs = []
  }

  /** 获取计算日志 */
  getCalculationLogs(): CalculationLog[] {
    return [...this.calculationLogs]
  }

  calculateHeal(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): number {
    this.calculationLogs = []
    let heal = 0

    if (skillStep.calculation) {
      heal = skillStep.calculation.baseValue
      // extraValues 处理
      if (skillStep.calculation.extraValues) {
        for (const extra of skillStep.calculation.extraValues) {
          const attrValue = this.getAttrValue(source, extra.attribute)
          const extraValue = attrValue * extra.ratio
          heal += extraValue
          this.logCalculation('extra_value', extraValue, `${extra.attribute} 额外加成: +${extraValue}`)
        }
      }
    } else if (skillStep.formula) {
      heal = this.evaluateFormula(skillStep.formula, source, target, skillStep)
    } else {
      heal = this.calculateBasicHeal(skillStep, source, target)
    }

    // 属性加成   
    if (skillStep.attributeCode && skillStep.attackBonus && skillStep.attackBonus > 0) {
      const attrValue = source.getAttribute(skillStep.attributeCode as ATTRIBUTE_CODE)
      const bonus = Math.floor(attrValue * skillStep.attackBonus / 100)
      heal += bonus
      this.logCalculation('attribute_bonus', bonus, `属性加成: +${bonus}`)
    }

    // targetModifiers 处理
    if (skillStep.targetModifiers) {
      Object.entries(skillStep.targetModifiers).forEach(([attr, modifier]) => {
        const targetAttrValue = this.getAttrValue(target, attr)
        const modifierEffect = (modifier * targetAttrValue) / 100
        heal *= 1 + modifierEffect
        heal = Math.floor(heal)
        this.logCalculation('target_modifier', modifierEffect, `${attr} 目标修正: x${1 + modifierEffect}`)
      })
    }

    // 治疗上限: 不超过目标最大生命值
    const maxHp = target.getAttribute(ATTRIBUTE_CODE.maxHealth)
    const currentHp = target.getAttribute(ATTRIBUTE_CODE.currentHealth)
    const healCap = Math.max(0, maxHp - currentHp)
    if (heal > healCap) {
      this.logCalculation('heal_cap', healCap, `治疗上限限制: ${heal} �?${healCap}`)
      heal = healCap
    }

    // 负面状态影响（降低治疗效果�?   
    const debuffEffect = this.calculateDebuffEffect(target)
    if (debuffEffect > 0) {
      heal = Math.floor(heal * (1 - debuffEffect))
      this.logCalculation('debuff', debuffEffect, `减益效果: -${Math.round(debuffEffect * 100)}%`)
    }

    heal = Math.max(0, heal)

    if (record) {
      record.effects?.push({
        type: 'heal',
        targetId: target.id,
        value: heal,
        description: `治疗 ${heal}`,
      })
    }

    return heal
  }

  /**
   * 计算减益效果对治疗的影响
   */
  private calculateDebuffEffect(target: BattleEntity): number {
    // ponytail: 检查常见减治疗 debuff，可扩展
    const healingReductionBuffs = [
      'buff_heal_reduction',
      'buff_poison',
      'buff_curse',
    ]
    let debuffEffect = 0
    for (const buffId of healingReductionBuffs) {
      if (target.hasBuff(buffId)) {
        debuffEffect += 0.2 // 每个 debuff 降低 20%
      }
    }
    return Math.min(debuffEffect, 0.8) // 最多降�?80%
  }

  private calculateBasicHeal(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
  ): number {
    let heal = 0
    const ls = skillStep as LegacyStepFields
    const baseValue = ls.baseValue || 0
    const bonusValue = ls.bonusValue || 0
    const attackBonus = ls.attackBonus || 0
    const levelBonus = ls.levelBonus || 0
    heal += baseValue
    heal += bonusValue
    if (attackBonus > 0) {
      const atk = source.getRandomAttackDemage()
      heal += Math.floor(atk * attackBonus / 100)
    }
    if (levelBonus > 0) {
      heal += (source.level || 1) * levelBonus
    }
    const targetMaxHp = target.getAttribute(ATTRIBUTE_CODE.maxHealth)
    if (ls.maxHpPercent && ls.maxHpPercent > 0) {
      heal += Math.floor(targetMaxHp * ls.maxHpPercent / 100)
    }
    if (ls.lostHpPercent && ls.lostHpPercent > 0) {
      const currentHp = target.getAttribute(ATTRIBUTE_CODE.currentHealth)
      const lostHp = Math.max(0, targetMaxHp - currentHp)
      heal += Math.floor(lostHp * ls.lostHpPercent / 100)
    }

    this.logCalculation('basic', heal, `基础治疗�? ${heal}`)
    return heal
  }

  applyHeal(target: BattleEntity, heal: number): number {
    if (!target.isAlive()) {
      battleLogManager.addDebugLog('目标已死亡，无法进行治疗')
      return 0
    }
    if (target.isFullHealth()) {
      battleLogManager.addDebugLog('目标生命值已满，无需治疗')
      return 0
    }
    const actualHeal = target.heal(heal)
    return actualHeal
  }

  isSingleTurnEffect(skillStep: ExtendedSkillStep): boolean {
    // ponytail: 同时兼容新旧两种配置方式
    return skillStep.calculation?.isSingleTurn === true || !skillStep.duration || skillStep.duration <= 1
  }

  private evaluateFormula(
    formula: string,
    source: BattleEntity,
    target: BattleEntity,
    step: ExtendedSkillStep,
  ): number {
    try {
      const atk = source.getRandomAttackDemage()
      const targetMaxHp = target.getAttribute(ATTRIBUTE_CODE.maxHealth)
      const sourceLevel = source.level || 1
      const targetLevel = target.level || 1
      const ls2 = step as LegacyStepFields
      const baseValue = ls2.baseValue || 0
      const bonusValue = ls2.bonusValue || 0
      const attackBonus = ls2.attackBonus || 0
      const levelBonus = ls2.levelBonus || 0
      const processedFormula = formula
        .replace(/\battack\b/gi, String(atk))
        .replace(/TARGET_MAX_HP/gi, String(targetMaxHp))
        .replace(/SOURCE_LEVEL/gi, String(sourceLevel))
        .replace(/TARGET_LEVEL/gi, String(targetLevel))
        .replace(/BASE_VALUE/gi, String(baseValue))
        .replace(/BONUS_VALUE/gi, String(bonusValue))
        .replace(/ATTACK_BONUS/gi, String(attackBonus))
        .replace(/LEVEL_BONUS/gi, String(levelBonus))
      let result = 0
      try {
        result = Function(`"use strict"; return (${processedFormula})`)()
      } catch {
        result = baseValue + Math.floor(atk * 0.5)
      }
      return Math.max(1, Math.floor(result))
    } catch {
      return 10
    }
  }

  private getAttrValue(participant: BattleEntity, attr: string): number {
    try {
      const code = LEGACY_ATTR_MAP[attr] || (attr as ATTRIBUTE_CODE)
      return participant.getAttribute(code) || 0
    } catch {
      return 0
    }
  }

  private logCalculation(step: string, value: number, description: string): void {
    this.calculationLogs.push({ step, value, description } as any)
    // ponytail: CalculationLog interface needs timestamp/type/sourceId/targetId fields;
    // the internal log shape is simpler — left as any until proper type alignment
  }
}
