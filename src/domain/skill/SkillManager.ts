import type {
  SkillConfig,
  SkillStep,
} from '@/domain/skill/types'
import { BattleActionHelper, type BattleAction, type BattleEntity } from '@/domain/battle/types'
import {
  ATTRIBUTE_CODE,
} from '@/domain/attribute/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { ControlType } from '@/domain/buff/types'
import { BattleTriggerPhase } from '@/domain/battle/types'
import { SkillExecutor } from '@/domain/skill/SkillExecutor'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'
import { validateSkillConfigs } from '@/shared/utils/schema-validator'
import type { CalculationLog } from '@/shared/types/battle-log'
interface CalculationContext {
  skillStep: SkillStep
  action: BattleAction
  source: BattleEntity
  targets: BattleEntity[]
  record?: CombatRecord
}

export class SkillManager {
  private skillConfigs: Map<string, SkillConfig> = new Map()
  private buffSystem: BuffSystem
  private damageCalculator: DamageCalculator
  private healCalculator: HealCalculator
  private executor: SkillExecutor
  private calculators: Map<string, any> = new Map()

  constructor(buffSystem: BuffSystem, damageCalculator?: DamageCalculator, healCalculator?: HealCalculator) {
    this.buffSystem = buffSystem
    this.damageCalculator = damageCalculator || new DamageCalculator()
    this.healCalculator = healCalculator || new HealCalculator()
    this.executor = new SkillExecutor(this.damageCalculator, this.healCalculator, this.buffSystem)
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

  /** ponytail: 设置技能执行的延迟伤害模式 — 为 true 时 executeDamage/executeHeal 只记录数值不实际扣血，
   * 由调用方在动画完成后统一应用 */
  setDeferredDamageMode(deferred: boolean): void {
    this.executor.deferDamage = deferred
  }

  /** 获取伤害计算日志 */
  getDamageCalculationLogs(): CalculationLog[] {
    return this.damageCalculator.getCalculationLogs()
  }

  /** 获取治疗计算日志 */
  getHealCalculationLogs(): CalculationLog[] {
    return this.healCalculator.getCalculationLogs()
  }

  /** 清空所有计算日志 */
  clearCalculationLogs(): void {
    this.damageCalculator.clearCalculationLogs()
    this.healCalculator.clearCalculationLogs()
  }

  loadSkillConfigs(configs: SkillConfig[]): void {
    for (const config of configs) {
      this.skillConfigs.set(config.id, config)
    }
    battleLogManager.addDebugLog(`已加载 ${configs.length} 个技能配置`, { level: LogLevel.INFO })
  }

  getSkillConfig(skillId: string): SkillConfig | undefined {
    return this.skillConfigs.get(skillId)
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
    resolveExtraTargets?: (stepTargetType: string, mainTarget: BattleEntity) => BattleEntity[],
  ): BattleAction | null {
    const config = this.skillConfigs.get(skillId)
    if (!config) {
      battleLogManager.addDebugLog(`技能 ${skillId} 不存在配置`, { level: LogLevel.WARN })
      console.error(`技能 ${skillId} 不存在配置`)
      return null
    }

    if (source.getAttribute) {
      const currentEnergy = source.getAttribute(ATTRIBUTE_CODE.currentEnergy)
      if (isNaN(config.energyCost)) {
        battleLogManager.addDebugLog(`技能 ${skillId} 能量消耗值无效`, { level: LogLevel.WARN })
        console.error(`技能 ${skillId} 能量消耗值无效`)
        return null
      }
      if (currentEnergy < config.energyCost) {
        battleLogManager.addDebugLog(`技能 ${skillId} 能量不足`, { level: LogLevel.WARN })
        console.error(`技能 ${skillId} 能量不足`, config.energyCost)
        return null
      }
    }

    // ponytail: 被动技能允许无 target（自施法技能通过 targetConfig.faction === 'self' 处理）
    const hasNonSelfStep = config.steps?.some(
      s => s.targetConfig?.faction !== 'self' && s.type !== 'remove_debuff' && s.type !== 'cleanse'
    ) ?? false
    if (!target && hasNonSelfStep) {
      battleLogManager.addDebugLog(`技能 ${skillId} 无有效目标`, { level: LogLevel.WARN })
      console.error(`技能 ${skillId} 无有效目标`)
      return null
    }

    // 检查目标是否被眩晕（仅目标存在时检查）
    const targetIsStunned = target ? this.isTargetStunned(target) : false
    if (targetIsStunned) {
      battleLogManager.addDebugLog(`技能 ${skillId} 取消：目标 ${target.name} 已被眩晕`, { level: LogLevel.WARN })
      const action = BattleActionHelper.createSkill({
        sourceId: source.id,
        targetId: target.id,
        skillId,
        skillName: config.name || '',
        turn: currentTurn,
        success: false,
        effects: [{ type: 'status', targetId: target.id, description: `${target.name} 已被眩晕，技能取消` }],
      })
      return action
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
          }
          this.executeStep(extraCtx)
        }
      }
    }

    // ponytail: 技能执行成功后设置冷却（如果配置了冷却回合数）
    if (config.cooldown && config.cooldown > 0) {
      if ('setSkillCooldown' in source && typeof source.setSkillCooldown === 'function') {
        source.setSkillCooldown(skillId, config.cooldown)
      }
    }

    battleLogManager.addDebugLog(`执行技能 ${config.name || skillId}`, { level: LogLevel.DEBUG })
    return action
  }

  private executeStep(ctx: CalculationContext): void {
    this.executor.executeStep(
      ctx.skillStep,
      ctx.action,
      ctx.source,
      ctx.targets[0],
      ctx.record,
    )
  }

  /** 检查目标是否被眩晕 */
  private isTargetStunned(target: BattleEntity): boolean {
    if (target.hasBuff('buff_stun')) return true
    const controlType = this.buffSystem.getHighestPriorityControlEffect(target.id)
    return controlType === ControlType.STUN
  }

  registerCalculator(name: string, calculator: any): void {
    this.calculators.set(name, calculator)
  }

  getCalculator(name: string): any | undefined {
    return this.calculators.get(name)
  }

  loadSkillConfigsFromData(data: SkillConfig[]): SkillConfig[] {
    const validConfigs = validateSkillConfigs(data) as any as SkillConfig[]
    this.loadSkillConfigs(validConfigs)
    return validConfigs
  }

  reloadAllSkills(configs: SkillConfig[]): void {
    this.clearSkills()
    this.loadSkillConfigs(configs)
  }
}
