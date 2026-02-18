import type { Character } from '@/types/character'
import type { EnemyInstance } from '@/types/enemy'
import type { BattleAI } from '@/core/BattleAI'
import type { SkillManager } from '@/core/skill/SkillManager'
import type { SkillConfig } from '@/types/skill'

/**
 * 战斗状态常量
 * 控制战斗的宏观生命周期
 */
export const BATTLE_STATUS = {
  /** 已创建 - 战斗实例已创建，等待参与者加入 */
  CREATED: 'CREATED',
  /** 战前准备 - 初始化技能、buff等 */
  PREPARING: 'PREPARING',
  /** 战斗进行中 */
  ACTIVE: 'ACTIVE',
  /** 战斗暂停 */
  PAUSED: 'PAUSED',
  /** 战斗结算 */
  SETTLEMENT: 'SETTLEMENT',
  /** 战斗结束 */
  ENDED: 'ENDED',
} as const

export type BattleStatus = (typeof BATTLE_STATUS)[keyof typeof BATTLE_STATUS]

/**
 * 回合状态常量
 * 控制回合内的子阶段
 */
export const ROUND_STATUS = {
  /** 无回合 - 不在回合中 */
  NONE: 'NONE',
  /** 回合开始 */
  START: 'START',
  /** 行动选择 */
  ACTION: 'ACTION',
  /** 行动执行 */
  EXECUTION: 'EXECUTION',
  /** 回合结束 */
  END: 'END',
} as const

export type RoundStatus = (typeof ROUND_STATUS)[keyof typeof ROUND_STATUS]

/**
 * 参与方常量
 * 用于区分战斗中的不同参与方
 */
export const PARTICIPANT_SIDE = {
  /** 我方/友方 */
  ALLY: 'ally' as const,
  /** 敌方 */
  ENEMY: 'enemy' as const,
}

/** 战斗相关常量 */
export const BATTLE_CONSTANTS = {
  /** 默认攻击伤害范围 */
  DEFAULT_ATTACK_DAMAGE_MIN: 10,
  DEFAULT_ATTACK_DAMAGE_MAX: 20,
  /** 敌人默认攻击伤害范围 */
  ENEMY_ATTACK_DAMAGE_MIN: 8,
  ENEMY_ATTACK_DAMAGE_MAX: 15,
  /** 默认能量上限 */
  DEFAULT_MAX_ENERGY: 150,
  /** 技能能量消耗阈值 */
  SKILL_ENERGY_THRESHOLD: 50,
  ULTIMATE_ENERGY_THRESHOLD: 100,
  /** 技能使用概率 */
  SKILL_USE_CHANCE: 0.4,
  ULTIMATE_USE_CHANCE: 0.3,
  LOW_ENERGY_USE_CHANCE: 0.7,
  /** AI决策能量阈值 */
  AI_SKILL_ENERGY_THRESHOLD: 0.7,
  ENEMY_SKILL_ENERGY_THRESHOLD: 50,
  /** 治疗血量阈值 */
  HEAL_THRESHOLD: 0.3,
  CRITICAL_HEALTH_THRESHOLD: 0.5,
  /** 威胁值计算权重 */
  THREAT_HEALTH_WEIGHT: 50,
  THREAT_ENERGY_WEIGHT: 30,
  THREAT_TYPE_WEIGHT: 20,
  THREAT_BUFF_WEIGHT: 10,
  /** 技能选择威胁阈值 */
  SKILL_SELECTION_THREAT_THRESHOLD: 50,
} as const

/** 技能类型相关常量 */
export const SKILL_CONSTANTS = {
  /** 技能能量消耗 */
  ULTIMATE_ENERGY_COST: 100,
  SKILL_ENERGY_COST: 50,
  PASSIVE_ENERGY_COST: 0,
  /** 技能冷却时间（毫秒） */
  HEAL_SKILL_COOLDOWN: 2000,
  ATTACK_SKILL_COOLDOWN: 1500,
  ULTIMATE_SKILL_COOLDOWN: 5000,
  ENEMY_BASIC_SKILL_COOLDOWN: 1000,
  ENEMY_ULTIMATE_SKILL_COOLDOWN: 3000,
  /** 默认技能能量消耗 */
  HEAL_SKILL_ENERGY: 30,
  ATTACK_SKILL_ENERGY: 25,
  ENEMY_BASIC_SKILL_ENERGY: 20,
  ENEMY_ULTIMATE_SKILL_ENERGY: 80,
} as const

