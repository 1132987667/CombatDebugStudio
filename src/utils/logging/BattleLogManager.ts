/**
 * 文件: BattleLogManager.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 统一日志管理器
 * 描述: 整合系统日志和战斗日志功能，提供统一的日志接口
 * 版本: 2.0.0
 * 
 */

import type {
  BattleLogEntry,
  LogFilters,
  BattleLogManagerOptions,
  LogFormatOptions,
  HTMLFormatOptions,
  BattleLogLevel,
  ActionType,
  LogEntry,
  LogHandler,
} from '@/types/battle-log'
import { LogLevel } from '@/types/battle-log'

/**
 * 战斗日志格式化模块
 * 提供战斗日志的文本和HTML格式化功能
 */
/**
 * 格式化普通攻击日志
 */
export function formatNormalAttack(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, target, damage } = options
  return {
    result: `${source} 对 ${target} 发动普通攻击，造成 ${damage} 点物理伤害。`,
    level: 'damage',
  }
}

/**
 * 格式化技能攻击日志
 */
export function formatSkillAttack(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, target, skillName, damage, damageType } = options
  return {
    result: `${source} 对 ${target} 发动终极技能【${skillName}】，造成 ${damage} 点${damageType || '魔法'}伤害。`,
    level: 'damage',
  }
}

/**
 * 格式化治疗技能日志
 */
export function formatHealSkill(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, target, skillName, heal } = options
  return {
    result: `${source} 对 ${target} 施放【${skillName}】，为其恢复 ${heal} 点生命值。`,
    level: 'heal',
  }
}

/**
 * 格式化施加增益日志
 */
export function formatBuffSkill(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, targetScope, skillName, effect, duration } = options
  return {
    result: `${source} 对 ${targetScope} 施加【${skillName}】，使${effect}，持续${duration}回合。`,
    level: 'status',
  }
}

/**
 * 格式化施加减益日志
 */
export function formatDebuffSkill(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, target, skillName, effect, duration } = options
  return {
    result: `${source} 对 ${target} 施放【${skillName}】，成功使${effect}，持续${duration}回合。`,
    level: 'status',
  }
}

/**
 * 格式化状态生效日志
 */
export function formatStatusEffect(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { triggerTime, source, target, statusName, damage, damageType } =
    options
  return {
    result: `[${triggerTime}] ${source}的【${statusName}】效果对 ${target} 生效，造成 ${damage} 点${damageType || '持续'}伤害。`,
    level: 'damage',
  }
}

/**
 * 格式化控制效果日志
 */
export function formatControlEffect(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, target, skillName, statusName } = options
  return {
    result: `${source} 对 ${target} 发动【${skillName}】，成功使目标陷入【${statusName}】状态，无法行动。`,
    level: 'status',
  }
}

/**
 * 格式化暴击日志
 */
export function formatCriticalHit(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, target, skillName, damage, damageType } = options
  return {
    result: `${source} 对 ${target} 发动【${skillName}】，触发会心一击，造成 ${damage} 点${damageType || '魔法'}伤害。`,
    level: 'crit',
  }
}

/**
 * 格式化未命中日志
 */
export function formatMissedAttack(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, target, skillName } = options
  const attackType = skillName ? `【${skillName}】` : '普通攻击'
  return {
    result: `${source} 对 ${target} 发动${attackType}，攻击被闪避，未命中。`,
    level: 'status',
  }
}

/**
 * 格式化格挡日志
 */
export function formatBlockedAttack(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, target, skillName, damage } = options
  return {
    result: `${source} 对 ${target} 发动【${skillName}】，攻击被格挡，最终造成 ${damage} 点伤害。`,
    level: 'damage',
  }
}

/**
 * 格式化防御动作日志
 */
export function formatDefenseAction(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, stanceName, effect } = options
  return {
    result: `${source} 采取了【${stanceName}】姿态，${effect}。`,
    level: 'status',
  }
}

/**
 * 格式化蓄力动作日志
 */
export function formatChargeAction(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, chargeDescription, skillName } = options
  return {
    result: `${source} 开始${chargeDescription}，将在下回合释放【${skillName}】。`,
    level: 'status',
  }
}

