/**
 * 文件: BattleAI.ts
 * 功能: 战斗AI接口和实现
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
  SKILL_EFFECT_CONSTANTS,
  ACTION_TYPES,
  EFFECT_TYPES,
} from '@/types/battle'
import { useBattleStore } from '@/stores/battleStore'
import type { BuffSystem } from '@/core/BuffSystem'
import type { SkillManager } from '@/core/skill/SkillManager'
import {
  AIPriorityStrategy,
  AIPriorityStrategyFactory,
} from '@/core/battle/AIPriorityStrategy'
import {
  SkillConfig,
  ExtendedSkillStep,
  Skill,
  SkillType,
  convertSkillConfigToSkill,
} from '@/types/skill'
import type { UISkills } from '@/types/UI/UIBattleCharacter'

/** 战斗AI接口 */
export interface BattleAI {
  /** 设置上下文（Buff系统、技能管理器） */
  setContext(buffSystem: BuffSystem, skillManager: SkillManager): void

  /** 做出战斗决策 */
  makeDecision(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAction

  /** 选择攻击目标 */
  selectTarget(battleState: BattleState, participant: BattleParticipant): string

  /** 判断是否应该使用技能 */
  shouldUseSkill(participant: BattleParticipant): boolean

  /** 选择要使用的技能 */
  selectSkill(participant: BattleParticipant): string | null

  /** 选择普通攻击 */
  selectAttack(participant: BattleParticipant): BattleAction
}

/** 技能配置加载器类型 */
export type SkillConfigLoader = (skillIds: string[]) => Skill[]

/** 战场分析结果接口 */
interface BattleAnalysis {
  allies: BattleParticipant[]
  enemies: BattleParticipant[]
  teamHealthPercent: number
  highestThreatEnemy: { enemy: BattleParticipant | null; threat: number }
  needsHealing: boolean
  shouldUseSkill: boolean
}

/** 基础AI策略类 */
export class BaseBattleAI implements BattleAI {
  protected skills: Map<string, Skill> = new Map()
  protected skillConfigLoader?: SkillConfigLoader
  protected buffSystem?: BuffSystem
  protected skillManager?: SkillManager
  protected priorityStrategy: AIPriorityStrategy

  constructor(skillIds?: string[], strategyName: string = 'balanced') {
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
      loadedSkills.forEach((skill: any) => {
        if (skill && skill.id) {
          this.skills.set(skill.id, skill)
        }
      })
    }
  }

  /** 设置技能配置加载器 */
  public setSkillConfigLoader(loader: SkillConfigLoader): void {
    this.skillConfigLoader = loader
  }

  /** 初始化技能（子类可重写） */
  protected initializeSkills(): void {}

