import type { SkillStep, SkillConfig } from '@/domain/skill/types'

/**
 * 文件: effect.ts
 * 创建日期: 2026-02-19
 * 作者: CombatDebugStudio
 * 功能: 定义效果接口和相关类型
 * 描述: 统一技能和Buff的效果接口，包含伤害、治疗、Buff等效果类型
 */

/**
 * 效果类型常量
 * 统一的效果类型定义，供全项目使用
 */
export const EffectType = {
  DAMAGE: 'damage',
  HEAL: 'heal',
  BUFF: 'buff',
  DEBUFF: 'debuff',
  MISS: 'miss',
  STATUS: 'status',
  CRITICAL: 'critical',
  SPECIAL: 'special',
  SHIELD: 'shield',
} as const
/**
 * 效果类型
 * 定义技能和Buff的效果类型
 */
export type EffectType = (typeof EffectType)[keyof typeof EffectType]

/**
 * 效果标签枚举
 * 用于替代硬编码的 Buff ID 列表，通过标签驱动查询
 * 配置在 JSON 中的 tags 字段使用这些值
 */
export const EffectTag = {
  /** 增益效果 */
  BUFF: 'buff',
  /** 减益效果 */
  DEBUFF: 'debuff',
  /** 控制效果 */
  CONTROL: 'control',
  /** 持续伤害 */
  DOT: 'dot',
  /** 持续治疗 */
  HOT: 'hot',
  /** 护盾 */
  SHIELD: 'shield',
  /** 减治疗效果 */
  HEAL_REDUCTION: 'heal_reduction',
  /** 灼烧 */
  BURN: 'burn',
  /** 中毒 */
  POISON: 'poison',
  /** 眩晕 */
  STUN: 'stun',
  /** 沉默 */
  SILENCE: 'silence',
  /** 冰冻 */
  FREEZE: 'freeze',
  /** 睡眠 */
  SLEEP: 'sleep',
  /** 束缚 */
  BIND: 'bind',
} as const

/**
 * 效果标签类型
 */
export type EffectTag = (typeof EffectTag)[keyof typeof EffectTag]

/**
 * 效果接口
 * 定义技能和Buff的统一效果接口
 */
export interface Effect {
  /**
   * 效果唯一标识符
   */
  id: string

  /**
   * 效果类型
   */
  type: EffectType

  /**
   * 效果参数
   */
  params: Record<string, any>

  /**
   * 效果描述（可选）
   */
  description?: string
}

/**
 * 效果配置接口
 * 定义技能步骤中的效果配置
 */
export interface EffectConfig {
  /**
   * 效果ID
   */
  effectId: string

  /**
   * 效果参数（可选）
   * 用于覆盖默认参数
   */
  effectParams?: Record<string, any>
}

/**
 * 技能配置接口扩展
 * 包含效果配置
 */
export interface SkillConfigWithEffect extends SkillConfig {
  /**
   * 技能效果配置（可选）
   */
  effectConfig?: EffectConfig
}
