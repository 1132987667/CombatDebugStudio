/**
 * 文件: DefaultStrategies.ts
 * 功能: 默认AI策略实现
 * 描述: 提供开箱即用的AI策略实现，包括目标选择、技能选择、威胁计算等
 */

import {
  type ITargetSelectionStrategy,
  type ISkillSelectionStrategy,
  type IThreatCalculationStrategy,
  type IBattleDecisionStrategy,
  type ParticipantSnapshot,
  type BattleContext,
  type BattleAnalysis,
} from './StrategyInterfaces'
import {
  BATTLE_CONSTANTS,
  ACTION_TYPES,
  BattleAction,
} from '@/types/battle'
import { EFFECT_TYPES } from '@/types/effect'
import type { Skill } from '@/types/skill'

/**
 * 默认威胁计算策略
 */
export class DefaultThreatCalculationStrategy implements IThreatCalculationStrategy {
  getName(): string {
    return 'DefaultThreatCalculation'
  }

  calculateThreat(
    target: ParticipantSnapshot,
    participant: ParticipantSnapshot,
    _context: BattleContext,
  ): number {
    let threat = 0

    const healthPercent = target.currentHealth / target.maxHealth
    threat += (1 - healthPercent) * BATTLE_CONSTANTS.THREAT_HEALTH_WEIGHT

    const energyPercent = target.currentEnergy / target.maxEnergy
    threat += energyPercent * BATTLE_CONSTANTS.THREAT_ENERGY_WEIGHT

    if (target.type === 'ally' && participant.type === 'enemy') {
      threat += BATTLE_CONSTANTS.THREAT_TYPE_WEIGHT
    }

    if (target.buffs.length > 0) {
      threat += target.buffs.length * BATTLE_CONSTANTS.THREAT_BUFF_WEIGHT
    }

    return threat
  }
}

/**
 * 攻击性目标选择策略
 * 优先选择血量最少的敌人
 */
export class AggressiveTargetStrategy implements ITargetSelectionStrategy {
  private threatStrategy: IThreatCalculationStrategy

  constructor(threatStrategy?: IThreatCalculationStrategy) {
    this.threatStrategy =
      threatStrategy || new DefaultThreatCalculationStrategy()
  }

  getName(): string {
    return 'AggressiveTarget'
  }

  selectTarget(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): string {
    const enemies = context.getEnemies(participant)

    if (enemies.length === 0) {
      throw new Error('No valid targets')
    }

    const targetsWithThreat = enemies.map((target) => ({
      target,
      threat: this.threatStrategy.calculateThreat(target, participant, context),
    }))

    targetsWithThreat.sort((a, b) => b.threat - a.threat)

    return targetsWithThreat[0].target.id
  }
}

/**
 * 防御性目标选择策略
 * 优先攻击对我方威胁最大的敌人
 */
export class DefensiveTargetStrategy implements ITargetSelectionStrategy {
  private threatStrategy: IThreatCalculationStrategy

  constructor(threatStrategy?: IThreatCalculationStrategy) {
    this.threatStrategy =
      threatStrategy || new DefaultThreatCalculationStrategy()
  }

  getName(): string {
    return 'DefensiveTarget'
  }

  selectTarget(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): string {
    const enemies = context.getEnemies(participant)

    if (enemies.length === 0) {
      throw new Error('No valid targets')
    }

    enemies.sort((a, b) => a.currentHealth - b.currentHealth)

    return enemies[0].id
  }
}

/**
 * 角色目标选择策略（优先选择血量最少的敌人）
 */
export class CharacterTargetStrategy implements ITargetSelectionStrategy {
  getName(): string {
    return 'CharacterTarget'
  }

  selectTarget(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): string {
    const enemies = context.getEnemies(participant)

    if (enemies.length === 0) {
      throw new Error('No enemies found')
    }

    enemies.sort((a, b) => a.currentHealth - b.currentHealth)

    return enemies[0].id
  }
}

/**
 * 敌人目标选择策略（优先选择血量最少的角色）
 */
export class EnemyTargetStrategy implements ITargetSelectionStrategy {
  getName(): string {
    return 'EnemyTarget'
  }

  selectTarget(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): string {
    const characters = context
      .getAllies({ ...participant, type: 'enemy' } as ParticipantSnapshot)
      .filter((p) => p.type === 'ally' && p.isAlive())

    const allParticipants = Array.from(context.participants.values())
    const allies = allParticipants.filter(
      (p) => p.type === 'ally' && p.isAlive(),
    )

    if (allies.length === 0) {
      throw new Error('No characters found')
    }

    allies.sort((a, b) => a.currentHealth - b.currentHealth)

    return allies[0].id
  }
}

