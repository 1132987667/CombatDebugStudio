/**
 * 战斗日志管理器
 * 整合战斗日志的添加、查询、过滤、格式化和持久化功能
 * 提供统一的日志接口，便于组件间复用和测试
 *
 * 使用统一的类型定义：@/types/battle-log
 */

import type {
  BattleLogEntry,
  LogFilters,
  BattleLogManagerOptions,
  LogFormatOptions,
  HTMLFormatOptions,
  BattleLogLevel,
  ActionType,
} from '@/types/battle-log'

/**
 * 战斗日志格式化模块
 * 提供战斗日志的文本和HTML格式化功能
 */
export namespace BattleLogFormatter {
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
  export function formatBattleDefeat(options: LogFormatOptions): {
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
  export function formatBattleDefeatHTML(options: HTMLFormatOptions): {
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
}

/**
 * 简单日志记录器
 * 轻量级日志系统，适用于组件内部和高频调用场景
 */
export const SimpleLogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const

export type SimpleLogLevel =
  (typeof SimpleLogLevel)[keyof typeof SimpleLogLevel]

export interface SimpleLoggerConfig {
  level: SimpleLogLevel
  prefix: string
  enableColors: boolean
}

export class SimpleLogger {
  private config: SimpleLoggerConfig

  constructor(config: Partial<SimpleLoggerConfig> = {}) {
    this.config = {
      level: config.level || 'INFO',
      prefix: config.prefix || 'BattleSystem',
      enableColors: config.enableColors ?? true,
    }
  }

  private shouldLog(level: SimpleLogLevel): boolean {
    const levels: SimpleLogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR']
    return levels.indexOf(level) >= levels.indexOf(this.config.level)
  }

  private formatMessage(
    level: SimpleLogLevel,
    message: string,
    data?: unknown,
  ): string {
    const timestamp = new Date().toISOString()
    const levelName = level
    let formattedMessage = `[${timestamp}] [${levelName}] ${this.config.prefix}: ${message}`

    if (data) {
      formattedMessage += ` ${JSON.stringify(data)}`
    }

    return formattedMessage
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('DEBUG')) {
      console.log(this.formatMessage('DEBUG', message, data))
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('INFO')) {
      console.info(this.formatMessage('INFO', message, data))
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('WARN')) {
      console.warn(this.formatMessage('WARN', message, data))
    }
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog('ERROR')) {
      console.error(this.formatMessage('ERROR', message, data))
    }
  }

  setLevel(level: SimpleLogLevel): void {
    this.config.level = level
  }

  setPrefix(prefix: string): void {
    this.config.prefix = prefix
  }
}

/**
 * 框架日志记录器
 * 企业级日志系统，支持多处理器、过滤和持久化
 */
import {
  LogLevel as FrameworkLogLevel,
  type LogEntry,
  type LogHandler,
} from '@/types/battle-log'

export class ConsoleLogHandler implements LogHandler {
  handle(entry: LogEntry): void {
    const timestamp = new Date(entry.timestamp).toISOString()
    const levelName = FrameworkLogLevel[entry.level]
    const contextStr = entry.context ? JSON.stringify(entry.context) : ''
    const errorStr = entry.error ? `\nError: ${entry.error.message}` : ''

    const logMessage = `[${timestamp}] ${levelName}: ${entry.message} ${contextStr}${errorStr}`

    switch (entry.level) {
      case FrameworkLogLevel.ERROR:
        console.error(logMessage)
        break
      case FrameworkLogLevel.WARN:
        console.warn(logMessage)
        break
      case FrameworkLogLevel.INFO:
        console.info(logMessage)
        break
      case FrameworkLogLevel.DEBUG:
        console.debug(logMessage)
        break
      case FrameworkLogLevel.TRACE:
        console.trace(logMessage)
        break
    }
  }
}

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

export class FrameworkLogger {
  private level: FrameworkLogLevel
  private handlers: LogHandler[] = []
  private source?: string

  constructor(
    source?: string,
    level: FrameworkLogLevel = FrameworkLogLevel.INFO,
  ) {
    this.source = source
    this.level = level

    this.addHandler(new ConsoleLogHandler())
  }

