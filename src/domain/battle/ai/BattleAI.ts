/**
 * 文件: BattleAI.ts
 * 功能: 战斗AI接口和实现 */

import type {
  BattleEntity,
  BattleAction,
  BattleState,
} from '@/domain/battle/type/types'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import {
  ParticipantSide,
  BattleActionHelper,
  BATTLE_CONSTANTS,
} from '@/domain/battle/type/types'
import { EffectType } from '@/domain/skill/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import type { SkillManager } from '@/domain/skill/SkillManager'
import {
  AIPriorityStrategy,
  AIPriorityStrategyFactory,
  AI_STRATEGY,
} from '@/domain/battle/ai/AIPriorityStrategy'
import {
  SkillConfig,
  Skill,
  SkillType,
  convertSkillConfigToSkill,
} from '@/domain/skill/types'
import type { BuffConfigLookup } from '@/domain/skill/types'

/** 战斗AI接口 */
export interface BattleAI {
  /** 设置上下文（Buff系统、技能管理器）*/
  setContext(buffSystem: BuffSystem, skillManager: SkillManager): void

  /** 做出战斗决策 */
  makeDecision(
    battleState: BattleState,
    participant: BattleEntity,
  ): BattleAction

  /** 选择攻击目标 */
  selectTarget(battleState: BattleState, participant: BattleEntity): string

  /** 判断是否应该使用技能 */
  shouldUseSkill(participant: BattleEntity): boolean

  /** 选择要使用的技能 */
  selectSkill(participant: BattleEntity): string | null

  /** 选择普通攻击 */
  selectAttack(participant: BattleEntity): BattleAction
}

/** 技能配置加载器接口 */
export type SkillConfigLoader = (skillIds: string[]) => Skill[]

/** 战场分析结果接口 */
export interface BattleAnalysis {
  allies: BattleEntity[]
  enemies: BattleEntity[]
  teamHealthPercent: number
  highestThreatEnemy: { enemy: BattleEntity | null; threat: number }
  needsHealing: boolean
  /** ponytail: BaseBattleAI 使用，AIPriorityStrategy 不计算此字段 */
  shouldUseSkill?: boolean
  /** ponytail: 是否有队友气血值低于重危阈值（用于治疗权重调整） */
  hasLowHealthAlly: boolean
}

/** 基础AI策略类 */
export class BaseBattleAI implements BattleAI {
  protected skills: Map<string, Skill> = new Map()
  protected skillConfigLoader?: SkillConfigLoader
  protected buffSystem?: BuffSystem
  protected skillManager?: SkillManager
  protected priorityStrategy: AIPriorityStrategy

  constructor(
    skillIds?: string[],
    strategyName: string = AI_STRATEGY.BALANCED,
  ) {
    this.priorityStrategy =
      AIPriorityStrategyFactory.createStrategy(strategyName)

    if (skillIds && skillIds.length > 0) {
      this.loadSkillsFromConfig(skillIds)
    } else {
      this.initializeSkills()
    }
  }

  /** 设置优先级策略 */
  public setPriorityStrategy(strategyName: string): void {
    this.priorityStrategy =
      AIPriorityStrategyFactory.createStrategy(strategyName)
  }

  /** 获取当前优先级策略 */
  public getPriorityStrategy(): AIPriorityStrategy {
    return this.priorityStrategy
  }

  /** 从外部配置加载技能 */
  protected loadSkillsFromConfig(skillIds: string[]): void {
    if (this.skillConfigLoader) {
      const loadedSkills = this.skillConfigLoader(skillIds)
      loadedSkills.forEach((skill: Skill) => {
        if (skill && skill.id) {
          this.skills.set(skill.id, skill)
        }
      })
    }
  }

  /** 设置鎶€鑳介厤缃姞杞藉櫒 */
  public setSkillConfigLoader(loader: SkillConfigLoader): void {
    this.skillConfigLoader = loader
  }

  /** 初始化技能（子类可重写） */
  protected initializeSkills(): void {}

