import type { Character } from './character'
import type { EnemyInstance } from './enemy'
import type { BattleAI } from '@/core/BattleAI'
import type { SkillManager } from '@/core/skill/SkillManager'

/**
 * 战斗阶段枚举
 * 定义战斗生命周期中的所有阶段
 */
export enum BattlePhase {
  /** 已就绪 - 战斗系统初始化完成，等待参与者加入 */
  READY = 'READY',
  /** 对战双方已就位 - 所有参与者已添加到战斗中 */
  BOTH_SIDES_READY = 'BOTH_SIDES_READY',
  /** 战前准备 - 初始化技能、buff等战前状态 */
  PRE_BATTLE_PREPARATION = 'PRE_BATTLE_PREPARATION',
  /** 开始对战 - 战斗正式开始，进入战斗循环 */
  BATTLE_STARTED = 'BATTLE_STARTED',
  /** 回合开始 - 新回合开始 */
  ROUND_START = 'ROUND_START',
  /** 回合结束 - 当前回合结束 */
  ROUND_END = 'ROUND_END',
  /** 战斗结算 - 计算战斗结果、奖励等 */
  BATTLE_SETTLEMENT = 'BATTLE_SETTLEMENT',
  /** 对战结束 - 战斗完全结束，可以清理资源 */
  BATTLE_ENDED = 'BATTLE_ENDED',
}

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
  /** 战斗是否活跃 */
  isActive: boolean
  /** 战斗开始时间戳 */
  startTime: number
  /** 战斗结束时间戳（可选） */
  endTime?: number
  /** 战斗胜利者（可选） */
  winner?: ParticipantSide
  /** 每个参与者的AI实例映射 */
  aiInstances: Map<string, BattleAI>
  /** 技能管理器实例 */
  skillManager: SkillManager
  /** 战斗当前阶段 */
  phase?: BattlePhase
}
