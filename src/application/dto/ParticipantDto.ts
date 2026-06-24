/**
 * 参与者数据传输对象
 * 用于应用层与表现层之间的数据传递
 */
import type { ParticipantSide, SkillSet } from '@/domain/battle/types';

export interface ParticipantInfo {
  /** 参与者唯一标识符 */
  id: string
  /** 参与者名称 */
  name: string
  /** 参与者类型（我方/敌方） */
  type: ParticipantSide
  /** 队伍归属 */
  team: ParticipantSide
  /** 最大生命值 */
  maxHealth: number
  /** 当前生命值 */
  currentHealth?: number
  /** 最大能量值 */
  maxEnergy?: number
  /** 当前能量值（初始值5） */
  currentEnergy?: number
  /** 等级（≥1） */
  level: number
  /** 最小攻击力（≤最大攻击） */
  minAttack: number
  /** 最大攻击力（≥最小攻击） */
  maxAttack: number
  /** 防御力（≥0） */
  defense: number
  /** 速度（≥1） */
  speed: number
  /** 暴击率（百分比，0-100，默认0） */
  critRate?: number
  /** 暴击伤害（百分比，≥100，默认25） */
  critDamage?: number
  /** 免伤率（百分比，0-100） */
  damageReduction?: number
  /** 气血加成（百分比，可正可负） */
  healthBonus?: number
  /** 攻击加成（百分比，可正可负） */
  attackBonus?: number
  /** 防御加成（百分比，可正可负） */
  defenseBonus?: number
  /** 速度加成（百分比，可正可负） */
  speedBonus?: number
  /** Buff实例ID列表 */
  buffs?: string[]
  /** 技能配置 */
  skills?: SkillSet
}
