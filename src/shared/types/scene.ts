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

export interface SceneData {
  id: string
  name: string
  background: string
  difficulties: {
    easy: { enemyIds: string[] }
    normal: { enemyIds: string[] }
    hard: { enemyIds: string[] }
  }
  requiredLevel: number
  rewards: {
    exp: number
    gold: number
  }
  /** 场地效果列表 */
  fieldEffects?: FieldEffectConfig[]
}
