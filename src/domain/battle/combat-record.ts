/**
 * 文件：combat-record.ts
 * 创建日期：2026-03-08
 * 作者：CombatDebugStudio
 * 功能：战斗记录核心类型定义
 * 描述：定义统一的战斗记录数据结构，用于贯穿整个动作生命周期的记录
 * 版本：1.0.0
 */

import type { BattleEffect } from '@/domain/battle/types'
import type { CalculationStep } from '@/domain/attribute/types'
import type { ActionTypes } from '@/domain/battle/types'

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

// ===================== 伤害拆分（完整链路） =====================

/** 伤害计算中的一步 */
export interface DamageStep {
  stepName: string
  value: number
  description: string
}

/** 额外加成项 */
export interface ExtraContribution {
  attribute: string
  value: number
  ratio: number
}

/** 目标修正项 */
export interface TargetModifierEffect {
  attribute: string
  multiplier: number
  effect: number
}

/**
 * 伤害拆分明细
 * 记录从"基础威力"到"最终伤害"的完整计算链路
 */
export interface DamageBreakdown {
  /** 基础伤害（威力） */
  baseDamage: number
  /** 额外加成（属性倍率） */
  extraContributions: ExtraContribution[]
  /** 暴击相关 */
  isCritical: boolean
  critRate: number
  critDamage: number
  critMultiplier: number
  /** 暴击前伤害（加成后） */
  preCritDamage: number
  /** 暴击后伤害 */
  postCritDamage: number
  /** 防御相关 */
  defenseValue: number
  effectiveDefense: number
  defenseMultiplier: number
  /** 各项减免（百分比点，如 20 = 减免 20%） */
  normalAtkReduction?: number
  skillDmgReduction?: number
  generalDamageReduction?: number
  damageTakenIncrease?: number
  /** 目标修正 */
  targetModifierEffects: TargetModifierEffect[]
  /** 阈值 */
  minDamageThreshold: number
  maxDamageThreshold: number
  /** 最终伤害 */
  finalDamage: number
  /** 完整步骤链（用于 UI 逐条展示） */
  steps: DamageStep[]
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
  actionType: ActionTypes
  skillId?: string
  skillName?: string
  targetId: string
  targetName?: string

  damage: number
  heal: number
  effects: BattleEffect[]

  energyCost?: number
  energyGain?: number

  hasDetail?: boolean
  detail?: CalculationDetail

  /** 伤害拆分明细（攻击/技能动作时填充） */
  damageBreakdown?: DamageBreakdown

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
  actionType: ActionTypes,
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