  /** 做出战斗决策 */
  public makeDecision(
    battleState: BattleState,
    participant: BattleParticipant,
  ): BattleAction {
    const battleStore = useBattleStore()
    try {
      if (!battleState || !participant) {
        battleStore.addErrorLog('AI决策参数无效')
        return this.selectAttack(participant)
      }

      const battleAnalysis = this.analyzeBattleState(battleState, participant)
      if (battleAnalysis.shouldUseSkill) {
        const skillId = this.selectSkill(
          participant,
          battleState,
          battleAnalysis,
        )
        console.log(`${participant.name}选择使用技能。`, skillId)
        if (skillId) {
          try {
            return this.createSkillStep(battleState, participant, skillId)
          } catch (skillError) {
            battleStore.addErrorLog('技能执行出错')
            return this.selectAttack(participant)
          }
        }
      }

      return this.selectAttack(participant)
    } catch (error) {
      battleStore.addErrorLog('AI决策出错')
      console.log('AI决策出错')
      try {
        return this.selectAttack(participant)
      } catch (attackError) {
        battleStore.addErrorLog('攻击执行出错')
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

  /** 分析战场态势 */
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

    const needsHealing = allies.some(
      (p) => p.currentHealth / p.maxHealth < BATTLE_CONSTANTS.HEAL_THRESHOLD,
    )

    return {
      allies,
      enemies,
      teamHealthPercent,
      highestThreatEnemy,
      needsHealing,
      shouldUseSkill: this.shouldUseSkill(participant),
    }
  }

  /** 选择目标（优先选择血量最少的角色） */
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

  /** 计算目标威胁值 */
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

    if (
      target.type === PARTICIPANT_SIDE.ALLY &&
      participant.type === PARTICIPANT_SIDE.ENEMY
    ) {
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
      participant.getAttribute('max_energy') ||
      participant.maxEnergy ||
      BATTLE_CONSTANTS.DEFAULT_MAX_ENERGY
    return energy >= maxEnergy * BATTLE_CONSTANTS.AI_SKILL_ENERGY_THRESHOLD
  }

  /** 选择要使用的技能 */
  public selectSkill(
    participant: BattleParticipant,
    battleState?: BattleState,
    analysis?: BattleAnalysis,
  ): string | null {
    if (!this.canUseSkill(participant)) {
      return null
    }
    const participantSkills = participant.getSkillIds('active')

    const validSkills = participantSkills.filter((skillId) => {
      return this.skills.has(skillId)
    })

    if (validSkills.length > 0) {
      if (battleState) {
        const skills = validSkills.map((skillId) => {
          const skill = this.skills.get(skillId)
          return {
            id: skillId,
            name: skill?.name || skillId,
            type: skill?.type || ('small' as SkillType),
            energyCost: skill?.energyCost || 0,
            cooldown: skill?.cooldown || 0,
            lastUsed: skill?.lastUsed || 0,
            description: skill?.description || '',
          }
        })

        const skillWeights = this.priorityStrategy.calculateSkillWeights(
          battleState,
          participant,
          skills,
        )

        if (skillWeights.length > 0) {
          return skillWeights[0].skillId
        }
      }

      return validSkills[0]
    }

    const allSkills = Array.from(this.skills.values())
    const skills = allSkills.filter((s) => s.type !== SkillType.PASSIVE)
    if (skills.length === 0) {
      return null
    }

    if (battleState) {
      const skillWeights = this.priorityStrategy.calculateSkillWeights(
        battleState,
        participant,
        skills,
      )

      if (skillWeights.length > 0) {
        return skillWeights[0].skillId
      }
    }

    if (analysis) {
      if (analysis.needsHealing) {
        const healSkill = skills.find((s) => s.heal && s.heal > 0)
        if (healSkill) {
          return healSkill.id
        }
      }

      if (
        analysis.highestThreatEnemy.threat >
        BATTLE_CONSTANTS.SKILL_SELECTION_THREAT_THRESHOLD
      ) {
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

  /** 选择普通攻击 */
  public selectAttack(participant: BattleParticipant): BattleAction {
    return {
      id: `attack_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: ACTION_TYPES.ATTACK,
      sourceId: participant.id,
      targetId: '',
      damage:
        Math.floor(
          Math.random() *
            (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX -
              BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN),
        ) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN,
      success: true,
      timestamp: Date.now(),
      effects: [
        {
          type: EFFECT_TYPES.DAMAGE,
          value:
            Math.floor(
              Math.random() *
                (BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MAX -
                  BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN),
            ) + BATTLE_CONSTANTS.DEFAULT_ATTACK_DAMAGE_MIN,
          description: `${participant.name} 普通攻击`,
        },
      ],
    }
  }

  /** 选择治疗目标 */
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

  /** 创建技能行动 */
  protected createSkillStep(
    battleState: BattleState,
    participant: BattleParticipant,
    skillId: string,
  ): BattleAction {
    const skill = this.skills.get(skillId)
    console.log(`${participant.name}使用技能。`, skill)
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

  /** 添加技能 */
  public addSkill(skill: Skill): void {
    this.skills.set(skill.id, skill)
  }

  /** 获取技能 */
  public getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId)
  }

  /** 获取所有技能 */
  public getSkills(): Skill[] {
    return Array.from(this.skills.values())
  }

  /** 设置上下文 */
  public setContext(buffSystem: BuffSystem, skillManager: SkillManager): void {
    this.buffSystem = buffSystem
    this.skillManager = skillManager
  }

  /** 检查是否可以使用技能 */
  protected canUseSkill(participant: BattleParticipant): boolean {
    if (this.buffSystem) {
      return this.buffSystem.canUseSkill(participant.id)
    }
    return true
  }
}

/** 角色AI类 */
export class CharacterAI extends BaseBattleAI {
  constructor(skillIds?: string[], strategyName: string = 'balanced') {
    super(skillIds, strategyName)
  }

  /** 判断是否使用技能（生命低于临界值时触发） */
  public shouldUseSkill(participant: BattleParticipant): boolean {
    const healthPercent = participant.currentHealth / participant.maxHealth

    if (healthPercent < BATTLE_CONSTANTS.CRITICAL_HEALTH_THRESHOLD) {
      return true
    }

    return super.shouldUseSkill(participant)
  }

  /** 选择技能（角色AI优先使用真实技能） */
  public selectSkill(
    participant: BattleParticipant,
    analysis?: BattleAnalysis,
  ): string | null {
    const participantSkills = participant.getSkillIds('active')

    const validSkills = participantSkills.filter((skillId) => {
      return this.skills.has(skillId)
    })

    if (validSkills.length > 0) {
      return validSkills[0]
    }

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

    if (
      participant.currentEnergy >= BATTLE_CONSTANTS.ULTIMATE_ENERGY_THRESHOLD
    ) {
      const ultimateSkill = Array.from(this.skills.values()).find(
        (s) => s.type === SkillType.ULTIMATE,
      )
      if (ultimateSkill) {
        return ultimateSkill.id
      }
    }

    return super.selectSkill(participant, analysis)
  }

  /** 选择目标（优先选择血量最少的敌人） */
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

/** 敌人AI类 */
export class EnemyAI extends BaseBattleAI {
  constructor(skillIds?: string[], strategyName: string = 'aggressive') {
    super(skillIds, strategyName)
  }

  /** 判断是否使用技能（能量足够时触发） */
  public shouldUseSkill(participant: BattleParticipant): boolean {
    return (
      participant.currentEnergy >= BATTLE_CONSTANTS.ENEMY_SKILL_ENERGY_THRESHOLD
    )
  }

  /** 选择技能（敌人AI优先使用真实技能） */
  public selectSkill(
    participant: BattleParticipant,
    analysis?: BattleAnalysis,
  ): string | null {
    const participantSkills = participant.getSkillIds('active')

    const validSkills = participantSkills.filter((skillId) => {
      return this.skills.has(skillId)
    })

    if (validSkills.length > 0) {
      return validSkills[0]
    }

    return super.selectSkill(participant, analysis)
  }

  /** 选择目标（优先选择血量最少的角色） */
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

/** AI策略配置接口 */
export interface AIStrategyConfig {
  priorityStrategy?: string
  parameters?: Record<string, any>
}

/** AI工厂类 */
export class BattleAIFactory {
  /** 创建AI实例 */
  public static createAI(
    type: ParticipantSide,
    skillIds?: string[],
    skillLoader?: SkillConfigLoader,
    strategyConfig?: AIStrategyConfig,
  ): BattleAI {
    const ai =
      type === PARTICIPANT_SIDE.ALLY
        ? new CharacterAI(skillIds, strategyConfig?.priorityStrategy)
        : new EnemyAI(skillIds, strategyConfig?.priorityStrategy)

    if (skillLoader) {
      ai.setSkillConfigLoader(skillLoader)
    }

    return ai
  }

  /** 创建带技能的AI实例 */
  public static createAIWithSkills(
    type: ParticipantSide,
    uiSkills: UISkills,
    strategyConfig?: AIStrategyConfig,
    skillLoader?: SkillConfigLoader,
  ): BattleAI {
    const allConfigs: SkillConfig[] = [
      ...(uiSkills.small ?? []),
      ...(uiSkills.passive ?? []),
      ...(uiSkills.ultimate ?? []),
    ]
    const validConfigs = allConfigs.filter(this.isValidSkillConfig)

    const skills: Skill[] = validConfigs.map((config) =>
      convertSkillConfigToSkill(config, {
        lastUsed: 0,
        includeDamage: true,
        includeHeal: true,
        includeBuffId: true,
      }),
    )

    const skillIds = skills.map((s) => s.id)
    const ai =
      type === PARTICIPANT_SIDE.ALLY
        ? new CharacterAI(skillIds, strategyConfig?.priorityStrategy)
        : new EnemyAI(skillIds, strategyConfig?.priorityStrategy)

    skills.forEach((skill) => ai.addSkill(skill))

    if (skillLoader) {
      ai.setSkillConfigLoader(skillLoader)
    }

    return ai
  }

  /** 验证技能配置有效性 */
  private static isValidSkillConfig(config: unknown): config is SkillConfig {
    return (
      config !== null &&
      typeof config === 'object' &&
      'id' in config &&
      'name' in config
    )
  }

  /** 从配置创建AI实例 */
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
      config.strategy,
    )
  }
}
