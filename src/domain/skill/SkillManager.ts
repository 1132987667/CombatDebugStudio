import type { SkillConfig, SkillStep } from '@/domain/skill/types'
import {
  BattleActionHelper,
  type BattleAction,
  type BattleEntity,
  SkillBlockReason,
} from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { ControlType } from '@/domain/buff/types'
import { BattleTriggerPhase } from '@/domain/battle/type/types'
import { SkillExecutor } from '@/domain/skill/SkillExecutor'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { DeferredDamageToken } from '@/domain/skill/DeferredDamageToken'
import { LogLevel } from '@/shared/types/battle-log'
import { validateSkillConfigs } from '@/shared/utils/schema-validator'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { createStepContext } from '@/domain/battle/type/types'
interface CalculationContext {
  skillStep: SkillStep
  action: BattleAction
  source: BattleEntity
  targets: BattleEntity[]
  record?: CombatRecord
  token?: DeferredDamageToken
}

export class SkillManager {
  private skillConfigs: Map<string, SkillConfig> = new Map()
  private buffSystem: BuffSystem
  private damageCalculator: DamageCalculator
  private healCalculator: HealCalculator
  private executor: SkillExecutor
  private calculators: Map<string, unknown> = new Map()

  constructor(
    buffSystem: BuffSystem,
    damageCalculator?: DamageCalculator,
    healCalculator?: HealCalculator,
  ) {
    this.buffSystem = buffSystem
    this.damageCalculator = damageCalculator || new DamageCalculator()
    this.healCalculator = healCalculator || new HealCalculator()
    this.executor = new SkillExecutor(
      this.damageCalculator,
      this.healCalculator,
      this.buffSystem,
    )
  }

  getSkillConfigs(): Map<string, SkillConfig> {
    return this.skillConfigs
  }

  getBuffSystem(): BuffSystem {
    return this.buffSystem
  }

  getDamageCalculator(): DamageCalculator {
    return this.damageCalculator
  }

  getHealCalculator(): HealCalculator {
    return this.healCalculator
  }

  getExecutor(): SkillExecutor {
    return this.executor
  }

  /** 获取伤害计算日志 */
  getDamageCalculationLogs() {
    return this.damageCalculator.getCalculationLogs()
  }

  /** 获取治疗计算日志 */
  getHealCalculationLogs() {
    return this.healCalculator.getCalculationLogs()
  }

  /** 清空所有计算日志 */
  clearCalculationLogs(): void {
    this.damageCalculator.clearCalculationLogs()
    this.healCalculator.clearCalculationLogs()
  }

  loadSkillConfigs(configs: SkillConfig[]): void {
    let dupCount = 0
    for (const config of configs) {
      if (this.skillConfigs.has(config.id)) {
        dupCount++
        LoggerProvider.logger.addDebugLog(
          `[SkillManager] 重复技能 ID: ${config.id}，将被覆盖`,
          { level: LogLevel.WARN },
        )
      }
      this.skillConfigs.set(config.id, config)
    }
    LoggerProvider.logger.addDebugLog(
      `已加载 ${configs.length} 个技能配置${dupCount > 0 ? `（${dupCount} 个重复 ID）` : ''}`,
      { level: LogLevel.INFO },
    )
  }

  getSkillConfig(skillId: string): SkillConfig | undefined {
    const config = this.skillConfigs.get(skillId)
    // ponytail: 返回浅拷贝防止外部修改影响内部状态
    return config ? { ...config } : undefined
  }

  setSkillConfig(skillId: string, config: SkillConfig): void {
    this.skillConfigs.set(skillId, config)
  }

  hasSkill(skillId: string): boolean {
    return this.skillConfigs.has(skillId)
  }

  removeSkill(skillId: string): boolean {
    return this.skillConfigs.delete(skillId)
  }

  getSkillNames(): string[] {
    return Array.from(this.skillConfigs.keys())
  }

