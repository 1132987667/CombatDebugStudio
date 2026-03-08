/**
 * 文件: StrategyInterfaces.ts
 * 功能: AI决策策略接口定义
 * 描述: 采用策略模式，将AI决策逻辑抽象为独立接口，支持运行时动态替换策略
 */

import type { BattleParticipant, BattleState, BattleAction } from '@/types/battle'
import type { Skill } from '@/types/skill'

/**
 * 参与者快照接口
 * 用于BattleContext中存储参与者的只读快照，避免直接操作实时对象
 */
export interface ParticipantSnapshot {
  id: string
  name: string
  level: number
  type: 'ally' | 'enemy'
  team: 'ally' | 'enemy'
  currentHealth: number
  maxHealth: number
  currentEnergy: number
  maxEnergy: number
  speed: number
  minAttack: number
  maxAttack: number
  attack: number
  defense: number
  critRate: number
  critDamage: number
  damageReduction: number
  healthBonus: number
  attackBonus: number
  defenseBonus: number
  speedBonus: number
  buffs: string[]
  isAlive(): boolean
  getHealthPercent(): number
  getEnergyPercent(): number
  getAttribute(attribute: string): number
}

/**
 * 战场态势分析接口
 */
export interface BattleAnalysis {
  allies: ParticipantSnapshot[]
  enemies: ParticipantSnapshot[]
  teamHealthPercent: number
  lowestHealthAlly: ParticipantSnapshot | null
  lowestHealthEnemy: ParticipantSnapshot | null
  highestThreatEnemy: { enemy: ParticipantSnapshot | null; threat: number }
  needsHealing: boolean
  hasLowHealthCharacter: boolean
}

/**
 * 目标选择策略接口
 */
export interface ITargetSelectionStrategy {
  /**
   * 选择攻击目标
   * @param context 战场上下文
   * @param participant 当前参与者快照
   * @returns 目标参与者ID
   */
  selectTarget(context: BattleContext, participant: ParticipantSnapshot): string

  /**
   * 获取策略名称
   */
  getName(): string
}

/**
 * 技能选择策略接口
 */
export interface ISkillSelectionStrategy {
  /**
   * 判断是否应该使用技能
   * @param context 战场上下文
   * @param participant 当前参与者快照
   * @returns 是否使用技能
   */
  shouldUseSkill(context: BattleContext, participant: ParticipantSnapshot): boolean

  /**
   * 选择要使用的技能
   * @param context 战场上下文
   * @param participant 当前参与者快照
   * @returns 技能ID，如果不需要使用技能则返回null
   */
  selectSkill(
    context: BattleContext,
    participant: ParticipantSnapshot,
  ): string | null

  /**
   * 获取策略名称
   */
  getName(): string
}

/**
 * 威胁计算策略接口
 */
export interface IThreatCalculationStrategy {
  /**
   * 计算目标威胁值
   * @param target 目标快照
   * @param participant 当前参与者快照
   * @param context 战场上下文
   * @returns 威胁值
   */
  calculateThreat(
    target: ParticipantSnapshot,
    participant: ParticipantSnapshot,
    context: BattleContext,
  ): number

  /**
   * 获取策略名称
   */
  getName(): string
}

/**
 * 战斗决策策略接口
 * 组合目标选择、技能选择和威胁计算策略
 */
export interface IBattleDecisionStrategy {
  /**
   * 做出战斗决策
   * @param context 战场上下文
   * @param participant 当前参与者快照
   * @param availableSkills 可用技能映射
   * @returns 战斗动作
   */
  makeDecision(
    context: BattleContext,
    participant: ParticipantSnapshot,
    availableSkills: Map<string, Skill>,
  ): BattleAction

  /**
   * 获取策略名称
   */
  getName(): string
}

/**
 * 战场上下文接口
 * 包含参与者快照，避免直接操作实时对象
 */
export interface IBattleContext {
  /** 战场状态ID */
  battleId: string
  /** 所有参与者快照映射 */
  participants: Map<string, ParticipantSnapshot>
  /** 当前回合 */
  currentTurn: number
  /** 是否活跃 */
  isActive: boolean

  /**
   * 获取所有友方参与者
   */
  getAllies(participant: ParticipantSnapshot): ParticipantSnapshot[]

