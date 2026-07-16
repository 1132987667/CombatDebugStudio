import type { ExtendedSkillStep } from '@/domain/skill/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { EffectTag } from '@/shared/types/effect'

interface HealCalculationStep {
  step: string
  value: number
  description: string
}

export class HealCalculator {
  calculationLogs: HealCalculationStep[] = []

  /** 清空计算日志 */
  clearCalculationLogs(): void {
    this.calculationLogs = []
  }

  /** 获取计算日志 */
  getCalculationLogs(): HealCalculationStep[] {
    return [...this.calculationLogs]
  }

  calculateHeal(
    skillStep: ExtendedSkillStep,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
    buffSystem?: BuffSystem,
  ): number {
    this.calculationLogs = []
    let heal = 0

    if (skillStep.calculation) {
      heal = skillStep.calculation.baseValue
      // extraValues 处理
      if (skillStep.calculation.extraValues) {
        for (const extra of skillStep.calculation.extraValues) {
          const attrValue = this.getAttrValue(source, extra.attribute as ATTRIBUTE_CODE)
          const extraValue = attrValue * extra.ratio
          heal += extraValue
          this.logCalculation('extra_value', extraValue, `${extra.attribute} 额外加成: +${extraValue}`)
        }
      }
    }

    // targetModifiers 处理
    if (skillStep.targetModifiers) {
      Object.entries(skillStep.targetModifiers).forEach(([attr, modifier]) => {
        const targetAttrValue = this.getAttrValue(target, attr as ATTRIBUTE_CODE)
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

    // 负面状态影响（降低治疗效果）   
    const debuffEffect = this.calculateDebuffEffect(target, buffSystem)
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
  /** 每个 debuff 的减治疗效果（20%） */
  private static readonly HEAL_REDUCTION_PER_DEBUFF = 0.2
  /** 最大减治疗效果上限（80%） */
  private static readonly MAX_HEAL_REDUCTION = 0.8

  private calculateDebuffEffect(target: BattleEntity, buffSystem?: BuffSystem): number {
    if (!buffSystem) return 0
    const reductionInstances = buffSystem.getBuffInstancesWithTag(target.id, EffectTag.HEAL_REDUCTION)
    const debuffEffect = reductionInstances.length * HealCalculator.HEAL_REDUCTION_PER_DEBUFF
    return Math.min(debuffEffect, HealCalculator.MAX_HEAL_REDUCTION)
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
    return skillStep.calculation?.isSingleTurn === true || !skillStep.duration || skillStep.duration <= 1
  }

  private getAttrValue(participant: BattleEntity, attr: ATTRIBUTE_CODE): number {
    try {
      return participant.getAttribute(attr) || 0
    } catch {
      return 0
    }
  }

  private logCalculation(step: string, value: number, description: string): void {
    this.calculationLogs.push({ step, value, description })
  }
}
