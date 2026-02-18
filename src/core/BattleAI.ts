/**
 * 文件: BattleAI.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 战斗AI接口和实现
 * 描述: 定义战斗AI的核心行为和决策方法，包括决策制定、目标选择、技能使用等，提供多种AI策略实现
 * 版本: 1.0.0
 */

import type {
  BattleParticipant,
  BattleAction,
  BattleState,
  ParticipantSide,

} from '@/types/battle'
import {
  PARTICIPANT_SIDE, 
  BATTLE_CONSTANTS,
  SKILL_CONSTANTS,
  SKILL_EFFECT_CONSTANTS,
  ACTION_TYPES,
  EFFECT_TYPES,
} from '@/types/battle'
import { battleLogManager } from '@/utils/logging'

/**
 * 战斗AI接口
 * 定义了AI在战斗中的核心行为和决策方法
 * 所有AI实现都必须遵循此接口规范
 */
import type { BuffSystem } from '@/core/BuffSystem'
import type { SkillManager } from '@/core/skill/SkillManager'
import { AIPriorityStrategy, AIPriorityStrategyFactory } from '@/core/battle/AIPriorityStrategy'

export interface BattleAI {
  /**
   * 设置上下文
   */
  setContext(buffSystem: BuffSystem, skillManager: SkillManager): void

  /**
   * 做出战斗决策
   */
  makeDecision(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAction

  /**
   * 选择目标
   */
  selectTarget(battleState: BattleState, participant: BattleParticipant): string

  /**
   * 检查是否应该使用技能
   */
  shouldUseSkill(participant: BattleParticipant): boolean

  /**
   * 选择技能
   */
  selectSkill(participant: BattleParticipant): string | null

  /**
   * 选择攻击
   */
  selectAttack(participant: BattleParticipant): BattleAction
}

/**
 * 技能类型枚举
 * 定义了游戏中技能的不同类型
 */
export enum SkillType {
  /** 被动技能 */
  PASSIVE = 'passive',
  /** 小技能 */
  SMALL = 'small',
  /** 终极技能（大招） */
  ULTIMATE = 'ultimate',
}

/**
 * 技能定义接口
 * 描述了技能的基本属性和效果
 */
export interface Skill {
  /** 技能唯一标识符 */
  id: string
  /** 技能名称 */
  name: string
  /** 技能类型 */
  type: SkillType
  /** 技能能量消耗 */
  energyCost: number
  /** 技能冷却时间（毫秒） */
  cooldown: number
  /** 技能上次使用时间戳 */
  lastUsed: number
  /** 技能描述 */
  description: string
  /** 技能伤害值（可选） */
  damage?: number
  /** 技能治疗值（可选） */
  heal?: number
  /** 技能附加的buff ID（可选） */
  buffId?: string
}

/** 技能配置加载器类型 */
export type SkillConfigLoader = (skillIds: string[]) => Skill[]

/**
 * 战场分析结果接口
 * 包含AI分析战场态势后得出的关键信息
 */
interface BattleAnalysis {
  /** 友方单位列表 */
  allies: BattleParticipant[]
  /** 敌方单位列表 */
  enemies: BattleParticipant[]
  /** 团队血量百分比 */
  teamHealthPercent: number
  /** 最高威胁的敌人 */
  highestThreatEnemy: { enemy: BattleParticipant | null; threat: number }
  /** 是否需要治疗 */
  needsHealing: boolean
  /** 是否应该使用技能 */
  shouldUseSkill: boolean
}

/**
 * 基础AI策略类
 * 提供了AI的通用实现，作为具体AI实现的基类
 * 包含技能管理、战场分析、决策逻辑等核心功能
 */
export class BaseBattleAI implements BattleAI {
  /** 技能集合，以技能ID为键 */
  protected skills: Map<string, Skill> = new Map()
  /** 技能配置加载器（可选） */
  protected skillConfigLoader?: SkillConfigLoader
  /** Buff系统实例 */
  protected buffSystem?: BuffSystem
  /** 技能管理器实例 */
  protected skillManager?: SkillManager
  /** 优先级策略 */
  protected priorityStrategy: AIPriorityStrategy

