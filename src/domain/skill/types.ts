/**
 * 文件: skill.ts
 * 描述: 技能系统类型定义
 * 版本:
 */

import type { ModifierTemplate } from '@/domain/attribute/modifier-template'

/**
 * 技能类型枚举
 */
export const SkillType = {
  ALL: 'all', // passive + active -> 主动技能 + 被动技能
  ACTIVE: 'active', // small + ultimate -> 小技能 + 大招
  PASSIVE: 'passive',
  SMALL: 'small',
  ULTIMATE: 'ultimate',
}
export type SkillType = (typeof SkillType)[keyof typeof SkillType]

export const SkillTypeName = {
  [SkillType.ALL]: '所有技能',
  [SkillType.ACTIVE]: '主动技能',
  [SkillType.PASSIVE]: '被动技能',
  [SkillType.SMALL]: '小技能',
  [SkillType.ULTIMATE]: '大招',
}
export type SkillTypeName = (typeof SkillTypeName)[keyof typeof SkillTypeName]

/**
 * 攻击方式（用于伤害减免计算）
 * ponytail: 值从 'normal_attack'/'skill_attack' 简化为 'normal'/'skill'
 */
export const AttackType = {
  NORMAL: 'normal',
  SKILL: 'skill',
}

export type AttackType = (typeof AttackType)[keyof typeof AttackType]

/**
 * 伤害大类
 */
export const DamageCategory = {
  PHYSICAL: 'physical',
  ELEMENTAL: 'elemental',
  TRUE: 'true',
}

export type DamageCategory = (typeof DamageCategory)[keyof typeof DamageCategory]

/**
 * 属性类型
 * 物理 金 木 水 火 土
 */
export type ElementType = 'PHYSICAL' | 'JIN' | 'MU' | 'SHU' | 'HUO' | 'TU'

/**
 * 目标阵营
 */
export const TargetFaction = {
  ENEMY: 'enemy',       // 敌方
  ALLY: 'ally',       // 友方
  ALL: 'all',       // 所有单位
  SELF: 'self'       // 自身
}
export type TargetFaction = (typeof TargetFaction)[keyof typeof TargetFaction]

/**
 * 目标选择策略
 */
export const TargetStrategy = {
  ALL: 'all',        // 全部目标
  RANDOM: 'random',     // 随机
  LOWEST_HP: 'lowest_hp',  // 最低血量
  HIGHEST_HP: 'highest_hp', // 最高血量
  FRONT: 'front',      // 前排
  BACK: 'back',       // 后排
  ADJACENT: 'adjacent',   // 相邻
  RANDOM_ADJACENT: 'random_adjacent', // 随机相邻
  FIRST: 'first',      // 第一个（默认）
} as const
export type TargetStrategy = (typeof TargetStrategy)[keyof typeof TargetStrategy]

/**
 * 技能定义接口（AI系统使用的运行时类型）
 */
export interface Skill {
  id: string // 技能唯一标识符
  name: string // 技能名称
  type: SkillType // 技能类型（被动/小技能/大招）
  energyCost: number // 能量消耗
  cooldown: number // 冷却回合数
  lastUsed: number // 上次使用回合
  description: string // 技能描述
  damage?: number // 伤害值（可选）
  heal?: number // 治疗值（可选）
  buffId?: string // 关联的Buff ID（可选）
  steps: SkillStep[] // 技能执行步骤
  level?: number // 技能等级
  levelValue?: number // 技能等级成长值
}

/**
 * 伤害/治疗计算配置接口
 */
export interface DamageHealCalculationConfig {
  /**
   * 基础值
   * 作为伤害/治疗计算的基础数值
   */
  baseValue: number

  /**
   * 额外值列表
   * 由多个(关联属性, 比率)键值对组成的数组
   */
  extraValues: Array<{
    /**
     * 关联属性名称
     * 如：'attack'、'defense'、'magicPower'等
     */
    attribute: string

    /**
     * 比率系数
     * 关联属性乘以该比率后加入最终计算
     */
    ratio: number
  }>

  /**
   * 伤害大类（仅DAMAGE类型使用）
   */
  damageCategory?: DamageCategory

  /**
   * 是否为单回合效果（仅HEAL类型使用）
   */
  isSingleTurn?: boolean
}

/**
 * 暴击配置接口
 */
export interface CriticalConfig {
  /**
   * 暴击率
   */
  rate: number

