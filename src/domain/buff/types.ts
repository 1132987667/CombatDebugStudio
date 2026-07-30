import type { BuffContext } from '@/domain/buff/BuffContext'
import { BattleTriggerPhase } from '@/domain/battle/type/types'
import { AtomicEffectType } from '@/domain/buff/atomic/types'
import {
  ConditionState,
} from '@/shared/types/buff-display'

/** Buff ID 前缀常量 */
export const BUFF_ID_PREFIX = 'buff_'

/**
 * buff 查询接口
 * BattleEntity 通过此接口查询 BuffSystem，不直接存储 buff 数据
 */
export interface BuffQuery {
  getBuffInstanceIds(characterId: string): string[]
  hasBuff(characterId: string, buffId: string): boolean
  /** 角色是否拥有包含指定 tag 的 buff */
  hasBuffWithTag(characterId: string, tag: string): boolean
  /** 角色是否处于被控制状态（无法行动） */
  isCharacterControlled(characterId: string): boolean
  /** 角色是否能使用技能（未被沉默/眩晕等阻止技能释放） */
  canUseSkill(characterId: string): boolean
  /** 获取角色当前护盾值 */
  getShieldValue(characterId: string): number
  /** 设置角色当前护盾值 */
  setShieldValue(characterId: string, value: number): void
}

/**
 * 特殊效果行（DOT/HEAL/护盾/反伤等非属性修正效果）
 * 供纯文本 UI 展示使用
 */
export interface BuffEffectLine {
  /** 显示文本，如 "每回合损失 5% 气血值"、"吸收 200 点伤害" */
  text: string
  /** 效果分类 */
  kind: AtomicEffectType
}

/**
 * 增益效果脚本接口
 * 定义了增益效果的气血周期回调函数,用于实现自定义的增益逻辑
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

  /**
   * 获取 Buff 的特殊效果文本行（供纯文本 UI 展示）
   * 返回 DOT/HEAL/护盾/反伤等非属性修正效果的描述文本
   */
  getEffectLines?(context: BuffContext): BuffEffectLine[]
}

/**
 * 叠加规则枚举
 */
export enum StackRule {
  /** 独立叠加：每层独立计算效果 */
  INDEPENDENT = 'independent',
  /** 刷新持续时间：新Buff覆盖旧Buff并重置时间 */
  REFRESH = 'refresh',
  /** 限制层数：达到最大层数后无法继续叠加 */
  LIMITED = 'limited',
}

/**
 * 控制效果类型枚举
 */
export const ControlType = {
  /** 无控制效果 */
  NONE: 'none',
  STUN: 'stun',
  SILENCE: 'silence',
  FREEZE: 'freeze',
  SLEEP: 'sleep',
  BIND: 'bind',
  CONFUSION: 'confusion',
  FEAR: 'fear',
  CHARM: 'charm',
  TAUNT: 'taunt',
  PETRIFY: 'petrify',
  IMMOBILIZE: 'immobilize',
  DISARM: 'disarm',
  POLYMORPH: 'polymorph',
  IMPRISON: 'imprison',
  GUIXU: 'guixu',
} as const
export type ControlType = (typeof ControlType)[keyof typeof ControlType]

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
   * 叠加规则
   * 定义Buff的叠加方式
   */
  stackRule: StackRule

  /**
   * 控制效果类型
   * 定义Buff是否为控制效果及其类型
   */
  controlType: ControlType

  /**
   * 效果标签
   */
  tags?: string[]

  /**
   * 免疫标签
   * 拥有对应标签的角色免疫此Buff
   */
  immunities?: string[]

  /**
   * 是否可驱散
   * true表示此Buff可被驱散技能移除
   */
  dispellable?: boolean

  /**
   * 图标路径
   * 用于UI显示Buff图标
   */
  iconPath?: string

  /**
   * 是否为永久效果
   * true表示增益效果不会因时间流逝而消失
   */
  isPermanent?: boolean

  /**
   * 增益效果参数配置
   * 用于存储额外的自定义参数,键值对形式
   */
  parameters?: Record<string, any>

  /**
   * 属性修饰符
   * 定义属性加成，使用字符串格式如 "+10"（数值加成）、"+0.05"（百分比加成）、"-0.15"（百分比减成）
   */
  attributes?: Record<string, string>

  /**
   * 触发器配置
   * 定义 Buff 在特定阶段自动触发的行为（如回合开始治疗、受击反弹等）
   */
  triggers?: TriggerAction[]

  /**
   * 是否级联移除子 Buff
   * true 表示父 Buff 移除时，以此 Buff 为父的子 Buff 被级联移除。
   * false/undefined 表示父 Buff 移除时，子 Buff 转为独立存在。
   * 典型场景：光环→派生子 Buff 设为 true；"Buff A 触发了一个永久标记"设为 false。
   */
  cascadeRemove?: boolean
}

