import type { ExtendedSkillStep } from '@/domain/skill/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { StepExecutionContext } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { STATUS_CODE } from '@/shared/types/status-meta'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'
import { processExtraValues, processTargetModifiers } from '@/domain/skill/calculation-utils'
import { floor } from '@/shared/utils/math'
import { createTraceEvent, TraceLevel, TracePhase } from '@/shared/types/trace-event'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'

interface HealCalculationStep {
  step: string
  value: number
  description: string
}

export class HealCalculator {
  calculationLogs: HealCalculationStep[] = []

  /** 可选的 IDebugTracePort（由 BattleSystem 经 SkillManager 注入，供 HEAL_CALCULATION 发射） */
  private tracePort: IDebugTracePort | null = null

  setTracePort(port: IDebugTracePort | null): void {
    this.tracePort = port
  }

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
    // 修饰前计算值（baseValue + extraValues 之后、targetModifiers/cap/debuff 之前）— 供 HEAL_CALCULATION 的 before 语义
    let baseBeforeModifiers = 0

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
    // 修饰前计算值（baseValue + extraValues 之后、targetModifiers/cap/debuff 之前）— 供 HEAL_CALCULATION 的 before 语义
    // 与最终 heal 同口径 floor，避免 before 显示浮点而 after 为整数
    baseBeforeModifiers = floor(heal)

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

    // 发射 HEAL_CALCULATION（文档 §7 第二层：calculateHeal 末尾；scope 来源 context.trace）
    if (
      this.tracePort &&
      context?.trace &&
      this.tracePort.isEnabled(TracePhase.HEAL_CALCULATION)
    ) {
      this.tracePort.emit(
        createTraceEvent({
          phase: TracePhase.HEAL_CALCULATION,
          correlationId: context.trace.correlationId,
          parentId: context.trace.parentId,
          battleId: context.trace.meta?.battleId,
          turn: context.trace.meta?.turn,
          sourceId: source.id,
          targetId: target.id,
          level: TraceLevel.DEBUG,
          summary:
            `治疗计算 ${source.name}→${target.name} ` +
            `${baseBeforeModifiers}→${heal}` +
            `${overflow > 0 ? ` (溢出 ${overflow})` : ''}`,
          payload: {
            sourceId: source.id,
            targetId: target.id,
            stepId: skillStep.id,
            // 治疗技能名：由执行器写入 CombatRecord.skillName（selectAndExecuteSkill 路径）；
            // record 为 undefined 时缺省（归"未标记技能"，与伤害路径同口径）
            skillName: context.record?.skillName,
            skillType: context.record?.skillType,
            base: baseBeforeModifiers,
            final: heal,
            overflow,
            steps: [...this.calculationLogs], // 复用 HealCalculationStep[]（含 before→after 语义）
          },
        }),
      )
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
      LoggerProvider.logger.addDebugLog('目标已死亡，无法进行治疗', { level: LogLevel.DEBUG })
      return 0
    }
    if (target.isFullHealth()) {
      LoggerProvider.logger.addDebugLog('目标气血值已满，无需治疗', { level: LogLevel.DEBUG })
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
