import type { BuffContext } from '@/core/BuffContext'

// [
//   {
//     id: "burn",
//     name: "灼烧",
//     duration: 3,
//     effect: "伤害:15/回合",
//     active: false,
//     isPositive: false,
//   },
//   {
//     id: "power",
//     name: "力量祝福",
//     duration: 5,
//     effect: "ATK+20%",
//     active: true,
//     isPositive: true,
//   },
//   {
//     id: "weak",
//     name: "虚弱",
//     duration: 2,
//     effect: "DEF-30%",
//     active: false,
//     isPositive: false,
//   },
//   {
//     id: "poison",
//     name: "中毒",
//     duration: 4,
//     effect: "伤害:20/回合",
//     active: false,
//     isPositive: false,
//   },
//   {
//     id: "shield",
//     name: "护盾",
//     duration: 3,
//     effect: "吸收100伤害",
//     active: false,
//     isPositive: true,
//   },
// ]

/**
 * 增益效果脚本接口
 * 定义了增益效果的生命周期回调函数,用于实现自定义的增益逻辑
 * @template TParams - 增益效果参数类型,默认为any
 */
export interface IBuffScript<TParams = any> {
  /**
   * 增益效果应用时的回调函数
   * 当增益效果首次添加到角色时调用
   * @param context - 增益效果上下文对象,包含角色、属性等信息
   */
  onApply(context: BuffContext): void

  /**
   * 增益效果移除时的回调函数
   * 当增益效果从角色身上移除时调用
   * @param context - 增益效果上下文对象,包含角色、属性等信息
   */
  onRemove(context: BuffContext): void

  /**
   * 增益效果更新时的回调函数
   * 每帧调用,用于处理持续效果或定时逻辑
   * @param context - 增益效果上下文对象,包含角色、属性等信息
   * @param deltaTime - 距离上一帧的时间增量(毫秒)
   */
  onUpdate(context: BuffContext, deltaTime: number): void

  /**
   * 增益效果刷新时的回调函数
   * 当已有的增益效果被重新施加时调用(如刷新持续时间)
   * @param context - 增益效果上下文对象,包含角色、属性等信息
   */
  onRefresh(context: BuffContext): void

  /**
   * 增益效果的自定义参数
   * 用于存储增益效果特有的配置数据
   */
  params?: TParams
}

/**
 * 增益效果配置接口
 * 定义了增益效果的基础属性和约束条件
 */
export interface BuffConfig {
  /**
   * 增益效果唯一标识符
   * 用于在系统中唯一标识一个增益效果
   */
  id: string

  /**
   * 增益效果名称
   * 用于UI显示和日志记录
   */
  name: string

  /**
   * 增益效果描述
   * 详细说明增益效果的作用和机制
   */
  description: string

  /**
   * 增益效果持续时间(回合数)
   * -1表示永久效果,0表示立即移除,正数表示持续回合数
   */
  duration: number

  /**
   * 最大叠加层数
   * 同一增益效果可叠加的最大层数,1表示不可叠加
   */
  maxStacks: number

  /**
   * 冷却时间(回合数)
   * 同一增益效果再次施加所需的冷却回合数
   */
  cooldown: number

  /**
   * 是否为永久效果
   * true表示增益效果不会因时间流逝而消失
   */
  isPermanent?: boolean

  /**
   * 是否为负面效果
   * true表示该增益效果为debuff,会影响角色属性
   */
  isDebuff?: boolean

  /**
   * 增益效果参数配置
   * 用于存储额外的自定义参数,键值对形式
   */
  parameters?: Record<string, any>

  /**
   * 是否为正面效果
   * true表示该增益效果为buff,会增强角色属性
   */
  isPositive?: boolean
}

/**
 * 增益效果实例接口
 * 表示一个已应用到角色身上的增益效果实例
 */
export interface BuffInstance {
  /**
   * 实例唯一标识符
   * 用于唯一标识一个增益效果实例
   */
  id: string

  /**
   * 角色唯一标识符
   * 拥有此增益效果的角色ID
   */
  characterId: string

  /**
   * 增益效果ID
   * 对应BuffConfig中的id
   */
  buffId: string

  /**
   * 增益效果脚本对象
   * 包含增益效果的所有生命周期回调函数
   */
  script: IBuffScript

  /**
   * 增益效果上下文对象
   * 包含角色状态、属性等运行时信息
   */
  context: BuffContext

  /**
   * 开始时间戳
   * 增益效果开始生效的时间(毫秒)
   */
  startTime: number

  /**
   * 持续时间(回合数)
   * 当前实例的持续时间,可能与BuffConfig中的duration不同(如被刷新)
   */
  duration: number

  /**
   * 是否处于激活状态
   * true表示增益效果正在生效,false表示已被暂停或失效
   */
  isActive: boolean
}

/**
 * 增益效果脚本元数据接口
 * 用于描述增益效果脚本的加载状态和路径信息
 */
export interface BuffScriptMetadata {
  /**
   * 增益效果ID
   * 对应BuffConfig中的id
   */
  buffId: string

  /**
   * 脚本文件路径
   * 增益效果脚本文件的相对或绝对路径
   */
  scriptPath: string

  /**
   * 是否已加载
   * true表示脚本已成功加载并初始化
   */
  isLoaded: boolean
}