  /** 做出战斗决策 */
  public makeDecision(
    battleState: BattleState,
    participant: BattleEntity,
  ): BattleAction {
    try {
      if (!battleState || !participant) {
        LoggerProvider.logger.addDebugLog('AI决策参数无效')
        return this.selectAttack(participant)
      }

      const battleAnalysis = this.analyzeBattleState(battleState, participant)
      if (battleAnalysis.shouldUseSkill) {
        const skillId = this.selectSkill(
          participant,
          battleState,
          battleAnalysis,
        )
        console.log(`${participant.name} chose skill`, skillId)
        if (skillId) {
          try {
            return this.createSkillStep(battleState, participant, skillId)
          } catch (skillError) {
            console.error('技能执行出错:', skillError)
            LoggerProvider.logger.addDebugLog('Skill execution error')
            return this.selectAttack(participant)
          }
        }
      }

      return this.selectAttack(participant)
    } catch (error) {
      LoggerProvider.logger.addDebugLog('AI决策出错')
      console.error('AI决策出错', error)
      try {
        return this.selectAttack(participant)
      } catch (attackError) {
        console.error('攻击执行出错:', attackError)
        LoggerProvider.logger.addDebugLog('攻击执行出错')
      }
    }

    return this.selectAttack(participant)
  }

  /** 分析战场状态 */
  protected analyzeBattleState(
    battleState: BattleState,
    participant: BattleEntity,
  ): BattleAnalysis {
    const allies = this.getAliveParticipants(battleState, participant.team)
    const enemies = this.getAliveParticipants(
      battleState,
      participant.team === ParticipantSide.ALLY
        ? ParticipantSide.ENEMY
        : ParticipantSide.ALLY,
    )

    const teamHealth = allies.reduce((sum, p) => sum + p.currentHealth, 0)
    const teamMaxHealth = allies.reduce((sum, p) => sum + p.maxHealth, 0)
    const teamHealthPercent = teamMaxHealth > 0 ? teamHealth / teamMaxHealth : 0

    // 判断是否应该使用技能：有可用技能且（能量充足或有治疗需求）
    const shouldUseSkill = this.shouldUseSkill(participant)

    // 计算最高威胁敌人（以攻击力衡量）
    const highestThreatEnemy = enemies.reduce<{
      enemy: BattleEntity | null
      threat: number
    }>(
      (max, enemy) => {
        const atk = enemy.getAttribute(ATTRIBUTE_CODE.attack)
        return atk > max.threat ? { enemy, threat: atk } : max
      },
      { enemy: null, threat: 0 },
    )

    return {
      allies,
      enemies,
      teamHealthPercent,
      highestThreatEnemy,
      needsHealing:
        teamHealthPercent < BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD,
      shouldUseSkill,
      hasLowHealthAlly: allies.some(
        (p) =>
          p.currentHealth / Math.max(p.maxHealth, 1) <
          BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD,
      ),
    }
  }

  /** 获取活着的参与者 */
  private getAliveParticipants(
    battleState: BattleState,
    team: ParticipantSide,
  ): BattleEntity[] {
    return Array.from(battleState.participants.values()).filter(
      (p) => p.team === team && p.isAlive(),
    )
  }

  /** 选择攻击目标 */
  public selectTarget(
    battleState: BattleState,
    participant: BattleEntity,
  ): string {
    const enemies = Array.from(battleState.participants.values()).filter(
      (p) => p.team !== participant.team && p.isAlive(),
    )

    if (enemies.length === 0) return ''

    // 嘲讽优先：通过标签检测（替换硬编码 buff_taunt）
    const taunters = enemies.filter(e => this.buffSystem?.hasBuffWithTag(e.id, 'taunt'))
    if (taunters.length > 0) return taunters[0].id

    // 选择血量最低的敌人
    const target = enemies.reduce((min, p) =>
      p.currentHealth < min.currentHealth ? p : min,
    )

    return target.id
  }

