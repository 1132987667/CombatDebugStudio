/**
 * 战斗日志系统 - 统一类型定义
 * 确保系统中所有战斗日志相关的类型引用保持一致
 */

import {
  BattleAction,
  ActionTypes,
  ActionResultType,
  ParticipantSide,
} from '@/domain/battle/type/types'

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

/** 将字符串日志级别/类别转换为数值 LogLevel（用于 LogEntry.level 字段） */
export function toLogLevel(level: string | undefined): LogLevel {
  switch (level) {
    case 'error':
    case 'ERROR':
    case '0':
      return LogLevel.ERROR
    case 'warn':
    case 'WARN':
    case '1':
      return LogLevel.WARN
    case 'info':
    case 'INFO':
    case '2':
      return LogLevel.INFO
    case 'debug':
    case 'DEBUG':
    case '3':
      return LogLevel.DEBUG
    case 'trace':
    case 'TRACE':
    case '4':
      return LogLevel.TRACE
    default:
      return LogLevel.INFO
  }
}

export const LogLevelClass: Record<LogLevel, string> = {
  [LogLevel.ERROR]: 'log-error',
  [LogLevel.WARN]: 'log-warn',
  [LogLevel.INFO]: 'log-info',
  [LogLevel.DEBUG]: 'log-debug',
  [LogLevel.TRACE]: 'log-trace',
}

/**
 * 叙事元数据 —— 渲染器据此生成 气血 箭头、高光标记、块归类
 */
export interface BattleLogMeta {
  /** 叙事角色：决定归入哪种块 */
  role?: 'action' | 'sub' | 'settlement' | 'snapshot' | 'condition' | 'battle'
  entityId?: string
  entityName?: string
  entityFaction?: 'ally' | 'enemy'
  hpBefore?: number
  hpAfter?: number
  damage?: number
  heal?: number
  crit?: boolean
  kill?: boolean
  lethal?: boolean
  immune?: boolean
  miss?: boolean
  skillName?: string
  /** 回合标签线索：'multi-trigger' | 'kill' | 'lethal-protect' | 'final' */
  roundTag?: string
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
export type BattleLogMessageType = LogType | BattleLogCategory

/**
 * 战斗动作类型定义 - 统一所有动作类型
 */
export const DetailActionType = {
  NORMAL_ATTACK: 'normal_attack',
  SKILL_ATTACK: 'skill_attack',
  HEAL_SKILL: 'heal_skill',
  BUFF_SKILL: 'buff_skill',
  DEBUFF_SKILL: 'debuff_skill',
  STATUS_EFFECT: 'status_effect',
  CONTROL_EFFECT: 'control_effect',
  CRITICAL_HIT: 'critical_hit',
  MISSED_ATTACK: 'missed_attack',
  BLOCKED_ATTACK: 'blocked_attack',
  DEFENSE_ACTION: 'defense_action',
  CHARGE_ACTION: 'charge_action',
  UNIT_DEATH: 'unit_death',
  BATTLE_VICTORY: 'battle_victory',
  BATTLE_DEFEAT: 'battle_defeat',
  BATTLE_START: 'battle_start',
  BATTLE_END: 'battle_end',
} as const

export type DetailActionType =
  (typeof DetailActionType)[keyof typeof DetailActionType]

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
  /** 叙事元数据（可选，渲染器据此生成 气血 箭头、高光标记、块归类） */
  meta?: BattleLogMeta
}

/**
 * 片段语义类型 — 决定渲染器把它包成什么 HTML
 */
export type LogSegmentKind =
  | 'entity' // 角色名 → 阵营色芯片
  | 'skill' // 技能名 → 可悬浮芯片
  | 'buff' // Buff名 → 可悬浮芯片
  | 'passive' // 被动名 → 可悬浮芯片
  | 'damage' // 伤害值 → 大号红色数字
  | 'heal' // 治疗值 → 大号绿色数字
  | 'hp-before' // 气血 变化前
  | 'hp-after' // 气血 变化后
  | 'text' // 普通文本（默认）

