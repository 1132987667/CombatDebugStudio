import type { ExtendedSkillStep } from '@/types/skill'
import type { CalculationLog } from '@/domain/skill/DamageCalculator'
import type { BattleEntity } from '@/types/battle'
import type { CombatRecord } from '@/types/combat-record'
import { ATTRIBUTE_CODE } from '@/types/attribute'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'

export class HealCalculator {
  calculationLogs: CalculationLog[] = []

  calculateHeal(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): number {
    this.calculationLogs = []
    let heal = 0

    if (skillStep.formula) {
      heal = this.evaluateFormula(skillStep.formula, source, target, skillStep)
    } else {
      heal = this.calculateBasicHeal(skillStep, source, target)
    }

    if ((skillStep as any).attributeCode && (skillStep as any).attackBonus && (skillStep as any).attackBonus > 0) {
      const attrValue = source.getAttribute((skillStep as any).attributeCode as ATTRIBUTE_CODE)
      const bonus = Math.floor(attrValue * (skillStep as any).attackBonus / 100)
      heal += bonus
      this.logCalculation('attribute_bonus', bonus, `属性加成: +${bonus}`)
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

  private calculateBasicHeal(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
  ): number {
    let heal = 0
    const baseValue = (skillStep as any).baseValue || 0
    const bonusValue = (skillStep as any).bonusValue || 0
    const attackBonus = (skillStep as any).attackBonus || 0
    const levelBonus = (skillStep as any).levelBonus || 0
    heal += baseValue
    heal += bonusValue
    if (attackBonus > 0) {
      const atk = source.getAttribute(ATTRIBUTE_CODE.attack)
      heal += Math.floor(atk * attackBonus / 100)
    }
    if (levelBonus > 0) {
      heal += (source.level || 1) * levelBonus
    }
    const targetMaxHp = target.getAttribute(ATTRIBUTE_CODE.maxHealth)
    if ((skillStep as any).maxHpPercent && (skillStep as any).maxHpPercent > 0) {
      heal += Math.floor(targetMaxHp * (skillStep as any).maxHpPercent / 100)
    }
    if ((skillStep as any).lostHpPercent && (skillStep as any).lostHpPercent > 0) {
      const currentHp = target.getAttribute(ATTRIBUTE_CODE.currentHealth)
      const lostHp = Math.max(0, targetMaxHp - currentHp)
      heal += Math.floor(lostHp * (skillStep as any).lostHpPercent / 100)
    }

    this.logCalculation('basic', heal, `基础治疗量: ${heal}`)
    return heal
  }

  applyHeal(target: BattleEntity, heal: number): number {
    const currentHp = target.getAttribute(ATTRIBUTE_CODE.currentHealth)
    const maxHp = target.getAttribute(ATTRIBUTE_CODE.maxHealth)
    const newHp = Math.min(maxHp, currentHp + heal)
    target.setAttribute(ATTRIBUTE_CODE.currentHealth, newHp)
    return newHp - currentHp
  }

  isSingleTurnEffect(skillStep: ExtendedSkillStep): boolean {
    return !skillStep.duration || skillStep.duration <= 1
  }

  private evaluateFormula(
    formula: string,
    source: BattleEntity,
    target: BattleEntity,
    step: ExtendedSkillStep,
  ): number {
    try {
      const atk = source.getAttribute(ATTRIBUTE_CODE.attack)
      const targetMaxHp = target.getAttribute(ATTRIBUTE_CODE.maxHealth)
      const sourceLevel = source.level || 1
      const targetLevel = target.level || 1
      const baseValue = (step as any).baseValue || 0
      const bonusValue = (step as any).bonusValue || 0
      const attackBonus = (step as any).attackBonus || 0
      const levelBonus = (step as any).levelBonus || 0
      const processedFormula = formula
        .replace(/ATK/gi, String(atk))
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

  private logCalculation(step: string, value: number, description: string): void {
    this.calculationLogs.push({ step, value, description } as any)
  }
}
