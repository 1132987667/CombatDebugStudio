/**
 * 文件: skill.ts
 * 描述: 技能系统类型定义
 * 版本: 
 */

import type { BuffContext } from '@/core/BuffContext'

// ========== 导入修饰符模板类型（实际项目中应从正确路径导入） ==========
import type { ModifierTemplate } from '@/types/modifier-template'

/**
 * 技能类型枚举
 */
export enum SkillType {
  PASSIVE = 'passive',
  SMALL = 'small',
  ULTIMATE = 'ultimate',
}

/**
 * 技能定义接口（AI系统使用的运行时类型）
 */
export interface Skill {
  id: string
  name: string
  type: SkillType
  energyCost: number
  cooldown: number
  lastUsed: number
  description: string
  damage?: number
  heal?: number
  buffId?: string
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
   * 攻击类型（仅DAMAGE类型使用）
   */
  attackType?: 'normal' | 'magic' | 'physical' | 'true'

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
  /**
   * 步骤ID (兼容旧版本)
   * 用于标识步骤的唯一ID
   */
  id?: string

  /**
   * 目标ID (兼容旧版本)
   * 指定该步骤的目标角色ID
   */
  targetId?: string

  /**
   * 伤害/治疗计算配置
   * 当type为DAMAGE或HEAL时使用
   */
  calculation?: DamageHealCalculationConfig

  /**
   * 目标属性修正（可选）
   * 对目标特定属性的修正系数
   */
  targetModifiers?: Record<string, number>

  /**
   * 暴击配置（可选）
   */
  criticalConfig?: CriticalConfig
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
 * 计算日志接口
 */
export interface CalculationLog {
  /**
   * 时间戳
   */
  timestamp: number

  /**
   * 计算类型
   */
  type: 'damage' | 'heal' | 'buff' | 'debuff'

  /**
   * 步骤类型
   */
  stepType?: 'DAMAGE' | 'HEAL'

  /**
   * 来源ID
   */
  sourceId: string

  /**
   * 目标ID
   */
  targetId: string

  /**
   * 技能ID
   */
  skillId?: string

  /**
   * 基础值
   */
  baseValue?: number

  /**
   * 最终值
   */
  finalValue?: number

  /**
   * 暴击
   */
  isCritical?: boolean

  /**
   * 闪避
   */
  isDodged?: boolean

  /**
   * 格挡
   */
  isBlocked?: boolean

  /**
   * 额外值列表
   */
  extraValues?: Array<{ attribute: string; value: number; ratio: number }>

