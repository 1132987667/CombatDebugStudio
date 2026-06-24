/**
 * 战斗日志系统 - 统一类型定义
 *
 * 整合了以下文件中的类型定义：
 *
 * 确保系统中所有战斗日志相关的类型引用保持一致
 */

import type { BattleAction } from '@/domain/battle/types'

/**
 * 日志级别 - 统一所有日志系统的级别定义
 */
export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
} as const

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel]

export const LogLevelClass: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'log-error',
  [LogLevel.WARN]: 'log-warn',
  [LogLevel.INFO]: 'log-info',
  [LogLevel.DEBUG]: 'log-debug',
  [LogLevel.TRACE]: 'log-trace',
}

export const LogLevelLabel: Record<LogLevel, string> = {
  [LogLevel.ERROR]: '错误',
  [LogLevel.WARN]: '警告',
  [LogLevel.INFO]: '信息',
  [LogLevel.DEBUG]: '调试',
  [LogLevel.TRACE]: '跟踪',
}

/**
 * 日志类别 - 用于业务过滤和展示分组
 * 包含战斗、系统、物品、动作和调试五种类别
 */
export const LogType = {
  BATTLE: 'battle',
  SYSTEM: 'system',
  ITEM: 'item',
  ACTION: 'action',
  DEBUG: 'debug',
} as const

export type LogType = (typeof LogType)[keyof typeof LogType]

export const LogTypeLabel: Record<LogType, string> = {
  [LogType.BATTLE]: '战斗',
  [LogType.SYSTEM]: '系统',
  [LogType.ITEM]: '物品',
  [LogType.ACTION]: '动作',
  [LogType.DEBUG]: '调试',
}

/**
 * 战斗日志级别类型 - 用于UI展示和过滤
 */
export type BattleLogLevel = 'debug' | 'info' | 'warning' | 'error'

/**
 * 战斗日志类别常量
 * 统一的日志类别定义，供全项目使用
 */
export const BATTLE_LOG_CATEGORIES = {
  SYSTEM: 'system',
  ACTION: 'action',
  DAMAGE: 'damage',
  HEAL: 'heal',
  CRIT: 'crit',
  STATUS: 'status',
  BATTLE: 'battle',
  ITEM: 'item',
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
} as const

/**
 * 战斗日志类别类型 - 用于业务过滤和展示分组
 */
export type BattleLogCategory =
  (typeof BATTLE_LOG_CATEGORIES)[keyof typeof BATTLE_LOG_CATEGORIES]

/**
 * 统一日志消息类型 - 合并级别和类别
 * 用于需要同时表示级别和业务类别的场景
 */
export type BattleLogMessageType = BattleLogLevel | BattleLogCategory

/**
 * 战斗日志条目类型枚举
 */
export type BattleLogType = 'system' | '普通攻击' | '小技能' | '大技能'

/**
 * 战斗动作类型定义 - 统一所有动作类型
 */
export type ActionType =
  | 'normal_attack' // 普通攻击
  | 'skill_attack' // 技能攻击
  | 'heal_skill' // 治疗技能
  | 'buff_skill' // 增益技能
  | 'debuff_skill' // 减益技能
  | 'status_effect' // 状态生效
  | 'control_effect' // 控制效果
  | 'critical_hit' // 暴击
  | 'missed_attack' // 未命中
  | 'blocked_attack' // 格挡
  | 'defense_action' // 防御动作
  | 'charge_action' // 蓄力动作
  | 'unit_death' // 单位死亡
  | 'battle_victory' // 战斗胜利
  | 'battle_defeat' // 战斗失败
  | 'battle_start' // 战斗开始
  | 'battle_end' // 战斗结束

/**
 * 通用日志条目接口 - 用于框架日志系统
 */
export interface LogEntry {
  /** 日志索引 */
  index: number
  /** 日志类型（顶级分类） */
  type: LogType
  /** 日志级别 */
  level?: LogLevel
  /** 日志消息（已废弃，推荐使用 segments） */
  message?: string
  /** 操作类型 */
  action?: string
  /** 额外的上下文数据 */
  context?: Record<string, any>
  /** 日志来源标识 */
  source?: string
  /** 目标标识 */
  target?: string
  /** 错误对象 */
  error?: Error
  /** 日志片段数组（推荐使用的结构化日志格式） */
  segments?: LogSegment[]
  /** 回合号（仅战斗日志使用） */
  turn?: number | string
  /** 日志类别（业务维度） */
  category?: BattleLogCategory
  /** 日志详细类别 */
  detailCategory?: string
}

