/**
 * 战斗日志格式化工具
 * 按照标准格式规范处理战斗日志，保持颜色属性一致性
 */

/**
 * 日志级别类型定义
 */
export type LogLevel =
  | 'damage'
  | 'heal'
  | 'crit'
  | 'status'
  | 'info'
  | 'ally'
  | 'enemy'

/**
 * 动作类型定义
 */
export type ActionType =
  | 'normal_attack'
  | 'skill_attack'
  | 'heal_skill'
  | 'buff_skill'
  | 'debuff_skill'
  | 'status_effect'
  | 'control_effect'
  | 'critical_hit'
  | 'missed_attack'
  | 'blocked_attack'
  | 'defense_action'
  | 'charge_action'
  | 'unit_death'
  | 'battle_victory'
  | 'battle_defeat'
  | 'battle_start'
  | 'battle_end'

/**
 * 战斗日志格式化选项
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
 * 格式化普通攻击日志
 */
export function formatNormalAttack(options: LogFormatOptions): {
  result: string
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  level: LogLevel
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
  actionType: string,
  options: LogFormatOptions,
): { result: string; level: LogLevel } {
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
export function getLogLevelColor(level: LogLevel): string {
  const colorMap: Record<LogLevel, string> = {
    damage: '#f44336', // 红色 - 伤害
    heal: '#4caf50', // 绿色 - 治疗
    crit: '#ff9800', // 橙色 - 暴击
    status: '#2196f3', // 蓝色 - 状态
    info: '#9e9e9e', // 灰色 - 信息
    ally: '#4fc3f7', // 青色 - 友方
    enemy: '#e94560', // 红色 - 敌方
  }
  return colorMap[level] || '#9e9e9e'
}

/**
 * 生成完整的战斗日志对象
 */
export function createBattleLog(
  actionType: string,
  options: LogFormatOptions,
  customLevel?: LogLevel,
): {
  turn: string
  source: string
  action: string
  target: string
  result: string
  level: LogLevel
} {
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

/**
 * HTML格式化选项扩展
 */
export interface HTMLFormatOptions extends LogFormatOptions {
  forceCritical?: boolean
  sourceIsAlly?: boolean
  targetIsAlly?: boolean
}

/**
 * 格式化角色名称（添加友方/敌方样式）
 */
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
 * 格式化普通攻击日志（HTML语义化版本）
 */
export function formatNormalAttackHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
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
 * 格式化技能攻击日志（HTML语义化版本）
 */
export function formatSkillAttackHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
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
 * 格式化治疗技能日志（HTML语义化版本）
 */
export function formatHealSkillHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  const { source, target, skillName, heal, sourceIsAlly, targetIsAlly } =
    options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 施放<span class="skill-heal">【${skillName}】</span>，为其恢复 <span class="heal-value">${heal}</span> 点生命值。`,
    level: 'heal',
  }
}

/**
 * 格式化增益技能日志（HTML语义化版本）
 */
export function formatBuffSkillHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  const { source, targetScope, skillName, effect, duration, sourceIsAlly } =
    options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${targetScope} 施加<span class="skill-heal">【${skillName}】</span>，使<span class="buff">${effect}</span>，持续${duration}回合。`,
    level: 'status',
  }
}

/**
 * 格式化减益技能日志（HTML语义化版本）
 */
export function formatDebuffSkillHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
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
 * 格式化状态生效日志（HTML语义化版本）
 */
export function formatStatusEffectHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
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
 * 格式化控制效果日志（HTML语义化版本）
 */
export function formatControlEffectHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  const { source, target, skillName, statusName, sourceIsAlly, targetIsAlly } =
    options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 发动<span class="skill-debuff">【${skillName}】</span>，成功使目标陷入<span class="debuff">【${statusName}】</span>状态，无法行动。`,
    level: 'status',
  }
}

/**
 * 格式化暴击日志（HTML语义化版本）
 */
export function formatCriticalHitHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
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
 * 格式化闪避日志（HTML语义化版本）
 */
export function formatMissedAttackHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
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
 * 格式化格挡日志（HTML语义化版本）
 */
export function formatBlockedAttackHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  const { source, target, skillName, damage, sourceIsAlly, targetIsAlly } =
    options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 发动<span class="skill-attack">【${skillName}】</span>，攻击被<span class="evade">格挡</span>，最终造成 ${damage} 点伤害。`,
    level: 'damage',
  }
}

/**
 * 格式化防御动作日志（HTML语义化版本）
 */
export function formatDefenseActionHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  const { source, stanceName, effect, sourceIsAlly } = options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 采取了<span class="skill-heal">【${stanceName}】</span>姿态，${effect}。`,
    level: 'status',
  }
}

/**
 * 格式化蓄力动作日志（HTML语义化版本）
 */
export function formatChargeActionHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  const { source, chargeDescription, skillName, sourceIsAlly } = options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 开始${chargeDescription}，将在下回合释放<span class="skill-attack">【${skillName}】</span>。`,
    level: 'status',
  }
}

/**
 * 格式化单位死亡日志（HTML语义化版本）
 */
export function formatUnitDeathHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  const { source, target, sourceIsAlly, targetIsAlly } = options
  return {
    htmlResult: `${formatSource(source, sourceIsAlly)} 对 ${formatTarget(target, targetIsAlly)} 造成了致命一击，${formatTarget(target, targetIsAlly)} 被击败。`,
    level: 'info',
  }
}

/**
 * 格式化战斗胜利日志（HTML语义化版本）
 */
export function formatBattleVictoryHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  const { exp, gold } = options
  return {
    htmlResult: `【战斗结束】我方取得了胜利，获得<span class="resource">${exp}</span>点经验值，<span class="resource">${gold}</span>枚金币。`,
    level: 'info',
  }
}

/**
 * 格式化战斗失败日志（HTML语义化版本）
 */
export function formatBattleDefeatHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  return {
    htmlResult: `【战斗结束】我方已全军覆没，战斗失败。`,
    level: 'info',
  }
}

/**
 * 格式化战斗开始日志（HTML语义化版本）
 */
export function formatBattleStartHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  return {
    htmlResult: `【战斗开始】战斗开始！参战角色: ${options.source} 人，参战敌人: ${options.target} 人`,
    level: 'info',
  }
}

/**
 * 格式化战斗结束日志（HTML语义化版本）
 */
export function formatBattleEndHTML(options: HTMLFormatOptions): {
  htmlResult: string
  level: LogLevel
} {
  return {
    htmlResult: `【战斗结束】战斗结束！胜利者: ${options.source}`,
    level: 'info',
  }
}

/**
 * 智能HTML格式化函数 - 根据动作类型自动选择合适的HTML格式化方法
 * 返回包含语义化HTML标签的日志结果
 */
export function formatBattleLogHTML(
  actionType: string,
  options: HTMLFormatOptions,
): { htmlResult: string; level: LogLevel } {
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
  actionType: string,
  options: HTMLFormatOptions,
  customLevel?: LogLevel,
): {
  turn: string
  htmlResult: string
  level: LogLevel
} {
  const formatted = formatBattleLogHTML(actionType, options)
  const level = customLevel || formatted.level

  return {
    turn:
      typeof options.turn === 'number' ? `回合${options.turn}` : options.turn,
    htmlResult: formatted.htmlResult,
    level: level,
  }
}