  /**
   * 暴击倍率
   */
  multiplier: number
}

/**
 * 扩展的技能步骤接口（DAMAGE/HEAL类型专用）
 */
export interface ExtendedSkillStep extends SkillStep {
  id?: string // 步骤ID 用于标识步骤的唯一ID
  targetId?: string // 目标ID 指定该步骤的目标角色ID
  calculation?: DamageHealCalculationConfig // 伤害/治疗计算配置 当type为DAMAGE或HEAL时使用
  targetModifiers?: Record<string, number> // 目标属性修正（可选） 对目标特定属性的修正系数
  criticalConfig?: CriticalConfig // 暴击配置（可选） 暴击率和倍率
  attackType?: AttackType // 攻击类型（可选） 指定该步骤的攻击类型（普通攻击、技能攻击）
}

/**
 * 计算错误接口
 */
export interface CalculationError {
  /**
   * 错误代码
   */
  code: string

  /**
   * 错误信息
   */
  message: string

  /**
   * 相关技能步骤
   */
  step: ExtendedSkillStep

  /**
   * 施放者（可选）
   */
  source?: any

  /**
   * 目标（可选）
   */
  target?: any

  /**
   * 时间戳
   */
  timestamp: number
}

/**
 * 组合式目标配置（新格式，推荐）
 */
export interface SkillTargetConfig {
  /** 目标阵营 */
  faction: TargetFaction
  /** 选择策略（默认 'first'） */
  strategy?: TargetStrategy
  /** 选择数量（默认 1，'all' 策略时忽略） */
  count?: number | typeof TargetStrategy.ALL
}

/**
 * 将 SkillTargetConfig 转换为人类可读的中文描述
 */
export function formatTargetConfig(config: SkillTargetConfig): string {
  const factionName: Record<string, string> = {
    enemy: '敌方', ally: '友方', all: '所有单位', self: '自身',
  }
  const strategyName: Record<string, string> = {
    all: '全部', random: '随机', lowest_hp: '最低血量', highest_hp: '最高血量',
    front: '前排', back: '后排', adjacent: '相邻', first: '',
  }
  const f = factionName[config.faction] || config.faction
  const s = strategyName[config.strategy || 'first']
  if (!s) return f
  const count = typeof config.count === 'number' ? `${config.count}个` : ''
  return `${s}${count}${f}`
}

/**
 * 资源消耗类型
 */
export enum CostType {
  ENERGY = '能量',
  HP = '生命值',
  NONE = '无消耗',
}

/**
 * 技能步骤类型枚举（扩展版）
 * 定义技能执行步骤的所有可能类型
 */
export const SkillStepType = {
  // === 新版步骤类型 ===
  DEAL_DAMAGE: 'deal_damage',       // 造成伤害（结构化）
  HEAL: 'heal',                     // 治疗目标（结构化）
  APPLY_BUFF: 'apply_buff',         // 施加 Buff/Debuff（通过 BuffId 引用）
  MODIFY_ATTRIBUTE: 'modify_attribute', // 直接修改属性（仅在被动技能初始化时由 GameDataProcessor 处理）
  // ponytail: 以下步骤类型为预留定义，当前零个技能配置使用，待需要时在 SkillExecutor 中实现
  AURA: 'aura',                     // 光环效果
  REMOVE_BUFF: 'remove_buff',       // 移除增益效果
  REMOVE_DEBUFF: 'remove_debuff',   // 移除减益效果
  CLEANSE: 'cleanse',               // 净化（移除所有负面效果）
  DISPEL: 'dispel',                 // 驱散（移除所有正面效果）
  STUN: 'stun',                     // 眩晕（已通过 apply_buff + buff_stun 实现）
  SILENCE: 'silence',               // 沉默（已通过 apply_buff 实现）
  KNOCKBACK: 'knockback',           // 击退
  PULL: 'pull',                     // 拉扯
  TELEPORT: 'teleport',             // 传送
  SUMMON: 'summon',                 // 召唤
  TRANSFORM: 'transform',           // 变身
  SHIELD: 'shield',                 // 护盾（有壳实现，无技能使用）
  REFLECT: 'reflect',               // 反射
  DRAIN: 'drain',                   // 吸取
  REVIVE: 'revive',                 // 复活
  CUSTOM: 'custom',                 // 自定义效果（通过自定义脚本实现）
} as const
export type SkillStepType = (typeof SkillStepType)[keyof typeof SkillStepType]

