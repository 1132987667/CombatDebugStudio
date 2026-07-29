import type { SkillStep, SkillConfig, EffectType } from '@/domain/skill/types'

/**
 * 文件: effect.ts
 * 创建日期: 2026-02-19
 * 作者: CombatDebugStudio
 * 功能: 定义效果接口和相关类型
 * 描述: 统一技能和Buff的效果接口，包含伤害、治疗、Buff等效果类型
 */

export const STATUS_NAMES = {
  // 控制类
  STUN: '眩晕',
  SILENCE: '沉默',
  FREEZE: '冰冻',
  SLEEP: '睡眠',
  BIND: '束缚',
  /** 混乱: 行动目标随机化（可能攻击友方） */
  CONFUSION: 'confusion',
  /** 恐惧: 无法主动攻击，只能逃跑/跳过行动 */
  FEAR: 'fear',
  // 伤害/治疗类
  DOT: '持续伤害',
  HEAL: '持续治疗',
  BURN: '灼烧',
  POISON: '中毒',
  DRAIN: '吸取',
  REFLECT: '反射',
  // 防御类
  SHIELD: '护盾',
  // 增益/减益
  BUFF: '增益',
  DEBUFF: '减益',
  HEAL_REDUCTION: '减治疗',
  // 动作类
  DEAL_DAMAGE: '造成伤害',
  KNOCKBACK: '击退',
  PULL: '拉扯',
  TELEPORT: '传送',
  SUMMON: '召唤',
  TRANSFORM: '变身',
  REVIVE: '复活',
  CLEANSE: '净化',
  DISPEL: '驱散',
  AURA: '光环',
} as const

export type CombatTerm = keyof typeof STATUS_NAMES

export const CONTROL_KIND = {
  /** 眩晕: 无法进行任何行动 */
  STUN: 'stun',
  /** 沉默: 无法使用技能，但可普攻 */
  SILENCE: 'silence',
  /** 冰冻: 无法行动，可能有额外效果 */
  FREEZE: 'freeze',
  /** 睡眠: 无法行动，受攻击后解除 */
  SLEEP: 'sleep',
  /** 束缚: 无法行动 */
  BIND: 'bind',
} as const
export type ControlKind = (typeof CONTROL_KIND)[keyof typeof CONTROL_KIND]

export const CONTROL_NAMES: Record<string, string> = {
  [CONTROL_KIND.STUN]: STATUS_NAMES.STUN,
  [CONTROL_KIND.SILENCE]: STATUS_NAMES.SILENCE,
  [CONTROL_KIND.FREEZE]: STATUS_NAMES.FREEZE,
  [CONTROL_KIND.SLEEP]: STATUS_NAMES.SLEEP,
  [CONTROL_KIND.BIND]: STATUS_NAMES.BIND,
}

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
  HEAL: 'heal',
  /** 护盾 */
  SHIELD: 'shield',
  /** 减治疗效果 */
  HEAL_REDUCTION: 'heal_reduction',
  /** 灼烧 */
  BURN: 'burn',
  /** 中毒 */
  POISON: 'poison',
  ...CONTROL_KIND,
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