export const LogSegmentHoverKind = {
  BUFF: 'buff',
  SKILL: 'skill',
  PASSIVE: 'passive',
} as const
export type LogSegmentHoverKind = (typeof LogSegmentHoverKind)[keyof typeof LogSegmentHoverKind]
/**
 * 可悬浮的实体身份（方案二：悬浮信息卡片）
 * 带此字段的 LogSegment 渲染为可交互锚点，
 * EntityTooltip 根据 kind+id 查 LogTooltipResolver 弹出信息卡。
 */
export interface LogSegmentHover {
  kind: 'buff' | 'skill' | 'passive'
  id: string
}

/**
 * 日志片段接口 - 用于结构化渲染日志内容
 */
export interface LogSegment {
  /** 片段文本内容 */
  text: string
  /** 片段CSS类名 */
  classStr?: string
  /** 可悬浮的实体身份（可选）：带此字段的片段渲染为可交互锚点 */
  hover?: LogSegmentHover
  /** 片段语义类型（可选）：指导渲染器按哪种 HTML 组件展示 */
  kind?: LogSegmentKind
  /** 阵营（kind=entity 时使用） */
  faction?: ParticipantSide
}

/**
 * 叙事块 — 玩家日志的渲染单元
 * 与 BattleLogMeta.role 对应，渲染器据此决定布局
 */
export type NarrativeBlock =
  | { type: 'battle-header'; segments: LogSegment[] }
  | { type: 'section'; title: string; lines: LogSegment[][] }
  | { type: 'round'; turn: number; tag?: string }
  | {
      type: 'action'
      header: LogSegment[]
      result?: LogSegment[]
      subs: LogSegment[][]
      /** 是否造成击杀（用于回合标签推断） */
      kill?: boolean
    }
  | { type: 'settlement'; lines: LogSegment[][] }
  | { type: 'snapshot'; lines: LogSegment[][] }
  | { type: 'summary'; lines: LogSegment[][] }
  | { type: 'plain'; segments: LogSegment[] }

export function newLogSegment(
  text: string,
  classStr?: string,
  hover?: LogSegmentHover,
): LogSegment {
  const seg: LogSegment = { text }
  if (classStr !== undefined) seg.classStr = classStr
  if (hover !== undefined) seg.hover = hover
  return seg
}

/**
 * HTML格式化选项扩展 - 包含HTML特定属性
 */