/**
 * 自包含脚本 Buff 的默认配置类型
 * 脚本类通过静态 CONFIG 属性提供这些值，框架在注册时读取并存储。
 * 所有字段均可选——脚本只需提供需要覆盖的字段，其余从 JSON 或内置默认值填充。
 */
export interface ScriptBuffConfig {
  id: string
  name?: string
  description?: string
  duration?: number
  maxStacks?: number
  cooldown?: number
  isPermanent?: boolean
  stackRule?: StackRule
  controlType?: ControlType
  iconPath?: string
  dispellable?: boolean
  parameters?: Record<string, any>
  /** 标记该脚本完全自包含——框架不再从 JSON 读取 attributes 应用修饰符 */
  selfContained?: boolean
  /** 效果标签（同 BuffConfig.tags） */
  tags?: string[]
  /** 免疫标签（同 BuffConfig.immunities） */
  immunities?: string[]
  /** 是否级联移除子 Buff（同 BuffConfig.cascadeRemove） */
  cascadeRemove?: boolean
}

/**
 * 增益效果实例接口
 * 表示一个已应用到角色身上的增益效果实例
 */
export interface BuffInstance<TParams = any> {
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
   * 包含增益效果的所有气血周期回调函数
   */
  script: IBuffScript<TParams>

  /**
   * 增益效果上下文对象
   * 包含角色状态、属性等运行时信息
   */
  context: BuffContext

  /**
   * 开始回合
   * 增益效果开始生效的回合数
   */
  startTurn: number

  /**
   * 持续时间(回合数)
   * 当前实例的持续时间,可能与BuffConfig中的duration不同(如被刷新)
   */
  duration: number

  /**
   * 剩余回合数
   * 增益效果还剩余的回合数
   */
  remainingTurns: number

  /**
   * 当前叠加层数
   * 此Buff实例的当前叠加层数
   */
  currentStacks: number

  /**
   * 是否处于激活状态
   * true表示增益效果正在生效,false表示已被暂停或失效
   */
  isActive: boolean

  /**
   * 特殊效果文本行（缓存脚本 getEffectLines 的输出）
   * 供纯文本 UI 展示使用，由 BuffSystem 在 addBuff/refresh 时填充
   */
  effectLines?: BuffEffectLine[]

  /**
   * 条件评估状态
   * 由外部通过 BuffSystem.setBuffConditionState() 设置
   * active = 条件已满足（如已残血），inactive = 条件未满足
   */
  conditionState?: ConditionState

  /**
   * 触发器监听器 ID 列表
   * 在 addBuff 时注册到 TriggerEventBus，removeBuff 时反注册。
   * ponytail: 每个 trigger 生成一个 listenerId，存储在数组中统一清理。
   */
  triggerListenerIds?: string[]

  /**
   * 父 Buff 实例 ID
   * 当此 Buff 由另一个 Buff（如光环）派生时，记录父实例的 ID。
   * 父 Buff 被移除时，若自身 cascadeRemove===true，则被子级联移除。
   */
  parentInstanceId?: string
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

// ========== 触发器系统类型定义 ==========

/**
 * 触发行为定义
 * 触发行为定义
 * 定义Buff在特定阶段触发的行为
 */
export interface TriggerAction {
  /** 触发的阶段 */
  phase: BattleTriggerPhase
  /** 执行脚本ID（如 "deal_damage", "apply_buff", "heal"） */
  scriptId: string
  /** 执行参数（传递给脚本） */
  params?: Record<string, unknown>
  /** 触发概率（0-1），默认1 */
  probability?: number
  /** 冷却回合数（同一Buff实例的内部冷却） */
  cooldown?: number
  /** 最大触发次数（-1表示无限制） */
  maxTriggers?: number
}

// 删除，改为从 battle/type/types.ts 导入
export type { TriggerEventContext } from '@/domain/battle/type/types'

/**
 * 触发器运行时状态
 * 追踪Buff实例中每个触发器的运行时状态
 */
export interface TriggerRuntimeState {
  /** 当前冷却回合数 */
  currentCooldown: number
  /** 已触发次数 */
  triggerCount: number
  /** 注册的监听器ID */
  listenerId: string
}
