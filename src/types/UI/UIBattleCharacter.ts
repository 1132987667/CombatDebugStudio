import type { BuffConfig } from '@/types/buff'
import { ParticipantSide } from '@/types/battle'

// UI角色接口定义
export interface UIBattleCharacter {
  originalId?: string
  id: string
  team: ParticipantSide
  name: string
  level: number
  maxHp: number
  currentHp: number
  maxMp: number
  currentMp: number
  currentEnergy: number
  maxEnergy: number
  attack: number
  defense: number
  speed: number
  enabled: boolean
  isFirst: boolean
  buffs: Array<BuffConfig>
}

export interface EnemyStats {
  health: number
  minAttack: number
  maxAttack: number
  defense: number
  speed: number
}