/**
 * 格式化单位死亡日志
 */
export function formatUnitDeath(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { source, target } = options
  return {
    result: `${source} 对 ${target} 造成了致命一击，${target} 被击败。`,
    level: 'info',
  }
}

/**
 * 格式化战斗胜利日志
 */
export function formatBattleVictory(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  const { exp, gold } = options
  return {
    result: `【战斗结束】我方取得了胜利，获得经验值${exp}点，金币${gold}枚。`,
    level: 'info',
  }
}

/**
 * 格式化战斗失败日志
 */
export function formatBattleDefeat(_options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  return {
    result: `【战斗结束】我方已全军覆没，战斗失败。`,
    level: 'info',
  }
}

/**
 * 格式化战斗开始日志
 */
export function formatBattleStart(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  return {
    result: `【战斗开始】战斗开始！参战角色: ${options.source} 人，参战敌人: ${options.target} 人`,
    level: 'info',
  }
}

/**
 * 格式化战斗结束日志
 */
export function formatBattleEnd(options: LogFormatOptions): {
  result: string
  level: BattleLogLevel
} {
  return {
    result: `【战斗结束】战斗结束！胜利者: ${options.source}`,
    level: 'info',
  }
}

/**
 * 智能格式化函数 - 根据动作类型自动选择合适的格式化方法
 */
export function formatBattleLog(
  actionType: ActionType,
  options: LogFormatOptions,
): { result: string; level: BattleLogLevel } {
  switch (actionType) {
    case 'normal_attack':
      return formatNormalAttack(options)
    case 'skill_attack':
      return formatSkillAttack(options)
    case 'heal_skill':
      return formatHealSkill(options)
    case 'buff_skill':
      return formatBuffSkill(options)
    case 'debuff_skill':
      return formatDebuffSkill(options)
    case 'status_effect':
      return formatStatusEffect(options)
    case 'control_effect':
      return formatControlEffect(options)
    case 'critical_hit':
      return formatCriticalHit(options)
    case 'missed_attack':
      return formatMissedAttack(options)
    case 'blocked_attack':
      return formatBlockedAttack(options)
    case 'defense_action':
      return formatDefenseAction(options)
    case 'charge_action':
      return formatChargeAction(options)
    case 'unit_death':
      return formatUnitDeath(options)
    case 'battle_victory':
      return formatBattleVictory(options)
    case 'battle_defeat':
      return formatBattleDefeat(options)
    case 'battle_start':
      return formatBattleStart(options)
    case 'battle_end':
      return formatBattleEnd(options)
    default:
      return {
        result: `${options.source} 对 ${options.target} 执行了未知动作。`,
        level: 'info',
      }
  }
}

/**
 * 获取日志颜色映射
 */
export function getLogLevelColor(level: BattleLogLevel): string {
  const colorMap: Record<BattleLogLevel, string> = {
    damage: '#f44336',
    heal: '#4caf50',
    crit: '#ff9800',
    status: '#2196f3',
    info: '#9e9e9e',
    ally: '#4fc3f7',
    enemy: '#e94560',
  }
  return colorMap[level] || '#9e9e9e'
}

/**
 * 生成完整的战斗日志对象
 */
export function createBattleLog(
  actionType: ActionType,
  options: LogFormatOptions,
  customLevel?: BattleLogLevel,
): BattleLogEntry {
  const formatted = formatBattleLog(actionType, options)
  const level = customLevel || formatted.level

  return {
    turn:
      typeof options.turn === 'number' ? `回合${options.turn}` : options.turn,
    source: options.source,
    action: '对',
    target: options.target,
    result: formatted.result,
    level: level,
  }
}

function formatSource(source: string, isAlly?: boolean): string {
  if (isAlly === true) {
    return `<span class="source-ally">${source}</span>`
  }
  return source
}

function formatTarget(target: string, isAlly?: boolean): string {
  if (isAlly === true) {
    return `<span class="source-ally">${target}</span>`
  }
  if (isAlly === false) {
    return `<span class="source-enemy">${target}</span>`
  }
  return target
}

/**
 * 格式化普通攻击日志（HTML版本）
 */