/** 技能效果常量 */
export const SKILL_EFFECT_CONSTANTS = {
  HEAL_SKILL_HEAL: 50,
  ATTACK_SKILL_DAMAGE: 35,
  ULTIMATE_SKILL_DAMAGE: 80,
  ENEMY_BASIC_SKILL_DAMAGE: 25,
  ENEMY_ULTIMATE_SKILL_DAMAGE: 60,
  DEFAULT_SKILL_DAMAGE: 10,
} as const

/** 动作类型常量 */
export const ACTION_TYPES = {
  ATTACK: 'attack',
  SKILL: 'skill',
  HEAL: 'heal',
  BUFF: 'buff',
  ITEM: 'item',
} as const

/** 动作类型数组 */
export const VALID_ACTION_TYPES = [
  ACTION_TYPES.ATTACK,
  ACTION_TYPES.SKILL,
  ACTION_TYPES.HEAL,
  ACTION_TYPES.BUFF,
  ACTION_TYPES.ITEM,
] as const

/** 战斗效果类型常量 */
export const EFFECT_TYPES = {
  DAMAGE: 'damage',
  HEAL: 'heal',
  BUFF: 'buff',
  DEBUFF: 'debuff',
  STATUS: 'status',
} as const

export type ParticipantSide =
  (typeof PARTICIPANT_SIDE)[keyof typeof PARTICIPANT_SIDE]

export interface BattleEntity {
  id: string
  name: string
  level: number
  type: ParticipantSide
  currentHealth: number
  maxHealth: number
  currentEnergy: number
  maxEnergy: number
  buffs: string[]

  getAttribute(attribute: string): number
  setAttribute(attribute: string, value: number): void
  addBuff(buffInstanceId: string): void
  removeBuff(buffInstanceId: string): void
  hasBuff(buffId: string): boolean
  takeDamage(amount: number): number
  heal(amount: number): number
  isAlive(): boolean

  gainEnergy(amount: number): void
  spendEnergy(amount: number): boolean
  afterAction(): void
  isFullHealth(): boolean
  needsHealing(): boolean

  getSkills(): string[]
  hasSkill(skillId: string): boolean
}

/**
 * 战斗参与者接口
 * 表示参与战斗的实体（角色或敌人）
 * 扩展 BattleEntity 接口，添加战斗相关属性
 */
export interface BattleParticipant extends BattleEntity {
  /** 队伍归属 */
  team: ParticipantSide
  /** 速度值（用于回合顺序计算） */
  speed: number
  /** 最小攻击力 */
  minAttack: number
  /** 最大攻击力 */
  maxAttack: number
  /** 平均攻击力（计算值） */
  attack: number
  /** 防御力 */
  defense: number
  /** 暴击率（百分比，0-100） */
  critRate: number
  /** 暴击伤害（百分比，≥100） */
  critDamage: number
  /** 免伤率（百分比，0-100） */
  damageReduction: number
  /** 气血加成（百分比） */
  healthBonus: number
  /** 攻击加成（百分比） */
  attackBonus: number
  /** 防御加成（百分比） */
  defenseBonus: number
  /** 速度加成（百分比） */
  speedBonus: number
  /** 状态效果列表 */
  statusEffects?: StatusEffect[]
  /** 技能配置 */
  skills: {
    small?: SkillConfig[]
    passive?: SkillConfig[]
    ultimate?: SkillConfig[]
  }
}

/**
 * 状态效果接口
 */
export interface StatusEffect {
  /** 效果ID */
  id: string
  /** 效果名称 */
  name: string
  /** 效果类型 */
  type: 'buff' | 'debuff'
  /** 持续时间 */
  duration: number
  /** 剩余回合数 */
  remainingTurns: number
}

export interface BattleAction {
  id: string
  type: 'attack' | 'skill' | 'buff' | 'item' | 'status'
  sourceId: string
  targetId: string
  skillId?: string
  itemId?: string
  buffId?: string
  damage?: number
  heal?: number
  success: boolean
  timestamp: number
  turn?: number
  effects: BattleEffect[]
}

export interface BattleEffect {
  type: 'damage' | 'heal' | 'buff' | 'debuff' | 'status'
  value?: number
  buffId?: string
  duration?: number
  description: string
}

export interface BattleState {
  battleId: string
  participants: Map<string, BattleParticipant>
  actions: BattleAction[]
  /** 回合顺序，按速度规则排序 */
  turnOrder: string[]
  currentTurn: number
  isActive: boolean
  startTime: number
  endTime?: number
  winner?: ParticipantSide
}

/**
 * 参与者初始化数据接口
 * 用于创建战斗参与者的基础数据结构
 * 仅包含数据属性，不包含方法实现
 */
