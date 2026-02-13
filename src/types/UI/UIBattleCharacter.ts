import type { BuffConfig } from '@/types/buff'
import { ParticipantSide } from '@/types/battle'
import type { SkillConfig } from '@/types'
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
  maxHp: number
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
  attack: number
  /** 防御力 */
  defense: number
  /** 速度 */
  speed: number
  /** 暴击率（百分比，0-100） */
  critRate: number
  /** 暴击伤害（百分比，≥100） */
  critDamage: number
  /** 免伤率（百分比，0-100） */
  damageReduction: number
  /** 气血加成（百分比） */
  healthBonus: number
  /** 攻击加成（百分比） */
  attackBonus: number
  /** 防御加成（百分比） */
  defenseBonus: number
  /** 速度加成（百分比） */
  speedBonus: number
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