  /**
   * 获取所有敌方参与者
   */
  getEnemies(participant: ParticipantSnapshot): ParticipantSnapshot[]

  /**
   * 分析战场态势
   */
  analyzeBattle(participant: ParticipantSnapshot): BattleAnalysis

  /**
   * 根据ID获取参与者快照
   */
  getParticipant(id: string): ParticipantSnapshot | undefined

  /**
   * 获取当前行动参与者
   */
  getCurrentParticipant(): ParticipantSnapshot | undefined
}

/**
 * 战场上下文类
 */
export class BattleContext implements IBattleContext {
  public battleId: string
  public participants: Map<string, ParticipantSnapshot>
  public currentTurn: number
  public isActive: boolean

  constructor(battleState: BattleState, currentParticipantId?: string) {
    this.battleId = battleState.battleId
    this.currentTurn = battleState.currentTurn
    this.isActive = battleState.isActive
    this.participants = new Map()

    battleState.participants.forEach((p, id) => {
      this.participants.set(id, this.createSnapshot(p))
    })
  }

  /**
   * 创建参与者快照
   */
  private createSnapshot(participant: BattleParticipant): ParticipantSnapshot {
    return {
      id: participant.id,
      name: participant.name,
      level: participant.level,
      type: participant.type,
      team: participant.team,
      currentHealth: participant.currentHealth,
      maxHealth: participant.maxHealth,
      currentEnergy: participant.currentEnergy,
      maxEnergy: participant.maxEnergy,
      speed: participant.speed,
      minAttack: participant.minAttack,
      maxAttack: participant.maxAttack,
      attack: participant.attack,
      defense: participant.defense,
      critRate: participant.critRate,
      critDamage: participant.critDamage,
      damageReduction: participant.damageReduction,
      healthBonus: participant.healthBonus,
      attackBonus: participant.attackBonus,
      defenseBonus: participant.defenseBonus,
      speedBonus: participant.speedBonus,
      buffs: [...participant.buffs],
      isAlive: () => participant.isAlive(),
      getHealthPercent: () => participant.currentHealth / participant.maxHealth,
      getEnergyPercent: () => participant.currentEnergy / participant.maxEnergy,
      getAttribute: (attr: string) => participant.getAttribute(attr),
    }
  }

  public getAllies(participant: ParticipantSnapshot): ParticipantSnapshot[] {
    return Array.from(this.participants.values()).filter(
      (p) => p.type === participant.type && p.isAlive(),
    )
  }

  public getEnemies(participant: ParticipantSnapshot): ParticipantSnapshot[] {
    return Array.from(this.participants.values()).filter(
      (p) => p.type !== participant.type && p.isAlive(),
    )
  }

  public analyzeBattle(participant: ParticipantSnapshot): BattleAnalysis {
    const allies = this.getAllies(participant)
    const enemies = this.getEnemies(participant)

    const teamHealth = allies.reduce((sum, p) => sum + p.currentHealth, 0)
    const teamMaxHealth = allies.reduce((sum, p) => sum + p.maxHealth, 0)
    const teamHealthPercent = teamMaxHealth > 0 ? teamHealth / teamMaxHealth : 0

    const sortedAllies = [...allies].sort(
      (a, b) => a.currentHealth / a.maxHealth - b.currentHealth / b.maxHealth,
    )
    const sortedEnemies = [...enemies].sort(
      (a, b) => a.currentHealth / a.maxHealth - b.currentHealth / b.maxHealth,
    )

    return {
      allies,
      enemies,
      teamHealthPercent,
      lowestHealthAlly: sortedAllies[0] || null,
      lowestHealthEnemy: sortedEnemies[0] || null,
      highestThreatEnemy: { enemy: null, threat: 0 },
      needsHealing: allies.some(
        (p) => p.currentHealth / p.maxHealth < 0.3,
      ),
      hasLowHealthCharacter: allies.some(
        (p) => p.currentHealth / p.maxHealth < 0.5,
      ),
    }
  }

  public getParticipant(id: string): ParticipantSnapshot | undefined {
    return this.participants.get(id)
  }

  public getCurrentParticipant(): ParticipantSnapshot | undefined {
    return undefined
  }
}