export interface ParticipantInfo {
  /** 参与者唯一标识符 */
  id: string
  /** 参与者名称 */
  name: string
  /** 参与者类型（我方/敌方） */
  type: ParticipantSide
  /** 队伍归属 */
  team: ParticipantSide
  /** 最大生命值 */
  maxHealth: number
  /** 当前生命值 */
  currentHealth?: number
  /** 最大能量值 */
  maxEnergy?: number
  /** 当前能量值（初始值25） */
  currentEnergy?: number
  /** 等级（≥1） */
  level: number
  /** 最小攻击力（≤最大攻击） */
  minAttack: number
  /** 最大攻击力（≥最小攻击） */
  maxAttack: number
  /** 防御力（≥0） */
  defense: number
  /** 速度（≥1） */
  speed: number
  /** 暴击率（百分比，0-100，默认10） */
  critRate?: number
  /** 暴击伤害（百分比，≥100，默认125） */
  critDamage?: number
  /** 免伤率（百分比，0-100） */
  damageReduction?: number
  /** 气血加成（百分比，可正可负） */
  healthBonus?: number
  /** 攻击加成（百分比，可正可负） */
  attackBonus?: number
  /** 防御加成（百分比，可正可负） */
  defenseBonus?: number
  /** 速度加成（百分比，可正可负） */
  speedBonus?: number
  /** Buff实例ID列表 */
  buffs?: string[]
  /** 技能配置 */
  skills?: {
    small?: SkillConfig[]
    passive?: SkillConfig[]
    ultimate?: SkillConfig[]
  }
}

/**
 * 战斗系统事件类型枚举
 * 定义所有战斗系统支持的事件名称
 */
export enum BattleSystemEvent {
  /** 战斗日志事件 */
  BATTLE_LOG = 'battleLog',
  /** 战斗状态更新事件 */
  BATTLE_STATE_UPDATE = 'battleStateUpdate',
  /** 伤害动画事件 */
  DAMAGE_ANIMATION = 'damageAnimation',
  /** 闪避动画事件 */
  MISS_ANIMATION = 'missAnimation',
  /** Buff效果事件 */
  BUFF_EFFECT = 'buffEffect',
  /** 技能效果事件 */
  SKILL_EFFECT = 'skillEffect',
  /** 战斗结束事件 */
  BATTLE_END = 'battleEnd',
  /** 回合开始事件 */
  TURN_START = 'turnStart',
  /** 回合结束事件 */
  TURN_END = 'turnEnd'
}

/**
 * 战斗系统接口
 */
export interface BattleSystem {
  createBattle(participantsInfo: BattleParticipant[]): BattleState
  processTurn(battleId: string): Promise<void>
  executeAction(action: BattleAction): Promise<BattleAction>
  getBattleState(battleId: string): BattleState | undefined
  endBattle(battleId: string, winner: ParticipantSide): void
  resetBattle(battleId: string): void
  getCurParticipantsInfo(): BattleParticipant[]
  getCurBattleData(battleId: string | null): BattleData | undefined
}

/**
 * 战斗数据接口
 * 描述战斗的完整状态和数据
 */
export interface BattleData {
  /** 战斗唯一标识符 */
  battleId: string
  /** 参与者映射，以参与者ID为键 */
  participants: Map<string, BattleParticipant>
  /** 战斗行动记录 */
  actions: BattleAction[]
  /** 回合顺序，按速度规则排序 */
  turnOrder: string[]
  /** 当前行动次序索引（表示当前回合内的第几个行动） */
  currentTurn: number
  /** 当前回合数（从1开始） */
  currentRound: number
  /** 最大回合数 */
  maxTurns: number
  /** 战斗开始时间戳 */
  startTime: number
  /** 战斗结束时间戳（可选） */
  endTime?: number
  /** 战斗胜利者（可选） */
  winner?: ParticipantSide
  /** 每个参与者的AI实例映射 */
  aiInstances: Map<string, BattleAI>
  /** 战斗速度（1-10） */
  battleSpeed: number
  /** 战斗状态 */
  battleState?: BattleStatus
  /** 回合状态 */
  roundState?: RoundStatus
  /** 自动战斗定时器ID */
  autoBattleIntervalId?: symbol
  /** 是否自动播放 */
  autoPlaying: boolean
  /** 战斗是否处于活跃状态 */
  isActive: boolean
  /** 技能管理器实例（可选，用于技能执行） */
  skillManager?: import('@/core/skill/SkillManager').SkillManager
}