  /**
   * 构造函数
   * 初始化AI实例并加载技能
   * @param skillIds - 可选的技能ID列表，用于从外部加载技能配置
   * @param strategyName - 可选的优先级策略名称
   */
  constructor(skillIds?: string[], strategyName: string = 'balanced') {
    // 初始化优先级策略
    this.priorityStrategy = AIPriorityStrategyFactory.createStrategy(strategyName)
    
    // 加载技能
    if (skillIds && skillIds.length > 0) {
      this.loadSkillsFromConfig(skillIds)
    } else {
      this.initializeSkills()
    }
  }

  /**
   * 设置优先级策略
   * @param strategyName 策略名称
   */
  public setPriorityStrategy(strategyName: string): void {
    this.priorityStrategy = AIPriorityStrategyFactory.createStrategy(strategyName)
  }

  /**
   * 获取当前优先级策略
   */
  public getPriorityStrategy(): AIPriorityStrategy {
    return this.priorityStrategy
  }

  /**
   * 从外部配置加载技能
   * @param skillIds - 技能ID列表
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
   * @param loader - 技能配置加载函数
   */
  public setSkillConfigLoader(loader: SkillConfigLoader): void {
    this.skillConfigLoader = loader
  }

  /**
   * 初始化技能
   * 子类应重写此方法添加特定技能
   * 如果已通过构造函数传入skillIds，则此方法不会自动调用
   */
  protected initializeSkills(): void {
    // 子类实现
  }