/**
 * 战斗日志条目接口 - 统一所有战斗日志条目定义
 * 精简版本：移除冗余字段，仅保留核心数据
 */
export interface BattleLogEntry extends LogEntry {
  /** 回合号（必需） */
  turn: number | string
  /** 日志消息（必需） */
  message: string
}

/**
 * 日志片段接口 - 用于结构化渲染日志内容
 */
export interface LogSegment {
  /** 片段文本内容 */
  text: string
  /** 片段CSS类名 */
  classStr?: string
}

export function newLogSegment(text: string, classStr?: string): LogSegment {
  return {
    text,
    classStr,
  }
}

/**
 * HTML格式化选项扩展 - 包含HTML特定属性
 */
export interface HTMLFormatOptions extends LogFormatOptions {
  forceCritical?: boolean
  sourceIsAlly?: boolean
  targetIsAlly?: boolean
}

/**
 * 日志过滤器配置 - 控制各类战斗日志在界面上的显示状态
 */
export interface LogFilters {
  /** 是否显示战斗日志（攻击、技能、治疗、暴击等） */
  battle: boolean
  /** 是否显示系统日志（规则变更、速度调整等） */
  system: boolean
  /** 是否显示物品日志（物品使用、获得等） */
  item: boolean
  /** 是否显示操作日志（玩家点击、调试操作等） */
  action: boolean
  /** 是否显示调试日志（开发信息、错误等，默认隐藏） */
  debug: boolean
}

/**
 * 日志处理器接口 - 用于框架日志系统
 */
export interface LogHandler {
  handle(entry: LogEntry): void
}

/**
 * 日志管理器选项接口
 */
export interface BattleLogManagerOptions {
  /** 战斗日志最大数量，默认200 */
  battleMaxLogs?: number
  /** 系统日志最大数量，默认200 */
  maxSystemLogs?: number
  /** 物品日志最大数量，默认200 */
  maxItemLogs?: number
  /** 动作日志最大数量，默认200 */
  maxActionLogs?: number
  /** 调试日志最大数量，默认500 */
  maxDebugLogs?: number
  /** 初始过滤器配置 */
  filters?: Partial<LogFilters>
  /** 是否启用自动清理，默认true */
  autoCleanup?: boolean
  /** 当前调试日志级别，默认DEBUG */
  level?: LogLevel
  /** 日志处理器数组 */
  handlers?: LogHandler[]
  /** 日志来源标识 */
  source?: string
}

/**
 * 日志颜色映射 - 统一所有UI颜色定义
 */
export const LogLevelColors: Record<BattleLogCategory, string> = {
  system: '#9e9e9e',
  action: '#4fc3f7',
  damage: '#f44336',
  heal: '#4caf50',
  crit: '#ff9800',
  status: '#2196f3',
  battle: '#9c27b0',
  item: '#8bc34a',
  debug: '#607d8b',
  info: '#2196f3',
  warning: '#ff9800',
  error: '#f44336',
}

/**
 * 获取日志颜色 - 统一颜色获取方法
 */
export function getLogLevelColor(level: BattleLogCategory): string {
  return LogLevelColors[level] || '#9e9e9e'
}

/**
 * 动作类型映射 - 统一动作类型到显示名称的映射
 */
export const ActionTypeDisplayNames: Record<ActionType, string> = {
  normal_attack: '普通攻击',
  skill_attack: '技能攻击',
  heal_skill: '治疗技能',
  buff_skill: '增益技能',
  debuff_skill: '减益技能',
  status_effect: '状态生效',
  control_effect: '控制效果',
  critical_hit: '暴击',
  missed_attack: '未命中',
  blocked_attack: '格挡',
  defense_action: '防御动作',
  charge_action: '蓄力动作',
  unit_death: '单位死亡',
  battle_victory: '战斗胜利',
  battle_defeat: '战斗失败',
  battle_start: '战斗开始',
  battle_end: '战斗结束',
}

/**
 * 默认日志过滤器配置
 */
export const DefaultLogFilters: LogFilters = {
  battle: true,
  system: true,
  item: true,
  action: true,
  debug: false,
}

/**
 * 创建攻击日志片段 - 结构化生成战斗攻击日志
 * @param attacker 攻击者名称
 * @param target 目标名称
 * @param damage 伤害值
 * @param isFriendlyAttacker 攻击者是否为我方
 * @param isFriendlyTarget 目标是否为我方
 * @returns LogSegment 数组
 */
