/**
 * 文件: skill.ts
 * 描述: 技能系统类型定义
 * 版本:
 */

import type {
  ATTRIBUTE_CODE,
  ModifierType,
  ModifierSourceType,
} from '@/domain/attribute/types'
import { AtomicEffectType } from '@/domain/buff/atomic/types'

/**
 * 修饰符模板（配置层使用）
 * 由技能/Buff/装备等配置转换而来，不包含运行时状态
 */
export interface ModifierTemplate {
  /** 模板唯一标识（用于追踪来源） */
  id: string
  /** 显示来源名称（如 "战吼"、"铁剑"） */
  sourceName: string
  /** 来源类型 */
  sourceType: ModifierSourceType
  /** 目标属性 */
  targetAttribute: ATTRIBUTE_CODE
  /** 修饰类型 */
  type: ModifierType
  /** 修饰数值（固定值） */
  value: number
  /** 生效条件（可选） */
  condition?: string
}

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
} as const
export type DamageCategory =
  (typeof DamageCategory)[keyof typeof DamageCategory]

export const DamageCategoryName : Record<DamageCategory, string>  = {
  [DamageCategory.PHYSICAL]: '物理',
  [DamageCategory.ELEMENTAL]: '元素',
  [DamageCategory.TRUE]: '真实',
} as const
export type DamageCategoryName = (typeof DamageCategoryName)[keyof typeof DamageCategoryName]

/**
 * 元素代码（运行时值）
 * 物理 金 木 水 火 土
 */
export const ElementCode = {
  PHYSICAL: 'PHYSICAL',
  JIN: 'JIN',
  MU: 'MU',
  SHU: 'SHU',
  HUO: 'HUO',
  TU: 'TU',
} as const

/**
 * 元素类型
 * 物理 金 木 水 火 土
 */
export type ElementType = (typeof ElementCode)[keyof typeof ElementCode]

/**
 * 目标阵营
 */
export const TargetFaction = {
  ENEMY: 'enemy', // 敌方
  ALLY: 'ally', // 友方
  ALL: 'all', // 所有单位
  SELF: 'self', // 自身
}
export type TargetFaction = (typeof TargetFaction)[keyof typeof TargetFaction]

/**
 * 目标选择策略
 */
export const TargetStrategy = {
  ALL: 'all', // 全部目标
  RANDOM: 'random', // 随机
  LOWEST_HP: 'lowest_hp', // 最低血量
  HIGHEST_HP: 'highest_hp', // 最高血量
  LOWEST_SPEED: 'lowest_speed', // 最低速度
  FRONT: 'front', // 前排
  BACK: 'back', // 后排
  ADJACENT: 'adjacent', // 相邻
  RANDOM_ADJACENT: 'random_adjacent', // 随机相邻
  FIRST: 'first', // 第一个（默认）
} as const
export type TargetStrategy =
  (typeof TargetStrategy)[keyof typeof TargetStrategy]

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
  damage?: number // 伤害值（汇总全部 DEAL_DAMAGE 步骤的 baseValue）
  heal?: number // 治疗值（汇总全部 HEAL 步骤的 baseValue）
  buffId?: string // 关联的Buff ID（可选）
  steps: SkillStep[] // 技能执行步骤
  level?: number // 技能等级
  levelValue?: number // 技能等级成长值
  /** ponytail: 以下为 P0/AI-2 新增字段，供 AI 权重系统使用 */
  hasBuff?: boolean // 技能是否包含增益步骤
  hasDebuff?: boolean // 技能是否包含减益步骤
  hasDynamicDamage?: boolean // 是否包含基于目标属性的动态伤害（如 maxHealth 比例），AI 应运行时实时计算
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
  // NOTE: 旧格式技能（enemy-skills.json 守卫者被动等）无 selector 字段，兜底展示避免渲染崩溃
  if (!config?.faction) return '目标'
  const factionName: Record<string, string> = {
    enemy: '敌方',
    ally: '友方',
    all: '所有单位',
    self: '自身',
  }
  const strategyName: Record<string, string> = {
    all: '全部',
    random: '随机',
    lowest_hp: '最低血量',
    highest_hp: '最高血量',
    front: '前排',
    back: '后排',
    adjacent: '相邻',
    first: '',
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
  气血 = '气血值',
  NONE = '无消耗',
}

/**
 * 技能步骤类型（配置层）
 * 仅包含可作为 SkillStep.type 的合法值
 */
