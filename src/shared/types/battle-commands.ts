/**
 * 战斗命令类型定义
 * 
 * 第三阶段核心：BattleSystem 不再直接修改状态，而是生成 BattleCommand 序列，
 * battleStore 的 reducer 负责执行命令更新响应式状态树。
 * 
 * 每条命令都是对状态的一次原子变更，支持回放与回溯。
 */

import type { ParticipantSide } from '@/domain/battle/types'

// ===================== 命令定义 =====================

/**
 * 应用伤害命令
 */
export interface ApplyDamageCommand {
  type: 'APPLY_DAMAGE'
  payload: {
    targetId: string
    amount: number
    sourceId: string
    isCritical?: boolean
    isHeal?: boolean
  }
}

/**
 * 应用治疗命令
 */
export interface ApplyHealCommand {
  type: 'APPLY_HEAL'
  payload: {
    targetId: string
    amount: number
    sourceId: string
  }
}

/**
 * 增加能量命令
 */
export interface GainEnergyCommand {
  type: 'GAIN_ENERGY'
  payload: {
    targetId: string
    amount: number
  }
}

/**
 * 消耗能量命令
 */
export interface SpendEnergyCommand {
  type: 'SPEND_ENERGY'
  payload: {
    targetId: string
    amount: number
  }
}

/**
 * 添加 Buff 命令
 */
export interface AddBuffCommand {
  type: 'ADD_BUFF'
  payload: {
    targetId: string
    buffId: string
    instanceId: string
    duration: number
  }
}

/**
 * 移除 Buff 命令
 */
export interface RemoveBuffCommand {
  type: 'REMOVE_BUFF'
  payload: {
    targetId: string
    instanceId: string
  }
}

/**
 * 重置受击能量计数器命令
 */
export interface ResetEnergyHitCountCommand {
  type: 'RESET_ENERGY_HIT_COUNT'
  payload: {
    targetId: string
  }
}

/**
 * 推进回合命令
export interface NextTurnCommand {
  type: 'NEXT_TURN'
  payload: {
    actorId: string
    round: number
    turnOrder: string[]
  }
}

/**
 * 设置战斗胜利命令
 */
export interface SetWinnerCommand {
  type: 'SET_WINNER'
  payload: {
    winner: ParticipantSide
  }
}

/**
 * 初始化参与者命令
 */
export interface InitParticipantsCommand {
  type: 'INIT_PARTICIPANTS'
  payload: {
    participants: Record<string /* participantId */, {
      id: string
      name: string
      team: ParticipantSide
      maxHealth: number
      currentHealth: number
      maxEnergy: number
      currentEnergy: number
      level: number
    }>
  }
}

/**
 * 记录战斗动作命令
 */
export interface RecordActionCommand {
  type: 'RECORD_ACTION'
  payload: {
    action: import('@/domain/battle/types').BattleAction
  }
}

/**
 * 更新角色属性命令
 */
export interface UpdateStatsCommand {
  type: 'UPDATE_STATS'
  payload: {
    participantId: string
    stats: Partial<{
      currentHealth: number
      currentEnergy: number
      level: number
    }>
  }
}

/**
 * 角色死亡命令
 */
export interface ParticipantDeathCommand {
  type: 'PARTICIPANT_DEATH'
  payload: {
    participantId: string
    sourceId: string
  }
}

// ===================== 联合类型 =====================

/**
 * 战斗命令联合类型
 * 所有可能的战斗命令，由 BattleSystem 生成，由 Store reducer 执行
 */
export type BattleCommand =
  | ApplyDamageCommand
  | ApplyHealCommand
  | GainEnergyCommand
  | SpendEnergyCommand
  | ResetEnergyHitCountCommand
  | AddBuffCommand
  | RemoveBuffCommand
  | NextTurnCommand
  | SetWinnerCommand
  | InitParticipantsCommand
  | RecordActionCommand
  | UpdateStatsCommand
  | ParticipantDeathCommand

// ===================== 辅助类型 =====================

/**
 * 命令执行上下文
 * 传递给 reducer 的额外信息
 */
export interface CommandContext {
  /** 当前回合数 */
  round: number
  /** 当前行动索引 */
  turn: number
}

/**
 * 命令执行结果
 */
export interface CommandResult {
  /** 是否成功执行 */
  success: boolean
  /** 错误信息（可选） */
  error?: string
}