  /**
   * 最终乘数
   */
  finalMultiplier?: number
}

/**
 * 属性类型
 * 物理 金 木 水 火 土
 */
export type ElementType = 'PHYSICAL' | 'JIN' | 'MU' | 'SHU' | 'HUO' | 'TU'

/**
 * 技能目标类型枚举
 * 定义技能的目标类型（单个目标、群体目标、特定目标等）
 */
export type SkillTargetType =
  | 'single' // 单个目标
  | 'multiple' // 多个目标
  | 'area' // 区域目标
  | 'chain' // 连锁目标
  | 'all' // 所有目标

/**
 * 技能目标类型常量数组
 */
export const SKILL_TARGET_TYPES: readonly SkillTargetType[] = [
  'single',
  'multiple',
  'area',
  'chain',
  'all',
] as const

/**
 * 技能目标类型中文映射
 */
export const SKILL_TARGET_TYPE_NAMES: Record<SkillTargetType, string> = {
  single: '单个目标',
  multiple: '多个目标',
  area: '区域目标',
  chain: '连锁目标',
  all: '所有目标',
}

/**
 * 技能作用范围枚举
 * 定义技能的作用范围（敌人、友方、自己、所有单位等）
 */
export type SkillScope =
  | 'enemy' // 敌人
  | 'ally' // 友方
  | 'self' // 自己
  | 'all' // 所有单位
  | 'enemy_front' // 敌人前排
  | 'enemy_back' // 敌人后排
  | 'ally_front' // 友方前排
  | 'ally_back' // 友方后排
  | 'adjacent' // 相邻目标
  | 'lowest_hp_ally' // 生命值最低的友方
  | 'lowest_hp_enemy' // 生命值最低的敌人
  | 'random_enemy' // 随机敌人
  | 'random_ally' // 随机友方
  | 'lowest_ally' // 生命值最低的友方单位
  | 'random_adjacent' // 随机相邻目标
  | 'all_allies' // 所有友方单位
  | 'all_enemies' // 所有敌方单位

/**
 * 技能作用范围常量数组
 * 用于验证和迭代所有有效的 SkillScope 值
 */
export const SKILL_SCOPES: readonly SkillScope[] = [
  'enemy',
  'ally',
  'self',
  'all',
  'enemy_front',
  'enemy_back',
  'ally_front',
  'ally_back',
  'adjacent',
  'lowest_hp_ally',
  'lowest_hp_enemy',
  'random_enemy',
  'random_ally',
  'lowest_ally',
  'random_adjacent',
  'all_allies',
  'all_enemies',
] as const

/**
 * 技能作用范围中文映射
 */
export const SKILL_SCOPE_NAMES: Record<SkillScope, string> = {
  enemy: '敌人',
  ally: '友方',
  self: '自己',
  all: '所有单位',
  enemy_front: '敌人前排',
  enemy_back: '敌人后排',
  ally_front: '友方前排',
  ally_back: '友方后排',
  adjacent: '相邻目标',
  lowest_hp_ally: '生命值最低的友方',
  lowest_hp_enemy: '生命值最低的敌人',
  random_enemy: '随机敌人',
  random_ally: '随机友方',
  lowest_ally: '生命值最低的友方单位',
  random_adjacent: '随机相邻目标',
  all_allies: '所有友方单位',
  all_enemies: '所有敌方单位',
}

/**
 * 检查是否为有效的技能作用范围
 * @param value 待检查的值
 * @returns 是否为有效的 SkillScope
 */
export function isValidSkillScope(value: string): value is SkillScope {
  return SKILL_SCOPES.includes(value as SkillScope)
}

/**
 * 检查是否为有效的技能目标类型
 * @param value 待检查的值
 * @returns 是否为有效的 SkillTargetType
 */
export function isValidSkillTargetType(value: string): value is SkillTargetType {
  return SKILL_TARGET_TYPES.includes(value as SkillTargetType)
}

/**
 * 旧版技能选择器到 SkillScope 的映射
 * 用于兼容配置文件中的旧版 selector 字段
 */
export const SELECTOR_TO_SCOPE: Record<string, SkillScope> = {
  'single_enemy': 'enemy',
  'single_ally': 'ally',
  'all_enemies': 'all_enemies',
  'all_ally': 'all_allies',
  'self': 'self',
  'random_enemy': 'random_enemy',
  'random_ally': 'random_ally',
  'lowest_hp_enemy': 'lowest_hp_enemy',
  'lowest_hp_ally': 'lowest_hp_ally',
}

/**
 * 技能选择器中文映射
 * 用于 UI 显示
 */
export const SELECTOR_NAMES: Record<string, string> = {
  'single_enemy': '单体敌人',
  'single_ally': '单体友军',
  'all_enemies': '全体敌人',
  'all_ally': '全体友军',
  'self': '自身',
  'random_enemy': '随机敌人',
  'random_ally': '随机友军',
  'lowest_hp_enemy': '生命最低敌人',
  'lowest_hp_ally': '生命最低友军',
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
 * 定义技能执行步骤的所有可能类型，支持新旧两种格式
 */
export type SkillStepType =
  // === 新版步骤类型（推荐） ===
  | 'deal_damage'       // 造成伤害（结构化）
  | 'heal'              // 治疗目标（结构化）
  | 'apply_buff'        // 施加 Buff/Debuff（通过 BuffId 引用）
  | 'modify_attribute'  // 直接修改属性（主要用于被动）
  | 'aura'              // 光环效果
  // === 旧版步骤类型（兼容） ===
  | 'damage'            // 造成伤害（旧版，使用 formula）
  | 'buff'              // 施加增益效果（旧版）
  | 'debuff'            // 施加减益效果（旧版）
  | 'remove_buff'       // 移除增益效果
  | 'remove_debuff'     // 移除减益效果
  | 'cleanse'           // 净化（移除所有负面效果）
  | 'dispel'            // 驱散（移除所有正面效果）
  | 'stun'              // 眩晕
  | 'silence'           // 沉默
  | 'knockback'         // 击退
  | 'pull'              // 拉扯
  | 'teleport'          // 传送
  | 'summon'            // 召唤
  | 'transform'         // 变身
  | 'shield'            // 护盾
  | 'reflect'           // 反射
  | 'drain'             // 吸取
  | 'revive'            // 复活
  | 'custom'            // 自定义效果
  // === 旧版大写兼容 ===
  | 'DAMAGE'
  | 'HEAL'
  | 'BUFF'
  | 'DEBUFF'
  | 'REMOVE_BUFF'
  | 'REMOVE_DEBUFF'
  | 'CLEANSE'
  | 'DISPEL'
  | 'STUN'
  | 'SILENCE'
  | 'KNOCKBACK'
  | 'PULL'
  | 'TELEPORT'
  | 'SUMMON'
  | 'TRANSFORM'
  | 'SHIELD'
  | 'REFLECT'
  | 'DRAIN'
  | 'REVIVE'
  | 'CUSTOM'

/**
 * 技能步骤接口（扩展版）
 * 定义技能执行的具体步骤及其参数，兼容新旧配置格式
 */
export interface SkillStep {
  /**
   * 步骤类型
   */
  type: SkillStepType

  // ========== 新版字段 ==========
  /**
   * 目标选择（标准化）
   * 用于 deal_damage / heal / apply_buff / modify_attribute 等步骤
   */
  target?: SkillScope | 'selected' | 'self' | 'all_enemies' | 'all_allies'

  /**
   * 伤害类型
   * 用于 deal_damage 步骤
   */
  damageType?: 'physical' | 'magical' | 'true'

  /**
   * 计算公式（新版使用更灵活的表达式）
   * 示例: "attack * 0.8", "target.maxHp * 0.05"
   */
  formula?: string

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

  // ========== 旧版兼容字段（保留以保证原有配置可用） ==========
  /**
   * 效果公式（旧版，使用字符串表达式）
   */
  // formula 已在上面声明，此处不再重复

  /**
   * 攻击类型（旧版，仅用于 damage 步骤）
   */
  attackType?: 'normal' | 'magic' | 'physical' | 'true'

  /**
   * 效果ID（旧版，用于 buff/debuff 步骤）
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
   * 目标类型（旧版）
   */
  targetType?: SkillTargetType

  /**
   * 作用范围（旧版）
   */
  scope?: SkillScope

  /**
   * 资源消耗类型（旧版）
   */
  costType?: CostType

  /**
   * 自定义参数（旧版）
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
  /**
   * 技能唯一标识符
   */
  id: string

  /**
   * 技能名称
   */
  name: string

  /**
   * 技能描述
   */
  description?: string

  /**
   * 能量消耗
   */
  energyCost: number

  /**
   * 冷却时间(回合数)
   */
  cooldown: number

  /**
   * 最大使用次数
   */
  maxUses?: number

  /**
   * 目标选择器（旧版字符串，如 "single_enemy"）
   */
  selector: string

  /**
   * 目标类型（兼容旧版）
   */
  targetType?: SkillTargetType

  /**
   * 作用范围（兼容旧版）
   */
  scope?: SkillScope

  /**
   * 技能步骤列表
   */
  steps: SkillStep[]

  /**
   * 施放条件
   */
  condition?: string

  /**
   * 技能类型
   */
  skillType?: 'active' | 'passive' | 'ultimate' | 'reaction'

  /**
   * 触发时机（被动技能专用）
   */
  triggerTimes?: string[]

  /**
   * 技能等级
   */
  level?: number

  /**
   * 技能图标
   */
  icon?: string

  /**
   * 技能动画
   */
  animation?: string

  /**
   * 技能音效
   */
  soundEffect?: string

  /**
   * 技能标签
   */
  tags?: string[]

  /**
   * 自定义参数
   */
  parameters?: Record<string, any>
}

/**
 * 技能实例接口
 */
export interface SkillInstance {
  id: string
  characterId: string
  skillId: string
  config: SkillConfig
  currentCooldown: number
  usedCount: number
  isAvailable: boolean
}

/**
 * 技能脚本接口
 */
export interface ISkillScript<TParams = any> {
  onBeforeCast?(context: BuffContext): boolean
  onAfterCast?(context: BuffContext): void
  onHit?(context: BuffContext, targetId: string): void
  onMiss?(context: BuffContext, targetId: string): void
  params?: TParams
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
 * 技能树节点接口
 */
export interface SkillTreeNode {
  id: string
  skillId: string
  prerequisites?: string[]
  requiredLevel?: number
  requiredPoints?: number
  isUnlocked?: boolean
}

/**
 * 技能树配置接口
 */
export interface SkillTreeConfig {
  id: string
  name: string
  description?: string
  nodes: SkillTreeNode[]
  maxPoints?: number
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
    type: inferSkillType(config),
    energyCost: config.energyCost || 0,
    cooldown: config.cooldown || 0,
    lastUsed,
    description: config.description || '',
  }

  if (includeDamage) {
    skill.damage = calculation?.baseValue || 0
  }

  if (includeHeal) {
    skill.heal = calculation?.baseValue || 0
  }

  if (includeBuffId) {
    // 优先使用新版的 buffId，其次旧版 effectId
    skill.buffId = (firstStep as any)?.buffId || firstStep?.effectId
  }

  return skill
}

/**
 * 根据 SkillConfig 推断 SkillType
 */
function inferSkillType(config: SkillConfig): SkillType {
  if (config.skillType === 'passive') {
    return SkillType.PASSIVE
  }
  if (config.skillType === 'ultimate') {
    return SkillType.ULTIMATE
  }
  // 兼容旧版可能使用 'small' 字符串
  if ((config as any).skillType === 'small') {
    return SkillType.SMALL
  }
  return SkillType.SMALL
}