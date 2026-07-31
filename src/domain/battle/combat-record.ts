/**
 * 文件：combat-record.ts
 * 创建日期：2026-03-08
 * 作者：CombatDebugStudio
 * 功能：战斗记录核心类型定义
 * 描述：定义统一的战斗记录数据结构，用于贯穿整个动作气血周期的记录
 * 版本：1.0.0
 */

import type { BattleEffect } from '@/domain/battle/type/types'
import type { CalculationStep } from '@/domain/attribute/types'
import type { ActionTypes } from '@/domain/battle/type/types'
import { DamageSource } from '@/domain/battle/type/types'
import { DamageCategory } from '@/domain/skill/types'

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
  /** 此步骤计算前的伤害值（用于 UI 展示 before→after 变化） */
  before?: number
  /** 此步骤计算后的伤害值（与 value 一致，结构化冗余以便 UI 直接读） */
  after?: number
  sourceType?: DamageSource | 'base' | 'system'
  /**
   * 子步骤（嵌套步骤）。
   * 最大嵌套深度 3：顶层步骤可以作为父节点包含 children，子节点不再嵌套。
   * 当前管线是线性的，children 为未来被动触发产生的子链路预留。
   */
  children?: DamageStep[]
}

/** 动作上下文：记录行动前的被动触发信息 */
export interface ActionContext {
  prePassives: Array<{
    passiveId: string
    passiveName: string
    ownerName: string
    effectSummary: string
  }>
}
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
  /** 暴击后伤害（暴击后、来源方加成前） */
  postCritDamage: number
  /** 原始伤害：来源方全部产出（暴击 + 伤害提升 + 条件加成），目标方减免前
   *  可选兼容：旧 localStorage 记录加载后该字段为 undefined。
   *  读取时请使用 `breakdown.rawDamage ?? breakdown.postCritDamage` 回退。 */
  rawDamage?: number
  /** 防御相关 */
  defenseValue: number
  /** 实际防御值（加成后） */
  effectiveDefense: number
  /** 防御减免乘数（0~1 小数） */
  defenseMultiplier: number
  /** 各项减免（百分比点，如 20 = 减免 20%） */
  normalAtkReduction?: number
  skillDmgReduction?: number
  /** 通用减免（免伤率，百分比点） */
  damageReduction?: number
  damageTakenIncrease?: number
  /** 来源方伤害提升（在原始伤害阶段生效） */
  damageBoost?: number
  /** 暴击承伤减免（目标方） */
  critDmgTakenReduction?: number
  /** 火系技能伤害加成（来源方，在原始伤害阶段生效） */
  fireSkillDmgBonus?: number
  /** 物理技能伤害加成（来源方，在原始伤害阶段生效） */
  physicalSkillDmgBonus?: number
  /** 低血量增伤（来源方，在原始伤害阶段生效） */
  damageToLowHp?: number
  /** 目标修正 */
  targetModifierEffects: TargetModifierEffect[]
  /** 阈值 */
  minDamageThreshold: number
  maxDamageThreshold: number
  /** 最终伤害 */
  finalDamage: number
  /** 伤害大类 */
  damageCategory?: DamageCategory
  /** 元素抗性 */
  elementalResistance?: number
  /** 完整步骤链（用于 UI 逐条展示） */
  steps: DamageStep[]
}

/**
 * 统一动作记录 - 贯穿整个动作气血周期的核心记录对象
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
  actionContext?: ActionContext
  /** 伤害来源类型：区分普通攻击/技能/DOT/反伤/反应 */
  /** 本回合第几次行动（从 1 开始，含额外行动） */
  actionOrder?: number
  /** 溢出伤害（takeDamage 返回值超出目标扣血前 HP 的部分，≥0） */
  overkill?: number
  damageSource?: DamageSource // 伤害来源类型
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
