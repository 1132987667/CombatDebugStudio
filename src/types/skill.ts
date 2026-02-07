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
   * 伤害/治疗计算配置
   * 当type为DAMAGE或HEAL时必填
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
 * 计算日志接口 - 使用统一类型定义
 */

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

/**
 * 资源消耗类型
 */
export enum CostType {
  ENERGY = '能量',
  HP = '生命值',
  NONE = '无消耗',
}

/**
 * 技能步骤接口
 * 定义技能执行的具体步骤及其参数
 */
export interface SkillStep {
  /**
   * 步骤类型
   * 指定该步骤的类型,如伤害、治疗、增益等
   */
  type: SkillStepType

  /**
   * 资源消耗类型
   * 指定施放技能所需的资源类型
   */
  costType?: CostType

  /**
   * 效果公式
   * 用于计算效果值的数学表达式,支持变量引用(如attack、defense等)
   * 示例: "attack*0.8"、"defense*1.5"、"damage*0.2"
   */
  formula: string
  /**
   * 攻击类型
   * 仅在type为damage时使用,指定伤害的攻击类型
   */
  attackType?: 'normal' | 'magic' | 'physical' | 'true'

  /**
   * 增益/减益效果ID
   * 仅在type为buff或debuff时使用,指定要应用的buff效果ID
   */
  buffId?: string

  /**
   * 持续时间(回合数)
   * 仅在type为buff或debuff时使用,指定效果的持续时间
   * -1表示永久效果
   */
  duration?: number

  /**
   * 叠加层数
   * 仅在type为buff或debuff时使用,指定效果的叠加层数
   */
  stacks?: number

  /**
   * 目标类型
   * 可选,用于覆盖技能级别的目标类型
   * 如果未指定,则使用技能级别的targetType
   */
  targetType?: SkillTargetType

  /**
   * 作用范围
   * 可选,用于覆盖技能级别的作用范围
   * 如果未指定,则使用技能级别的scope
   */
  scope?: SkillScope

  /**
   * 触发条件
   * 可选,指定动作执行的条件表达式
   * 示例: "target.hp < 50"、"self.hasBuff('buff_rage')"
   */
  condition?: string

  /**
   * 优先级
   * 动作的执行顺序,数值越小越先执行
   * 默认值为0
   */
  priority?: number

  /**
   * 自定义参数
   * 用于存储动作特有的额外参数
   */
  parameters?: Record<string, any>
}

/**
 * 技能配置接口
 * 定义技能的基础属性和行为规则
 */
export interface SkillConfig {
  /**
   * 技能唯一标识符
   * 用于在系统中唯一标识一个技能
   * 命名规范: skill_[角色类型]_[编号]_[难度]_[类型]_[大小]
   * 示例: skill_enemy_001_easy_1_small
   */
  id: string

  /**
   * 技能名称
   * 用于UI显示和日志记录
   */
  name: string

  /**
   * 技能描述
   * 详细说明技能的作用、效果和机制
   */
  description?: string

  /**
   * 法力值消耗
   * 施放技能所需的法力值
   * 0表示不消耗法力值
   */
  mpCost: number

  /**
   * 冷却时间(回合数)
   * 技能施放后需要等待的回合数才能再次使用
   * 0表示无冷却
   */
  cooldown: number

  /**
   * 最大使用次数
   * 技能在单场战斗中可使用的最大次数
   * 未指定或0表示无限制
   */
  maxUses?: number

  /**
   * 目标类型
   * 指定技能的目标类型（单个目标、群体目标、区域目标等）
   */
  targetType: SkillTargetType

  /**
   * 作用范围
   * 指定技能的作用范围（敌人、友方、自己等）
   */
  scope: SkillScope

  /**
   * 技能步骤列表
   * 定义技能执行的所有步骤,按优先级顺序执行
   */
  steps: SkillStep[]

  /**
   * 施放条件
   * 可选,指定技能可被施放的条件表达式
   * 示例: "self.mp >= 10"、"target.hasBuff('buff_stun')"
   */
  condition?: string

  /**
   * 技能类型
   * 可选,用于标识技能的类型,如主动技能、被动技能、终极技能等
   */
  skillType?: 'active' | 'passive' | 'ultimate' | 'reaction'

  /**
   * 技能等级
   * 可选,技能的等级,用于技能升级系统
   */
  level?: number

  /**
   * 技能图标
   * 可选,技能图标资源路径
   */
  icon?: string

