/**
 * 战斗日志系统 - 统一类型定义
 *
 * 整合了以下文件中的类型定义：
 * - src/utils/BattleLogFormatter.ts
 * - src/utils/BattleLogManager.ts
 * - src/framework/utils/Logger.ts
 * - src/utils/logger.ts
 * - src/types/battle-log.ts
 *
 * 确保系统中所有战斗日志相关的类型引用保持一致
 */

import type { BattleAction } from './battle'

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

export type LogLevel = typeof LogLevel[keyof typeof LogLevel]

export const LogLevelLabel: Record<LogLevel, string> = {
  [LogLevel.ERROR]: '错误',
  [LogLevel.WARN]: '警告',
  [LogLevel.INFO]: '信息',
  [LogLevel.DEBUG]: '调试',
  [LogLevel.TRACE]: '跟踪',
}

/**
 * 战斗日志级别类型 - 用于UI展示和过滤
 */
export type BattleLogLevel = 'debug' | 'info' | 'warning' | 'error'

/**
 * 战斗日志类别类型 - 用于业务过滤和展示分组
 * 注意: 此类型扩展为包含日志级别值，以兼容现有代码
 */
export type BattleLogCategory =
  | 'system'
  | 'action'
  | 'damage'
  | 'heal'
  | 'crit'
  | 'status'
  | 'debug'
  | 'info'
  | 'warning'
  | 'error'

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
  timestamp: number
  level: LogLevel
  message: string
  context?: Record<string, any>
  source?: string
  error?: Error
}

/**
 * 战斗日志条目接口 - 统一所有战斗日志条目定义
 * 精简版本：移除冗余字段，仅保留核心数据
 */
export interface BattleLogEntry {
  /** 回合号，如 '回合1' 或 '回合开始' */
  turn: string

  /** 来源（角色名或"系统"） */
  source: string

  /** 动作描述 */
  action: string

  /** 目标 */
  target: string

  /** 日志级别/类别（统一类型） */
  level: BattleLogMessageType

  /** 日志类别（业务维度） */
  category: BattleLogCategory

  /** 日志片段列表，用于结构化渲染（必需） */
  segments: LogSegment[]
}

/**
 * 战斗日志格式化选项 - 统一格式化参数
 */
export interface LogFormatOptions {
  turn: number | string
  source: string
  target: string
  skillName?: string
  damage?: number
  damageType?: string
  heal?: number
  effect?: string
  duration?: number
  targetScope?: string
  triggerTime?: string
  statusName?: string
  isCritical?: boolean
  isMissed?: boolean
  isBlocked?: boolean
  stanceName?: string
  chargeDescription?: string
  exp?: number
  gold?: number
}

/**
 * 日志片段颜色类型
 */
export type LogSegmentColor = 'friendly' | 'hostile' | 'damage' | 'heal' | 'crit' | 'default'

/**
 * 日志片段接口 - 用于结构化渲染日志内容
 */
export interface LogSegment {
  /** 片段文本内容 */
  text: string
  /** 片段颜色类型 */
  color?: LogSegmentColor
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
  /** 是否显示伤害类日志 */
  damage: boolean
  /** 是否显示状态类日志（增益、减益、控制等） */
  status: boolean
  /** 是否显示暴击类日志 */
  crit: boolean
  /** 是否显示治疗类日志 */
  heal: boolean
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
  /** 最大日志数量，默认100 */
  maxLogs?: number
  /** 初始过滤器配置 */
  filters?: Partial<LogFilters>
  /** 是否启用自动清理 */
  autoCleanup?: boolean
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
  damage: true,
  status: true,
  crit: true,
  heal: false,
}

/**
 * 日志级别优先级映射
 */
export const LogLevelPriority: Record<BattleLogLevel, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
}

/**
 * 判断日志是否应该显示（基于过滤器）
 */
export function shouldDisplayLog(
  log: BattleLogEntry,
  filters: LogFilters,
): boolean {
  // 根据日志类别和过滤器进行判断
  switch (log.category) {
    case 'damage':
      return filters.damage
    case 'heal':
      return filters.heal
    case 'crit':
      return filters.crit
    case 'status':
      return filters.status
    default:
      return true
  }
}

/**
 * 日志片段颜色映射到CSS类名
 */
