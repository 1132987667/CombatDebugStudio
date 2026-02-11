import type { Character } from './character'
import type { EnemyInstance } from './enemy'
import type { BattleAI } from '@/core/BattleAI'
import type { SkillManager } from '@/core/skill/SkillManager'

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

  getSkills(): any[]
  hasSkill(skillId: string): boolean
}

export interface BattleCharacter extends BattleEntity {
  type: ParticipantSide
  character: Character
}

export interface BattleEnemy extends BattleEntity {
  type: ParticipantSide
  enemy: EnemyInstance
}

export type BattleParticipant = BattleCharacter | BattleEnemy

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
 * 参与者信息接口
 * 用于创建战斗参与者的基础数据结构
 * 包含从enemy迁移的所有战斗属性
 * 同时实现了BattleEntity的所有方法
 */
export interface ParticipantInfo {
  /** 参与者唯一标识符 */
  id: string
  /** 参与者名称 */
  name: string
  /** 参与者类型（我方/敌方） */
  type: ParticipantSide
  /** 最大生命值 */
  maxHealth: number
  /** 当前生命值 */
  currentHealth: number
  /** 最大能量值 */
  maxEnergy: number
  /** 当前能量值（初始值25） */
  currentEnergy: number
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
  critRate: number
  /** 暴击伤害（百分比，≥100，默认125） */
  critDamage: number
  /** 免伤率（百分比，0-100） */
  damageReduction: number
  /** 气血加成（百分比，可正可负） */
  healthBonus: number
  /** 攻击加成（百分比，可正可负） */
  attackBonus: number
  /** 防御加成（百分比，可正可负） */
  defenseBonus: number
  /** 速度加成（百分比，可正可负） */
  speedBonus: number
  /** Buff实例ID列表 */
  buffs: string[]
  /** 技能配置 */
  skills: {
    small?: string[]
    passive?: string[]
    ultimate?: string[]
  }

  /** 获取属性值 */
  getAttribute(attribute: string): number
  /** 设置属性值 */
  setAttribute(attribute: string, value: number): void
  /** 添加Buff */
  addBuff(buffInstanceId: string): void
  /** 移除Buff */
  removeBuff(buffInstanceId: string): void
  /** 检查是否拥有指定Buff */
  hasBuff(buffId: string): boolean
  /** 受到伤害 */
  takeDamage(amount: number): number
  /** 治疗 */
  heal(amount: number): number
  /** 是否存活 */
  isAlive(): boolean
  /** 增加能量 */
  gainEnergy(amount: number): void
  /** 消耗能量 */
  spendEnergy(amount: number): boolean
  /** 行动后处理 */
  afterAction(): void
  /** 是否满血 */
  isFullHealth(): boolean
  /** 是否需要治疗 */
  needsHealing(): boolean
  /** 获取所有技能 */
  getSkills(): any[]
  /** 检查是否拥有指定技能 */
  hasSkill(skillId: string): boolean
}

export interface BattleSystem {
  createBattle(participantsInfo: ParticipantInfo[]): BattleState
  processTurn(battleId: string): Promise<void>
  executeAction(action: BattleAction): Promise<BattleAction>
  getBattleState(battleId: string): BattleState | undefined
  endBattle(battleId: string, winner: ParticipantSide): void
  resetBattle(battleId: string): void
  getCurParticipantsInfo(): ParticipantInfo[]
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
