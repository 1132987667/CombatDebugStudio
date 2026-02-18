/**
 * 文件: AIPriorityStrategy.ts
 * 创建日期: 2026-02-19
 * 作者: CombatDebugStudio
 * 功能: AI优先级策略
 * 描述: 根据角色类型和战场分析结果计算技能权重，支持动态调整技能优先级
 */

import type { BattleState, BattleParticipant } from '@/types/battle'
import type { Skill } from '@/core/BattleAI'
import { BATTLE_CONSTANTS } from '@/types/battle'

/**
 * 技能权重接口
 */
export interface SkillWeight {
  skillId: string
  weight: number
  reason: string
}

/**
 * AI优先级策略接口
 */
export interface AIPriorityStrategy {
  /**
   * 计算技能权重
   */
  calculateSkillWeights(
    battleState: BattleState,
    participant: BattleParticipant,
    skills: Skill[],
  ): SkillWeight[]

  /**
   * 获取策略名称
   */
  getName(): string
}

/**
 * 基础优先级策略类
 * 提供通用的技能权重计算逻辑
 */
export class BaseAIPriorityStrategy implements AIPriorityStrategy {
  /**
   * 计算技能权重
   */
  public calculateSkillWeights(
    battleState: BattleState,
    participant: BattleParticipant,
    skills: Skill[],
  ): SkillWeight[] {
    const weights: SkillWeight[] = []
    
    // 分析战场形势
    const battleAnalysis = this.analyzeBattleState(battleState, participant)
    
    // 计算每个技能的权重
    for (const skill of skills) {
      let weight = 0
      let reason = ''
      
      // 基础权重
      weight += this.getBaseWeight(skill)
      reason += '基础权重'
      
      // 根据战场形势调整权重
      weight += this.adjustWeightByBattleState(skill, battleAnalysis)
      reason += ', 战场形势调整'
      
      // 根据角色状态调整权重
      weight += this.adjustWeightByParticipantState(skill, participant)
      reason += ', 角色状态调整'
      
      // 确保权重为正数
      weight = Math.max(0, weight)
      
      weights.push({ skillId: skill.id, weight, reason })
    }
    
    // 按权重排序
    return weights.sort((a, b) => b.weight - a.weight)
  }

  /**
   * 获取策略名称
   */
  public getName(): string {
    return 'BaseAIPriorityStrategy'
  }

  /**
   * 分析战场状态
   */
  protected analyzeBattleState(
    battleState: BattleState,
    participant: BattleParticipant,
  ): any {
    const allies = Array.from(battleState.participants.values()).filter(
      (p) => p.type === participant.type && p.isAlive(),
    )

    const enemies = Array.from(battleState.participants.values()).filter(
      (p) => p.type !== participant.type && p.isAlive(),
    )

    const teamHealth = allies.reduce((sum, p) => sum + p.currentHealth, 0)
    const teamMaxHealth = allies.reduce((sum, p) => sum + p.maxHealth, 0)
    const teamHealthPercent = teamMaxHealth > 0 ? teamHealth / teamMaxHealth : 0

    const highestThreatEnemy = enemies.reduce<{ enemy: BattleParticipant | null; threat: number }>(
      (max, enemy) => {
        const threat = this.calculateEnemyThreat(enemy, participant, battleState)
        return threat > max.threat ? { enemy, threat } : max
      },
      { enemy: null, threat: 0 },
    )

    const needsHealing = allies.some((p) => p.currentHealth / p.maxHealth < BATTLE_CONSTANTS.HEAL_THRESHOLD)
    const hasLowHealthAlly = allies.some((p) => p.currentHealth / p.maxHealth < BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD)

    return {
      allies,
      enemies,
      teamHealthPercent,
      highestThreatEnemy,
      needsHealing,
      hasLowHealthAlly,
    }
  }

  /**
   * 计算敌人威胁值
   */
  protected calculateEnemyThreat(
    enemy: BattleParticipant,
    participant: BattleParticipant,
    battleState: BattleState,
  ): number {
    let threat = 0

    const healthPercent = enemy.currentHealth / enemy.maxHealth
    threat += (1 - healthPercent) * BATTLE_CONSTANTS.THREAT_HEALTH_WEIGHT

    const energyPercent = enemy.currentEnergy / enemy.maxEnergy
    threat += energyPercent * BATTLE_CONSTANTS.THREAT_ENERGY_WEIGHT

    if (enemy.buffs.length > 0) {
      threat += enemy.buffs.length * BATTLE_CONSTANTS.THREAT_BUFF_WEIGHT
    }

    return threat
  }