export const LogSegmentColorClass: Record<LogSegmentColor, string> = {
  friendly: 'log-friendly',
  hostile: 'log-hostile',
  damage: 'log-damage',
  heal: 'log-heal',
  crit: 'log-crit',
  default: '',
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
    { text: attacker, color: isFriendlyAttacker ? 'friendly' : 'hostile' },
    { text: ' 对 ' },
    { text: target, color: isFriendlyTarget ? 'friendly' : 'hostile' },
    { text: ' 发动普通攻击，造成 ' },
    { text: damage.toString(), color: 'damage' },
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
    { text: healer, color: isFriendlyHealer ? 'friendly' : 'hostile' },
    { text: ' 对 ' },
    { text: target, color: isFriendlyTarget ? 'friendly' : 'hostile' },
    { text: ' 恢复 ' },
    { text: healAmount.toString(), color: 'heal' },
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
    { text: attacker, color: isFriendlyAttacker ? 'friendly' : 'hostile' },
    { text: ' 对 ' },
    { text: target, color: isFriendlyTarget ? 'friendly' : 'hostile' },
    { text: ' 发动暴击，造成 ' },
    { text: damage.toString(), color: 'crit' },
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
    const validCategories: BattleLogCategory[] = [
      'system',
      'action',
      'damage',
      'heal',
      'crit',
      'status',
    ]
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

  /**
   * 比较两个日志级别的重要性
   */
  compareLevels(level1: BattleLogLevel, level2: BattleLogLevel): number {
    return LogLevelPriority[level1] - LogLevelPriority[level2]
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

  const sourceIsAlly = options?.sourceIsAlly ?? (action.sourceId !== 'system' ? participants.get(action.sourceId)?.team === 'ally' : false)
  const targetIsAlly = options?.targetIsAlly ?? (action.targetId ? participants.get(action.targetId)?.team === 'ally' : undefined)

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
    return generateMissLogSegments(action, sourceName, targetName, sourceIsAlly, targetIsAlly)
  }

  if (action.isCrit) {
    return generateCritLogSegments(action, sourceName, targetName, sourceIsAlly, targetIsAlly)
  }

  if (action.heal && action.heal > 0) {
    return generateHealLogSegments(action, sourceName, targetName, sourceIsAlly, targetIsAlly)
  }

  if (action.damage && action.damage > 0) {
    return generateDamageLogSegments(action, sourceName, targetName, sourceIsAlly, targetIsAlly)
  }

  return generateDefaultLogSegments(action, sourceName, targetName, sourceIsAlly, targetIsAlly)
}

/**
 * 生成系统日志片段
 */
function generateSystemLogSegments(
  action: BattleAction,
): {
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

  if (description.includes('战斗结束') || description.includes('胜利') || description.includes('失败')) {
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
      { text: sourceName, color: sourceIsAlly ? 'friendly' : 'hostile' },
      { text: ' 对 ' },
      { text: targetName, color: targetIsAlly ? 'friendly' : 'hostile' },
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
      { text: sourceName, color: sourceIsAlly ? 'friendly' : 'hostile' },
      { text: ' 对 ' },
      { text: targetName, color: targetIsAlly ? 'friendly' : 'hostile' },
      { text: ` 发动${isSkill ? `【${skillName}】` : ''}，触发会心一击，造成 ` },
      { text: damage.toString(), color: 'crit' },
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
      { text: sourceName, color: sourceIsAlly ? 'friendly' : 'hostile' },
      { text: ' 对 ' },
      { text: targetName, color: targetIsAlly ? 'friendly' : 'hostile' },
      { text: ` 施放【${skillName}】，为其恢复 ` },
      { text: healAmount.toString(), color: 'heal' },
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
        { text: sourceName, color: sourceIsAlly ? 'friendly' : 'hostile' },
        { text: ' 对 ' },
        { text: targetName, color: targetIsAlly ? 'friendly' : 'hostile' },
        { text: ` 发动终极技能【${skillName}】，造成 ` },
        { text: damage.toString(), color: 'damage' },
        { text: ' 点魔法伤害' },
      ],
    }
  }

  return {
    category: 'damage',
    level: 'info',
    segments: [
      { text: sourceName, color: sourceIsAlly ? 'friendly' : 'hostile' },
      { text: ' 对 ' },
      { text: targetName, color: targetIsAlly ? 'friendly' : 'hostile' },
      { text: ' 发动普通攻击，造成 ' },
      { text: damage.toString(), color: 'damage' },
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
      { text: sourceName, color: sourceIsAlly ? 'friendly' : 'hostile' },
      { text: ' 对 ' },
      { text: targetName, color: targetIsAlly ? 'friendly' : 'hostile' },
      { text: ` ${effectDescription}` },
    ],
  }
}
