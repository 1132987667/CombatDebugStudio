/**
 * 战斗系统类型定义模块
 * 包含战斗相关的所有类型定义、枚举和常量
 * 提供战斗实体、参与者、动作、效果等核心数据结构
 */

import type { BattleAI } from '@/core/BattleAI'
import type { SkillConfig, SkillSet } from '@/types/skill'
import type {
  AttributeValue,
  IModifierProvider,
  ATTRIBUTE_CODE,
  AttributeValues,
  Modifier,
} from '@/types/attribute'
import type { BattleLogEntry } from '@/types/battle-log'
import { EffectType } from '@/types/effect'
import { Counter } from '@/utils/Counter'
import { Ref } from 'vue'
import { BattleEventCodes } from './battle-events'

const counter = new Counter()

/**
 * 战斗状态常量
 * 控制战斗的宏观生命周期
 */
export const BattleStatus = {
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

export type BattleStatus = (typeof BattleStatus)[keyof typeof BattleStatus]

/**
 * 回合状态常量
 * 控制回合内的子阶段
 */
export const RoundStatus = {
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

export type RoundStatus = (typeof RoundStatus)[keyof typeof RoundStatus]

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

/** 自动战斗速度到延迟(ms)的映射 */
export const AUTO_BATTLE_CONFIG = {
  /** 速度等级对应的延迟时间(ms) */
  DELAYS: {
    1: 1000,
    2: 500,
    3: 330,
    5: 200,
  } as Record<number, number>,
  /** 默认延迟时间(ms) */
  DEFAULT_DELAY: 500,
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
export const ActionTypes = {
  ATTACK: 'attack',
  SKILL: 'skill',
  HEAL: 'heal',
  BUFF: 'buff',
  ITEM: 'item',
  STATUS: 'status',
} as const

export type ActionTypes = (typeof ActionTypes)[keyof typeof ActionTypes]

/** 动作类型数组 - 从 ACTION_TYPES 自动生成 */
export const ValidActionTypes = Object.freeze([
  ActionTypes.ATTACK,
  ActionTypes.SKILL,
  ActionTypes.HEAL,
  ActionTypes.BUFF,
  ActionTypes.ITEM,
]) as readonly (typeof ActionTypes)[keyof typeof ActionTypes][]

export type ParticipantSide =
  (typeof PARTICIPANT_SIDE)[keyof typeof PARTICIPANT_SIDE]

/**
 * 战斗实体接口
 * 定义战斗中最基础的实体结构
 * 包含实体的基本属性（ID、名称、等级、阵营等）和核心方法（生命值、能量、Buff 等）
 * 所有参与战斗的角色和敌人都应实现此接口
 */
export interface BattleEntity {
  id: string // 实体唯一标识
  name: string // 实体名称
  level: number // 实体等级
  type: ParticipantSide // 实体类型
  team: ParticipantSide // 实体阵营
  enabled: boolean // 实体是否启用
  /** Buff列表 */
  buffs: Modifier[]
  /** 状态效果列表 */
  statusEffects?: StatusEffect[]
  /** 技能配置 */
  skills: SkillSet
  /** 属性值缓存 */
  attributeValues: AttributeValues

  /** 获取属性值对象（包含详细信息） */
  getAttributeValue(
    attribute: ATTRIBUTE_CODE | string,
  ): AttributeValue | undefined
  /** 获取属性最终值（快捷方法） */
  getAttribute(attribute: ATTRIBUTE_CODE | string): number
  /** 快捷获取属性最终值（number） */
  getAttr(attr: ATTRIBUTE_CODE): number
  /** 快捷获取属性值对象（包含基础值、修饰符等） */
  getAttrValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined
  /** 批量预计算所有属性（回合开始时调用） */
  recalcAll(): void
  /** 设置属性值 */
  setAttribute(attribute: string, value: number): void
  /** 标记属性为脏（需要重新计算） */
  markDirty(attribute: ATTRIBUTE_CODE | string): void
  /** 标记所有属性为脏 */
  markAllDirty(): void
  /** 重新计算所有属性 */
  recalculateAll(): void
  /** 设置修饰符提供者 */
  setModifierProvider(provider: IModifierProvider): void

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

  getSkillList(): SkillConfig[]
  getSkillIds(filter?: 'all' | 'active' | 'passive'): string[]
  hasSkill(skillId: string): boolean
}

/**
 * 状态效果接口
 * 定义战斗中的状态效果（Buff/Debuff）
 * 包含效果的ID、名称、类型、持续时间等属性
 * 用于表示角色在战斗中获得的各种增益或减益效果
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

/**
 * 战斗动作接口
 * 表示战斗中执行的一个具体动作
 * 包含动作的基本信息（ID、类型、来源、目标）、动作结果（伤害、治疗等）以及时间戳
 * 用于记录战斗过程中的所有行动，支持战斗回放和日志功能
 */
export interface BattleAction {
  /** 动作唯一标识符 */
  id: string

  /** 动作类型：attack-普通攻击, skill-技能, buff-增益/减益, item-物品, status-状态 */
  type: ActionTypes

  /** 执行动作的角色ID */
  sourceId: string

  /** 目标角色ID */
  targetId: string

  /** 使用的技能ID（type为skill时有效） */
  skillId?: string

  /** 技能名称（type为skill时有效，用于日志展示） */
  skillName?: string

  /** 使用的物品ID（type为item时有效） */
  itemId?: string

  /** 引用的Buff ID（type为buff时有效） */
  buffId?: string

  /** 造成的伤害值（type为attack/skill时有效） */
  damage?: number

  /** 治疗值（type为skill且为治疗技能时有效） */
  heal?: number

  /** 动作是否成功执行 */
  success: boolean

  /** 是否命中（type为attack/skill时有效） */
  isHit?: boolean

  /** 是否暴击（type为attack/skill时有效） */
  isCrit?: boolean

  /** 暴击伤害值（isCrit为true时有效，表示本次暴击造成的额外伤害） */
  critDamage?: number

  /** 动作执行时间戳（毫秒） */
  timestamp: number

  /** 所在回合号 */
  turn?: number

  /** 动作产生的效果列表 */
  effects: BattleEffect[]
}

export const BattleActionHelper = {
  /**
   * 生成唯一动作ID
   * @param prefix ID前缀
   * @returns 唯一ID字符串
   */
  generateId(prefix: string = 'action'): string {
    return `${prefix}_${counter.next()}`
  },

  /**
   * 创建基础战斗动作
   * @param options 动作选项
   * @returns 战斗动作对象
   */
  create(options: {
    type: BattleAction['type']
    sourceId: string
    targetId: string
    skillId?: string
    skillName?: string
    itemId?: string
    buffId?: string
    damage?: number
    heal?: number
    success?: boolean
    isHit?: boolean
    isCrit?: boolean
    critDamage?: number
    effects?: BattleEffect[]
    turn: number
  }): BattleAction {
    return {
      id: this.generateId(options.type),
      type: options.type,
      sourceId: options.sourceId,
      targetId: options.targetId,
      skillId: options.skillId,
      skillName: options.skillName,
      itemId: options.itemId,
      buffId: options.buffId,
      damage: options.damage ?? 0,
      heal: options.heal ?? 0,
      success: options.success ?? true,
      isHit: options.isHit,
      isCrit: options.isCrit,
      critDamage: options.critDamage,
      timestamp: Date.now(),
      turn: options.turn,
      effects: options.effects ?? [],
    }
  },

  /**
   * 创建攻击动作
   */
  createAttack(options: {
    sourceId: string
    targetId: string
    damage?: number
    isHit?: boolean
    isCrit?: boolean
    critDamage?: number
    effects?: BattleEffect[]
    turn: number
  }): BattleAction {
    return this.create({ type: 'attack', ...options })
  },

  /**
   * 创建技能动作
   */
  createSkill(options: {
    sourceId: string
    targetId: string
    skillId: string
    skillName?: string
    damage?: number
    heal?: number
    isHit?: boolean
    isCrit?: boolean
    critDamage?: number
    effects?: BattleEffect[]
    turn: number
  }): BattleAction {
    return this.create({ type: 'skill', ...options })
  },

  /**
   * 创建Buff/DeBuff动作
   */
  createBuff(options: {
    sourceId: string
    targetId: string
    buffId: string
    effects?: BattleEffect[]
    turn: number
  }): BattleAction {
    return this.create({ type: 'buff', ...options })
  },

  /**
   * 创建物品动作
   */
  createItem(options: {
    sourceId: string
    targetId: string
    itemId: string
    heal?: number
    effects?: BattleEffect[]
    turn: number
  }): BattleAction {
    return this.create({ type: 'item', ...options })
  },

  /**
   * 创建状态动作
   */
  createStatus(options: {
    sourceId: string
    targetId: string
    success?: boolean
    effects?: BattleEffect[]
    turn: number
  }): BattleAction {
    return this.create({ type: 'status', ...options })
  },
}

/**
 * 战斗效果接口
 * 表示战斗中产生的单一效果
 * 包含效果的类型、数值、关联的 Buff 以及效果描述
 * 用于描述战斗动作产生的具体效果（如伤害、治疗、Buff 等）
 */
export interface BattleEffect {
  type: EffectType
  targetId?: string
  value?: number
  buffId?: string
  instanceId?: string
  duration?: number
  description: string
  isCritical?: boolean
}

/**
 * 战斗状态接口
 * 表示战斗的完整运行时状态
 * 包含战斗 ID、所有参与者、战斗动作记录、回合顺序、当前回合等核心信息
 * 用于在战斗过程中实时跟踪和更新战斗状态
 */
export interface BattleState {
  battleId: string
  participants: Map<string, BattleEntity>
  actions: BattleAction[]
  /** 回合顺序，按速度规则排序 */
  turnOrder: string[]
  /** 当前行动次序索引（0-based，表示当前回合内的第几个行动） */
  currentTurn: number
  /** 当前回合数（1-based，从 1 开始） */
  currentRound: number
  /** 战斗状态 */
  battleState: BattleStatus
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
  skills?: SkillSet
}

/**
 * 动画类型联合类型
 * 定义所有支持的动画事件类型
 */
export type AnimationType =
  | typeof BattleEventCodes.DAMAGE_ANIMATION
  | typeof BattleEventCodes.MISS_ANIMATION
  | typeof BattleEventCodes.BUFF_EFFECT
  | typeof BattleEventCodes.SKILL_EFFECT

/**
 * 动画队列项接口
 * 定义动画队列中每个动画项的结构
 */
export interface AnimationQueueItem {
  /** 动画类型 */
  type: AnimationType
  /** 动画数据 */
  data: AnimationData
  /** 动画持续时间（毫秒） */
  duration: number
  /** Promise 解析函数，动画完成时调用 */
  resolve: () => void
}

/**
 * 动画数据基础接口
 * 所有动画数据的公共属性
 */
export interface BaseAnimationData {
  /** 动作来源ID（可选） */
  sourceId?: string
  /** 目标ID */
  targetId: string
}

/**
 * 伤害动画数据
 */
export interface DamageAnimationData extends BaseAnimationData {
  /** 伤害/治疗值 */
  damage: number
  /** 是否暴击 */
  isCritical: boolean
  /** 伤害类型 */
  damageType: string
  /** 是否为治疗 */
  isHeal: boolean
}

/**
 * 闪避动画数据
 */
export interface MissAnimationData extends BaseAnimationData {
  /** 闪避原因描述（可选） */
  reason?: string
}

/**
 * Buff效果动画数据
 */
export interface BuffEffectAnimationData extends BaseAnimationData {
  /** Buff名称 */
  buffName: string
  /** 是否为正面Buff */
  isPositive: boolean
}

/**
 * 技能效果动画数据
 */
export interface SkillEffectAnimationData extends BaseAnimationData {
  /** 技能名称 */
  skillName: string
  /** 效果类型 */
  effectType: string
  /** 伤害类型 */
  damageType: string
}

/**
 * 动画数据联合类型
 */
export type AnimationData =
  | DamageAnimationData
  | MissAnimationData
  | BuffEffectAnimationData
  | SkillEffectAnimationData

/**
 * 战斗数据接口
 * 描述战斗的完整状态和数据
 * 包含战斗的核心运行时信息（参与者、回合、状态等）以及战斗控制相关属性
 * 是战斗系统中最全面的数据结构，用于管理整个战斗的生命周期
 */
export interface BattleData {
  /** 战斗唯一标识符 */
  battleId: string
  /** 参与者映射，以参与者ID为键 */
  participants: Map<string, BattleEntity>
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
  /** 是否开启自动战斗 */
  autoBattle: boolean
  /** 自动战斗定时器ID */
  autoBattleIntervalId?: symbol
  /** 技能管理器实例（可选，用于技能执行） */
  skillManager?: import('@/core/skill/SkillManager').SkillManager
}

/** 战斗回放系统版本号 */
export const BATTLE_REPLAY_VERSION = '1.0.0'

/** Buff实例快照 */
export interface BuffInstanceSnapshot {
  buffId: string
  instanceId: string
  remainingTurns: number
  stacks: number
  sourceId: string
}

/** 参与者状态快照 */
export interface ParticipantSnapshot {
  id: string
  name: string
  type: ParticipantSide
  team: ParticipantSide
  hp: number
  maxHp: number
  energy: number
  maxEnergy: number
  buffs: BuffInstanceSnapshot[]
  skillCooldowns: Record<string, number>
  statusEffects: StatusEffect[]
  attributes: {
    attack: number
    defense: number
    speed: number
    critRate: number
    critDamage: number
  }
}

/** 战斗状态快照 */
export interface BattleStateSnapshot {
  timestamp: number
  turn: number
  roundIndex: number
  participants: ParticipantSnapshot[]
  currentActorId?: string
}

/** 回合数据 */
export interface BattleRound {
  roundNumber: number
  startSnapshot?: BattleStateSnapshot
  endSnapshot?: BattleStateSnapshot
  events: BattleEvent[]
}

/** 战斗结果 */
export interface BattleResult {
  winner: ParticipantSide
  duration: number
  totalRounds: number
  totalEvents: number
  stats: {
    totalDamage: number
    totalHealing: number
    criticalHits: number
    dodges: number
    buffsApplied: number
    buffsRemoved: number
  }
}

/** 增强的战斗回放数据 */
export interface BattleReplay {
  version: string
  replayId: string
  randomSeed: string
  checksum: string
  startTime: number
  endTime?: number
  duration: number
  initialState: BattleStateSnapshot
  finalState?: BattleStateSnapshot
  rounds: BattleRound[]
  logs: BattleLogEntry[]
  result?: BattleResult
}

/** 事件类型枚举 */
export enum BattleEventType {
  ACTION = 'action',
  STATE_CHANGE = 'state_change',
  TURN_START = 'turn_start',
  TURN_END = 'turn_end',
  BATTLE_START = 'battle_start',
  BATTLE_END = 'battle_end',
  BUFF_ADD = 'buff_add',
  BUFF_REMOVE = 'buff_remove',
  BUFF_UPDATE = 'buff_update',
  DAMAGE = 'damage',
  HEAL = 'heal',
}

/** 战斗事件 */
export interface BattleEvent {
  eventId: string
  type: string
  timestamp: number
  turn: number
  roundNumber: number
  data: any
}

/** 扩展的战斗事件 */
export interface ReplayBattleEvent {
  eventId: string
  type: BattleEventType
  timestamp: number
  turn: number
  roundNumber: number
  sourceId?: string
  targetId?: string
  data: Record<string, any>
}

/** 快照索引项 */
export interface SnapshotIndexItem {
  snapshotIndex: number
  eventIndex: number
  turn: number
  roundNumber: number
  timestamp: number
}
