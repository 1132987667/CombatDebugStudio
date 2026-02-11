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
  maxEnergy: number // Fixed at 150
  buffs: string[]

  // Common battle methods
  getAttribute(attribute: string): number
  setAttribute(attribute: string, value: number): void
  addBuff(buffInstanceId: string): void
  removeBuff(buffInstanceId: string): void
  hasBuff(buffId: string): boolean
  takeDamage(amount: number): number
  heal(amount: number): number
  isAlive(): boolean

  // Energy management
  gainEnergy(amount: number): void
  spendEnergy(amount: number): boolean
  afterAction(): void
  isFullHealth(): boolean
  needsHealing(): boolean
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
  turnOrder: string[]
  currentTurn: number
  isActive: boolean
  startTime: number
  endTime?: number
  winner?: ParticipantSide
}

export interface ParticipantInfo {
  id: string
  name: string
  type: ParticipantSide
  maxHealth: number
  currentHealth: number
  maxEnergy: number
  currentEnergy: number
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
  /** 回合顺序，按参与者ID排序 */
  turnOrder: string[]
  /** 当前回合索引 */
  currentTurn: number
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
}
