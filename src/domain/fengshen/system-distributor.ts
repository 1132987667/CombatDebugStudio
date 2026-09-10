/**
 * system-distributor.ts — 系统投放明细计算纯函数（数值体系扩展 3.1）
 *
 * 三个口径：
 * - evalDistributionValue：单条投放规则求值（fixed 定值 / range 区间中值——期望口径，
 *   汇总与校验用同一读数 / formula 白名单模板，Phase 1 仅 linear：k × level + b）
 * - systemActualSap：某系统全部投放折算 SAP（Σ value ÷ attributes.sapMultiplier，
 *   与 player-config.sapByAttr / equip-generator 同口径：属性值 ÷ 转化系数）
 * - budgetDeviations：实际投放 vs 预算权重偏差。预算 weight 是相对权重非 SAP 绝对量
 *   （等级 totalSap=900 而 weight=120），故按占比对比：
 *   deviation = (实际占比 − 预算占比) ÷ 预算占比；>10% warn / >50% error。
 *   占比口径下全系统等比放大不告警（总量超标由 attribute_limit 的 playerMax 口径管）。
 */

import type {
  AttributeDef,
  SystemBudgetConfig,
  SystemDistributionEntry,
  SystemDistributionRule,
} from '@/domain/fengshen/types'

/** 单条投放规则求值（level 为评估等级，通常传 player_config.maxLevel） */
export function evalDistributionValue(rule: SystemDistributionRule, level: number): number {
  if (rule.mode === 'fixed') return rule.value ?? 0
  if (rule.mode === 'range') {
    const r = rule.range
    if (!r) return 0
    return (r.min + r.max) / 2
  }
  // formula：白名单模板（不做表达式 DSL，§七·公式注入风险）
  if (rule.formula?.template === 'linear') return rule.formula.k * level + rule.formula.b
  return 0
}

/** attributes 表索引：code → sapMultiplier（缺项按 1——percent/机制属性无静态 SAP 口径） */
export function sapMultiplierIndex(attributes: AttributeDef[]): Record<string, number> {
  const idx: Record<string, number> = {}
  for (const a of attributes) idx[a.code] = a.sapMultiplier > 0 ? a.sapMultiplier : 1
  return idx
}

/** 某系统投放折算 SAP：Σ evalValue ÷ sapMultiplier；byAttr 同时返回分属性明细 */
export function systemActualSap(
  entry: SystemDistributionEntry,
  sapMultipliers: Record<string, number>,
  level: number,
): { totalSap: number; byAttr: Record<string, number> } {
  const byAttr: Record<string, number> = {}
  let total = 0
  for (const rule of entry.distributions) {
    const value = evalDistributionValue(rule, level)
    const sap = value / (sapMultipliers[rule.attribute] ?? 1)
    byAttr[rule.attribute] = (byAttr[rule.attribute] ?? 0) + sap
    total += sap
  }
  return { totalSap: Math.round(total * 10) / 10, byAttr }
}

export interface BudgetDeviationRow {
  system: string
  label: string
  /** 预算权重（system_budget 原值） */
  budgetWeight: number
  /** 预算占比（0~1） */
  budgetShare: number
  /** 实际投放 SAP（level 口径求值） */
  actualSap: number
  /** 实际占比（0~1） */
  actualShare: number
  /** 偏差百分比（(实际占比 − 预算占比) ÷ 预算占比 × 100，正 = 超投） */
  deviation: number
  status: 'ok' | 'warn' | 'error'
  /** 无预算的系统（system_budget 未列，如 talent）：仅有投放无参照 */
  noBudget?: boolean
}

const WARN_THRESHOLD = 10
const ERROR_THRESHOLD = 50

/** 实际投放 vs 预算偏差（占比口径）。只算两侧都有的系统；单侧存在的系统显式列出供 UI 提示。 */
export function budgetDeviations(
  dist: { systems: SystemDistributionEntry[] },
  budget: SystemBudgetConfig,
  sapMultipliers: Record<string, number>,
  level: number,
): BudgetDeviationRow[] {
  const rows: BudgetDeviationRow[] = []
  const totalWeight = budget.systems.reduce((s, b) => s + (b.weight || 0), 0)
  const distBySystem = new Map(dist.systems.map((e) => [e.system, e]))
  const totalActual = dist.systems.reduce(
    (s, e) => s + systemActualSap(e, sapMultipliers, level).totalSap,
    0,
  )

  // 预算内系统：正常偏差行
  for (const b of budget.systems) {
    const entry = distBySystem.get(b.system)
    const actualSap = entry ? systemActualSap(entry, sapMultipliers, level).totalSap : 0
    const budgetShare = totalWeight > 0 ? b.weight / totalWeight : 0
    const actualShare = totalActual > 0 ? actualSap / totalActual : 0
    const deviation = budgetShare > 0 ? ((actualShare - budgetShare) / budgetShare) * 100 : 0
    const abs = Math.abs(deviation)
    rows.push({
      system: b.system,
      label: b.label,
      budgetWeight: b.weight,
      budgetShare: Math.round(budgetShare * 1000) / 1000,
      actualSap,
      actualShare: Math.round(actualShare * 1000) / 1000,
      deviation: Math.round(deviation * 10) / 10,
      status: abs > ERROR_THRESHOLD ? 'error' : abs > WARN_THRESHOLD ? 'warn' : 'ok',
    })
    distBySystem.delete(b.system)
  }

  // 预算外系统（配置了投放但无预算行）：noBudget 标记，不参与占比
  for (const entry of distBySystem.values()) {
    rows.push({
      system: entry.system,
      label: entry.label,
      budgetWeight: 0,
      budgetShare: 0,
      actualSap: systemActualSap(entry, sapMultipliers, level).totalSap,
      actualShare: totalActual > 0 ? Math.round((systemActualSap(entry, sapMultipliers, level).totalSap / totalActual) * 1000) / 1000 : 0,
      deviation: 0,
      status: 'warn',
      noBudget: true,
    })
  }
  return rows
}
