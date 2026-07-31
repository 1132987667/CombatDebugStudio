import type { ExtendedSkillStep } from '@/domain/skill/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { StepExecutionContext } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { STATUS_CODE } from '@/shared/types/status-meta'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { processExtraValues, processTargetModifiers } from '@/domain/skill/calculation-utils'
import { floor } from '@/shared/utils/math'

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
        const { total } = processExtraValues(
          skillStep.calculation.extraValues,
          (attr) => {
            if (attr === 'damageDealt' || attr === 'damageTaken') {
              return context?.damage ?? 0
            }
            return source.getAttribute(attr as ATTRIBUTE_CODE) || 0
          },
        )
        heal += total
      }
    }

    // targetModifiers 处理
    if (skillStep.targetModifiers) {
      const { result } = processTargetModifiers(skillStep.targetModifiers, target, heal)
      heal = result
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
      this.calculationLogs.push({
        step: 'heal_cap',
        value: healCap,
        description: `治疗上限限制: ${heal} → ${healCap}，溢出: ${overflow}`,
      })
      heal = healCap
    }

    // 负面状态影响（降低治疗效果）
    const debuffEffect = this.calculateDebuffEffect(target, buffSystem)
    if (debuffEffect > 0) {
      heal = floor(heal * (1 - debuffEffect))
      this.calculationLogs.push({
        step: 'debuff',
        value: debuffEffect,
        description: `减益效果: -${Math.round(debuffEffect * 100)}%`,
      })
    }

    heal = Math.max(0, floor(heal))

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
      STATUS_CODE.HEAL_REDUCTION,
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
}