/**
 * 默认技能选择策略
 */
export class DefaultSkillSelectionStrategy implements ISkillSelectionStrategy {
  private priorityStrategy: any

  constructor(priorityStrategy?: any) {
    this.priorityStrategy = priorityStrategy
  }

  getName(): string {
    return 'DefaultSkillSelection'
  }

  shouldUseSkill(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): boolean {
    const energyPercent = participant.getEnergyPercent()
    return energyPercent >= BATTLE_CONSTANTS.AI_SKILL_ENERGY_THRESHOLD
  }

  selectSkill(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): string | null {
    const availableSkills = this.getAvailableSkills(participant)
    if (availableSkills.length === 0) {
      return null
    }

    const analysis = context.analyzeBattle(participant)

    if (analysis.needsHealing) {
      const healSkill = availableSkills.find((s) => s.heal && s.heal > 0)
      if (healSkill) {
        return healSkill.id
      }
    }

    if (
      analysis.highestThreatEnemy.threat >
      BATTLE_CONSTANTS.SKILL_SELECTION_THREAT_THRESHOLD
    ) {
      const damageSkill = availableSkills.find((s) => s.damage && s.damage > 0)
      if (damageSkill) {
        return damageSkill.id
      }
    }

    const smallSkill = availableSkills.find((s) => s.type === 'small')
    if (smallSkill) {
      return smallSkill.id
    }

    const ultimateSkill = availableSkills.find((s) => s.type === 'ultimate')
    if (ultimateSkill) {
      return ultimateSkill.id
    }

    return availableSkills[0]?.id || null
  }

  protected getAvailableSkills(participant: ParticipantSnapshot): Skill[] {
    return []
  }
}

/**
 * 角色技能选择策略
 * 优先使用真实技能，生命低于临界值时触发治疗
 */
export class CharacterSkillSelectionStrategy extends DefaultSkillSelectionStrategy {
  getName(): string {
    return 'CharacterSkillSelection'
  }

  shouldUseSkill(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): boolean {
    const healthPercent = participant.getHealthPercent()

    if (healthPercent < BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD) {
      return true
    }

    return super.shouldUseSkill(context, participant)
  }

  selectSkill(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): string | null {
    const healthPercent = participant.getHealthPercent()

    if (healthPercent < BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD) {
      const allSkills = Array.from(context.participants.values())
      const healSkill = allSkills.find(
        (s) => (s as any).heal && (s as any).heal > 0,
      )
      if (healSkill) {
        return (healSkill as any).id
      }
    }

    if (healthPercent >= 1) {
      const allSkills = Array.from(context.participants.values())
      const attackSkills = allSkills.filter(
        (s) => (s as any).damage && (s as any).damage > 0,
      )
      if (attackSkills.length > 0) {
        return (attackSkills[0] as any).id
      }
    }

    if (
      participant.currentEnergy >= BATTLE_CONSTANTS.ULTIMATE_ENERGY_THRESHOLD
    ) {
      const allSkills = Array.from(context.participants.values())
      const ultimateSkill = allSkills.find(
        (s) => (s as any).type === 'ultimate',
      )
      if (ultimateSkill) {
        return (ultimateSkill as any).id
      }
    }

    return super.selectSkill(context, participant)
  }
}

/**
 * 敌人技能选择策略
 * 能量足够时触发技能
 */
export class EnemySkillSelectionStrategy extends DefaultSkillSelectionStrategy {
  getName(): string {
    return 'EnemySkillSelection'
  }

  shouldUseSkill(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): boolean {
    return (
      participant.currentEnergy >= BATTLE_CONSTANTS.ENEMY_SKILL_ENERGY_THRESHOLD
    )
  }
}

/**
 * 默认战斗决策策略
 */
export class DefaultBattleDecisionStrategy implements IBattleDecisionStrategy {
  private targetStrategy: ITargetSelectionStrategy
  private skillStrategy: ISkillSelectionStrategy

  constructor(
    targetStrategy?: ITargetSelectionStrategy,
    skillStrategy?: ISkillSelectionStrategy,
  ) {
    this.targetStrategy = targetStrategy || new AggressiveTargetStrategy()
    this.skillStrategy = skillStrategy || new DefaultSkillSelectionStrategy()
  }

