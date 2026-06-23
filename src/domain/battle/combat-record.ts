/**
 * 文件：combat-record.ts
 * 创建日期：2026-03-08
 * 作者：CombatDebugStudio
 * 功能：战斗记录核心类型定义
 * 描述：定义统一的战斗记录数据结构，用于贯穿整个动作生命周期的记录
 * 版本：1.0.0
 */

import type { EffectType } from './effect'
import type { BattleEffect } from './battle'
import type { CalculationStep } from '@/types/attribute'
/**
 * 动作类型
 */
export type ActionType =
  | 'attack'
  | 'skill'
  | 'heal'
  | 'buff'
  | 'item'
  | 'system'

/**
 * 计算详情 - 调试模式开启时填充
 */
export interface CalculationDetail {
  steps: CalculationStep[]
  finalValue: number
  critical: boolean
  miss: boolean
  modifiers: Record<string, number>
}

/**
 * 统一动作记录 - 贯穿整个动作生命周期的核心记录对象
 */
export interface CombatRecord {
  id: string
  battleId: string
  timestamp: number
  turn: number

  actorId: string
  actorName: string
  actionType: ActionType
  skillId?: string
  targetId: string
  targetName?: string

  damage: number
  heal: number
  effects: BattleEffect[]

  energyCost?: number
  energyGain?: number

  hasDetail?: boolean
  detail?: CalculationDetail

  message: string
  htmlMessage?: string

  sourceAction?: Record<string, any>
}

/**
 * 创建空的战斗记录对象
 */
export function createEmptyRecord(
  battleId: string,
  actorId: string,
  actorName: string,
  actionType: ActionType,
  targetId: string,
  targetName: string,
  turn: number,
  skillId?: string,
): CombatRecord {
  return {
    id: `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    battleId,
    timestamp: Date.now(),
    turn,
    actorId,
    actorName,
    actionType,
    skillId,
    targetId,
    targetName,
    damage: 0,
    heal: 0,
    effects: [],
    message: '',
    hasDetail: false,
  }
}
