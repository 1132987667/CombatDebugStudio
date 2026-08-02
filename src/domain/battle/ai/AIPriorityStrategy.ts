/**
 * 文件: AIPriorityStrategy.ts
 * 创建日期: 2026-02-19
 * 作者: CombatDebugStudio
 * 功能: AI优先级策略
 * 描述: 根据角色类型和战场分析结果计算技能权重，支持动态调整技能优先级
 */

import type { BattleState, BattleEntity } from '@/domain/battle/type/types'
import type { Skill } from '@/domain/skill/types'
import { BattleAnalysis } from '@/domain/battle/ai/BattleAI'
import { BATTLE_CONSTANTS } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { SkillType } from '@/domain/skill/types'
/**
 * 权重贡献项（数值化 breakdown，文档 §4.3）
 * 每个 label 对应一条权重调整规则，value 为该规则贡献的数值（可为负）
 */
export interface WeightBreakdownItem {
  label: string
  value: number
}

/** 权重计算结果（数值 + 贡献项列表） */
interface WeightDetail {
  value: number
  items: WeightBreakdownItem[]
}

/**
 * 技能权重接口
 */
export interface SkillWeight {
  skillId: string
  weight: number
  reason: string
  /** 数值化贡献项 — 逐项 label + value，供 AI_DECISION payload 与验收故事 B 取证 */
  breakdown: WeightBreakdownItem[]
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
    participant: BattleEntity,
    skills: Skill[],
  ): SkillWeight[]

  /**
   * ponytail: P0/AI-1 — 从可用技能中选出最优的一个
   */
  selectBestSkill(
    skills: Skill[],
    participant: BattleEntity,
    battleState: BattleState,
  ): string | null

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
    participant: BattleEntity,
    skills: Skill[],
  ): SkillWeight[] {
    const weights: SkillWeight[] = []

    // 分析战场形势
    const battleAnalysis = this.analyzeBattleState(battleState, participant)

    // 计算每个技能的权重
    for (const skill of skills) {
      const base = this.getBaseWeightDetail(skill)
      const battle = this.adjustWeightByBattleStateDetail(skill, battleAnalysis)
      const participantAdj = this.adjustWeightByParticipantStateDetail(
        skill,
        participant,
      )

      const breakdown: WeightBreakdownItem[] = [
        ...base.items,
        ...battle.items,
        ...participantAdj.items,
      ]
      const weight = Math.max(0, base.value + battle.value + participantAdj.value)
      const reason =
        breakdown
          .map((i) => `${i.label}${i.value >= 0 ? '+' : ''}${i.value}`)
          .join(' + ') || '无调整'

      weights.push({ skillId: skill.id, weight, reason, breakdown })
    }

    // 按权重排序
    return weights.sort((a, b) => b.weight - a.weight)
  }

  /**
   * ponytail: P0/AI-1 — 从可用技能中选出最优的一个
   */
  public selectBestSkill(
    skills: Skill[],
    participant: BattleEntity,
    battleState: BattleState,
  ): string | null {
    if (skills.length === 0) return null
    const weights = this.calculateSkillWeights(battleState, participant, skills)
    if (weights.length > 0 && weights[0].weight > 0) {
      return weights[0].skillId
    }
    return skills[0].id
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
    participant: BattleEntity,
  ): BattleAnalysis {
    const allies = Array.from(battleState.participants.values()).filter(
      (p) => p.team === participant.team && p.isAlive(),
    )

    const enemies = Array.from(battleState.participants.values()).filter(
      (p) => p.team !== participant.team && p.isAlive(),
    )

    const teamHealth = allies.reduce(
      (sum, p) => sum + p.getAttribute(ATTRIBUTE_CODE.currentHealth),
      0,
    )
    const teamMaxHealth = allies.reduce(
      (sum, p) => sum + p.getAttribute(ATTRIBUTE_CODE.maxHealth),
      0,
    )
    const teamHealthPercent = teamMaxHealth > 0 ? teamHealth / teamMaxHealth : 0

    const highestThreatEnemy = enemies.reduce<{
      enemy: BattleEntity | null
      threat: number
    }>(
      (max, enemy) => {
        const threat = this.calculateEnemyThreat(
          enemy,
          participant,
          battleState,
        )
        return threat > max.threat ? { enemy, threat } : max
      },
      { enemy: null, threat: 0 },
    )

    const needsHealing = allies.some(
      (p) =>
        p.getAttribute(ATTRIBUTE_CODE.currentHealth) /
          p.getAttribute(ATTRIBUTE_CODE.maxHealth) <
        BATTLE_CONSTANTS.HEAL_THRESHOLD,
    )
    const hasLowHealthAlly = allies.some(
      (p) =>
        p.getAttribute(ATTRIBUTE_CODE.currentHealth) /
          p.getAttribute(ATTRIBUTE_CODE.maxHealth) <
        BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD,
    )

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
    enemy: BattleEntity,
    participant: BattleEntity,
    battleState: BattleState,
  ): number {
    let threat = 0

    const healthPercent =
      enemy.getAttribute(ATTRIBUTE_CODE.currentHealth) /
      enemy.getAttribute(ATTRIBUTE_CODE.maxHealth)
    threat += (1 - healthPercent) * BATTLE_CONSTANTS.THREAT_HEALTH_WEIGHT

    const energyPercent =
      enemy.getAttribute(ATTRIBUTE_CODE.currentEnergy) /
      enemy.getAttribute(ATTRIBUTE_CODE.maxEnergy)
    threat += energyPercent * BATTLE_CONSTANTS.THREAT_ENERGY_WEIGHT

    if (enemy.getBuffInstanceIds().length > 0) {
      threat +=
        enemy.getBuffInstanceIds().length * BATTLE_CONSTANTS.THREAT_BUFF_WEIGHT
    }

    return threat
  }

  /**
   * 获取基础权重（数值化贡献项）
   */
  protected getBaseWeightDetail(skill: Skill): WeightDetail {
    const items: WeightBreakdownItem[] = [{ label: '基础', value: 50 }]
    let value = 50

    // 根据技能类型调整
    switch (skill.type) {
      case SkillType.ULTIMATE:
        value += 30
        items.push({ label: '终结技', value: 30 })
        break
      case SkillType.SMALL:
        value += 10
        items.push({ label: '小技能', value: 10 })
        break
      case SkillType.PASSIVE:
        value = 0 // 被动技能不主动使用
        items.length = 0
        items.push({ label: '被动', value: 0 })
        break
    }

    return { value, items }
  }

  /**
   * 根据战场形势调整权重（数值化贡献项）
   */
  protected adjustWeightByBattleStateDetail(
    skill: Skill,
    battleAnalysis: BattleAnalysis,
  ): WeightDetail {
    const items: WeightBreakdownItem[] = []
    let adjustment = 0

    // 治疗技能调整
    if (skill.heal && skill.heal > 0) {
      if (battleAnalysis.hasLowHealthAlly) {
        adjustment += 40
        items.push({ label: '低血量队友', value: 40 })
      } else if (battleAnalysis.needsHealing) {
        adjustment += 20
        items.push({ label: '队友需治疗', value: 20 })
      }
    }

    // 伤害技能调整
    if (skill.damage && skill.damage > 0) {
      if (
        battleAnalysis.highestThreatEnemy.threat >
        BATTLE_CONSTANTS.SKILL_SELECTION_THREAT_THRESHOLD
      ) {
        adjustment += 30
        items.push({ label: '高威胁目标', value: 30 })
      }
    }

    // ponytail: P0/AI-2 — Buff/Debuff 技能权重调整
    if (skill.hasBuff) {
      // 有高威胁敌人时，增益技能更有价值
      if (battleAnalysis.highestThreatEnemy.threat > 0) {
        adjustment += 15
        items.push({ label: '增益对抗', value: 15 })
      }
    }
    if (skill.hasDebuff) {
      // 有高威胁敌人时，减益技能更有价值
      if (
        battleAnalysis.highestThreatEnemy.threat >
        BATTLE_CONSTANTS.SKILL_SELECTION_THREAT_THRESHOLD
      ) {
        adjustment += 20
        items.push({ label: '减益对抗', value: 20 })
      }
    }

    return { value: adjustment, items }
  }

  /**
   * 根据角色状态调整权重（数值化贡献项）
   */
  protected adjustWeightByParticipantStateDetail(
    skill: Skill,
    participant: BattleEntity,
  ): WeightDetail {
    const items: WeightBreakdownItem[] = []
    let adjustment = 0
    const healthPercent =
      participant.getAttribute(ATTRIBUTE_CODE.currentHealth) /
      participant.getAttribute(ATTRIBUTE_CODE.maxHealth)
    const energyPercent =
      participant.getAttribute(ATTRIBUTE_CODE.currentEnergy) /
      participant.getAttribute(ATTRIBUTE_CODE.maxEnergy)

    // 能量不足时降低技能权重
    if (
      skill.energyCost &&
      energyPercent <
        skill.energyCost / participant.getAttribute(ATTRIBUTE_CODE.maxEnergy)
    ) {
      adjustment -= 50
      items.push({ label: '能量不足', value: -50 })
    }

    // 气血值过低时优先使用治疗技能
    if (
      skill.heal &&
      skill.heal > 0 &&
      healthPercent < BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD
    ) {
      adjustment += 30
      items.push({ label: '自身低血', value: 30 })
    }

    return { value: adjustment, items }
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
   * 获取基础权重（数值化贡献项）
   */
  protected getBaseWeightDetail(skill: Skill): WeightDetail {
    const base = super.getBaseWeightDetail(skill)

    // 增加伤害技能的权重
    if (skill.damage && skill.damage > 0) {
      return {
        value: base.value + 20,
        items: [...base.items, { label: '攻击加成', value: 20 }],
      }
    }

    return base
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
   * 获取基础权重（数值化贡献项）
   */
  protected getBaseWeightDetail(skill: Skill): WeightDetail {
    const base = super.getBaseWeightDetail(skill)

    // 增加治疗技能的权重
    if (skill.heal && skill.heal > 0) {
      return {
        value: base.value + 30,
        items: [...base.items, { label: '治疗加成', value: 30 }],
      }
    }

    return base
  }

  /**
   * 根据角色状态调整权重（数值化贡献项）
   */
  protected adjustWeightByParticipantStateDetail(
    skill: Skill,
    participant: BattleEntity,
  ): WeightDetail {
    const base = super.adjustWeightByParticipantStateDetail(skill, participant)

    const healthPercent =
      participant.getAttribute(ATTRIBUTE_CODE.currentHealth) /
      participant.getAttribute(ATTRIBUTE_CODE.maxHealth)

    // 气血值越低，治疗技能权重越高
    if (skill.heal && skill.heal > 0 && healthPercent < 0.5) {
      const value = (0.5 - healthPercent) * 100
      return {
        value: base.value + value,
        items: [...base.items, { label: '低气血治疗', value }],
      }
    }

    return base
  }
}

/**
 * 均衡优先级策略
 * 平衡伤害和治疗
 */
export class BalancedAIPriorityStrategy extends BaseAIPriorityStrategy {
  public getName(): string {
    return 'BalancedAIPriorityStrategy'
  }
}

/**
 * AI 策略名称常量
 */
export const AI_STRATEGY = {
  AGGRESSIVE: 'aggressive',
  DEFENSIVE: 'defensive',
  BALANCED: 'balanced',
} as const

export type AI_STRATEGY = (typeof AI_STRATEGY)[keyof typeof AI_STRATEGY]

/**
 * AI优先级策略工厂
 */
export class AIPriorityStrategyFactory {
  /**
   * 创建策略实例
   */
  public static createStrategy(strategyName: string): AIPriorityStrategy {
    switch (strategyName.toLowerCase()) {
      case AI_STRATEGY.AGGRESSIVE:
        return new AggressiveAIPriorityStrategy()
      case AI_STRATEGY.DEFENSIVE:
        return new DefensiveAIPriorityStrategy()
      case AI_STRATEGY.BALANCED:
      default:
        return new BalancedAIPriorityStrategy()
    }
  }
}