  getName(): string {
    return 'DefaultBattleDecision'
  }

  makeDecision(
    context: BattleContext,
    participant: ParticipantSnapshot,
    availableSkills: Map<string, Skill>,
  ): BattleAction {
    try {
      if (this.skillStrategy.shouldUseSkill(context, participant)) {
        const skillId = this.skillStrategy.selectSkill(context, participant)
        if (skillId && availableSkills.has(skillId)) {
          return this.createSkillAction(
            participant,
            skillId,
            context,
            availableSkills,
          )
        }
      }

      return this.createAttackAction(participant, context)
    } catch (error) {
      return this.createAttackAction(participant, context)
    }
  }

  protected createAttackAction(
    participant: ParticipantSnapshot,
    context: BattleContext,
  ): BattleAction {
    const targetId = this.targetStrategy.selectTarget(context, participant)
    const damage =
      Math.floor(
        Math.random() *
          (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX -
            BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN),
      ) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN

    return {
      id: `attack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: ACTION_TYPES.ATTACK,
      sourceId: participant.id,
      targetId,
      damage,
      success: true,
      timestamp: Date.now(),
      effects: [
        {
          type: EFFECT_TYPES.DAMAGE,
          value: damage,
          description: `${participant.name} 普通攻击`,
        },
      ],
    }
  }

  protected createSkillAction(
    participant: ParticipantSnapshot,
    skillId: string,
    context: BattleContext,
    availableSkills: Map<string, Skill>,
  ): BattleAction {
    const skill = availableSkills.get(skillId)
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    let targetId: string
    if (skill.heal) {
      const allies = context.getAllies(participant)
      allies.sort(
        (a, b) => a.currentHealth / a.maxHealth - b.currentHealth / b.maxHealth,
      )
      targetId = allies[0]?.id || participant.id
    } else {
      targetId = this.targetStrategy.selectTarget(context, participant)
    }

    const action: BattleAction = {
      id: `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: ACTION_TYPES.SKILL,
      sourceId: participant.id,
      targetId,
      skillId,
      success: true,
      timestamp: Date.now(),
      effects: [
        {
          type: EFFECT_TYPES.STATUS,
          description: `${participant.name} 使用 ${skill.name}`,
        },
      ],
    }

    if (skill.damage) {
      action.damage = skill.damage
      action.effects.push({
        type: EFFECT_TYPES.DAMAGE,
        value: skill.damage,
        description: `造成 ${skill.damage} 伤害`,
      })
    }

    if (skill.heal) {
      action.heal = skill.heal
      action.effects.push({
        type: EFFECT_TYPES.HEAL,
        value: skill.heal,
        description: `恢复 ${skill.heal} 生命值`,
      })
    }

    if (skill.buffId) {
      action.buffId = skill.buffId
      action.effects.push({
        type: EFFECT_TYPES.BUFF,
        buffId: skill.buffId,
        description: `施加 ${skill.name} 效果`,
      })
    }

    return action
  }
}

/**
 * 策略工厂类
 */
export class StrategyFactory {
  /**
   * 创建目标选择策略
   */
  public static createTargetStrategy(type: string): ITargetSelectionStrategy {
    switch (type.toLowerCase()) {
      case 'aggressive':
        return new AggressiveTargetStrategy()
      case 'defensive':
        return new DefensiveTargetStrategy()
      case 'character':
        return new CharacterTargetStrategy()
      case 'enemy':
        return new EnemyTargetStrategy()
      default:
        return new AggressiveTargetStrategy()
    }
  }

  /**
   * 创建技能选择策略
   */
  public static createSkillStrategy(type: string): ISkillSelectionStrategy {
    switch (type.toLowerCase()) {
      case 'character':
        return new CharacterSkillSelectionStrategy()
      case 'enemy':
        return new EnemySkillSelectionStrategy()
      default:
        return new DefaultSkillSelectionStrategy()
    }
  }

  /**
   * 创建威胁计算策略
   */
  public static createThreatStrategy(): IThreatCalculationStrategy {
    return new DefaultThreatCalculationStrategy()
  }

  /**
   * 创建战斗决策策略
   */
  public static createBattleDecisionStrategy(
    targetType: string = 'aggressive',
    skillType: string = 'default',
  ): IBattleDecisionStrategy {
    const targetStrategy = this.createTargetStrategy(targetType)
    const skillStrategy = this.createSkillStrategy(skillType)
    return new DefaultBattleDecisionStrategy(targetStrategy, skillStrategy)
  }
}