export const StepEffectType = {
  DEAL_DAMAGE: 'deal_damage',
  HEAL: 'heal',
  APPLY_BUFF: 'apply_buff',
  MODIFY_ATTRIBUTE: 'modify_attribute',
  GAIN_ENERGY: 'gain_energy',
  REMOVE_DEBUFF: 'remove_debuff',
  CLEANSE: 'cleanse',
  SHIELD: 'shield',
  REFLECT: 'reflect',
  DRAIN: 'drain',
  REVIVE: 'revive',
  CUSTOM: 'custom',
  STUN: 'stun',
  SILENCE: 'silence',
  /** 按 buffId 移除目标身上指定 buff（count 指定层数，缺省移除全部实例） */
  REMOVE_BUFF: 'remove_buff',
} as const
export type StepEffectType = (typeof StepEffectType)[keyof typeof StepEffectType]

/**
 * 战斗效果结果类型（运行时）
 * 用于 BattleEffect.type 分类
 */
export const ActionResultType = {
  DAMAGE: 'damage',
  HEAL: 'heal',
  BUFF: 'buff',
  DEBUFF: 'debuff',
  MISS: 'miss',
  CRITICAL: 'critical',
  STATUS: 'status',
  SHIELD: 'shield',
  DRAIN: 'drain',
  REFLECT: 'reflect',
  SPECIAL: 'special',
} as const
export type ActionResultType = (typeof ActionResultType)[keyof typeof ActionResultType]

/**
 * 技能步骤接口
 * 定义技能执行的具体步骤及其参数
 */
export interface SkillStep {
  /**
   * 步骤类型
   */
  type: StepEffectType

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
   * 步骤触发概率（0-1，可选）
   * 设置后该步骤按此概率判定是否执行（如 50% 概率溅射）；
   * 未设置时该步骤 100% 执行
   */
  probability?: number

  /**
   * 伤害大类
   * 用于 deal_damage 步骤，决定防御公式（physical/elemental/true）
   */
  damageCategory?: DamageCategory

  /**
   * 元素类型
   * 当 damageCategory 为 elemental 时生效，决定使用哪种元素抗性
   * 可选: JIN(金) MU(木) SHU(水) HUO(火) TU(土)
   */
  elementType?: ElementType

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
   * 移除/净化数量
   * 用于移除减益类技能步骤，指定移除多少个效果
   */
  count?: number

  /**
   * 触发条件表达式
   */
  condition?: string

  /**
   * 资源消耗类型
   */
  costType?: CostType

  /**
   * 步骤参数
   * 按步骤类型区分：
   * - gain_energy: GainEnergyStepParams
   * - custom: CustomStepParams
   * - revive: ReviveStepParams
   */
  parameters?: SkillStepParameters

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
  /** 条件参数（参数化条件如 source_has_debuff_count/combo_segment_min 的阈值；兼容 parameters.conditionParams） */
  conditionParams?: Record<string, number | string | boolean>
  skillType?: SkillType // 技能类型
  /** 是否为普通攻击（显式契约，替代名称/结构启发式猜测） */
  isNormalAttack?: boolean // 普通攻击标志
  triggerTimes?: string[] // 触发时机（被动技能专用）
  /** 触发概率（被动技能专用；兼容 parameters.triggerProbability 旧写法，两处皆可） */
  triggerProbability?: number
  /** 每回合最多触发次数（被动技能专用；兼容 parameters.maxTriggersPerRound 旧写法，两处皆可） */
  maxTriggersPerRound?: number
  passiveCategory?: AtomicEffectType[] // 被动技能分类（数组，支持多分类）
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
}

/**
 * Buff 极性查询：由调用方注入（通常基于 BuffScriptRegistry 已解析配置的 polarity），
 * 取代按 ID 前缀猜极性的隐式契约。
 */
export type BuffConfigLookup = (buffId: string) => string | undefined

/**
 * 汇总技能步骤的伤害/治疗/类型标记
 * 遍历全部 steps 而非只读第一个
 */
