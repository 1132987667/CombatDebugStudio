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

/**
 * 日志级别枚举 - 统一所有日志系统的级别定义
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

/**
 * 战斗日志级别类型 - 用于UI展示和过滤
 */
export type BattleLogLevel =
  | 'damage' // 红色 - 伤害
  | 'heal' // 绿色 - 治疗
  | 'crit' // 橙色 - 暴击
  | 'status' // 蓝色 - 状态
  | 'info' // 灰色 - 信息
  | 'ally' // 青色 - 友方
  | 'enemy' // 红色 - 敌方

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

  /** 结果描述 */
  result: string

  /** 日志级别 */
  level: string

  /** HTML格式的结果（可选） */
  htmlResult?: string

  /** 行动类型：system-系统消息，普通攻击-普通攻击，小技能-普通技能，大技能-终极技能 */
  type?: BattleLogType

  /** 是否命中（仅普通攻击有效） */
  isHit?: boolean

  /** 是否暴击（仅普通攻击有效） */
  isCrit?: boolean

  /** 技能名称（仅小技能和大技能有效） */
  skillName?: string

  /** 附加效果列表，如暴击、状态等详细信息 */
  subEffects?: string[]
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
export const LogLevelColors: Record<BattleLogLevel, string> = {
  damage: '#f44336', // 红色 - 伤害
  heal: '#4caf50', // 绿色 - 治疗
  crit: '#ff9800', // 橙色 - 暴击
  status: '#2196f3', // 蓝色 - 状态
  info: '#9e9e9e', // 灰色 - 信息
  ally: '#4fc3f7', // 青色 - 友方
  enemy: '#e94560', // 红色 - 敌方
}

/**
 * 获取日志颜色 - 统一颜色获取方法
 */
export function getLogLevelColor(level: BattleLogLevel): string {
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
  damage: 3,
  heal: 2,
  crit: 4,
  status: 2,
  info: 1,
  ally: 2,
  enemy: 3,
}

/**
 * 判断日志是否应该显示（基于过滤器）
 */
export function shouldDisplayLog(
  log: BattleLogEntry,
  filters: LogFilters,
): boolean {
  // 根据日志级别和过滤器进行判断
  const level = log.level as BattleLogLevel

  switch (level) {
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
 * 创建默认的战斗日志条目
 */
export function createDefaultBattleLogEntry(
  turn: string,
  source: string,
  action: string,
  target: string,
  result: string,
  level: string = 'info',
): BattleLogEntry {
  return {
    turn,
    source,
    action,
    target,
    result,
    level,
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
    const validLevels: BattleLogLevel[] = [
      'damage',
      'heal',
      'crit',
      'status',
      'info',
      'ally',
      'enemy',
    ]
    return validLevels.includes(level as BattleLogLevel)
  },

  /**
   * 获取日志级别的显示名称
   */
  getLevelDisplayName(level: BattleLogLevel): string {
    const displayNames: Record<BattleLogLevel, string> = {
      damage: '伤害',
      heal: '治疗',
      crit: '暴击',
      status: '状态',
      info: '信息',
      ally: '友方',
      enemy: '敌方',
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
