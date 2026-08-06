/**
 * 战斗日志系统 - 统一类型定义
 * 确保系统中所有战斗日志相关的类型引用保持一致
 */

import {
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

export const BattleLogMetaRole = {
  ACTION: 'action',
  SUB: 'sub',
  SETTLEMENT: 'settlement',
  SNAPSHOT: 'snapshot',
  CONDITION: 'condition',
  BATTLE: 'battle',
} as const
export type BattleLogMetaRole = (typeof BattleLogMetaRole)[keyof typeof BattleLogMetaRole]

/**
 * 叙事元数据 —— 渲染器据此生成 气血 箭头、高光标记、块归类
 */
export interface BattleLogMeta {
  /** 叙事角色：决定归入哪种块 */
  role?: BattleLogMetaRole
  /** 来源实体（施法者/被动触发者）— 因果链：谁引起了这条日志 */
  sourceId?: string
  /** 触发阶段（被动因果链：ON_HIT/DAMAGE_TAKEN/TURN_START…）— 为什么触发 */
  triggerPhase?: string
  entityId?: string
  entityName?: string
  entityFaction?: 'ally' | 'enemy'
  hpBefore?: number
  hpAfter?: number
  damage?: number
  /** 减免前原始伤害（action header「造成 X 点伤害」口径） */
  rawDamage?: number
  heal?: number
  crit?: boolean
  kill?: boolean
  lethal?: boolean
  immune?: boolean
  miss?: boolean
  skillName?: string
  /** 回合标签（可选）：提供后作为回合标签默认值；未提供时渲染器按本回合击杀/sub 统计计算 */
  roundTag?: string
  /** 能量变化快照（能量类日志） */
  energyBefore?: number
  energyAfter?: number
  /** 回合开始能量（合并日志）：角色级到账明细 */
  energyChanges?: Array<{
    entityId: string
    name?: string
    energyBefore: number
    energyAfter: number
  }>
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
  turn: number
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
 * entity 段的明确阵营：优先 faction 字段，退而求其次由着色 classStr 反推。
 * 用于渲染层 chip 着色（颜色提示无误导风险）。
 */
export function entityFaction(
  seg: LogSegment,
): ParticipantSide | undefined {
  if (seg.faction) return seg.faction
  if (seg.classStr === 'log-friendly') return ParticipantSide.ALLY
  if (seg.classStr === 'log-hostile') return ParticipantSide.ENEMY
  return undefined
}

/**
 * entity 段显示文本：缺 [友方]/[敌方] 前缀且阵营字段明确时自动补前缀。
 * 渲染层兜底——即使未来有调用方手写 entity 段漏了前缀，UI 仍统一。
 * NOTE: 只认 faction 字段，不按 classStr 反推前缀（回放 id 段只有 classStr，
 *       阵营未知时宁可不标，避免误标敌我）。
 */
export function entityDisplayText(seg: LogSegment): string {
  if (seg.kind !== 'entity') return seg.text
  if (seg.text.startsWith('[友方]') || seg.text.startsWith('[敌方]')) return seg.text
  if (seg.text === '自身') return seg.text
  if (!seg.faction) return seg.text
  return seg.faction === ParticipantSide.ALLY ? `[友方]${seg.text}` : `[敌方]${seg.text}`
}

export const NarrativeBlockType = {
  BATTLE_HEADER: 'battle-header',
  SECTION: 'section',
  ROUND: 'round',
  ACTION: 'action',
  SETTLEMENT: 'settlement',
  SNAPSHOT: 'snapshot',
  SUMMARY: 'summary',
  PLAIN: 'plain',
} as const
export type NarrativeBlockType = (typeof NarrativeBlockType)[keyof typeof NarrativeBlockType]

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
export type BattleLogParams = UnifiedLogParams & { turn: number }

/** 调试日志参数 */
export interface DebugLogParams {
  /** 日志级别，默认 LogLevel.INFO */
  level?: LogLevel
  /** 上下文数据 */
  context?: Record<string, unknown>
  /** 错误对象 */
  error?: Error
}
