import type { ExtendedSkillStep } from '@/domain/skill/types'
import { SkillStepType } from '@/domain/skill/types'
import type { BattleAction, BattleEntity } from '@/domain/battle/types'
import type { CombatRecord } from '@/domain/battle/combat-record'
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { StackRule, ControlType, type BuffConfig } from '@/domain/buff/types'
import { DamageCalculator } from '@/domain/skill/DamageCalculator'
import { HealCalculator } from '@/domain/skill/HealCalculator'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'

export class SkillExecutor {
  constructor(
    private readonly damageCalculator: DamageCalculator,
    private readonly healCalculator: HealCalculator,
    private readonly buffSystem: BuffSystem,
  ) {}

  /** ponytail: 延迟伤害模式 — 为 true 时 executeDamage/executeHeal 只记录数值到 action，不调用 target.takeDamage()/heal()，
   * 由调用方在动画完成后统一应用，保证攻击动画飞到目标时才扣血 */
  public deferDamage = false

  executeStep(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    switch (skillStep.type) {
      case SkillStepType.DEAL_DAMAGE:
        this.executeDamage(skillStep, action, source, target, record)
        break
      case SkillStepType.HEAL:
        this.executeHeal(skillStep, action, source, target, record)
        break
      case SkillStepType.APPLY_BUFF:
        this.executeBuff(skillStep, action, source, target, record)
        break
      case SkillStepType.SHIELD:
        this.executeShield(skillStep, action, source, target)
        break
      case SkillStepType.STUN:
      case SkillStepType.SILENCE:
        this.executeControl(skillStep, action, source, target, skillStep.type)
        break
      default: {
        // ponytail: 未实现的步骤类型 — 当前无任何技能配置使用这些类型
        // 升级路径：当有技能配置使用它们时，在 switch 中添加对应 case
        battleLogManager.addDebugLog(`未实现的技能步骤类型: ${skillStep.type}`, LogLevel.WARN)
        action.effects.push({
          type: 'status',
          targetId: target.id,
          description: `步骤类型 ${skillStep.type} 未实现`,
        })
        break
      }
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
      if (this.deferDamage) {
        // ponytail: 延迟模式 — 只记录伤害数值，不调用 takeDamage，由调用方在动画后统一应用
        action.damage += result.damage
        action.effects.push({ type: 'damage', targetId: target.id, value: result.damage, description: `${source.name} deals ${result.damage} damage`, isCritical: result.isCritical })
      } else {
        const actualDamage = this.damageCalculator.applyDamage(target, result.damage)
        action.damage += actualDamage
        action.effects.push({ type: 'damage', targetId: target.id, value: actualDamage, description: `${source.name} deals ${actualDamage} damage`, isCritical: result.isCritical })
      }
    }
  }

  private executeHeal(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    record?: CombatRecord,
  ): void {
    const healTarget = skillStep.targetConfig?.faction === 'self' ? source : target
    const heal = this.healCalculator.calculateHeal(skillStep, source, healTarget, record)
    if (this.deferDamage) {
      // ponytail: 延迟模式 — 只记录治疗数值，由调用方在动画后统一应用
      action.heal += heal
      action.effects.push({ type: 'heal', targetId: healTarget.id, value: heal, description: `${healTarget.name} healed for ${heal}` })
    } else {
      const actualHeal = this.healCalculator.applyHeal(healTarget, heal)
      action.heal += actualHeal
      action.effects.push({ type: 'heal', targetId: healTarget.id, value: actualHeal, description: `${healTarget.name} healed for ${actualHeal}` })
    }
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
    const buffId = skillStep.buffId ?? skillStep.effectId
    if (!buffId) return

    const buffTarget = skillStep.targetConfig?.faction === 'self' ? source : target
    const buffConfig: BuffConfig = {
      id: buffId, name: buffId, description: '', duration: skillStep.duration ?? 1,
      maxStacks: skillStep.stacks || 1, cooldown: 0,
      stackRule: StackRule.LIMITED, controlType: ControlType.NONE, controlPriority: 0,
      isDebuff: false,
      parameters: skillStep.parameters || skillStep.effectParams || {},
    }

    const instanceId = this.buffSystem.addBuff(buffTarget.id, buffId, buffConfig, 0, record)
    action.effects.push({ type: 'buff', targetId: buffTarget.id, buffId, instanceId, description: `${source.name} applies ${buffId} to ${buffTarget.name}` })
  }

  // TODO: 实现护盾逻辑（向目标添加 buff_shield 或直接修改属性）
  private executeShield(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
  ): void {
    // TODO: 实现护盾添加逻辑
    action.effects.push({ type: 'status', targetId: target.id, description: 'Shield effect (to be implemented)' })
  }

  private executeControl(
    skillStep: ExtendedSkillStep,
    action: BattleAction,
    source: BattleEntity,
    target: BattleEntity,
    normalizedType: string,
  ): void {
    const controlType = normalizedType === SkillStepType.STUN ? ControlType.STUN : normalizedType === SkillStepType.SILENCE ? ControlType.SILENCE : ControlType.STUN
    const buffId = skillStep.buffId || `control_${controlType}`
    const config: BuffConfig = {
      id: buffId, name: buffId, description: '', duration: skillStep.duration ?? 1, maxStacks: 1, cooldown: 0,
      stackRule: StackRule.REFRESH, controlType, controlPriority: 100, isDebuff: true,
      parameters: skillStep.parameters || {},
    }
    const instanceId = this.buffSystem.addBuff(target.id, buffId, config)
    action.effects.push({ type: 'status', targetId: target.id, buffId, description: `${source.name} applies ${controlType === ControlType.STUN ? 'stun' : 'silence'} to ${target.name}` })
  }
}
