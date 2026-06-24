import type { LogSegment } from '@/application/dto/battle-log'

export const BattleLogFormatter = {
  formatNormalAttack: (options: {
    sourceName: string
    targetName: string
    damage: number
    sourceIsAlly: boolean
    targetIsAlly: boolean
  }): LogSegment[] => {
    const sourceName = options.sourceName
    const targetName = options.targetName
    const damage = options.damage
    const sourceIsAlly = options.sourceIsAlly
    const targetIsAlly = options.targetIsAlly

    const segments: LogSegment[] = []

    segments.push({
      text: sourceName,
      classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ' 攻击 ',
    })
    segments.push({
      text: targetName,
      classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 造成 ${damage} 点伤害`,
      classStr: 'log-damage',
    })

    return segments
  },

  formatSkillAttack: (options: {
    sourceName: string
    targetName: string
    damage: number
    skillName: string
    sourceIsAlly: boolean
    targetIsAlly: boolean
  }): LogSegment[] => {
    const {
      sourceName,
      targetName,
      damage,
      skillName,
      sourceIsAlly,
      targetIsAlly,
    } = options

    const segments: LogSegment[] = []

    segments.push({
      text: sourceName,
      classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 使用技能 `,
    })
    segments.push({
      text: skillName,
    })
    segments.push({
      text: ` 攻击 `,
    })
    segments.push({
      text: targetName,
      classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 造成 ${damage} 点伤害`,
      classStr: 'log-damage',
    })

    return segments
  },

  formatHealSkill: (options: {
    sourceName: string
    targetName: string
    healAmount: number
    skillName: string
    sourceIsAlly: boolean
    targetIsAlly: boolean
  }): LogSegment[] => {
    const {
      sourceName,
      targetName,
      healAmount,
      skillName,
      sourceIsAlly,
      targetIsAlly,
    } = options

    const segments: LogSegment[] = []

    segments.push({
      text: sourceName,
      classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 使用技能 `,
    })
    segments.push({
      text: skillName,
    })
    segments.push({
      text: ` 为 `,
    })
    segments.push({
      text: targetName,
      classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 恢复 ${healAmount} 点生命`,
      classStr: 'log-heal',
    })

    return segments
  },

  formatBuffSkill: (options: {
    sourceName: string
    targetName: string
    buffName: string
    sourceIsAlly: boolean
    targetIsAlly: boolean
  }): LogSegment[] => {
    const { sourceName, targetName, buffName, sourceIsAlly, targetIsAlly } =
      options

    const segments: LogSegment[] = []

    segments.push({
      text: sourceName,
      classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 为 `,
    })
    segments.push({
      text: targetName,
      classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 施加增益 `,
    })
    segments.push({
      text: buffName,
    })

    return segments
  },

  formatDebuffSkill: (options: {
    sourceName: string
    targetName: string
    debuffName: string
    sourceIsAlly: boolean
    targetIsAlly: boolean
  }): LogSegment[] => {
    const { sourceName, targetName, debuffName, sourceIsAlly, targetIsAlly } =
      options

    const segments: LogSegment[] = []

    segments.push({
      text: sourceName,
      classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 对 `,
    })
    segments.push({
      text: targetName,
      classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 施加减益 `,
    })
    segments.push({
      text: debuffName,
    })

    return segments
  },

  formatStatusEffect: (options: {
    targetName: string
    statusName: string
    isAlly: boolean
  }): LogSegment[] => {
    const { targetName, statusName, isAlly } = options

    const segments: LogSegment[] = []

    segments.push({
      text: targetName,
      classStr: isAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 受到状态效果 `,
    })
    segments.push({
      text: statusName,
    })

    return segments
  },

  formatControlEffect: (options: {
    targetName: string
    effectName: string
    isAlly: boolean
  }): LogSegment[] => {
    const { targetName, effectName, isAlly } = options

    const segments: LogSegment[] = []

    segments.push({
      text: targetName,
      classStr: isAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 受到控制效果 `,
    })
    segments.push({
      text: effectName,
    })

    return segments
  },

  formatCriticalHit: (options: {
    sourceName: string
    targetName: string
    damage: number
    sourceIsAlly: boolean
    targetIsAlly: boolean
  }): LogSegment[] => {
    const { sourceName, targetName, damage, sourceIsAlly, targetIsAlly } =
      options

    const segments: LogSegment[] = []

    segments.push({
      text: sourceName,
      classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 暴击攻击 `,
      classStr: 'log-crit',
    })
    segments.push({
      text: targetName,
      classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 造成 ${damage} 点暴击伤害`,
      classStr: 'log-crit',
    })

    return segments
  },

  formatMissedAttack: (options: {
    sourceName: string
    targetName: string
    sourceIsAlly: boolean
    targetIsAlly: boolean
  }): LogSegment[] => {
    const { sourceName, targetName, sourceIsAlly, targetIsAlly } = options

    const segments: LogSegment[] = []

    segments.push({
      text: sourceName,
      classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 攻击 `,
    })
    segments.push({
      text: targetName,
      classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 未命中`,
    })

    return segments
  },

  formatBlockedAttack: (options: {
    sourceName: string
    targetName: string
    sourceIsAlly: boolean
    targetIsAlly: boolean
  }): LogSegment[] => {
    const { sourceName, targetName, sourceIsAlly, targetIsAlly } = options

    const segments: LogSegment[] = []

    segments.push({
      text: sourceName,
      classStr: sourceIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 攻击 `,
    })
    segments.push({
      text: targetName,
      classStr: targetIsAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 被格挡`,
    })

    return segments
  },

  formatDefenseAction: (options: {
    targetName: string
    isAlly: boolean
  }): LogSegment[] => {
    const { targetName, isAlly } = options

    const segments: LogSegment[] = []

    segments.push({
      text: targetName,
      classStr: isAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 进入防御状态`,
    })

    return segments
  },

  formatChargeAction: (options: {
    targetName: string
    isAlly: boolean
  }): LogSegment[] => {
    const { targetName, isAlly } = options

    const segments: LogSegment[] = []

    segments.push({
      text: targetName,
      classStr: isAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 蓄力中`,
    })

    return segments
  },

  formatUnitDeath: (options: {
    targetName: string
    isAlly: boolean
  }): LogSegment[] => {
    const { targetName, isAlly } = options

    const segments: LogSegment[] = []

    segments.push({
      text: targetName,
      classStr: isAlly ? 'log-friendly' : 'log-hostile',
    })
    segments.push({
      text: ` 阵亡`,
      classStr: 'log-damage',
    })

    return segments
  },

  formatBattleVictory: (options: { winnerTeam: string }): LogSegment[] => {
    const { winnerTeam } = options

    const segments: LogSegment[] = []

    segments.push({
      text: `${winnerTeam} 获得胜利`,
      classStr: 'log-heal',
    })

    return segments
  },

  formatBattleDefeat: (options: { loserTeam: string }): LogSegment[] => {
    const { loserTeam } = options

    const segments: LogSegment[] = []

    segments.push({
      text: `${loserTeam} 战败`,
      classStr: 'log-damage',
    })

    return segments
  },

  formatBattleStart: (options: { battleName: string }): LogSegment[] => {
    const { battleName } = options

    const segments: LogSegment[] = []

    segments.push({
      text: `战斗开始: ${battleName}`,
    })

    return segments
  },

  formatBattleEnd: (): LogSegment[] => {
    const segments: LogSegment[] = []

    segments.push({
      text: `战斗结束`,
    })

    return segments
  },
}
