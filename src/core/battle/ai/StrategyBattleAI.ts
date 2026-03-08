/**
 * 文件: StrategyBattleAI.ts
 * 功能: 策略模式AI实现
 * 描述: 采用策略模式，通过依赖注入方式注入决策策略，实现运行时动态替换
 */

import {
  type IBattleContext,
  type IBattleDecisionStrategy,
  type ITargetSelectionStrategy,
  type ISkillSelectionStrategy,
  type IThreatCalculationStrategy,
  type ParticipantSnapshot,
  BattleContext,
} from './StrategyInterfaces'
import {
  DefaultBattleDecisionStrategy,
  CharacterTargetStrategy,
  CharacterSkillSelectionStrategy,
  EnemyTargetStrategy,
  EnemySkillSelectionStrategy,
  type DefaultBattleDecisionStrategy as IDefaultBattleDecisionStrategy,
} from './DefaultStrategies'
import {
  type BattleAI as IBattleAI,
  type SkillConfigLoader,
} from '@/core/BattleAI'
import type { BattleParticipant, BattleState, BattleAction } from '@/types/battle'
import type { Skill } from '@/types/skill'
import type { SkillManager } from '@/core/skill/SkillManager'
import type { BuffSystem } from '@/core/BuffSystem'
import { ACTION_TYPES, EFFECT_TYPES, BATTLE_CONSTANTS } from '@/types/battle'

/**
 * 策略模式AI类
 * 支持运行时动态替换策略，实现决策逻辑与AI的解耦
 */
export class StrategyBattleAI implements IBattleAI {
  private skills: Map<string, Skill> = new Map()
  private skillConfigLoader?: SkillConfigLoader
  private buffSystem?: BuffSystem
  private skillManager?: SkillManager

  private battleDecisionStrategy: IBattleDecisionStrategy
  private targetStrategy: ITargetSelectionStrategy
  private skillStrategy: ISkillSelectionStrategy
  private threatStrategy: IThreatCalculationStrategy

  constructor(strategy?: IDefaultBattleDecisionStrategy) {
    this.battleDecisionStrategy = strategy || this.createDefaultStrategy()
    this.targetStrategy = (this.battleDecisionStrategy as any).targetStrategy
    this.skillStrategy = (this.battleDecisionStrategy as any).skillStrategy
    this.threatStrategy = (this.battleDecisionStrategy as any).threatStrategy
  }

  /**
   * 创建默认策略
   */
  private createDefaultStrategy(): IDefaultBattleDecisionStrategy {
    return new DefaultBattleDecisionStrategy()
  }

  /**
   * 设置战斗决策策略
   */
  public setBattleDecisionStrategy(strategy: IBattleDecisionStrategy): void {
    this.battleDecisionStrategy = strategy
    this.targetStrategy = (strategy as any).targetStrategy
    this.skillStrategy = (strategy as any).skillStrategy
    this.threatStrategy = (strategy as any).threatStrategy
  }

  /**
   * 设置目标选择策略
   */
  public setTargetStrategy(strategy: ITargetSelectionStrategy): void {
    this.targetStrategy = strategy
    if ((this.battleDecisionStrategy as any).targetStrategy) {
      (this.battleDecisionStrategy as any).targetStrategy = strategy
    }
  }

  /**
   * 设置技能选择策略
   */
  public setSkillStrategy(strategy: ISkillSelectionStrategy): void {
    this.skillStrategy = strategy
    if ((this.battleDecisionStrategy as any).skillStrategy) {
      (this.battleDecisionStrategy as any).skillStrategy = strategy
    }
  }

  /**
   * 设置威胁计算策略
   */
  public setThreatStrategy(strategy: IThreatCalculationStrategy): void {
    this.threatStrategy = strategy
    if ((this.battleDecisionStrategy as any).threatStrategy) {
      (this.battleDecisionStrategy as any).threatStrategy = strategy
    }
  }

  /**
   * 获取当前战斗决策策略
   */
  public getBattleDecisionStrategy(): IBattleDecisionStrategy {
    return this.battleDecisionStrategy
  }

  /**
   * 获取当前目标选择策略
   */
  public getTargetStrategy(): ITargetSelectionStrategy {
    return this.targetStrategy
  }

  /**
   * 获取当前技能选择策略
   */
  public getSkillStrategy(): ISkillSelectionStrategy {
    return this.skillStrategy
  }

  /**
   * 获取当前威胁计算策略
   */
  public getThreatStrategy(): IThreatCalculationStrategy {
    return this.threatStrategy
  }

  /**
   * 设置上下文
   */
  public setContext(buffSystem: BuffSystem, skillManager: SkillManager): void {
    this.buffSystem = buffSystem
    this.skillManager = skillManager
  }

