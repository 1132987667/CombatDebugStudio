export type ModifierType = 'ADDITIVE' | 'MULTIPLICATIVE' | 'PERCENTAGE'

export type AttributeType = 
  | 'HP'             // 生命值
  | 'MP'             // 魔法值
  | 'ATK'            // 攻击力
  | 'DEF'            // 防御力
  | 'SPD'            // 速度
  | 'CRIT_RATE'      // 暴击率
  | 'CRIT_DMG'       // 暴击伤害
  | 'ACCURACY'       // 命中率
  | 'EVADE'          // 闪避率
  | 'LIFESTEAL'      // 吸血
  | 'REGENERATION'   // 生命回复
  | 'MANA_REGEN'     // 魔法回复
  | 'DAMAGE_BOOST'   // 伤害提升
  | 'DAMAGE_REDUCE'  // 伤害减免

export interface Modifier {
  buffInstanceId: string
  attribute: AttributeType
  value: number
  type: ModifierType
}

export interface ModifierConfig {
  attribute: AttributeType
  value: number
  type: ModifierType
  duration?: number
  maxStacks?: number
}

export interface ModifierResult {
  baseValue: number
  finalValue: number
  modifiers: Modifier[]
  breakdown: {
    additive: number
    multiplicative: number
    percentage: number
  }
}