export interface HTMLFormatOptions {
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
export const ActionTypeDisplayNames: Record<DetailActionType, string> = {
  [DetailActionType.NORMAL_ATTACK]: '普通攻击',
  [DetailActionType.SKILL_ATTACK]: '技能攻击',
  [DetailActionType.HEAL_SKILL]: '治疗技能',
  [DetailActionType.BUFF_SKILL]: '增益技能',
  [DetailActionType.DEBUFF_SKILL]: '减益技能',
  [DetailActionType.STATUS_EFFECT]: '状态生效',
  [DetailActionType.CONTROL_EFFECT]: '控制效果',
  [DetailActionType.CRITICAL_HIT]: '暴击',
  [DetailActionType.MISSED_ATTACK]: '未命中',
  [DetailActionType.BLOCKED_ATTACK]: '格挡',
  [DetailActionType.DEFENSE_ACTION]: '防御动作',
  [DetailActionType.CHARGE_ACTION]: '蓄力动作',
  [DetailActionType.UNIT_DEATH]: '单位死亡',
  [DetailActionType.BATTLE_VICTORY]: '战斗胜利',
  [DetailActionType.BATTLE_DEFEAT]: '战斗失败',
  [DetailActionType.BATTLE_START]: '战斗开始',
  [DetailActionType.BATTLE_END]: '战斗结束',
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
    { text: ' 发起 「普通攻击」，造成 ' },
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
    { text: ' 点气血' },
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
    index: -1,
    type: LogType.BATTLE,
    message: result,
    level: toLogLevel(level),
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
    const validLevels: string[] = ['debug', 'info', 'warning', 'error']
    return validLevels.includes(level)
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
    const displayNames: Partial<Record<LogType | BattleLogCategory, string>> = {
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
 * 生成带着色的来源/目标名称段
 *
 * 统一辅助函数，解决战斗日志中角色名缺少颜色的问题。
 * 所有 addBattleLog 调用处应当使用此函数生成前 2~3 个 segment，
 * 确保日志中所有角色名都有敌我颜色区分。
 *
 * 使用示例：
 * ```
 * const segs = buildNameSegments('剑士', true, '史莱姆', false)
 * // → [{text:'剑士', classStr:'log-friendly'}, {text:' 对 '}, {text:'史莱姆', classStr:'log-hostile'}]
 * segs.push({ text: ' 发起 「普通攻击」，造成 104 点伤害' })
 * ```
 */
export function buildNameSegments(
  source: string,
  sourceIsAlly: boolean,
  target?: string,
  targetIsAlly?: boolean,
): LogSegment[] {
  const sourcePrefix = sourceIsAlly ? '[友方]' : '[敌方]'
  const sourceFaction = sourceIsAlly ? ('ally' as const) : ('enemy' as const)
  const segs: LogSegment[] = [
    {
      text: `${sourcePrefix}${source}`,
      classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      kind: 'entity',
      faction: sourceFaction,
    },
  ]
  if (target && target !== source) {
    const targetPrefix =
      targetIsAlly != null ? (targetIsAlly ? '[友方]' : '[敌方]') : ''
    const targetFaction =
      targetIsAlly != null
        ? targetIsAlly
          ? ('ally' as const)
          : ('enemy' as const)
        : undefined
    segs.push({ text: ' 对 ' })
    segs.push({
      text: `${targetPrefix}${target}`,
      classStr:
        targetIsAlly != null
          ? targetIsAlly
            ? 'log-friendly'
            : 'log-hostile'
          : undefined,
      kind: 'entity',
      faction: targetFaction,
    })
  }
  return segs
}

/** 便捷版本：直接返回完整的一段着色日志 segments */
export function buildColoredLogSegments(
  source: string,
  sourceIsAlly: boolean,
  target: string | undefined,
  targetIsAlly: boolean | undefined,
  actionDescription: string,
): LogSegment[] {
  const segs = buildNameSegments(source, sourceIsAlly, target, targetIsAlly)
  segs.push({ text: ` ${actionDescription}` })
  return segs
}

/** 便捷版本：带数值的着色日志 */
export function buildColoredValueLogSegments(
  source: string,
  sourceIsAlly: boolean,
  target: string | undefined,
  targetIsAlly: boolean | undefined,
  actionText: string,
  valueText: string,
  valueClass?: string,
): LogSegment[] {
  const segs = buildNameSegments(source, sourceIsAlly, target, targetIsAlly)
  segs.push({ text: ` ${actionText} ` })
  segs.push({ text: valueText, classStr: valueClass })
  return segs
}

/**
 * 计算日志接口 - 统一所有计算日志定义
 */
export interface CalculationLog {
  /** 时间戳 */
  timestamp: number

  /** 计算类型 */
  type: ActionResultType

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
      const prefix = sourceParticipant.team === ParticipantSide.ALLY ? '[友方]' : '[敌方]'
      sourceName = `${prefix}${sourceParticipant.name}`
    }
  }

  let targetName = ''
  if (action.targetId && action.targetId !== 'system') {
    const targetParticipant = participants.get(action.targetId)
    if (targetParticipant) {
      const prefix = targetParticipant.team === 'ally' ? '[友方]' : '[敌方]'
      targetName = `${prefix}${targetParticipant.name}`
    }
  }

  const sourceIsAlly =
    options?.sourceIsAlly ??
    (action.sourceId !== 'system'
      ? participants.get(action.sourceId)?.team === ParticipantSide.ALLY
      : false)
  const targetIsAlly =
    options?.targetIsAlly ??
    (action.targetId
      ? participants.get(action.targetId)?.team === ParticipantSide.ALLY
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
    index: -1,
    type: LogType.BATTLE,
    message: `${sourceName} ${action}${targetName}`,
    level: toLogLevel(level),
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
      category: BATTLE_LOG_CATEGORIES.SYSTEM,
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
      category: BATTLE_LOG_CATEGORIES.SYSTEM,
      level: description.includes('胜利') ? 'info' : 'warning',
      segments: [{ text: description }],
    }
  }