  clearSkills(): void {
    this.skillConfigs.clear()
  }

  executeSkill(
    skillId: string,
    source: BattleEntity,
    target: BattleEntity,
    currentTurn: number,
    record?: CombatRecord,
    /** 步骤级目标解析回调：给定 targetType 和主目标，返回额外目标列表 */
    resolveExtraTargets?: (
      stepTargetType: string,
      mainTarget: BattleEntity,
    ) => BattleEntity[],
    /** ponytail: 延迟伤害令牌 — 传入时只记录不扣血，调用方动画后 applyAll */
    token?: DeferredDamageToken,
  ): BattleAction {
    const config = this.skillConfigs.get(skillId)
    if (!config) {
      LoggerProvider.logger.addDebugLog(`技能 ${skillId} 不存在配置`, {
        level: LogLevel.WARN,
      })
      console.error(`技能 ${skillId} 不存在配置`)
      return BattleActionHelper.createSkill({
        sourceId: source.id,
        targetId: target.id,
        skillId,
        skillName: skillId,
        turn: currentTurn,
        success: false,
        effects: [
          {
            type: 'status',
            targetId: target.id,
            description: `技能 ${skillId} 不存在配置`,
          },
        ],
      })
    }

    // ponytail: P1/CTRL-1 — 统一可执行性检查委托给 participant.canExecuteSkill
    // 通过 getAttribute 获取能量，确保与属性系统（含修饰符）一致
    const currentEnergy = source.getAttribute(ATTRIBUTE_CODE.currentEnergy)
    const availability = source.canExecuteSkill(
      source.id,
      skillId,
      currentEnergy,
      this.buffSystem,
    )
    if (!availability.can) {
      LoggerProvider.logger.addDebugLog(
        `技能 ${skillId} 不可用: ${availability.reason}`,
        { level: LogLevel.WARN },
      )
      console.log(`技能 ${skillId} 不可用:`, availability.reason)
      return BattleActionHelper.createSkill({
        sourceId: source.id,
        targetId: target.id,
        skillId,
        skillName: config.name || '',
        turn: currentTurn,
        success: false,
        effects: [
          {
            type: 'status',
            targetId: target.id,
            description: `技能 ${skillId} 不可用: ${availability.reason}`,
          },
        ],
      })
    }

    // ponytail: 被动技能允许无 target（自施法技能通过 targetConfig.faction === 'self' 处理）
    const hasNonSelfStep =
      config.steps?.some(
        (s) =>
          s.targetConfig?.faction !== 'self' &&
          s.type !== 'remove_debuff' &&
          s.type !== 'cleanse',
      ) ?? false
    if (!target && hasNonSelfStep) {
      LoggerProvider.logger.addDebugLog(`技能 ${skillId} 无有效目标`, {
        level: LogLevel.WARN,
      })
      console.error(`技能 ${skillId} 无有效目标`)
      return BattleActionHelper.createSkill({
        sourceId: source.id,
        targetId: source.id,
        skillId,
        skillName: config.name || '',
        turn: currentTurn,
        success: false,
        effects: [
          {
            type: 'status',
            targetId: source.id,
            description: `技能 ${skillId} 无有效目标`,
          },
        ],
      })
    }

    // ponytail: 施法者被控制时技能取消
    const sourceControl = this.buffSystem.getHighestPriorityControlEffect(
      source.id,
    )
    if (sourceControl !== ControlType.NONE) {
      LoggerProvider.logger.addDebugLog(
        `技能 ${skillId} 取消：施法者 ${source.name} 已被控制`,
        { level: LogLevel.WARN },
      )
      const action = BattleActionHelper.createSkill({
        sourceId: source.id,
        targetId: target?.id ?? '',
        skillId,
        skillName: config.name || '',
        turn: currentTurn,
        success: false,
        effects: [
          {
            type: 'status',
            targetId: source.id,
            description: `${source.name} 已被控制，技能取消`,
          },
        ],
      })
      return action
    }

    // ponytail: 目标被控制时技能取消（覆盖所有非 NONE 控制类型）
    if (target) {
      const targetControl = this.buffSystem.getHighestPriorityControlEffect(
        target.id,
      )
      if (targetControl !== ControlType.NONE) {
        LoggerProvider.logger.addDebugLog(
          `技能 ${skillId} 取消：目标 ${target.name} 已被控制`,
          { level: LogLevel.WARN },
        )
        const action = BattleActionHelper.createSkill({
          sourceId: source.id,
          targetId: target.id,
          skillId,
          skillName: config.name || '',
          turn: currentTurn,
          success: false,
          effects: [
            {
              type: 'status',
              targetId: target.id,
              description: `${target.name} 已被控制，技能取消`,
            },
          ],
        })
        return action
      }
    }

    // 在执行前消耗能量——如果失败则无法恢复，但
    // 上面的预检查确保了有足够的能量可用
    if (source.spendEnergy && config.energyCost) {
      source.spendEnergy(config.energyCost)
    }

    const action = BattleActionHelper.createSkill({
      sourceId: source.id,
      targetId: target.id,
      skillId,
      skillName: config.name || '',
      turn: currentTurn,
      success: true,
    })

    this.buffSystem.getEventBus().emit(BattleTriggerPhase.SKILL_USE, {
      phase: BattleTriggerPhase.SKILL_USE,
      sourceId: source.id,
      targetId: target.id,
      skillId,
      value: 0,
      currentTurn,
    })

    const steps = config.steps || []
    for (const step of steps) {
      const ctx: CalculationContext = {
        skillStep: step,
        action,
        source,
        targets: [target],
        record,
        token,
      }
      this.executeStep(ctx)

      // 处理步骤级 targetType（如 random_adjacent 溅射伤害）
      const stepTargetType = step.targetType as string | undefined
      if (stepTargetType && resolveExtraTargets) {
        const extraTargets = resolveExtraTargets(stepTargetType, target)
        for (const extraTarget of extraTargets) {
          if (!extraTarget.isAlive()) continue
          const extraCtx: CalculationContext = {
            skillStep: step,
            action,
            source,
            targets: [extraTarget],
            record,
            token,
          }
          this.executeStep(extraCtx)
        }
      }
    }

    // ponytail: 技能执行成功后设置冷却（如果配置了冷却回合数）
    if (config.cooldown && config.cooldown > 0) {
      if (
        'setSkillCooldown' in source &&
        typeof source.setSkillCooldown === 'function'
      ) {
        source.setSkillCooldown(skillId, config.cooldown)
      }
    }

    LoggerProvider.logger.addDebugLog(`执行技能 ${config.name || skillId}`, {
      level: LogLevel.DEBUG,
    })
    return action
  }

  private executeStep(ctx: CalculationContext): void {
    this.executor.executeStep(
      ctx.skillStep,
      ctx.action,
      ctx.source,
      ctx.targets[0],
      createStepContext(ctx.record, ctx.token),
    )
  }

  registerCalculator(name: string, calculator: unknown): void {
    this.calculators.set(name, calculator)
  }

  getCalculator(name: string): unknown | undefined {
    return this.calculators.get(name)
  }

  loadSkillConfigsFromData(data: SkillConfig[]): SkillConfig[] {
    const result = validateSkillConfigs(data)
    if (!result.valid) {
      LoggerProvider.logger.addDebugLog(
        `技能配置验证失败: ${result.errors.join('; ')}`,
        { level: LogLevel.WARN },
      )
    }
    // ponytail: validateSkillConfigs 签名返回 ValidationResult，实际不修改 data。
    // 保留原数组，仅记录验证结果。
    this.loadSkillConfigs(data)
    return data
  }

  reloadAllSkills(configs: SkillConfig[]): void {
    this.clearSkills()
    this.loadSkillConfigs(configs)
  }
}
