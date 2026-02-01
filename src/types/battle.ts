import type { Character } from './character'
import type { EnemyInstance } from './enemy'

export type BattleEntityType = 'character' | 'enemy'

export interface BattleEntity {
  id: string
  name: string
  level: number
  type: BattleEntityType
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
  type: 'character'
  character: Character
}

export interface BattleEnemy extends BattleEntity {
  type: 'enemy'
  enemy: EnemyInstance
}

export type BattleParticipant = BattleCharacter | BattleEnemy

export interface BattleAction {
  id: string
  type: 'attack' | 'skill' | 'buff' | 'item'
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
  winner?: BattleEntityType
}

export interface ParticipantInfo {
  id: string
  name: string
  type: 'character' | 'enemy'
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
  endBattle(battleId: string, winner: BattleEntityType): void
}