  return {
    category: BATTLE_LOG_CATEGORIES.SYSTEM,
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
  const isSkill = action.type === ActionTypes.SKILL

  return {
    category: BATTLE_LOG_CATEGORIES.STATUS,
    level: 'info',
    segments: [
      {
        text: `${sourceIsAlly ? '[友方]' : '[敌方]'}${sourceName}`,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: `${targetIsAlly ? '[友方]' : '[敌方]'}${targetName}`,
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
    category: BATTLE_LOG_CATEGORIES.CRIT,
    level: 'info',
    segments: [
      {
        text: `${sourceIsAlly ? '[友方]' : '[敌方]'}${sourceName}`,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: `${targetIsAlly ? '[友方]' : '[敌方]'}${targetName}`,
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
    category: BATTLE_LOG_CATEGORIES.HEAL,
    level: 'info',
    segments: [
      {
        text: `${sourceIsAlly ? '[友方]' : '[敌方]'}${sourceName}`,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: `${targetIsAlly ? '[友方]' : '[敌方]'}${targetName}`,
        classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ` 施放【${skillName}】，为其恢复 ` },
      { text: healAmount.toString(), classStr: 'log-heal' },
      { text: ' 点气血' },
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
      category: BATTLE_LOG_CATEGORIES.DAMAGE,
      level: 'info',
      segments: [
        {
          text: `${sourceIsAlly ? '[友方]' : '[敌方]'}${sourceName}`,
          classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
        },
        { text: ' 对 ' },
        {
          text: `${targetIsAlly ? '[友方]' : '[敌方]'}${targetName}`,
          classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
        },
        { text: ` 发动终极技能【${skillName}】，造成 ` },
        { text: damage.toString(), classStr: 'log-damage' },
        { text: ' 点魔法伤害' },
      ],
    }
  }

  return {
    category: BATTLE_LOG_CATEGORIES.DAMAGE,
    level: 'info',
    segments: [
      {
        text: `${sourceIsAlly ? '[友方]' : '[敌方]'}${sourceName}`,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: `${targetIsAlly ? '[友方]' : '[敌方]'}${targetName}`,
        classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 发起 「普通攻击」，造成 ' },
      { text: damage.toString(), classStr: 'log-damage' },
      { text: ' 点伤害' },
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
    category: BATTLE_LOG_CATEGORIES.STATUS,
    level: 'info',
    segments: [
      {
        text: `${sourceIsAlly ? '[友方]' : '[敌方]'}${sourceName}`,
        classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ' 对 ' },
      {
        text: `${targetIsAlly ? '[友方]' : '[敌方]'}${targetName}`,
        classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
      },
      { text: ` ${effectDescription}` },
    ],
  }
}

/**
 * 统一日志参数 — 所有 addXxxLog 方法的入参
 * 从 infrastructure/adapters/logging/BattleLogManager.ts 下沉到 shared 层，
 * 使领域层端口接口可以引用具体类型而非 any。
 */
export interface UnifiedLogParams {
  /** 日志消息（可选，与 segments 二选一） */
  message?: string
  /** 日志片段数组（推荐使用的结构化格式） */
  segments?: LogSegment[]
  /** 日志级别 */
  level?: LogLevel
  /** 日志来源 */
  source?: string
  /** 日志目标 */
  target?: string
  /** 操作类型 */
  action?: string
  /** 回合号 */
  turn?: number | string
  /** 日志类别 */
  category?: BattleLogCategory
  /** 日志详细类别 */
  detailCategory?: string
  /** 上下文数据 */
  context?: Record<string, unknown>
  /** 错误对象 */
  error?: Error
  /** 叙事元数据 */
  meta?: BattleLogMeta
}

/** 战斗日志参数 — turn 必填 */
export type BattleLogParams = UnifiedLogParams & { turn: number | string }

/** 调试日志参数 */
export interface DebugLogParams {
  /** 日志级别，默认 LogLevel.INFO */
  level?: LogLevel
  /** 上下文数据 */
  context?: Record<string, unknown>
  /** 错误对象 */
  error?: Error
}
