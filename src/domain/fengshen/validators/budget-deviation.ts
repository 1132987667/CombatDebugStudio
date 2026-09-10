/**
 * budget-deviation.ts — 系统投放 vs 预算偏差规则（数值体系扩展 3.1 / 3.9 共用口径）
 *
 * 消费 budgetDeviations 的占比口径：|偏差| > 10% warn、> 50% error（run 内动态升级，
 * 规则声明级别取 warn 基线）。配置了投放但 system_budget 无对应行的系统按 warn 列出。
 * 两侧配置任一缺失时整条规则跳过（未启用该功能不算问题）。
 */

import type { ValidationContext, ValidationIssue } from './registry'
import { budgetDeviations } from '@/domain/fengshen/system-distributor'

const SYSTEM_LABEL: Record<string, string> = {
  level: '等级', equipment: '装备', school: '流派树', pet: '宠物', mount: '坐骑',
  talent: '天赋', artifact: '法宝', relic: '神器',
}

export function checkBudgetDeviation(ctx: ValidationContext): ValidationIssue[] {
  const dist = ctx.systemDistribution
  const budget = ctx.systemBudget
  if (!dist || !budget) return []
  const multipliers: Record<string, number> = {}
  for (const a of ctx.attributes ?? []) multipliers[a.code] = a.sapMultiplier > 0 ? a.sapMultiplier : 1
  // 评估等级：玩家满级（投放与预算同为满级总量口径）；无 player_config 按 50 兜底
  const level = ctx.playerConfig?.maxLevel ?? 50

  const issues: ValidationIssue[] = []
  for (const row of budgetDeviations(dist, budget, multipliers, level)) {
    const label = row.label || SYSTEM_LABEL[row.system] || row.system
    if (row.noBudget) {
      issues.push({
        ruleId: 'budget_deviation',
        severity: 'warn',
        table: 'params',
        rowId: 'system_distribution',
        field: `systems.${row.system}`,
        message: `系统「${label}」配置了投放但 system_budget 无预算行，偏差无法评估`,
      })
      continue
    }
    if (row.status === 'ok') continue
    issues.push({
      ruleId: 'budget_deviation',
      severity: row.status === 'error' ? 'error' : 'warn',
      table: 'params',
      rowId: 'system_distribution',
      field: `systems.${row.system}`,
      message: `系统「${label}」实际投放占比 ${(row.actualShare * 100).toFixed(1)}% vs 预算占比 ${(row.budgetShare * 100).toFixed(1)}%，偏差 ${row.deviation > 0 ? '+' : ''}${row.deviation}%（${row.deviation > 0 ? '超出' : '低于'}预算 ${Math.abs(row.deviation) > 50 ? '超过 50%' : '超过 10%'}）`,
    })
  }
  return issues
}
