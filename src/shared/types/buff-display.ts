/**
 * Buff 纯文本显示类型定义
 *
 * 用于从 BuffSystem 数据到纯文本 UI 的转换管道。
 * 部分类型（如 BuffEffectLine）复用于领域层，从 @/domain/buff/types 导入。
 */
import type { BuffEffectLine } from '@/domain/buff/types'

/**
 * Buff 原始条目 —— 从 BuffSystem 或 InterventionManager 合并后的中间格式，
 * 作为 `toBuffTextItem()` 的输入契约，替代 `any` 参数。
 * id/buffId/name 为必填字段，其余可选。
 */
export interface BuffRawItem {
  /** Buff 实例 ID（源1）或效果 ID（源2） */
  id: string
  /** Buff 实例 ID（与 id 二选一） */
  instanceId?: string
  /** Buff 配置 ID（buffs.json 中的 id） */
  buffId: string
  /** 显示名称 */
  name: string
  /** 效果描述 */
  description?: string
  /** 是否为 debuff */
  isDebuff?: boolean
  /** 剩余回合数 */
  remainingTurns?: number
  /** 当前层数 */
  currentStacks?: number
  /** 属性修正（key=attribute code, value=如 "+0.05" 或 "+20%"，per-stack 值） */
  attributes?: Record<string, string>
  /** 特殊效果行 */
  effectLines?: BuffEffectLine[]
  /** 领域层条件状态（由 BuffSystem.setBuffConditionState 设置）
   *  'active' = 条件已满足，'inactive' = 条件未满足
   *  undefined = 领域层未设置，回退到文本启发式推断 */
  conditionState?: ConditionState
  /** Buff 脚本类名（调试用） */
  scriptName?: string
  /** 控制类型（来自 BuffConfig，如 "stun"、"silence"） */
  controlType?: string
}

/** 单个 Buff 在纯文本模式下的显示条目 */
export interface BuffTextItem {
  /** 实例 ID（用于追踪和调试） */
  instanceId: string
  /** Buff 配置 ID（来自 buffs.json） */
  buffId: string
  /** Buff 显示名称 */
  name: string
  /** 效果描述 */
  description: string

  /** 剩余回合数，0 表示永久 */
  remainingTurns: number
  /** 当前层数 */
  stacks: number

  /** 类型标识 */
  type: 'buff' | 'debuff' | 'control'

  /** 条件状态 */
  condition: ConditionState

  /** 条件标签文本（如 "残血"、"满血"），仅 condition 为 inactive/active 时有意义 */
  conditionLabel?: string

  /** 是否为光环（全队效果） */
  isAura: boolean

  /** 修饰符列表（来源追溯用） */
  modifiers: BuffModifier[]

  /** 特殊效果行（DOT/HOT/护盾/反伤等非属性修正效果） */
  effectLines: BuffEffectLine[]

  // === 调试模式字段 ===
  /** 所属的参与者 ID */
  ownerId: string
  /** Buff 脚本类名 */
  scriptName?: string
  /** buffs.json 中的配置 key */
  configKey?: string
}

/** 条件状态 */
export const ConditionState = {
  ACTIVE: 'active',     // 条件已满足（如已经残血）
  INACTIVE: 'inactive',   // 条件未满足
  PERMANENT: 'permanent',  // 永久效果
  NONE: 'none'       // 无条件，普通计时
} as const
export type ConditionState = (typeof ConditionState)[keyof typeof ConditionState]

export const ConditionStateNames = {
  [ConditionState.ACTIVE]: '已激活',
  [ConditionState.INACTIVE]: '未激活',
  [ConditionState.PERMANENT]: '永久效果',
  [ConditionState.NONE]: '无条件，普通计时',
}


/**
 * 条件状态名称
 */
export type ConditionStateName = (typeof ConditionStateNames)[keyof typeof ConditionStateNames]


/** 修饰符（来源追溯用） */
export interface BuffModifier {
  sourceName: string
  attribute: string
  value: number
  type: 'PERCENTAGE' | 'ADDITIVE' | 'MULTIPLICATIVE' | 'FINAL'
  /** 是否为固定值（不加 % 后缀） */
  isFlat?: boolean
}

/** 属性合并条目：同一属性多来源合并后的一条显示 */
export interface MergedAttributeLine {
  /** 属性名，如 "攻击"、"防御" */
  attribute: string
  /** 合并后总百分比（正=增益，负=减益） */
  totalPercent: number
  /** 该属性是否实际发生了变化（±0 表示抵消） */
  isChanged: boolean
  /** 是否为固定值（不加 % 后缀） */
  isFlat?: boolean
  /** 基础值（未加修饰符前的原始值，可选） */
  baseValue?: number
  /** 各来源明细 */
  sources: Array<{
    buffName: string
    percent: number
    remainingTurns: number
    isPermanent: boolean
    stacks: number
  }>
}

/** 排序优先级（用于 collapse 前的预排序） */
export interface SortKey {
  /** 是否控制类型 */
  isControl: boolean
  /** 剩余回合数（永久=Infinity） */
  turnsLeft: number
  /** 是否已激活条件 */
  isActive: boolean
  /** 增益（数值>0）优先 */
  isPositive: boolean
}

/** useBuffDisplay 的返回值 */
export interface BuffDisplayState {
  /** 原始转换后的条目 */
  items: BuffTextItem[]
  /** 合并后的属性标签（用于收缩态标签栏） */
  mergedLabels: MergedAttributeLine[]
  /** 实际可见的属性标签（受折叠阈值控制） */
  visibleAttrLabels: MergedAttributeLine[]
  /** 控制标签（排最前，不折叠） */
  controlLabels: BuffTextItem[]
  /** 折叠后需要隐藏的标签数 */
  collapsedCount: number
  /** 排序后的完整分组（用于展开面板） */
  groups: BuffTextItem[]
  /** 次要分组（极多 Buff 时折叠的超期/永久效果） */
  secondaryGroups: BuffTextItem[]
}
