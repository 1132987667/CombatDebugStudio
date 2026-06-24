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
export const EFFECT_TYPES = {
  DAMAGE: 'damage',
  HEAL: 'heal',
  BUFF: 'buff',
  DEBUFF: 'debuff',
  MISS: 'miss',
  STATUS: 'status',
  CRITICAL: 'critical',
  SPECIAL: 'special',
} as const

/**
 * 效果类型
 * 定义技能和Buff的效果类型
 */
export type EffectType = (typeof EFFECT_TYPES)[keyof typeof EFFECT_TYPES]

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
 * 技能步骤接口扩展
 * 包含效果配置
 * @deprecated 请使用 @/domain/skill/types 中的 ExtendedSkillStep 接口
 */
export interface SkillStepWithEffect extends SkillStep {
  /**
   * 效果配置
   */
  effect?: EffectConfig
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