export function formatNormalAttackHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const {
    source,
    target,
    damage,
    isCritical,
    forceCritical,
    sourceIsAlly,
    targetIsAlly,
  } = options
  const isCrit = isCritical || forceCritical
  const damageHtml = isCrit
    ? `<span class="crit-value">${damage}</span>`
    : damage
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 发动普通攻击，造成 ${damageHtml} 点物理伤害。`,
    level: isCrit ? 'crit' : 'damage',
  }
}

/**
 * 格式化技能攻击日志（HTML版本）
 */
export function formatSkillAttackHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const {
    source,
    target,
    skillName,
    damage,
    damageType,
    isCritical,
    forceCritical,
    sourceIsAlly,
    targetIsAlly,
  } = options
  const isCrit = isCritical || forceCritical
  const damageHtml = isCrit
    ? `<span class="crit-value">${damage}</span>`
    : damage
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 发动<span class="skill-attack">【${skillName}】</span>，造成 ${damageHtml} 点${damageType || '魔法'}伤害。`,
    level: isCrit ? 'crit' : 'damage',
  }
}

/**
 * 格式化治疗技能日志（HTML版本）
 */
export function formatHealSkillHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const { source, target, skillName, heal, sourceIsAlly, targetIsAlly } =
    options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 施放<span class="skill-heal">【${skillName}】</span>，为其恢复 <span class="heal-value">${heal}</span> 点生命值。`,
    level: 'heal',
  }
}

/**
 * 格式化增益技能日志（HTML版本）
 */
export function formatBuffSkillHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const { source, targetScope, skillName, effect, duration, sourceIsAlly } =
    options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${targetScope} 施加<span class="skill-heal">【${skillName}】</span>，使<span class="buff">${effect}</span>，持续${duration}回合。`,
    level: 'status',
  }
}

/**
 * 格式化减益技能日志（HTML版本）
 */
export function formatDebuffSkillHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const {
    source,
    target,
    skillName,
    effect,
    duration,
    sourceIsAlly,
    targetIsAlly,
  } = options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 施放<span class="skill-debuff">【${skillName}】</span>，成功使<span class="debuff">${effect}</span>，持续${duration}回合。`,
    level: 'status',
  }
}

/**
 * 格式化状态生效日志（HTML版本）
 */
export function formatStatusEffectHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const {
    triggerTime,
    source,
    target,
    statusName,
    damage,
    damageType,
    isCritical,
    forceCritical,
    sourceIsAlly,
    targetIsAlly,
  } = options
  const isCrit = isCritical || forceCritical
  const damageHtml = isCrit
    ? `<span class="crit-value">${damage}</span>`
    : damage
  return {
    htmlResult: `[${triggerTime}] ${formatSource(source, sourceIsAlly)}的<span class="debuff">【${statusName}】</span>效果对 ${formatTarget(target, targetIsAlly)} 生效，造成 ${damageHtml} 点${damageType || '持续'}伤害。`,
    level: isCrit ? 'crit' : 'damage',
  }
}

/**
 * 格式化控制效果日志（HTML版本）
 */
export function formatControlEffectHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const {
    source,
    target,
    skillName,
    statusName,
    sourceIsAlly,
    targetIsAlly,
  } = options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 发动<span class="skill-debuff">【${skillName}】</span>，成功使目标陷入<span class="debuff">【${statusName}】</span>状态，无法行动。`,
    level: 'status',
  }
}

/**
 * 格式化暴击日志（HTML版本）
 */
export function formatCriticalHitHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const {
    source,
    target,
    skillName,
    damage,
    damageType,
    sourceIsAlly,
    targetIsAlly,
  } = options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 发动<span class="skill-attack">【${skillName}】</span>，触发会心一击，造成 <span class="crit-value">${damage}</span> 点${damageType || '魔法'}伤害。`,
    level: 'crit',
  }
}

/**
 * 格式化闪避日志（HTML版本）
 */
export function formatMissedAttackHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const { source, target, skillName, sourceIsAlly, targetIsAlly } = options
  const attackType = skillName
    ? `<span class="skill-attack">【${skillName}】</span>`
    : '普通攻击'
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 发动${attackType}，攻击被<span class="evade">闪避</span>，未命中。`,
    level: 'status',
  }
}