  /**
   * 做出战斗决策
   */
  public makeDecision(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAction {
    const context = new BattleContext(battleState)
    const participantSnapshot = context.getParticipant(participant.id)

    if (!participantSnapshot) {
      return this.createFallbackAction(participant)
    }

    try {
      const action = this.battleDecisionStrategy.makeDecision(
        context,
        participantSnapshot,
        this.skills,
      )
      return action
    } catch (error) {
      console.error('AI决策出错:', error)
      return this.createFallbackAction(participant, context, participantSnapshot)
    }
  }

  /**
   * 选择攻击目标
   */
  public selectTarget(
    battleState: BattleState,
    participant: BattleParticipant,
  ): string {
    const context = new BattleContext(battleState)
    const participantSnapshot = context.getParticipant(participant.id)

    if (!participantSnapshot) {
      throw new Error('Participant not found')
    }

    return this.targetStrategy.selectTarget(context, participantSnapshot)
  }

  /**
   * 判断是否应该使用技能
   */
  public shouldUseSkill(participant: BattleParticipant): boolean {
    const context = new BattleContext({
      battleId: '',
      participants: new Map([[participant.id, participant]]),
      actions: [],
      turnOrder: [],
      currentTurn: 0,
      isActive: false,
      startTime: 0,
    })

    const participantSnapshot = context.getParticipant(participant.id)
    if (!participantSnapshot) {
      return false
    }

    return this.skillStrategy.shouldUseSkill(context, participantSnapshot)
  }

  /**
   * 选择要使用的技能
   */
  public selectSkill(participant: BattleParticipant): string | null {
    const context = new BattleContext({
      battleId: '',
      participants: new Map([[participant.id, participant]]),
      actions: [],
      turnOrder: [],
      currentTurn: 0,
      isActive: false,
      startTime: 0,
    })

    const participantSnapshot = context.getParticipant(participant.id)
    if (!participantSnapshot) {
      return null
    }

    return this.skillStrategy.selectSkill(context, participantSnapshot)
  }

  /**
   * 选择普通攻击
   */
  public selectAttack(participant: BattleParticipant): BattleAction {
    const targetId = participant.id

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

  /**
   * 创建回退动作
   */
  private createFallbackAction(
    participant: BattleParticipant,
    context?: BattleContext,
    participantSnapshot?: ParticipantSnapshot,
  ): BattleAction {
    if (context && participantSnapshot) {
      try {
        const targetId = this.targetStrategy.selectTarget(context, participantSnapshot)
        return {
          id: `fallback_${Date.now()}`,
          type: ACTION_TYPES.ATTACK,
          sourceId: participant.id,
          targetId,
          damage: BATTLE_CONSTANTS.DEFAULT_SKILL_DAMAGE,
          success: true,
          timestamp: Date.now(),
          effects: [
            {
              type: EFFECT_TYPES.DAMAGE,
              value: BATTLE_CONSTANTS.DEFAULT_SKILL_DAMAGE,
              description: '默认攻击',
            },
          ],
        }
      } catch {
        return this.selectAttack(participant)
      }
    }

    return {
      id: `fallback_${Date.now()}`,
      type: ACTION_TYPES.ATTACK,
      sourceId: participant?.id || 'unknown',
      targetId: 'unknown',
      damage: BATTLE_CONSTANTS.DEFAULT_SKILL_DAMAGE,
      success: true,
      timestamp: Date.now(),
      effects: [
        {
          type: EFFECT_TYPES.DAMAGE,
          value: BATTLE_CONSTANTS.DEFAULT_SKILL_DAMAGE,
          description: '默认攻击',
        },
      ],
    }
  }

  /**
   * 从外部配置加载技能
   */
  protected loadSkillsFromConfig(skillIds: string[]): void {
    if (this.skillConfigLoader) {
      const loadedSkills = this.skillConfigLoader(skillIds)
      loadedSkills.forEach((skill: any) => {
        if (skill && skill.id) {
          this.skills.set(skill.id, skill)
        }
      })
    }
  }

  /**
   * 设置技能配置加载器
   */
  public setSkillConfigLoader(loader: SkillConfigLoader): void {
    this.skillConfigLoader = loader
  }

  /**
   * 添加技能
   */
  public addSkill(skill: Skill): void {
    this.skills.set(skill.id, skill)
  }

  /**
   * 获取技能
   */
  public getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId)
  }

  /**
   * 获取所有技能
   */
  public getSkills(): Skill[] {
    return Array.from(this.skills.values())
  }

  /**
   * 检查是否可以使用技能
   */
  protected canUseSkill(participant: BattleParticipant): boolean {
    if (this.buffSystem) {
      return this.buffSystem.canUseSkill(participant.id)
    }
    return true
  }
}

/**
 * 角色专用策略AI
 */
export class CharacterStrategyAI extends StrategyBattleAI {
  constructor() {
    const targetStrategy = new CharacterTargetStrategy()
    const skillStrategy = new CharacterSkillSelectionStrategy()
    const strategy = new DefaultBattleDecisionStrategy(targetStrategy, skillStrategy)
    super(strategy)
  }
}

/**
 * 敌人专用策略AI
 */
export class EnemyStrategyAI extends StrategyBattleAI {
  constructor() {
    const targetStrategy = new EnemyTargetStrategy()
    const skillStrategy = new EnemySkillSelectionStrategy()
    const strategy = new DefaultBattleDecisionStrategy(targetStrategy, skillStrategy)
    super(strategy)
  }
}

/**
 * 策略AI工厂类
 */
export class StrategyAIFactory {
  /**
   * 创建策略AI实例
   */
  public static createStrategyAI(
    type: 'ally' | 'enemy',
    strategy?: IBattleDecisionStrategy,
  ): StrategyBattleAI {
    if (type === 'ally') {
      return new CharacterStrategyAI()
    }
    return new EnemyStrategyAI()
  }

  /**
   * 创建带技能的策略AI实例
   */
  public static createStrategyAIWithSkills(
    type: 'ally' | 'enemy',
    skills: Skill[],
  ): StrategyBattleAI {
    const ai = this.createStrategyAI(type)
    skills.forEach((skill) => ai.addSkill(skill))
    return ai
  }
}