  /**
   * 技能动画
   * 可选,技能动画资源路径
   */
  animation?: string

  /**
   * 技能音效
   * 可选,技能施放时的音效资源路径
   */
  soundEffect?: string

  /**
   * 技能标签
   * 可选,用于技能分类和筛选的标签数组
   * 示例: ["fire", "aoe", "debuff"]
   */
  tags?: string[]

  /**
   * 自定义参数
   * 用于存储技能特有的额外参数
   */
  parameters?: Record<string, any>
}

/**
 * 技能实例接口
 * 表示一个已加载到战斗系统中的技能实例
 */
export interface SkillInstance {
  /**
   * 实例唯一标识符
   * 用于唯一标识一个技能实例
   */
  id: string

  /**
   * 角色唯一标识符
   * 拥有此技能的角色ID
   */
  characterId: string

  /**
   * 技能ID
   * 对应SkillConfig中的id
   */
  skillId: string

  /**
   * 技能配置对象
   * 包含技能的所有配置信息
   */
  config: SkillConfig

  /**
   * 当前冷却时间(回合数)
   * 技能当前的冷却剩余回合数
   */
  currentCooldown: number

  /**
   * 已使用次数
   * 技能在当前战斗中已使用的次数
   */
  usedCount: number

  /**
   * 是否可用
   * true表示技能当前可以施放,false表示因冷却或其他原因不可用
   */
  isAvailable: boolean
}

/**
 * 技能脚本接口
 * 定义了技能的自定义脚本逻辑
 * @template TParams - 技能参数类型,默认为any
 */
export interface ISkillScript<TParams = any> {
  /**
   * 技能施放前的回调函数
   * 在技能执行前调用,可用于修改技能参数或取消施放
   * @param context - 增益效果上下文对象
   * @returns 返回true表示继续执行,false表示取消施放
   */
  onBeforeCast?(context: BuffContext): boolean

  /**
   * 技能施放后的回调函数
   * 在技能执行完成后调用
   * @param context - 增益效果上下文对象
   */
  onAfterCast?(context: BuffContext): void

  /**
   * 技能命中目标的回调函数
   * 当技能命中目标时调用
   * @param context - 增益效果上下文对象
   * @param targetId - 目标角色ID
   */
  onHit?(context: BuffContext, targetId: string): void

  /**
   * 技能未命中目标的回调函数
   * 当技能未命中目标时调用
   * @param context - 增益效果上下文对象
   * @param targetId - 目标角色ID
   */
  onMiss?(context: BuffContext, targetId: string): void

  /**
   * 技能的自定义参数
   * 用于存储技能特有的配置数据
   */
  params?: TParams
}

/**
 * 技能脚本元数据接口
 * 用于描述技能脚本的加载状态和路径信息
 */
export interface SkillScriptMetadata {
  /**
   * 技能ID
   * 对应SkillConfig中的id
   */
  skillId: string

  /**
   * 脚本文件路径
   * 技能脚本文件的相对或绝对路径
   */
  scriptPath: string

  /**
   * 是否已加载
   * true表示脚本已成功加载并初始化
   */
  isLoaded: boolean
}

/**
 * 技能树节点接口
 * 用于定义技能升级系统的技能树结构
 */
export interface SkillTreeNode {
  /**
   * 节点唯一标识符
   */
  id: string

  /**
   * 技能ID
   * 该节点对应的技能ID
   */
  skillId: string

  /**
   * 前置节点ID列表
   * 解锁该节点所需的前置技能节点
   */
  prerequisites?: string[]

  /**
   * 所需等级
   * 解锁该节点所需的角色等级
   */
  requiredLevel?: number

  /**
   * 所需技能点
   * 解锁该节点所需的技能点数
   */
  requiredPoints?: number

  /**
   * 是否已解锁
   * true表示该节点已被解锁
   */
  isUnlocked?: boolean
}

/**
 * 技能树配置接口
 * 定义完整的技能树结构
 */
export interface SkillTreeConfig {
  /**
   * 技能树唯一标识符
   */
  id: string

  /**
   * 技能树名称
   */
  name: string

  /**
   * 技能树描述
   */
  description?: string

  /**
   * 技能树节点列表
   */
  nodes: SkillTreeNode[]

  /**
   * 最大技能点
   * 该技能树可分配的最大技能点数
   */
  maxPoints?: number
}
