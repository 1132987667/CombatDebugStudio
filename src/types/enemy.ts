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

/**
 * 敌人技能配置接口
 * 支持字符串或字符串数组格式
 */
export interface EnemySkills {
  /** 小技能ID（字符串或字符串数组） */
  small?: string[]
  /** 被动技能ID（字符串或字符串数组） */
  passive?: string[]
  /** 终极技能ID（字符串或字符串数组） */
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
