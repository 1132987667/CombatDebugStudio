import type { ExtendedSkillStep, CalculationLog } from '@/domain/skill/types'
import type { BattleAction, BattleEntity } from '@/domain/battle/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { StackRule, ControlType } from '@/domain/buff/types'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { battleLogManager } from '@/infrastructure/adapters/logging'

export class SkillExecutor {
  constructor(
    private readonly damageCalculator: DamageCalculator,
    private readonly healCalculator: HealCalculator,
    private readonly buffSystem: BuffSystem,
  ) {}

  executeStep(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const normalizedType = skillStep.type.toUpperCase()
    switch (normalizedType) {
      case 'DAMAGE':
        this.executeDamage(skillStep, action, source, target, record)
        break
      case 'HEAL':
        this.executeHeal(skillStep, action, source, target, record)
        break
      case 'BUFF':
      case 'DEBUFF':
        this.executeBuff(skillStep, action, source, target, record)
        break
      case 'SHIELD':
        this.executeShield(skillStep, action, source, target)
        break
      case 'CONTROL':
      case 'STUN':
      case 'SILENCE':
        this.executeControl(skillStep, action, source, target, normalizedType)
        break
    }
  }

  private executeDamage(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const result = this.damageCalculator.calculateDamage(skillStep, source, target, record)
    if (result.isMiss) {
      action.effects.push({ type: 'miss', targetId: target.id, value: 0, description: `${target.name} dodged attack` })
    } else {
      const actualDamage = this.damageCalculator.applyDamage(target, result.damage)
      action.damage += actualDamage
      action.effects.push({ type: 'damage', targetId: target.id, value: actualDamage, description: `${source.name} deals ${actualDamage} damage`, isCritical: result.isCritical })
    }
  }

  private executeHeal(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const healTarget = skillStep.target === 'self' || skillStep.targetType === 'self' ? source : target
    const heal = this.healCalculator.calculateHeal(skillStep, source, healTarget, record)
    const actualHeal = this.healCalculator.applyHeal(healTarget, heal)
    action.heal += actualHeal
    action.effects.push({ type: 'heal', targetId: healTarget.id, value: actualHeal, description: `${healTarget.name} healed for ${actualHeal}` })
    if (this.healCalculator.isSingleTurnEffect(skillStep)) {
      action.effects.push({ type: 'status', description: 'Single-turn heal effect applied immediately' })
    }
  }

  private executeBuff(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const buffId = skillStep.buffId || skillStep.effectId
    if (!buffId) return

    const registry = this.buffSystem.getScriptRegistry()
    if (!registry.has(buffId)) {
      action.effects.push({ type: 'buff', buffId, description: `${source.name} failed to apply ${buffId}` })
      return
    }

    const buffTarget = skillStep.target === 'self' || skillStep.targetType === 'self' ? source : target
    const buffConfig: any = {
      id: buffId, name: buffId, duration: skillStep.duration ?? 1,
      maxStacks: skillStep.stacks || 1, cooldown: 0,
      stackRule: StackRule.LIMITED, controlType: ControlType.NONE, controlPriority: 0,
      isDebuff: skillStep.type === 'DEBUFF',
      parameters: skillStep.parameters || skillStep.effectParams || {},
    }

    const instanceId = this.buffSystem.addBuff(buffTarget.id, buffId, buffConfig, 0, record)
    if (instanceId) buffTarget.addBuff(instanceId)
    action.effects.push({ type: 'buff', targetId: buffTarget.id, buffId, instanceId, description: `${source.name} applies ${buffId} to ${buffTarget.name}` })
  }

  private executeShield(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    action.effects.push({ type: 'status', targetId: target.id, description: 'Shield effect (to be implemented)' })
  }

  private executeControl(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    normalizedType: string,
  ): void {
    const controlType = normalizedType === 'STUN' ? ControlType.STUN : normalizedType === 'SILENCE' ? ControlType.SILENCE : ControlType.STUN
    const buffId = skillStep.buffId || `control_${controlType}`
    const config: any = {
      id: buffId, name: buffId, duration: skillStep.duration ?? 1, maxStacks: 1, cooldown: 0,
      stackRule: StackRule.REFRESH, controlType, controlPriority: 100, isDebuff: true,
      parameters: skillStep.parameters || {},
    }
    const instanceId = this.buffSystem.addBuff(target.id, buffId, config)
    if (instanceId) target.addBuff(instanceId)
    action.effects.push({ type: 'status', targetId: target.id, buffId, description: `${source.name} applies ${controlType === ControlType.STUN ? 'stun' : 'silence'} to ${target.name}` })
  }
}