function summarizeSkillSteps(
  steps: SkillStep[],
  lookup?: BuffConfigLookup,
): {
  totalDamage: number
  totalHeal: number
  hasBuff: boolean
  hasDebuff: boolean
  hasDynamicDamage: boolean
} {
  let totalDamage = 0,
    totalHeal = 0
  let hasBuff = false,
    hasDebuff = false,
    hasDynamicDamage = false

  for (const step of steps) {
    const extStep = step as ExtendedSkillStep

    if (step.type === 'deal_damage' && extStep.calculation) {
      totalDamage += extStep.calculation.baseValue || 0
      if (extStep.calculation.extraValues) {
        for (const extra of extStep.calculation.extraValues) {
          if (
            extra.attribute === 'maxHealth' ||
            extra.attribute === 'currentHealth'
          ) {
            hasDynamicDamage = true
          }
        }
      }
    }

    if (step.type === 'heal' && extStep.calculation) {
      totalHeal += extStep.calculation.baseValue || 0
    }

    if (step.type === 'apply_buff') {
      const buffId = step.buffId || step.effectId || ''
      if (!buffId) continue
      // 极性由显式查询决定（lookup 返回配置声明的 polarity），不做 ID 前缀猜测
      if (lookup?.(buffId) === 'negative') {
        hasDebuff = true
      } else {
        hasBuff = true
      }
    }
  }

  // ponytail: CUSTOM 步骤的伤害（如 burn_detonate）不会被汇总。
  // 升级路径：需要在步骤中添加 effectType 或标签体系来识别自定义步骤的伤害类型。
  return { totalDamage, totalHeal, hasBuff, hasDebuff, hasDynamicDamage }
}

/**
 * 将 SkillConfig 转换为 Skill（AI系统使用的运行时类型）
 * @param lookup 可选的 Buff 极性查询（未注入时不判减益，仅标记为 buff）
 */
export function convertSkillConfigToSkill(
  config: SkillConfig,
  options: ConvertSkillOptions = {},
  lookup?: BuffConfigLookup,
): Skill {
  const { lastUsed = 0 } = options

  const steps = config.steps || []
  const firstStep = steps[0] as ExtendedSkillStep | undefined
  const summary = summarizeSkillSteps(steps, lookup)

  const skill: Skill = {
    id: config.id,
    name: config.name,
    type: config.skillType ?? SkillType.SMALL,
    energyCost: config.energyCost || 0,
    cooldown: config.cooldown || 0,
    lastUsed,
    description: config.description || '',
    steps,
    damage: summary.totalDamage || undefined,
    heal: summary.totalHeal || undefined,
    hasBuff: summary.hasBuff || undefined,
    hasDebuff: summary.hasDebuff || undefined,
    hasDynamicDamage: summary.hasDynamicDamage || undefined,
    buffId: firstStep?.buffId || undefined,
  }

  return skill
}

/** gain_energy 步骤参数 */
export interface GainEnergyStepParams {
  /** 能量获得量 */
  value: number
}

/** custom 步骤参数（按 customType 分发） */
export interface CustomStepParams {
  /** 自定义步骤类型标识 */
  customType: string
  /** 自定义步骤描述（未实现时用于报错信息） */
  description?: string
  /** burn_detonate 每层灼烧伤害百分比（默认 5%） */
  burnDamagePercent?: number
  /** rotating_apply_buff 轮转施加的 buff 列表 */
  buffIds?: string[]
  /** fengshi_detonate：每层风势追加伤害系数（×攻击力，默认 0.10） */
  damagePercentPerStack?: number
  /** fengshi_detonate：每 N 层风势转化 1 层裂甲（默认 2，0 表示不转化） */
  stacksPerDebuff?: number
  /** fengshi_detonate / liejia_detonate：引爆后施加的 buff id */
  applyBuffId?: string
  /** liejia_detonate：每层裂甲追加真实伤害系数（×攻击力，默认 0） */
  trueDamagePerStack?: number
  /** liejia_detonate：真实伤害段数上限（默认 8） */
  maxSegments?: number
  /** fengshi_detonate：每层风痕追加真实伤害系数（×攻击力，默认 0；狂风绝息「风绝」用） */
  fenghenTrueDamagePerStack?: number
  /** fengshi_detonate：风痕真实伤害段数上限（默认 8） */
  fenghenMaxSegments?: number
  /** fengsuo_bounce：弹射伤害系数（×攻击力，默认 0.6） */
  damageRatio?: number
  /** fengsuo_bounce：基础弹射概率（默认 0.2） */
  baseProbability?: number
  /** fengsuo_bounce：速度差单位（点，默认 10） */
  speedUnit?: number
  /** fengsuo_bounce：每单位速度差的概率加成（默认 0.05） */
  speedBonusPerUnit?: number
  /** fengsuo_bounce：概率上限（默认 0.4） */
  maxProbability?: number
}

/** 步骤参数：按步骤类型判别，业务参数全部显式类型化 */
export type SkillStepParameters =
  | GainEnergyStepParams
  | CustomStepParams
  | ReviveStepParams

/** 复活步骤参数 */
export interface ReviveStepParams {
  /** 复活后气血百分比（默认 30） */
  hpPercent?: number
  /** 最大复活次数限制 */
  maxRevives?: number
  /** 复活冷却回合数 */
  cooldown?: number
  /** 是否清除减益效果 */
  cleanseDebuffs?: boolean
}