  public makeDecision(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAction {
    try {
      if (!battleState || !participant) {
        battleLogManager.addErrorLog('AI决策参数无效')
        return this.selectAttack(participant)
      }

      const battleAnalysis = this.analyzeBattleState(battleState, participant)

      if (battleAnalysis.shouldUseSkill) {
      const skillId = this.selectSkill(participant, battleState, battleAnalysis)
      if (skillId) {
        try {
          return this.createSkillStep(battleState, participant, skillId)
        } catch (skillError) {
          battleLogManager.addErrorLog('技能执行出错')
          return this.selectAttack(participant)
        }
      }
    }

      return this.selectAttack(participant)
    } catch (error) {
      battleLogManager.addErrorLog('AI决策出错')
      try {
        return this.selectAttack(participant)
      } catch (attackError) {
        battleLogManager.addErrorLog('攻击执行出错')
        return {
          id: `fallback_${Date.now()}`,
          type: ACTION_TYPES.ATTACK,
          sourceId: participant?.id || 'unknown',
          targetId: 'unknown',
          damage: SKILL_EFFECT_CONSTANTS.DEFAULT_SKILL_DAMAGE,
          success: true,
          timestamp: Date.now(),
          effects: [
            {
              type: EFFECT_TYPES.DAMAGE,
              value: SKILL_EFFECT_CONSTANTS.DEFAULT_SKILL_DAMAGE,
              description: '默认攻击',
            },
          ],
        }
      }
    }
  }

  protected analyzeBattleState(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAnalysis {
    const allies = Array.from(battleState.participants.values()).filter(
      (p) => p.type === participant.type && p.isAlive(),
    )

    const enemies = Array.from(battleState.participants.values()).filter(
      (p) => p.type !== participant.type && p.isAlive(),
    )

    const teamHealth = allies.reduce((sum, p) => sum + p.currentHealth, 0)
    const teamMaxHealth = allies.reduce((sum, p) => sum + p.maxHealth, 0)
    const teamHealthPercent = teamMaxHealth > 0 ? teamHealth / teamMaxHealth : 0

    const highestThreatEnemy = enemies.reduce<{
      enemy: BattleParticipant | null
      threat: number
    }>(
      (max, enemy) => {
        const threat = this.calculateThreat(enemy, participant, battleState)
        return threat > max.threat ? { enemy, threat } : max
      },
      { enemy: null, threat: 0 },
    )

    const needsHealing = allies.some((p) => p.currentHealth / p.maxHealth < BATTLE_CONSTANTS.HEAL_THRESHOLD)

    return {
      allies,
      enemies,
      teamHealthPercent,
      highestThreatEnemy,
      needsHealing,
      shouldUseSkill: this.shouldUseSkill(participant),
    }
  }

  public selectTarget(
    battleState: BattleState,
    _participant: BattleParticipant,
  ): string {
    const enemies = Array.from(battleState.participants.values())
      .filter((p) => p.type !== _participant.type && p.isAlive())
      .map((p) => p)

    if (enemies.length === 0) {
      throw new Error('No valid targets')
    }

    const targetsWithThreat = enemies.map((target) => ({
      target,
      threat: this.calculateThreat(target, _participant, battleState),
    }))

    targetsWithThreat.sort((a, b) => b.threat - a.threat)

    return targetsWithThreat[0].target.id
  }

  protected calculateThreat(
    target: BattleParticipant,
    participant: BattleParticipant,
    _battleState: BattleState,
  ): number {
    let threat = 0

    const healthPercent = target.currentHealth / target.maxHealth
    threat += (1 - healthPercent) * BATTLE_CONSTANTS.THREAT_HEALTH_WEIGHT

    const energyPercent = target.currentEnergy / target.maxEnergy
    threat += energyPercent * BATTLE_CONSTANTS.THREAT_ENERGY_WEIGHT

    if (target.type === PARTICIPANT_SIDE.ALLY && participant.type === PARTICIPANT_SIDE.ENEMY) {
      threat += BATTLE_CONSTANTS.THREAT_TYPE_WEIGHT
    }

    if (target.buffs.length > 0) {
      threat += target.buffs.length * BATTLE_CONSTANTS.THREAT_BUFF_WEIGHT
    }

    return threat
  }

  public shouldUseSkill(participant: BattleParticipant): boolean {
    const energy =
      participant.getAttribute('energy') || participant.currentEnergy || 0
    const maxEnergy =
      participant.getAttribute('max_energy') || participant.maxEnergy || BATTLE_CONSTANTS.DEFAULT_MAX_ENERGY
    return energy >= maxEnergy * BATTLE_CONSTANTS.AI_SKILL_ENERGY_THRESHOLD
  }

  public selectSkill(
    participant: BattleParticipant,
    battleState?: BattleState,
    analysis?: BattleAnalysis,
  ): string | null {
    // 检查是否可以使用技能
    if (!this.canUseSkill(participant)) {
      return null
    }

    // 优先使用参与者真实拥有的技能
    const participantSkills = participant.getSkills() || []
    
    // 过滤掉被动技能
    const availableSkills = participantSkills.filter(skillId => {
      return !skillId.includes('passive')
    })
    
    if (availableSkills.length > 0) {
      // 如果有battleState，使用优先级策略计算权重
      if (battleState) {
        // 构建技能对象列表
        const skills = availableSkills.map(skillId => ({
          id: skillId,
          name: skillId,
          type: 'small' as SkillType,
          energyCost: 0,
          cooldown: 0,
          lastUsed: 0,
          description: '',
        }))
        
        // 计算技能权重
        const skillWeights = this.priorityStrategy.calculateSkillWeights(
          battleState,
          participant,
          skills
        )
        
        // 选择权重最高的技能
        if (skillWeights.length > 0) {
          return skillWeights[0].skillId
        }
      }
      
      // 回退：从可用技能中选择第一个
      return availableSkills[0]
    }
    
    // 如果没有真实技能，回退到AI内部技能
    const allSkills = Array.from(this.skills.values())
    const skills = allSkills.filter((s) => s.type !== SkillType.PASSIVE)
    if (skills.length === 0) {
      return null
    }

    // 使用优先级策略计算权重
    if (battleState) {
      const skillWeights = this.priorityStrategy.calculateSkillWeights(
        battleState,
        participant,
        skills
      )
      
      // 选择权重最高的技能
      if (skillWeights.length > 0) {
        return skillWeights[0].skillId
      }
    }

    // 回退：使用原来的逻辑
    if (analysis) {
      if (analysis.needsHealing) {
        const healSkill = skills.find((s) => s.heal && s.heal > 0)
        if (healSkill) {
          return healSkill.id
        }
      }

      if (analysis.highestThreatEnemy.threat > BATTLE_CONSTANTS.SKILL_SELECTION_THREAT_THRESHOLD) {
        const damageSkill = skills.find((s) => s.damage && s.damage > 0)
        if (damageSkill) {
          return damageSkill.id
        }
      }
    }

    const smallSkill = skills.find((s) => s.type === SkillType.SMALL)
    if (smallSkill) {
      return smallSkill.id
    }

    const ultimateSkill = skills.find((s) => s.type === SkillType.ULTIMATE)
    if (ultimateSkill) {
      return ultimateSkill.id
    }

    return null
  }

  public selectAttack(participant: BattleParticipant): BattleAction {
    return {
      id: `attack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: ACTION_TYPES.ATTACK,
      sourceId: participant.id,
      targetId: '',
      damage: Math.floor(Math.random() * (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX - BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN)) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN,
      success: true,
      timestamp: Date.now(),
      effects: [
        {
          type: EFFECT_TYPES.DAMAGE,
          value: Math.floor(Math.random() * (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX - BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN)) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN,
          description: `${participant.name} 普通攻击`,
        },
      ],
    }
  }

  protected selectHealTarget(
    battleState: BattleState,
    participant: BattleParticipant,
  ): string {
    const allies: { target: BattleParticipant; healthPercent: number }[] = []

    battleState.participants.forEach((target) => {
      if (target.type === participant.type && target.isAlive()) {
        const healthPercent = target.currentHealth / target.maxHealth
        allies.push({ target, healthPercent })
      }
    })

    allies.sort((a, b) => a.healthPercent - b.healthPercent)

    return allies.length > 0 ? allies[0].target.id : participant.id
  }

  protected createSkillStep(
    battleState: BattleState,
    participant: BattleParticipant,
    skillId: string,
  ): BattleAction {
    const skill = this.skills.get(skillId)

    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`)
    }

    let targetId = ''
    if (skill.heal) {
      targetId = this.selectHealTarget(battleState, participant)
    } else {
      targetId = this.selectTarget(battleState, participant)
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

  public addSkill(skill: Skill): void {
    this.skills.set(skill.id, skill)
  }

  public getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId)
  }

  public getSkills(): Skill[] {
    return Array.from(this.skills.values())
  }

  /**
   * 设置上下文
   */
  public setContext(buffSystem: BuffSystem, skillManager: SkillManager): void {
    this.buffSystem = buffSystem
    this.skillManager = skillManager
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
 * 角色AI类
 * 为玩家角色提供特定的AI行为
 */
export class CharacterAI extends BaseBattleAI {
  /**
   * 构造函数
   * @param skillIds 技能ID列表
   * @param strategyName 优先级策略名称
   */
  constructor(skillIds?: string[], strategyName: string = 'balanced') {
    super(skillIds, strategyName)
  }

  protected initializeSkills(): void {
    this.addSkill({
      id: 'skill_heal',
      name: '治疗术',
      type: SkillType.SMALL,
      energyCost: SKILL_CONSTANTS.HEAL_SKILL_ENERGY,
      cooldown: SKILL_CONSTANTS.HEAL_SKILL_COOLDOWN,
      lastUsed: 0,
      description: '恢复生命值',
      heal: SKILL_EFFECT_CONSTANTS.HEAL_SKILL_HEAL,
    })

    this.addSkill({
      id: 'skill_attack',
      name: '强力攻击',
      type: SkillType.SMALL,
      energyCost: SKILL_CONSTANTS.ATTACK_SKILL_ENERGY,
      cooldown: SKILL_CONSTANTS.ATTACK_SKILL_COOLDOWN,
      lastUsed: 0,
      description: '造成额外伤害',
      damage: SKILL_EFFECT_CONSTANTS.ATTACK_SKILL_DAMAGE,
    })

    this.addSkill({
      id: 'skill_ultimate',
      name: '终极技能',
      type: SkillType.ULTIMATE,
      energyCost: SKILL_CONSTANTS.ULTIMATE_ENERGY_COST,
      cooldown: SKILL_CONSTANTS.ULTIMATE_SKILL_COOLDOWN,
      lastUsed: 0,
      description: '造成大量伤害',
      damage: SKILL_EFFECT_CONSTANTS.ULTIMATE_SKILL_DAMAGE,
    })
  }

  public shouldUseSkill(participant: BattleParticipant): boolean {
    const healthPercent = participant.currentHealth / participant.maxHealth

    if (healthPercent < BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD) {
      return true
    }

    return super.shouldUseSkill(participant)
  }

  public selectSkill(
    participant: BattleParticipant,
    analysis?: BattleAnalysis,
  ): string | null {
    // 优先使用参与者真实拥有的技能
    const participantSkills = participant.getSkills() || []
    
    // 过滤掉被动技能
    const availableSkills = participantSkills.filter(skillId => {
      return !skillId.includes('passive')
    })
    
    if (availableSkills.length > 0) {
      // 从可用技能中选择一个
      return availableSkills[0]
    }

    // 如果没有真实技能，回退到AI内部技能
    const healthPercent = participant.currentHealth / participant.maxHealth

    if (healthPercent < BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD) {
      const healSkill = Array.from(this.skills.values()).find(
        (s) => s.heal && s.heal > 0,
      )
      if (healSkill) {
        return healSkill.id
      }
    }

    const healSkill2 = Array.from(this.skills.values()).find(
      (s) => s.heal && s.heal > 0,
    )
    if (healSkill2 && healthPercent >= 1) {
      const attackSkills = Array.from(this.skills.values()).filter(
        (s) => s.damage && s.damage > 0,
      )
      if (attackSkills.length > 0) {
        attackSkills.sort((a, b) => (b.damage || 0) - (a.damage || 0))
        return attackSkills[0].id
      }
    }

    if (participant.currentEnergy >= BATTLE_CONSTANTS.ULTIMATE_ENERGY_THRESHOLD) {
      const ultimateSkill = Array.from(this.skills.values()).find(
        (s) => s.type === SkillType.ULTIMATE,
      )
      if (ultimateSkill) {
        return ultimateSkill.id
      }
    }

    return super.selectSkill(participant, analysis)
  }

  public selectTarget(
    battleState: BattleState,
    _participant: BattleParticipant,
  ): string {
    const enemies = Array.from(battleState.participants.values())
      .filter((p) => p.type === PARTICIPANT_SIDE.ENEMY && p.isAlive())
      .map((p) => p)

    if (enemies.length === 0) {
      throw new Error('No enemies found')
    }

    enemies.sort((a, b) => a.currentHealth - b.currentHealth)
    return enemies[0].id
  }
}

/**
 * 敌人AI类
 * 为敌人单位提供特定的AI行为
 */
export class EnemyAI extends BaseBattleAI {
  /**
   * 构造函数
   * @param skillIds 技能ID列表
   * @param strategyName 优先级策略名称
   */
  constructor(skillIds?: string[], strategyName: string = 'aggressive') {
    super(skillIds, strategyName)
  }

  protected initializeSkills(): void {
    this.addSkill({
      id: 'enemy_skill_1',
      name: '爪击',
      type: SkillType.SMALL,
      energyCost: SKILL_CONSTANTS.ENEMY_BASIC_SKILL_ENERGY,
      cooldown: SKILL_CONSTANTS.ENEMY_BASIC_SKILL_COOLDOWN,
      lastUsed: 0,
      description: '快速攻击',
      damage: SKILL_EFFECT_CONSTANTS.ENEMY_BASIC_SKILL_DAMAGE,
    })

    this.addSkill({
      id: 'enemy_skill_2',
      name: '狂暴',
      type: SkillType.ULTIMATE,
      energyCost: SKILL_CONSTANTS.ENEMY_ULTIMATE_SKILL_ENERGY,
      cooldown: SKILL_CONSTANTS.ENEMY_ULTIMATE_SKILL_COOLDOWN,
      lastUsed: 0,
      description: '增加攻击力',
      damage: SKILL_EFFECT_CONSTANTS.ENEMY_ULTIMATE_SKILL_DAMAGE,
    })
  }

  public shouldUseSkill(participant: BattleParticipant): boolean {
    return participant.currentEnergy >= BATTLE_CONSTANTS.ENEMY_SKILL_ENERGY_THRESHOLD
  }

  public selectSkill(
    participant: BattleParticipant,
    analysis?: BattleAnalysis,
  ): string | null {
    // 优先使用参与者真实拥有的技能
    const participantSkills = participant.getSkills() || []
    
    // 过滤掉被动技能
    const availableSkills = participantSkills.filter(skillId => {
      return !skillId.includes('passive')
    })
    
    if (availableSkills.length > 0) {
      // 从可用技能中选择一个
      return availableSkills[0]
    }

    // 如果没有真实技能，回退到AI内部技能
    return super.selectSkill(participant, analysis)
  }

  public selectTarget(
    battleState: BattleState,
    _participant: BattleParticipant,
  ): string {
    const characters = Array.from(battleState.participants.values())
      .filter((p) => p.type === PARTICIPANT_SIDE.ALLY && p.isAlive())
      .map((p) => p)

    if (characters.length === 0) {
      throw new Error('No characters found')
    }

    characters.sort((a, b) => a.currentHealth - b.currentHealth)
    return characters[0].id
  }
}

/**
 * AI策略配置接口
 */
export interface AIStrategyConfig {
  /** 优先级策略名称 */
  priorityStrategy?: string
  /** 自定义参数 */
  parameters?: Record<string, any>
}

/**
 * AI工厂类
 * 负责创建不同类型的AI实例
 */
export class BattleAIFactory {
  public static createAI(
    type: ParticipantSide,
    skillIds?: string[],
    skillLoader?: SkillConfigLoader,
    strategyConfig?: AIStrategyConfig,
  ): BattleAI {
    const ai = type === PARTICIPANT_SIDE.ALLY 
      ? new CharacterAI(skillIds, strategyConfig?.priorityStrategy)
      : new EnemyAI(skillIds, strategyConfig?.priorityStrategy)
    
    if (skillLoader) {
      ai.setSkillConfigLoader(skillLoader)
    }
    
    return ai
  }

  public static createAIWithSkills(
    type: ParticipantSide,
    skillIds: string[],
    skillLoader?: SkillConfigLoader,
    strategyConfig?: AIStrategyConfig,
  ): BattleAI {
    const ai = type === PARTICIPANT_SIDE.ALLY 
      ? new CharacterAI(skillIds, strategyConfig?.priorityStrategy)
      : new EnemyAI(skillIds, strategyConfig?.priorityStrategy)
    
    if (skillLoader) {
      ai.setSkillConfigLoader(skillLoader)
    }
    
    return ai
  }

  /**
   * 从配置创建AI实例
   * @param config 配置对象
   * @returns AI实例
   */
  public static createAIFromConfig(config: {
    type: ParticipantSide
    skillIds?: string[]
    skillLoader?: SkillConfigLoader
    strategy?: AIStrategyConfig
  }): BattleAI {
    return this.createAI(
      config.type,
      config.skillIds,
      config.skillLoader,
      config.strategy
    )
  }
}