/**
 * 格式化格挡日志（HTML版本）
 */
export function formatBlockedAttackHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const { source, target, skillName, damage, sourceIsAlly, targetIsAlly } =
    options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 发动<span class="skill-attack">【${skillName}】</span>，攻击被<span class="evade">格挡</span>，最终造成 ${damage} 点伤害。`,
    level: 'damage',
  }
}

/**
 * 格式化防御动作日志（HTML版本）
 */
export function formatDefenseActionHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const { source, stanceName, effect, sourceIsAlly } = options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 采取了<span class="skill-heal">【${stanceName}】</span>姿态，${effect}。`,
    level: 'status',
  }
}

/**
 * 格式化蓄力动作日志（HTML版本）
 */
export function formatChargeActionHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const { source, chargeDescription, skillName, sourceIsAlly } = options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 开始${chargeDescription}，将在下回合释放<span class="skill-attack">【${skillName}】</span>。`,
    level: 'status',
  }
}

/**
 * 格式化单位死亡日志（HTML版本）
 */
export function formatUnitDeathHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const { source, target, sourceIsAlly, targetIsAlly } = options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 造成了致命一击，${formatTarget(target, targetIsAlly)} 被击败。`,
    level: 'info',
  }
}

/**
 * 格式化战斗胜利日志（HTML版本）
 */
export function formatBattleVictoryHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  const { exp, gold } = options
  return {
    htmlResult: `【战斗结束】我方取得了胜利，获得<span class="resource">${exp}</span>点经验值，<span class="resource">${gold}</span>枚金币。`,
    level: 'info',
  }
}

/**
 * 格式化战斗失败日志（HTML版本）
 */
export function formatBattleDefeatHTML(_options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  return {
    htmlResult: `【战斗结束】我方已全军覆没，战斗失败。`,
    level: 'info',
  }
}

/**
 * 格式化战斗开始日志（HTML版本）
 */
export function formatBattleStartHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  return {
    htmlResult: `【战斗开始】战斗开始！参战角色: ${options.source} 人，参战敌人: ${options.target} 人`,
    level: 'info',
  }
}

/**
 * 格式化战斗结束日志（HTML版本）
 */
export function formatBattleEndHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: BattleLogLevel
} {
  return {
    htmlResult: `【战斗结束】战斗结束！胜利者: ${options.source}`,
    level: 'info',
  }
}

/**
 * 智能HTML格式化函数 - 根据动作类型自动选择合适的HTML格式化方法
 */
export function formatBattleLogHTML(
  actionType: ActionType,
  options: HTMLFormatOptions,
): { htmlResult: string; level: BattleLogLevel } {
  switch (actionType) {
    case 'normal_attack':
      return formatNormalAttackHTML(options)
    case 'skill_attack':
      return formatSkillAttackHTML(options)
    case 'heal_skill':
      return formatHealSkillHTML(options)
    case 'buff_skill':
      return formatBuffSkillHTML(options)
    case 'debuff_skill':
      return formatDebuffSkillHTML(options)
    case 'status_effect':
      return formatStatusEffectHTML(options)
    case 'control_effect':
      return formatControlEffectHTML(options)
    case 'critical_hit':
      return formatCriticalHitHTML(options)
    case 'missed_attack':
      return formatMissedAttackHTML(options)
    case 'blocked_attack':
      return formatBlockedAttackHTML(options)
    case 'defense_action':
      return formatDefenseActionHTML(options)
    case 'charge_action':
      return formatChargeActionHTML(options)
    case 'unit_death':
      return formatUnitDeathHTML(options)
    case 'battle_victory':
      return formatBattleVictoryHTML(options)
    case 'battle_defeat':
      return formatBattleDefeatHTML(options)
    case 'battle_start':
      return formatBattleStartHTML(options)
    case 'battle_end':
      return formatBattleEndHTML(options)
    default:
      return {
        htmlResult: `${formatSource(options.source, options.sourceIsAlly)} 对 ${formatTarget(options.target, options.targetIsAlly)} 执行了未知动作。`,
        level: 'info',
      }
  }
}