  setLevel(level: FrameworkLogLevel): void {
    this.level = level
  }

  addHandler(handler: LogHandler): void {
    this.handlers.push(handler)
  }

  removeHandler(handler: LogHandler): void {
    const index = this.handlers.indexOf(handler)
    if (index !== -1) {
      this.handlers.splice(index, 1)
    }
  }

  error(
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    this.log(FrameworkLogLevel.ERROR, message, context, error)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log(FrameworkLogLevel.WARN, message, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log(FrameworkLogLevel.INFO, message, context)
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log(FrameworkLogLevel.DEBUG, message, context)
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log(FrameworkLogLevel.TRACE, message, context)
  }

  createChild(source: string): FrameworkLogger {
    const childLogger = new FrameworkLogger(source, this.level)
    childLogger.handlers = [...this.handlers]
    return childLogger
  }

  private log(
    level: FrameworkLogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    if (level > this.level) {
      return
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      context,
      source: this.source,
      error,
    }

    for (const handler of this.handlers) {
      try {
        handler.handle(entry)
      } catch {
        console.error('Logger handler error:', handler)
      }
    }
  }
}

/**
 * 战斗日志管理器类
 */
export class BattleLogManager {
  private logs: BattleLogEntry[] = []
  private maxLogs: number
  private autoCleanup: boolean
  private filters: LogFilters
  private logger: SimpleLogger

  constructor(options: BattleLogManagerOptions = {}) {
    this.maxLogs = options.maxLogs || 100
    this.autoCleanup = options.autoCleanup ?? true

    this.filters = {
      damage: true,
      status: true,
      crit: true,
      heal: false,
      ...options.filters,
    }

    this.logger = new SimpleLogger({ prefix: 'BattleLogManager' })
  }

  addLog(
    turn: string,
    source: string,
    action: string,
    target: string,
    result: string,
    level: string = 'info',
    htmlResult?: string,
  ): void {
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

  addSystemLog(message: string, level: string = 'info'): void {
    this.addLog('系统', '系统', '系统消息', '', message, level)
  }

  addActionLog(
    source: string,
    action: string,
    target: string,
    result: string,
    level: string = 'info',
  ): void {
    this.addLog('当前回合', source, action, target, result, level)
  }

  addErrorLog(message: string): void {
    this.addSystemLog(message, 'error')
  }

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

  getAllLogs(): BattleLogEntry[] {
    return [...this.logs]
  }

  getFilteredLogs(): BattleLogEntry[] {
    return this.logs.filter((log) => this.shouldDisplayLog(log))
  }

  getLogsByLevel(level: string): BattleLogEntry[] {
    return this.logs.filter((log) => log.level === level)
  }

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

  clearLogs(): void {
    this.logs = []
    this.emitLogUpdate()
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2)
  }

  importLogs(logsData: string): void {
    try {
      const importedLogs = JSON.parse(logsData) as BattleLogEntry[]
      this.logs = importedLogs
      this.emitLogUpdate()
    } catch (error) {
      this.addErrorLog(`导入日志失败: ${error}`)
    }
  }

  getFilters(): LogFilters {
    return { ...this.filters }
  }

  updateFilters(newFilters: Partial<LogFilters>): void {
    this.filters = { ...this.filters, ...newFilters }
    this.emitLogUpdate()
  }

  setMaxLogs(max: number): void {
    this.maxLogs = max
    if (this.autoCleanup && this.logs.length > max) {
      this.logs = this.logs.slice(0, max)
      this.emitLogUpdate()
    }
  }

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

  private emitLogUpdate(): void {
    // 事件发射逻辑用于响应式更新
  }
}

/**
 * 创建默认的日志管理器实例
 */
export function createBattleLogManager(
  options?: BattleLogManagerOptions,
): BattleLogManager {
  return new BattleLogManager(options)
}

/**
 * 默认日志管理器实例
 */
export const battleLogManager = new BattleLogManager()

/**
 * 默认简单日志记录器实例
 */
export const logger = new SimpleLogger()
