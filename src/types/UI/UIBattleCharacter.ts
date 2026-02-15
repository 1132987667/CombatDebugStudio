import type { BuffConfig } from '@/types/buff'
import { ParticipantSide } from '@/types/battle'
import type { SkillConfig } from '@/types'

/**
 * 属性值类型
 */
export type AttributeValueType = '数值' | '百分比'

/**
 * 属性来源类型（可扩展）
 */
export type AttributeSourceType = '基础' | '装备' | '天赋' | '被动技能' | 'buff' | '其他'

/**
 * 单个属性来源选项
 */
export interface AttributeOption {
  /** 来源类型 */
  from: AttributeSourceType
  /** 来源描述 */
  sourceName?: string
  /** 数值 */
  value: number
  /** 属性值类型 */
  valueType: AttributeValueType
}

/**
 * 属性对象结构
 * 用于存储属性的最终值及各项来源
 */
export interface AttributeValue {
  /** 计算后的最终值 */
  value: number
  /** 属性值类型 */
  valueType: AttributeValueType
  /** 属性来源详情数组（可扩展） */
  options: AttributeOption[]
}

/**
 * 技能配置接口
 * 定义角色的技能ID列表
 */
export interface UISkills {
  /** 小技能ID列表 */
  small?: SkillConfig[]
  /** 被动技能ID列表 */
  passive?: SkillConfig[]
  /** 终极技能ID列表 */
  ultimate?: SkillConfig[]
}

/**
 * UI角色接口定义
 * 用于前端展示的战斗角色数据结构
 */
export interface UIBattleCharacter {
  /** 原始角色ID（配置ID） */
  originalId?: string
  /** 战斗实例ID */
  id: string
  /** 队伍归属 */
  team: ParticipantSide
  /** 角色名称 */
  name: string
  /** 等级 */
  level: number
  /** 最大生命值 */
  maxHp: number | AttributeValue
  /** 当前生命值 */
  currentHp: number
  /** 最大魔法值 */
  maxMp: number
  /** 当前魔法值 */
  currentMp: number
  /** 当前能量值 */
  currentEnergy: number
  /** 最大能量值 */
  maxEnergy: number
  /** 最小攻击力 */
  minAttack: number
  /** 最大攻击力 */
  maxAttack: number
  /** 平均攻击力（计算值） */
  attack: number | AttributeValue
  /** 防御力 */
  defense: number | AttributeValue
  /** 速度 */
  speed: number | AttributeValue
  /** 暴击率（百分比，0-100） */
  critRate: number | AttributeValue
  /** 暴击伤害（百分比，≥100） */
  critDamage: number | AttributeValue
  /** 免伤率（百分比，0-100） */
  damageReduction: number | AttributeValue
  /** 气血加成（百分比） */
  healthBonus: number | AttributeValue
  /** 攻击加成（百分比） */
  attackBonus: number | AttributeValue
  /** 防御加成（百分比） */
  defenseBonus: number | AttributeValue
  /** 速度加成（百分比） */
  speedBonus: number | AttributeValue
  /** 是否启用 */
  enabled: boolean
  /** 是否先手 */
  isFirst: boolean
  /** Buff列表 */
  buffs: Array<BuffConfig>
  /** 技能配置 */
  skills: UISkills
}

export interface EnemyStats {
  health: number
  minAttack: number
  maxAttack: number
  defense: number
  speed: number
}