/**
 * 生成完整的战斗日志对象（HTML版本）
 */
export function createBattleLogHTML(
  actionType: ActionType,
  options: HTMLFormatOptions,
  customLevel?: BattleLogLevel,
): BattleLogEntry {
  const formatted = formatBattleLogHTML(actionType, options)
  const level = customLevel || formatted.level

  return {
    turn:
      typeof options.turn === 'number' ? `回合${options.turn}` : options.turn,
    source: options.source,
    action: '对',
    target: options.target,
    result: formatted.htmlResult,
    level: level,
    htmlResult: formatted.htmlResult,
  }
}

// 最后，导出一个聚合对象，名字与原来相同
export const BattleLogFormatter = {
  formatNormalAttack,
  formatSkillAttack,
  formatHealSkill,
  formatBuffSkill,
  formatDebuffSkill,
  formatStatusEffect,
  formatControlEffect,
  formatCriticalHit,
  formatMissedAttack,
  formatBlockedAttack,
  formatDefenseAction,
  formatChargeAction,
  formatUnitDeath,
  formatBattleVictory,
  formatBattleDefeat,
  formatBattleStart,
  formatBattleEnd,
  formatBattleLog,
  getLogLevelColor,
  createBattleLog,
  formatNormalAttackHTML,
  formatSkillAttackHTML,
  formatHealSkillHTML,
  formatBuffSkillHTML,
  formatDebuffSkillHTML,
  formatStatusEffectHTML,
  formatControlEffectHTML,
  formatCriticalHitHTML,
  formatMissedAttackHTML,
  formatBlockedAttackHTML,
  formatDefenseActionHTML,
  formatChargeActionHTML,
  formatUnitDeathHTML,
  formatBattleVictoryHTML,
  formatBattleDefeatHTML,
  formatBattleStartHTML,
  formatBattleEndHTML,
  formatBattleLogHTML,
  createBattleLogHTML,
};
/**
 * 控制台日志处理器
 */
export class ConsoleLogHandler implements LogHandler {
  handle(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString()
    const levelName = LogLevel[entry.level]
    const contextStr = entry.context ? JSON.stringify(entry.context) : ''
    const errorStr = entry.error ? `\nError: ${entry.error.message}` : ''

    const logMessage = `[${timestamp}] ${levelName}: ${entry.message} ${contextStr}${errorStr}`

    switch (entry.level) {
      case LogLevel.ERROR:
        console.error(logMessage)
        break
      case LogLevel.WARN:
        console.warn(logMessage)
        break
      case LogLevel.INFO:
        console.info(logMessage)
        break
      case LogLevel.DEBUG:
        console.debug(logMessage)
        break
      case LogLevel.TRACE:
        console.trace(logMessage)
        break
    }
  }
}

/**
 * 文件日志处理器（内存存储）
 */
export class FileLogHandler implements LogHandler {
  private logs: LogEntry[] = []
  private maxSize = 1000

  handle(entry: LogEntry): void {
    this.logs.push(entry)

    if (this.logs.length > this.maxSize) {
      this.logs = this.logs.slice(-this.maxSize)
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs]
  }

  clear(): void {
    this.logs = []
  }
}

/**
 * 统一日志管理器
 * 
 */
export class BattleLogManager {
  /** 单例实例 */
  private static instance: BattleLogManager | null = null

  /** 战斗日志条目数组 */
  private logs: BattleLogEntry[] = []
  /** 系统日志条目数组 */
  private systemLogs: LogEntry[] = []
  /** 战斗日志最大数量 */
  private maxLogs: number = 200
  /** 系统日志最大数量，默认1000条 */
  private maxSystemLogs: number = 200
  /** 是否启用自动清理 */
  private autoCleanup: boolean
  /** 日志过滤器配置 */
  private filters: LogFilters
  /** 当前日志级别，默认INFO */
  private level: LogLevel = LogLevel.INFO
  /** 日志处理器数组 */
  private handlers: LogHandler[] = []
  /** 日志来源标识 */
  private source?: string

  /**
   * 获取单例实例
   */
  public static getInstance(options?: BattleLogManagerOptions): BattleLogManager {
    if (!BattleLogManager.instance) {
      BattleLogManager.instance = new BattleLogManager(options)
    }
    return BattleLogManager.instance
  }