/**
 * 技能步骤接口
 * 定义技能执行的具体步骤及其参数
 */
export interface SkillStep {
  /**
   * 步骤类型
   */
  type: SkillStepType

  // ========== 新版字段 ==========
  /**
   * 目标选择配置（标准化，推荐）
   * 用于 deal_damage / heal / apply_buff / modify_attribute 等步骤
   */
  targetConfig?: SkillTargetConfig

  /**
   * 步骤级目标类型
   * 默认 undefined 表示复用技能级 selector 选出的主目标
   * 设置此字段后，该步骤会重新选择目标执行（如溅射/相邻）
   */
  targetType?: TargetStrategy

  /**
   * 伤害大类
   * 用于 deal_damage 步骤，决定防御公式（physical/elemental/true）
   */
  damageCategory?: DamageCategory

  /**
   * 重复次数
   * 用于多段伤害/治疗
   */
  repeat?: number

  /**
   * Buff ID
   * 用于 apply_buff 步骤，引用 Buff 配置
   */
  buffId?: string

  /**
   * 光环 ID
   * 用于 aura 步骤，引用光环配置
   */
  auraId?: string

  /**
   * 直接修饰符列表
   * 用于 modify_attribute 步骤，直接定义属性修正
   */
  modifiers?: ModifierTemplate[]

  /**
   * 效果ID
   */
  effectId?: string

  /**
   * 持续时间(回合数)
   * -1 表示永久
   */
  duration?: number

  /**
   * 叠加层数
   */
  stacks?: number

  /**
   * 触发条件表达式
   */
  condition?: string

  /**
   * 效果参数（旧版扩展字段）
   */
  effectParams?: Record<string, any>

  /**
   * 资源消耗类型
   */
  costType?: CostType

  /**
   * 自定义参数
   */
  parameters?: Record<string, any>

  /**
   * 优先级
   */
  priority?: number
}

/**
 * 技能配置接口
 */
export interface SkillConfig {
  id: string // 技能唯一标识符
  name: string // 技能名称
  description?: string // 技能描述
  energyCost: number // 能量消耗
  cooldown: number // 冷却时间(回合数)
  maxUses?: number // 最大使用次数
  selector: SkillTargetConfig // 目标选择配置
  steps: SkillStep[] // 技能步骤列表
  condition?: string // 施放条件
  skillType?: SkillType // 技能类型
  triggerTimes?: string[] // 触发时机（被动技能专用）
  level?: number // 技能等级
  levelValue?: number // 技能等级成长值
  icon?: string // 技能图标
  animation?: string // 技能动画
  soundEffect?: string // 技能音效
  tags?: string[] // 技能标签
  parameters?: Record<string, any> // 自定义参数
}

export interface SkillSet {
  [key: string]: SkillConfig[]
  small: SkillConfig[]
  passive: SkillConfig[]
  ultimate: SkillConfig[]
}

/**
 * 技能脚本元数据接口
 */
export interface SkillScriptMetadata {
  skillId: string
  scriptPath: string
  isLoaded: boolean
}

/**
 * Skill 转换选项
 */
export interface ConvertSkillOptions {
  lastUsed?: number
  includeDamage?: boolean
  includeHeal?: boolean
  includeBuffId?: boolean
}

/**
 * 将 SkillConfig 转换为 Skill（AI系统使用的运行时类型）
 */
export function convertSkillConfigToSkill(
  config: SkillConfig,
  options: ConvertSkillOptions = {},
): Skill {
  const {
    lastUsed = 0,
    includeDamage = false,
    includeHeal = false,
    includeBuffId = false,
  } = options

  const firstStep = config.steps?.[0] as ExtendedSkillStep | undefined
  const calculation = firstStep?.calculation

  const skill: Skill = {
    id: config.id,
    name: config.name,
    type: config.skillType!,
    energyCost: config.energyCost || 0,
    cooldown: config.cooldown || 0,
    lastUsed,
    description: config.description || '',
    steps: config.steps || [],
  }

  if (includeDamage) {
    skill.damage = calculation?.baseValue || 0
  }

  if (includeHeal) {
    skill.heal = calculation?.baseValue || 0
  }

  if (includeBuffId) {
    skill.buffId = firstStep?.buffId || ''
  }

  return skill
}
