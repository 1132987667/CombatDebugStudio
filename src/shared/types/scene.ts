/**
 * 场景数据接口定义
 */

/** 场地效果修饰符 */
export interface FieldEffectModifier {
  attribute: string
  value: number
  type: 'ADDITIVE' | 'PERCENTAGE'
}

/** 场地元素修正 */
export interface FieldEffectElemental {
  bonusElements?: string[]
  resistElements?: string[]
  percent: number
}

/** 场地周期效果 */
export interface FieldEffectPeriodic {
  phase: 'turn_start' | 'turn_end'
  effect: 'damage' | 'heal' | 'energy'
  value: number
  isPercent?: boolean
}

/** 场地效果配置 */
export interface FieldEffectConfig {
  id: string
  name: string
  description: string
  type: 'modifier' | 'elemental' | 'periodic'
  duration: number
  faction: 'all' | 'ally' | 'enemy'
  modifiers?: FieldEffectModifier[]
  elemental?: FieldEffectElemental
  periodic?: FieldEffectPeriodic
}

/**
 * 场景难度编组：直接列敌人（enemyIds）与引用预设阵容（lineupId）二选一，lineupId 优先。
 * 兼容旧数据：enemyIds 缺省时回退 lineupId 展开。
 */
export interface SceneDifficulty {
  enemyIds?: string[]
  lineupId?: string
}

export interface SceneData {
  id: string
  name: string
  background: string
  difficulties: {
    easy: SceneDifficulty
    normal: SceneDifficulty
    hard: SceneDifficulty
  }
  requiredLevel: number
  rewards: {
    exp: number
    gold: number
  }
  /** 场地效果列表 */
  fieldEffects?: FieldEffectConfig[]
  /** 通关后解锁的关卡 id（线性关卡链） */
  unlocks?: string
  /** 隐藏 BOSS（通关特定难度后出现） */
  hiddenBoss?: {
    enemyId: string
    /** 解锁条件：通关的难度档位（easy/normal/hard） */
    unlockDifficulty: 'easy' | 'normal' | 'hard'
    description?: string
  }
  /** 通关奖励掉落组（引用 drops 表） */
  rewardDrops?: string[]
}