  /**
   * 获取基础权重
   */
  protected getBaseWeight(skill: Skill): number {
    let weight = 50 // 基础权重
    
    // 根据技能类型调整
    switch (skill.type) {
      case 'ultimate':
        weight += 30
        break
      case 'small':
        weight += 10
        break
      case 'passive':
        weight = 0 // 被动技能不主动使用
        break
    }
    
    return weight
  }

  /**
   * 根据战场形势调整权重
   */
  protected adjustWeightByBattleState(skill: Skill, battleAnalysis: any): number {
    let adjustment = 0
    
    // 治疗技能调整
    if (skill.heal && skill.heal > 0) {
      if (battleAnalysis.hasLowHealthAlly) {
        adjustment += 40
      } else if (battleAnalysis.needsHealing) {
        adjustment += 20
      }
    }
    
    // 伤害技能调整
    if (skill.damage && skill.damage > 0) {
      if (battleAnalysis.highestThreatEnemy.threat > BATTLE_CONSTANTS.SKILL_SELECTION_THREAT_THRESHOLD) {
        adjustment += 30
      }
    }
    
    return adjustment
  }

  /**
   * 根据角色状态调整权重
   */
  protected adjustWeightByParticipantState(skill: Skill, participant: BattleParticipant): number {
    let adjustment = 0
    
    const healthPercent = participant.currentHealth / participant.maxHealth
    const energyPercent = participant.currentEnergy / participant.maxEnergy
    
    // 能量不足时降低技能权重
    if (skill.energyCost && energyPercent < skill.energyCost / participant.maxEnergy) {
      adjustment -= 50
    }
    
    // 生命值过低时优先使用治疗技能
    if (skill.heal && skill.heal > 0 && healthPercent < BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD) {
      adjustment += 30
    }
    
    return adjustment
  }
}

/**
 * 攻击性优先级策略
 * 优先考虑伤害输出
 */
export class AggressiveAIPriorityStrategy extends BaseAIPriorityStrategy {
  /**
   * 获取策略名称
   */
  public getName(): string {
    return 'AggressiveAIPriorityStrategy'
  }

  /**
   * 获取基础权重
   */
  protected getBaseWeight(skill: Skill): number {
    let weight = super.getBaseWeight(skill)
    
    // 增加伤害技能的权重
    if (skill.damage && skill.damage > 0) {
      weight += 20
    }
    
    return weight
  }
}

/**
 * 防御性优先级策略
 * 优先考虑生存和治疗
 */
export class DefensiveAIPriorityStrategy extends BaseAIPriorityStrategy {
  /**
   * 获取策略名称
   */
  public getName(): string {
    return 'DefensiveAIPriorityStrategy'
  }

  /**
   * 获取基础权重
   */
  protected getBaseWeight(skill: Skill): number {
    let weight = super.getBaseWeight(skill)
    
    // 增加治疗技能的权重
    if (skill.heal && skill.heal > 0) {
      weight += 30
    }
    
    return weight
  }

  /**
   * 根据角色状态调整权重
   */
  protected adjustWeightByParticipantState(skill: Skill, participant: BattleParticipant): number {
    let adjustment = super.adjustWeightByParticipantState(skill, participant)
    
    const healthPercent = participant.currentHealth / participant.maxHealth
    
    // 生命值越低，治疗技能权重越高
    if (skill.heal && skill.heal > 0 && healthPercent < 0.5) {
      adjustment += (0.5 - healthPercent) * 100
    }
    
    return adjustment
  }
}

/**
 * 均衡优先级策略
 * 平衡伤害和治疗
 */
export class BalancedAIPriorityStrategy extends BaseAIPriorityStrategy {
  /**
   * 获取策略名称
   */
  public getName(): string {
    return 'BalancedAIPriorityStrategy'
  }
}

/**
 * AI优先级策略工厂
 */
export class AIPriorityStrategyFactory {
  /**
   * 创建策略实例
   */
  public static createStrategy(strategyName: string): AIPriorityStrategy {
    switch (strategyName.toLowerCase()) {
      case 'aggressive':
        return new AggressiveAIPriorityStrategy()
      case 'defensive':
        return new DefensiveAIPriorityStrategy()
      case 'balanced':
      default:
        return new BalancedAIPriorityStrategy()
    }
  }
}
