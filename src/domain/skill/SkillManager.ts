import type {
  SkillConfig,
  SkillStep,
} from '@/domain/skill/types'
import type { BattleEntity } from '@/domain/battle/types'
import {
  ATTRIBUTE_CODE,
} from '@/domain/attribute/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { StackRule, ControlType } from '@/domain/buff/types'
import { SkillExecutor } from '@/domain/skill/SkillExecutor'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'
import { validateSkillConfigs } from '@/shared/utils/schema-validator'

interface CalculationContext {
  skillStep: any
  action: any
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

  /** 获取伤害计算日志 */
  getDamageCalculationLogs(): any[] {
    return this.damageCalculator.getCalculationLogs()
  }

  /** 获取治疗计算日志 */
  getHealCalculationLogs(): any[] {
    return this.healCalculator.getCalculationLogs()
  }

  /** 清空所有计算日�?*/
  clearCalculationLogs(): void {
    this.damageCalculator.clearCalculationLogs()
    this.healCalculator.clearCalculationLogs()
  }

  loadSkillConfigs(configs: SkillConfig[]): void {
    for (const config of configs) {
      this.skillConfigs.set(config.id, config)
    }
    battleLogManager.addDebugLog(`Loaded ${configs.length} skill configs`, LogLevel.INFO)
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
  ): any {
    const config = this.skillConfigs.get(skillId)
    if (!config) {
      battleLogManager.addDebugLog(`Skill ${skillId} not found`, LogLevel.WARN)
      return null
    }

    if (source.getAttribute) {
      const currentEnergy = source.getAttribute(ATTRIBUTE_CODE.currentEnergy)
      if (currentEnergy < (config.energyCost || 0)) {
        battleLogManager.addDebugLog(`Insufficient energy for skill ${skillId}`, LogLevel.WARN)
        return null
      }
    }

    const targets = this.resolveTargets(config, source, target)
    if (targets.length === 0) {
      battleLogManager.addDebugLog(`No valid targets for skill ${skillId}`, LogLevel.WARN)
      return null
    }

    const action: any = {
      id: `action_${Date.now()}`,
      sourceId: source.id,
      skillId,
      skillName: config.name || skillId,
      type: 'skill',
      damage: 0,
      heal: 0,
      effects: [],
      targetId: target.id,
      targets: targets.map((t) => t.id),
      timestamp: Date.now(),
      currentTurn,
    }

    this.buffSystem.getEventBus().emit('ON_SKILL_USE' as any, {
      phase: 'ON_SKILL_USE' as any,
      sourceId: source.id,
      targetId: target.id,
      skillId,
      value: 0,
      currentTurn,
    } as any)

    const steps = this.normalizeSteps(config.steps || [])
    for (const step of steps) {
      for (const t of targets) {
        const ctx: CalculationContext = {
          skillStep: this.extendStep(step, config),
          action,
          source,
          targets: [t],
          record: undefined,
        }
        this.executeStep(ctx)
      }
    }

    if (source.spendEnergy && config.energyCost) {
      source.spendEnergy(config.energyCost)
    }

    const buffsOnTarget = target.buffs || []
    const stunPresent = buffsOnTarget.some((b: any) => {
      if (typeof b === 'string') return b.includes('stun') || b.includes('STUN')
      return false
    })
    if (!stunPresent) {
      const controlType = this.buffSystem.getHighestPriorityControlEffect(target.id)
      if (controlType === ControlType.STUN) {
        action.effects.push({ type: 'status', targetId: target.id, description: `${target.name} is stunned, action skipped` })
        return null
      }
    }

    battleLogManager.addDebugLog(`Executed skill ${config.name || skillId}`, LogLevel.DEBUG)
    return action
  }

  private resolveTargets(
    config: SkillConfig,
    source: BattleEntity,
    target: BattleEntity,
  ): BattleEntity[] {
    const selector = config.selector || 'single_enemy'
    switch (selector) {
      case 'self':
        return [source]
      case 'single_enemy':
      case 'single' as any:
        return target ? [target] : []
      case 'all_enemies':
        return [target]
      case 'all_allies':
        return [source]
      case 'lowest_hp_ally':
        return [source]
      case 'random_enemy':
        return target ? [target] : []
      default:
        return target ? [target] : []
    }
  }

  private normalizeSteps(steps: SkillStep[]): SkillStep[] {
    return steps
  }

  private extendStep(step: SkillStep, config: SkillConfig): any {
    return {
      ...step,
      attackType: (config as any).attackType || 'skill',
      buffId: (step as any).buffId || (step as any).effectId,
      effectId: (step as any).effectId || (step as any).buffId,
    }
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