export function createAttackLogSegments(
  attacker: string,
  target: string,
  damage: number,
  isFriendlyAttacker: boolean,
  isFriendlyTarget: boolean,
): LogSegment[] {
  return [
    {
      text: attacker,
      classStr: isFriendlyAttacker ? 'log-friendly' : 'log-hostile',
    },
    { text: ' 对 ' },
    {
      text: target,
      classStr: isFriendlyTarget ? 'log-friendly' : 'log-hostile',
    },
    { text: ' 发动普通攻击，造成 ' },
    { text: damage.toString(), classStr: 'log-damage' },
    { text: ' 点伤害' },
  ]
}

/**
 * 创建治疗日志片段 - 结构化生成治疗日志
 * @param healer 治疗者名称
 * @param target 目标名称
 * @param healAmount 治疗量
 * @param isFriendlyHealer 治疗者是否为我方
 * @param isFriendlyTarget 目标是否为我方
 * @returns LogSegment 数组
 */
export function createHealLogSegments(
  healer: string,
  target: string,
  healAmount: number,
  isFriendlyHealer: boolean,
  isFriendlyTarget: boolean,
): LogSegment[] {
  return [
    {
      text: healer,
      classStr: isFriendlyHealer ? 'log-friendly' : 'log-hostile',
    },
    { text: ' 对 ' },
    {
      text: target,
      classStr: isFriendlyTarget ? 'log-friendly' : 'log-hostile',
    },
    { text: ' 恢复 ' },
    { text: healAmount.toString(), classStr: 'log-heal' },
    { text: ' 点生命值' },
  ]
}

/**
 * 创建暴击攻击日志片段 - 结构化生成暴击攻击日志
 * @param attacker 攻击者名称
 * @param target 目标名称
 * @param damage 伤害值
 * @param isFriendlyAttacker 攻击者是否为我方
 * @param isFriendlyTarget 目标是否为我方
 * @returns LogSegment 数组
 */
export function createCritAttackLogSegments(
  attacker: string,
  target: string,
  damage: number,
  isFriendlyAttacker: boolean,
  isFriendlyTarget: boolean,
): LogSegment[] {
  return [
    {
      text: attacker,
      classStr: isFriendlyAttacker ? 'log-friendly' : 'log-hostile',
    },
    { text: ' 对 ' },
    {
      text: target,
      classStr: isFriendlyTarget ? 'log-friendly' : 'log-hostile',
    },
    { text: ' 发动暴击，造成 ' },
    { text: damage.toString(), classStr: 'log-crit' },
    { text: ' 点暴击伤害！' },
  ]
}

/**
 * 创建默认的战斗日志条目
 */
export function createDefaultBattleLogEntry(
  turn: string,
  source: string,
  action: string,
  target: string,
  result: string,
  level: BattleLogMessageType = 'info',
  category: BattleLogCategory = 'system',
): BattleLogEntry {
  return {
    turn,
    source,
    action,
    target,
    level,
    category,
    segments: [{ text: result }],
  }
}

/**
 * 格式化日志时间戳
 */
export function formatLogTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString()
}

/**
 * 日志系统工具函数集合
 */
export const LogUtils = {
  /**
   * 检查日志级别是否有效
   */
  isValidLogLevel(level: string): boolean {
    const validLevels: BattleLogLevel[] = ['debug', 'info', 'warning', 'error']
    return validLevels.includes(level as BattleLogLevel)
  },

  isValidLogCategory(category: string): boolean {
    const validCategories = Object.values(BATTLE_LOG_CATEGORIES)
    return validCategories.includes(category as BattleLogCategory)
  },

  /**
   * 获取日志级别的显示名称
   * @param level - 日志级别或类别
   */
  getLevelDisplayName(level: BattleLogMessageType): string {
    const displayNames: Partial<
      Record<BattleLogLevel | BattleLogCategory, string>
    > = {
      damage: '伤害',
      heal: '治疗',
      crit: '暴击',
      status: '状态',
      info: '信息',
      debug: '调试',
      warning: '警告',
      error: '错误',
      system: '系统',
      action: '动作',
    }
    return displayNames[level] || '未知'
  },
}

/**
 * 计算结果接口
 */
export interface CalculationResult {
  value: number
  isCritical: boolean
  isMissed: boolean
  isBlocked: boolean
  finalMultiplier: number
}

/**
 * 计算上下文接口
 */
export interface CalculationContext {
  source: any
  target: any
  skill: any
  modifiers: Record<string, number>
}

