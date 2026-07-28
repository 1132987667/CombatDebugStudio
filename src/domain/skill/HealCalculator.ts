import type { ExtendedSkillStep } from '@/domain/skill/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { StepExecutionContext } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { LogLevel } from '@/shared/types/battle-log'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { EffectTag } from '@/shared/types/effect'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

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
    context?: StepExecutionContext,
    buffSystem?: BuffSystem,
  ): { heal: number; overflow: number } {
    this.calculationLogs = []
    let heal = 0

    if (skillStep.calculation) {
      heal = skillStep.calculation.baseValue
      // extraValues 处理
      if (skillStep.calculation.extraValues) {
        for (const extra of skillStep.calculation.extraValues) {
          let extraValue: number
          if (
            extra.attribute === 'damageDealt' ||
            extra.attribute === 'damageTaken'
          ) {
            extraValue = (context?.damage ?? 0) * extra.ratio
          } else {
            extraValue =
              this.getAttrValue(source, extra.attribute as ATTRIBUTE_CODE) *
              extra.ratio
          }
          heal += extraValue
          this.logCalculation(
            'extra_value',
            extraValue,
            `${extra.attribute} 额外加成: +${extraValue}`,
          )
        }
      }
    }

    // targetModifiers 处理
    if (skillStep.targetModifiers) {
      Object.entries(skillStep.targetModifiers).forEach(([attr, modifier]) => {
        const targetAttrValue = this.getAttrValue(
          target,
          attr as ATTRIBUTE_CODE,
        )
        const modifierEffect = (modifier * targetAttrValue) / 100
        heal *= 1 + modifierEffect
        heal = Math.floor(heal)
        this.logCalculation(
          'target_modifier',
          modifierEffect,
          `${attr} 目标修正: x${1 + modifierEffect}`,
        )
      })
    }

    // 治疗上限: 不超过目标最大气血值
    const maxHp = target.getAttribute(ATTRIBUTE_CODE.maxHealth)
    const currentHp = target.getAttribute(ATTRIBUTE_CODE.currentHealth)
    const healCap = Math.max(0, maxHp - currentHp)
    let overflow = 0
    if (heal > healCap) {
      // ponytail: 溢出量在 debuff 之前计算——"损失"由两个独立机制构成：
      // ① 上限溢出（HP满了装不下）= overflow，用于盾生成
      // ② 减益缩减（debuff降低效果）= 在下方计算，反映在最终 heal 值
      // 两者互不抵消，各自反映一个不同的游戏机制
      overflow = heal - healCap
      this.logCalculation(
        'heal_cap',
        healCap,
        `治疗上限限制: ${heal} → ${healCap}，溢出: ${overflow}`,
      )
      heal = healCap
    }

    // 负面状态影响（降低治疗效果）
    const debuffEffect = this.calculateDebuffEffect(target, buffSystem)
    if (debuffEffect > 0) {
      heal = Math.floor(heal * (1 - debuffEffect))
      this.logCalculation(
        'debuff',
        debuffEffect,
        `减益效果: -${Math.round(debuffEffect * 100)}%`,
      )
    }

    heal = Math.max(0, Math.floor(heal))

    if (context?.record) {
      context.record.effects?.push({
        type: 'heal',
        targetId: target.id,
        value: heal,
        description: `治疗 ${heal}`,
      })
    }

    return { heal, overflow }
  }

  /**
   * 计算减益效果对治疗的影响
   */
  /** 每个 debuff 的减治疗效果（20%） */
  private static readonly HEAL_REDUCTION_PER_DEBUFF = 0.2
  /** 最大减治疗效果上限（80%） */
  private static readonly MAX_HEAL_REDUCTION = 0.8

  private calculateDebuffEffect(
    target: BattleEntity,
    buffSystem?: BuffSystem,
  ): number {
    if (!buffSystem) return 0
    const reductionInstances = buffSystem.getBuffInstancesWithTag(
      target.id,
      EffectTag.HEAL_REDUCTION,
    )
    const debuffEffect =
      reductionInstances.length * HealCalculator.HEAL_REDUCTION_PER_DEBUFF
    return Math.min(debuffEffect, HealCalculator.MAX_HEAL_REDUCTION)
  }

  applyHeal(target: BattleEntity, heal: number): number {
    if (!target.isAlive()) {
      LoggerProvider.logger.addDebugLog('目标已死亡，无法进行治疗')
      return 0
    }
    if (target.isFullHealth()) {
      LoggerProvider.logger.addDebugLog('目标气血值已满，无需治疗')
      return 0
    }
    const actualHeal = target.heal(heal)
    return actualHeal
  }

  isSingleTurnEffect(skillStep: ExtendedSkillStep): boolean {
    return (
      skillStep.calculation?.isSingleTurn === true ||
      !skillStep.duration ||
      skillStep.duration <= 1
    )
  }

  private getAttrValue(
    participant: BattleEntity,
    attr: ATTRIBUTE_CODE,
  ): number {
    try {
      return participant.getAttribute(attr) || 0
    } catch {
      return 0
    }
  }

  private logCalculation(
    step: string,
    value: number,
    description: string,
  ): void {
    this.calculationLogs.push({ step, value, description })
  }
}