  /** 判断是否应该使用技能 */
  public shouldUseSkill(participant: BattleEntity): boolean {
    if (this.skills.size === 0) return false

    // ponytail: 加入概率检查，与非AI路径的 SKILL_USE_CHANCE 保持一致
    if (Math.random() >= BATTLE_CONSTANTS.SKILL_USE_CHANCE) return false

    // Check if any skill is available and has enough energy
    for (const skillId of this.skills.keys()) {
      const skill = this.skills.get(skillId)
      if (!skill) continue
      // ★ 被动技能由系统自动触发，不参与 AI 主动决策
      if (skill.type === SkillType.PASSIVE) continue
      if (participant.isSkillAvailable(skillId)) {
        const cost = skill.energyCost ?? 0
        if (participant.currentEnergy >= cost) {
          return true
        }
      }
    }

    return false
  }

  /** 选择要使用的技能 */
  public selectSkill(
    participant: BattleEntity,
    battleState?: BattleState,
    battleAnalysis?: BattleAnalysis,
  ): string | null {
    const availableSkills: Skill[] = []

    this.skills.forEach((skill) => {
      // ponytail: 跳过被动技能——被动由系统自动触发，不应出现在 AI 可选列表中
      if (skill.type === SkillType.PASSIVE) return
      if (
        participant.isSkillAvailable(skill.id) &&
        this.canUseSkill(skill, participant)
      ) {
        availableSkills.push(skill)
      }
    })

    if (availableSkills.length === 0) return null

    // Use priority strategy to select skill
    if (battleState && battleAnalysis) {
      const weights = this.priorityStrategy.calculateSkillWeights(
        battleState,
        participant,
        availableSkills,
      )
      if (weights.length > 0) {
        return weights[0].skillId
      }
    }

    // Fallback: select first available skill
    return availableSkills[0].id
  }

  /** 检查是否能使用技能 */
  private canUseSkill(skill: Skill, participant: BattleEntity): boolean {
    if (skill.energyCost && participant.currentEnergy < skill.energyCost) {
      return false
    }
    return true
  }

  /** Create skill action */
  protected createSkillStep(
    battleState: BattleState,
    participant: BattleEntity,
    skillId: string,
  ): BattleAction {
    const targetId = this.selectTarget(battleState, participant)
    const skill = this.skills.get(skillId)

    return BattleActionHelper.createSkill({
      sourceId: participant.id,
      targetId,
      skillId,
      damage: skill?.damage || 0,
      heal: skill?.heal || 0,
      turn: 0,
      effects: [
        {
          type: EffectType.SPECIAL,
          description: `${participant.name} uses skill`,
        },
      ],
    })
  }

  /** 选择普通攻击 */
  public selectAttack(participant: BattleEntity): BattleAction {
    return BattleActionHelper.createAttack({
      sourceId: participant.id,
      targetId: '',
      damage: participant.getRandomAttackDamage(),
      turn: 0,
      effects: [
        {
          type: EffectType.DAMAGE,
          value: participant.getRandomAttackDamage(),
          description: `${participant.name} normal attack`,
        },
      ],
    })
  }

  /** 设置上下文 */
  public setContext(buffSystem: BuffSystem, skillManager: SkillManager): void {
    this.buffSystem = buffSystem
    this.skillManager = skillManager
  }
}

/** AI工厂类 */
export class BattleAIFactory {
  /** 使用技能创建AI */
  static createAIWithSkills(
    side: ParticipantSide,
    skills: SkillConfig[],
    buffLookup?: BuffConfigLookup,
  ): BattleAI {
    const ai = new BaseBattleAI()
    skills.forEach((skillConfig) => {
      // ★ 被动技能不进入 AI 决策池，由 PassiveSkillManager 独立管理
      if (skillConfig.skillType === SkillType.PASSIVE) return
      const skill = convertSkillConfigToSkill(skillConfig, undefined, buffLookup)
      if (skill) {
        ai['skills'].set(skill.id, skill)
      }
    })
    return ai
  }
}