/**
 * 计算日志接口 - 统一所有计算日志定义
 */
export interface CalculationLog {
  /** 时间戳 */
  timestamp: number

  /** 计算类型 */
  type: 'damage' | 'heal' | 'buff' | 'debuff'

  /** 步骤类型（兼容原有系统） */
  stepType?: 'DAMAGE' | 'HEAL'

  /** 来源ID */
  sourceId: string

  /** 目标ID */
  targetId: string

  /** 技能ID（可选） */
  skillId?: string

  /** 基础值（兼容原有系统） */
  baseValue?: number

  /** 额外值列表（兼容原有系统） */
  extraValues?: Array<{ attribute: string; value: number; ratio: number }>

  /** 最终值（兼容原有系统） */
  finalValue?: number

  /** 是否暴击（兼容原有系统） */
  critical?: boolean

  /** 修正系数（兼容原有系统） */
  modifiers?: Record<string, number>

  /** 计算结果（框架系统） */
  result?: CalculationResult

  /** 计算上下文（框架系统） */
  context?: CalculationContext
}

/**
 * BattleAction 转换为 BattleLogEntry 的选项
 */
export interface BattleActionToLogEntryOptions {
  turnNumber?: number
  sourceIsAlly?: boolean
  targetIsAlly?: boolean
}

/**
 * 参与者映射类型
 */
export interface ParticipantMap {
  get(id: string): { name: string; team: string } | undefined
}

/**
 * 将 BattleAction 转换为 BattleLogEntry
 * 统一转换逻辑，确保日志生成准确、可复用
 */
export function battleActionToLogEntry(
  action: BattleAction,
  participants: ParticipantMap,
  options?: BattleActionToLogEntryOptions,
): BattleLogEntry {
  const turn = options?.turnNumber ?? action.turn ?? 1
  const turnStr = `回合${turn}`

  let sourceName = action.sourceId
  if (action.sourceId === 'system') {
    sourceName = '系统'
  } else {
    const sourceParticipant = participants.get(action.sourceId)
    if (sourceParticipant) {
      sourceName = sourceParticipant.name
    }
  }

  let targetName = ''
  if (action.targetId && action.targetId !== 'system') {
    const targetParticipant = participants.get(action.targetId)
    if (targetParticipant) {
      targetName = targetParticipant.name
    }
  }

  const sourceIsAlly =
    options?.sourceIsAlly ??
    (action.sourceId !== 'system'
      ? participants.get(action.sourceId)?.team === 'ally'
      : false)
  const targetIsAlly =
    options?.targetIsAlly ??
    (action.targetId
      ? participants.get(action.targetId)?.team === 'ally'
      : undefined)

  const { category, level, segments } = generateLogSegments(
    action,
    sourceName,
    targetName,
    sourceIsAlly,
    targetIsAlly,
  )

  return {
    turn: turnStr,
    source: sourceName,
    action: '对',
    target: targetName,
    level,
    category,
    segments,
  }
}

/**
 * 根据动作类型生成日志片段
 */
function generateLogSegments(
  action: BattleAction,
  sourceName: string,
  targetName: string,
  sourceIsAlly: boolean,
  targetIsAlly: boolean | undefined,
): {
  category: BattleLogCategory
  level: BattleLogMessageType
  segments: LogSegment[]
} {
  if (action.sourceId === 'system') {
    return generateSystemLogSegments(action)
  }

  if (!action.success || action.isHit === false) {
    return generateMissLogSegments(
      action,
      sourceName,
      targetName,
      sourceIsAlly,
      targetIsAlly,
    )
  }

  if (action.isCrit) {
    return generateCritLogSegments(
      action,
      sourceName,
      targetName,
      sourceIsAlly,
      targetIsAlly,
    )
  }

  if (action.heal && action.heal > 0) {
    return generateHealLogSegments(
      action,
      sourceName,
      targetName,
      sourceIsAlly,
      targetIsAlly,
    )
  }

  if (action.damage && action.damage > 0) {
    return generateDamageLogSegments(
      action,
      sourceName,
      targetName,
      sourceIsAlly,
      targetIsAlly,
    )
  }

  return generateDefaultLogSegments(
    action,
    sourceName,
    targetName,
    sourceIsAlly,
    targetIsAlly,
  )
}

/**
 * 生成系统日志片段
 */