  private constructor(options: BattleLogManagerOptions = {}) {
    this.maxLogs = options.maxLogs || 100
    this.autoCleanup = options.autoCleanup ?? true
    this.source = options.source

    this.filters = {
      damage: true,
      status: true,
      crit: true,
      heal: false,
      ...options.filters,
    }

    // this.addHandler(new ConsoleLogHandler())
  }

  // ==================== 系统日志功能 ====================

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.level = level
  }

  /**
   * 获取当前日志级别
   */
  getLevel(): LogLevel {
    return this.level
  }

  /**
   * 添加日志处理器
   */
  addHandler(handler: LogHandler): void {
    this.handlers.push(handler)
  }

  /**
   * 移除日志处理器
   */
  removeHandler(handler: LogHandler): void {
    const index = this.handlers.indexOf(handler)
    if (index !== -1) {
      this.handlers.splice(index, 1)
    }
  }

  /**
   * 设置日志来源标识
   */
  setSource(source: string): void {
    this.source = source
  }

  /**
   * 记录调试级别日志
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context)
  }

  /**
   * 记录信息级别日志
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context)
  }

  /**
   * 记录警告级别日志
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context)
  }

  /**
   * 记录错误级别日志
   */
  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error)
  }

  /**
   * 记录跟踪级别日志
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, context)
  }

  /**
   * 内部日志记录方法
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    console.log('添加日志:', message, context, error)
    if (level > this.level) {
      console.log('日志级别不满足要求:', level, this.level)
      // return
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
      source: this.source,
      error,
    }

    this.systemLogs.push(entry)
    if (this.systemLogs.length > this.maxSystemLogs) {
      this.systemLogs = this.systemLogs.slice(-this.maxSystemLogs)
    }

    for (const handler of this.handlers) {
      try {
        handler.handle(entry)
      } catch {
        console.error('Logger handler error:', handler)
      }
    }
  }

  /**
   * 获取系统日志
   */
  getSystemLogs(): LogEntry[] {
    return [...this.systemLogs]
  }

  /**
   * 清除系统日志
   */
  clearSystemLogs(): void {
    this.systemLogs = []
  }

  /**
   * 创建子日志器
   */
  createChild(source: string): BattleLogManager {
    const childLogger = new BattleLogManager({
      source,
      maxLogs: this.maxLogs,
      autoCleanup: this.autoCleanup,
      filters: this.filters,
    })
    childLogger.level = this.level
    childLogger.handlers = [...this.handlers]
    return childLogger
  }

  // ==================== 战斗日志功能 ====================

  /**
   * 添加战斗日志
   */
  addLog(
    turn: string,
    source: string,
    action: string,
    target: string,
    result: string,
    level: string = 'info',
    htmlResult?: string,
  ): void {
    console.log('添加战斗日志:', turn, source, action, target, result, level, htmlResult)
    const logEntry: BattleLogEntry = {
      turn,
      source,
      action,
      target,
      result,
      level,
      htmlResult,
    }

    this.logs.unshift(logEntry)

    if (this.autoCleanup && this.logs.length > this.maxLogs) {
      this.logs.pop()
    }

    this.emitLogUpdate()
  }

  /**
   * 添加系统战斗日志
   */
  addSystemBattleLog(message: string, level: string = 'info'): void {
    this.addLog('系统', '系统', '系统消息', '', message, level)
  }

  /**
   * 添加系统日志（兼容旧接口）
   */
  addSystemLog(message: string, level: string = 'info'): void {
    this.addSystemBattleLog(message, level)
  }

  /**
   * 添加动作日志
   */
  addActionLog(
    source: string,
    action: string,
    target: string,
    result: string,
    level: string = 'info',
  ): void {
    this.addLog('当前回合', source, action, target, result, level)
  }

  /**
   * 添加错误日志
   */
  addErrorLog(message: string): void {
    this.addSystemBattleLog(message, 'error')
  }

  /**
   * 添加回合开始日志
   */
  addTurnStartLog(turn: number): void {
    this.addLog(
      `回合${turn}`,
      '系统',
      '回合开始',
      '',
      `第${turn}回合开始`,
      'info',
    )
  }

  /**
   * 添加回合结束日志
   */
  addTurnEndLog(turn: number): void {
    this.addLog(
      `回合${turn}`,
      '系统',
      '回合结束',
      '',
      `第${turn}回合结束`,
      'info',
    )
  }

  /**
   * 获取所有战斗日志
   */
  getAllLogs(): BattleLogEntry[] {
    return [...this.logs]
  }

  /**
   * 获取过滤后的战斗日志
   */
  getFilteredLogs(): BattleLogEntry[] {
    return this.logs.filter((log) => this.shouldDisplayLog(log))
  }

  /**
   * 按级别获取战斗日志
   */
  getLogsByLevel(level: string): BattleLogEntry[] {
    return this.logs.filter((log) => log.level === level)
  }

  /**
   * 搜索战斗日志
   */
  searchLogs(keyword: string): BattleLogEntry[] {
    const lowerKeyword = keyword.toLowerCase()
    return this.logs.filter(
      (log) =>
        log.source.toLowerCase().includes(lowerKeyword) ||
        log.action.toLowerCase().includes(lowerKeyword) ||
        log.target.toLowerCase().includes(lowerKeyword) ||
        log.result.toLowerCase().includes(lowerKeyword),
    )
  }

  /**
   * 清除战斗日志
   */
  clearLogs(): void {
    this.logs = []
    this.emitLogUpdate()
  }

  /**
   * 导出战斗日志
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  /**
   * 导入战斗日志
   */
  importLogs(logsData: string): void {
    try {
      const importedLogs = JSON.parse(logsData) as BattleLogEntry[]
      this.logs = importedLogs
      this.emitLogUpdate()
    } catch (error) {
      this.addErrorLog(`导入日志失败: ${error}`)
    }
  }

  /**
   * 获取过滤器配置
   */
  getFilters(): LogFilters {
    return { ...this.filters }
  }

  /**
   * 更新过滤器配置
   */
  updateFilters(newFilters: Partial<LogFilters>): void {
    this.filters = { ...this.filters, ...newFilters }
    this.emitLogUpdate()
  }

  /**
   * 设置最大日志数量
   */
  setMaxLogs(max: number): void {
    this.maxLogs = max
    if (this.autoCleanup && this.logs.length > max) {
      this.logs = this.logs.slice(0, max)
      this.emitLogUpdate()
    }
  }

  /**
   * 获取日志统计信息
   */
  getStats(): { total: number; byLevel: Record<string, number> } {
    const byLevel: Record<string, number> = {}

    this.logs.forEach((log) => {
      byLevel[log.level] = (byLevel[log.level] || 0) + 1
    })

    return {
      total: this.logs.length,
      byLevel,
    }
  }

  /**
   * 判断日志是否应该显示
   */
  private shouldDisplayLog(log: BattleLogEntry): boolean {
    const level = log.level as BattleLogLevel

    switch (level) {
      case 'damage':
        return this.filters.damage
      case 'heal':
        return this.filters.heal
      case 'crit':
        return this.filters.crit
      case 'status':
        return this.filters.status
      default:
        return true
    }
  }

  // ==================== 监听器功能 ====================

  private listeners: Set<(logs: BattleLogEntry[]) => void> = new Set()

  /**
   * 添加日志更新监听器
   */
  addListener(callback: (logs: BattleLogEntry[]) => void): void {
    this.listeners.add(callback)
    callback(this.getFilteredLogs())
  }

  /**
   * 移除日志更新监听器
   */
  removeListener(callback: (logs: BattleLogEntry[]) => void): void {
    this.listeners.delete(callback)
  }

  /**
   * 触发日志更新通知
   */
  private emitLogUpdate(): void {
    const filteredLogs = this.getFilteredLogs()
    console.log('触发日志更新:', filteredLogs)
    this.listeners.forEach(callback => {
      try {
        callback(filteredLogs)
      } catch (error) {
        console.error('Log listener error:', error)
      }
    })
  }
}

/**
 * 默认日志管理器单例实例
 */
export const battleLogManager = BattleLogManager.getInstance({ maxLogs: 100 })