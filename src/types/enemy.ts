export interface EnemyStats {
  health: number
  minAttack: number
  maxAttack: number
  defense: number
  speed: number
}

export interface EnemyDrop {
  itemId: string
  quantity: number
  chance: number
}

export interface EnemySkills {
  small?: string[]
  passive?: string[]
  ultimate?: string[]
}

export interface Enemy {
  id: string
  name: string
  level: number
  stats: EnemyStats
  drops: EnemyDrop[]
  skills: EnemySkills
}

export interface EnemyInstance extends Enemy {
  currentHealth: number
  buffs: string[]
  activeSkills: Set<string>
  lastActionTime: number
  isDefeated: boolean
  
  // Character-like interface for battle compatibility
  getAttribute(attribute: string): number
  setAttribute(attribute: string, value: number): void
  addBuff(buffInstanceId: string): void
  removeBuff(buffInstanceId: string): void
  hasBuff(buffId: string): boolean
}

export interface EnemyManager {
  getEnemy(enemyId: string): Enemy | undefined
  createEnemyInstance(enemyId: string): EnemyInstance
  removeEnemyInstance(enemyInstanceId: string): void
  getAllEnemyInstances(): EnemyInstance[]
}