function generateSystemLogSegments(action: BattleAction): {
  category: BattleLogCategory
  level: BattleLogMessageType
  segments: LogSegment[]
} {
  const description = action.effects[0]?.description || ''

  if (description.includes('战斗开始')) {
    return {
      category: 'system',
      level: 'info',
      segments: [{ text: description }],
    }
  }

  if (
    description.includes('战斗结束') ||
    description.includes('胜利') ||
    description.includes('失败')
  ) {
    return {
      category: 'system',
      level: description.includes('胜利') ? 'info' : 'warning',
      segments: [{ text: description }],
    }
  }

  return {
    category: 'system',
    level: 'info',
    segments: [{ text: description }],
  }
}

/**
 * 生成未命中日志片段
 */
function generateMissLogSegments(
  action: BattleAction,
  sourceName: string,
  targetName: string,
  sourceIsAlly: boolean,
  targetIsAlly: boolean | undefined,
): {
  category: BattleLogCategory
  level: BattleLogMessageType
  segments: LogSegment[]
} {
  const skillName = action.skillName || '普通攻击'
  const isSkill = action.type === 'skill'

  return {
    category: 'status',
    level: 'info',
    segments: [
      {
        text: sourceName,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: targetName,
        classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ` 发动${isSkill ? `【${skillName}】` : ''}，攻击被闪避，未命中` },
    ],
  }
}

/**
 * 生成暴击日志片段
 */
function generateCritLogSegments(
  action: BattleAction,
  sourceName: string,
  targetName: string,
  sourceIsAlly: boolean,
  targetIsAlly: boolean | undefined,
): {
  category: BattleLogCategory
  level: BattleLogMessageType
  segments: LogSegment[]
} {
  const skillName = action.skillName || '普通攻击'
  const isSkill = action.type === 'skill'
  const damage = action.damage || 0

  return {
    category: 'crit',
    level: 'info',
    segments: [
      {
        text: sourceName,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: targetName,
        classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
      },
      {
        text: ` 发动${isSkill ? `【${skillName}】` : ''}，触发会心一击，造成 `,
      },
      { text: damage.toString(), classStr: 'log-crit' },
      { text: ' 点暴击伤害！' },
    ],
  }
}

/**
 * 生成治疗日志片段
 */
function generateHealLogSegments(
  action: BattleAction,
  sourceName: string,
  targetName: string,
  sourceIsAlly: boolean,
  targetIsAlly: boolean | undefined,
): {
  category: BattleLogCategory
  level: BattleLogMessageType
  segments: LogSegment[]
} {
  const skillName = action.skillName || '治疗'
  const healAmount = action.heal || 0

  return {
    category: 'heal',
    level: 'info',
    segments: [
      {
        text: sourceName,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: targetName,
        classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ` 施放【${skillName}】，为其恢复 ` },
      { text: healAmount.toString(), classStr: 'log-heal' },
      { text: ' 点生命值' },
    ],
  }
}

/**
 * 生成伤害日志片段
 */
function generateDamageLogSegments(
  action: BattleAction,
  sourceName: string,
  targetName: string,
  sourceIsAlly: boolean,
  targetIsAlly: boolean | undefined,
): {
  category: BattleLogCategory
  level: BattleLogMessageType
  segments: LogSegment[]
} {
  const skillName = action.skillName
  const isSkill = action.type === 'skill'
  const damage = action.damage || 0

  if (isSkill && skillName) {
    return {
      category: 'damage',
      level: 'info',
      segments: [
        {
          text: sourceName,
          classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
        },
        { text: ' 对 ' },
        {
          text: targetName,
          classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
        },
        { text: ` 发动终极技能【${skillName}】，造成 ` },
        { text: damage.toString(), classStr: 'log-damage' },
        { text: ' 点魔法伤害' },
      ],
    }
  }

  return {
    category: 'damage',
    level: 'info',
    segments: [
      {
        text: sourceName,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: targetName,
        classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 发动普通攻击，造成 ' },
      { text: damage.toString(), classStr: 'log-damage' },
      { text: ' 点物理伤害' },
    ],
  }
}

/**
 * 生成默认日志片段
 */
function generateDefaultLogSegments(
  action: BattleAction,
  sourceName: string,
  targetName: string,
  sourceIsAlly: boolean,
  targetIsAlly: boolean | undefined,
): {
  category: BattleLogCategory
  level: BattleLogMessageType
  segments: LogSegment[]
} {
  const effectDescription = action.effects[0]?.description || '执行了动作'

  return {
    category: 'action',
    level: 'info',
    segments: [
      {
        text: sourceName,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: targetName,
        classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ` ${effectDescription}` },
    ],
  }
}
