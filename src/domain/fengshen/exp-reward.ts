/**
 * exp-reward.ts — 经验与金钱计算纯函数（封神榜「经验与金钱管理」功能域）
 *
 * 供封神榜 UI 快速验算/模拟验算与未来引擎结算（RewardCalculator）共用：
 * - matchLevelDiffCondition / matchLevelDiffRule：等级差条件解析与规则匹配
 * - getExpRequired：玩家升级经验表查询
 * - interpolateEnemyReward：敌人奖励基准按插值方式取值
 * - calcEnemyReward：应用难度倍率/角色倍率后的最终值
 *
 * 全部纯函数，无 IO；数据形态对齐 domain/fengshen/types.ts 的三个 params 结构化表。
 */

import type {
  EnemyRewardTableConfig,
  ExpTableConfig,
  LevelDiffBonusConfig,
  LevelDiffCondition,
  LevelDiffRule,
} from '@/domain/fengshen/types'

/** 钳制数值到 [min, max]（min > max 时返回原值，防御坏数据） */
function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return v
  return Math.min(max, Math.max(min, v))
}

/** 解析条件字符串（"<= -5" / ">= 6"），返回 [op, value]；格式非法返回 null */
function parseRangeOp(cond: string): { op: '<=' | '>='; value: number } | null {
  const m = cond.match(/^\s*(<=|>=)\s*(-?\d+(?:\.\d+)?)\s*$/)
  if (!m) return null
  return { op: m[1] as '<=' | '>=', value: Number(m[2]) }
}

/** 判断等级差是否命中一条 condition（0=精确 / [min,max]=闭区间 / "<= x"|">= x"=半开区间） */
export function matchLevelDiffCondition(cond: LevelDiffCondition, diff: number): boolean {
  if (typeof cond === 'number') return diff === cond
  if (Array.isArray(cond)) {
    const [min, max] = cond
    return diff >= min && diff <= max
  }
  const op = parseRangeOp(cond)
  if (!op) return false
  return op.op === '<=' ? diff <= op.value : diff >= op.value
}

/** 按数组顺序返回第一条命中规则的等级差倍率；无命中用 fallbackMultiplier */
export function matchLevelDiffMultiplier(
  config: LevelDiffBonusConfig,
  diff: number,
): { expMult: number; goldMult: number } {
  const rule = config.rules.find((r) => matchLevelDiffCondition(r.condition.diff, diff))
  return rule
    ? { expMult: rule.expMultiplier, goldMult: rule.goldMultiplier }
    : { expMult: config.fallbackMultiplier, goldMult: config.fallbackMultiplier }
}

/** 返回第一条命中的规则（UI 模拟验算展示命中规则用）；无命中返回 undefined */
export function matchLevelDiffRule(
  config: LevelDiffBonusConfig,
  diff: number,
): LevelDiffRule | undefined {
  return config.rules.find((r) => matchLevelDiffCondition(r.condition.diff, diff))
}

/** 等级差倍率并钳制到 clampRange（规则匹配 + fallback 共用，防极端值） */
export function calcLevelDiffMultiplier(
  config: LevelDiffBonusConfig,
  diff: number,
): { expMult: number; goldMult: number } {
  const { expMult, goldMult } = matchLevelDiffMultiplier(config, diff)
  return {
    expMult: clamp(expMult, config.clampRange.min, config.clampRange.max),
    goldMult: clamp(goldMult, config.clampRange.min, config.clampRange.max),
  }
}

/** 玩家升级经验表查询：精确查找 level 的升级所需经验；无档位返回 null（视为满级） */
export function getExpRequired(table: ExpTableConfig, level: number): number | null {
  const entry = table.entries.find((e) => e.level === level)
  return entry ? entry.expRequired : null
}

/** 敌人奖励基准取值：优先精确匹配；否则按插值方式计算（linear 线性插值 / nearest 最近档） */
export function interpolateEnemyReward(
  table: EnemyRewardTableConfig,
  enemyLevel: number,
): { baseExp: number; goldMin: number; goldMax: number } {
  const exact = table.entries.find((e) => e.enemyLevel === enemyLevel)
  if (exact) return { baseExp: exact.baseExp, goldMin: exact.goldMin, goldMax: exact.goldMax }

  const sorted = [...table.entries].sort((a, b) => a.enemyLevel - b.enemyLevel)
  if (sorted.length === 0) return { baseExp: 0, goldMin: 0, goldMax: 0 }
  // 超出档位范围：取最近档（两端不插值外推）
  if (enemyLevel < sorted[0].enemyLevel) {
    const e = sorted[0]
    return { baseExp: e.baseExp, goldMin: e.goldMin, goldMax: e.goldMax }
  }
  const last = sorted[sorted.length - 1]
  if (enemyLevel > last.enemyLevel) {
    return { baseExp: last.baseExp, goldMin: last.goldMin, goldMax: last.goldMax }
  }

  // 相邻两档
  let hi = sorted.find((e) => e.enemyLevel > enemyLevel)
  let lo = sorted[sorted.length - 1]
  for (const e of sorted) {
    if (e.enemyLevel > enemyLevel) {
      hi = e
      break
    }
    lo = e
  }
  if (!hi || lo.enemyLevel === hi.enemyLevel) {
    return { baseExp: lo.baseExp, goldMin: lo.goldMin, goldMax: lo.goldMax }
  }

  if (table.interpolation === 'nearest') {
    const dLo = enemyLevel - lo.enemyLevel
    const dHi = hi.enemyLevel - enemyLevel
    const e = dLo <= dHi ? lo : hi
    return { baseExp: e.baseExp, goldMin: e.goldMin, goldMax: e.goldMax }
  }

  const ratio = (enemyLevel - lo.enemyLevel) / (hi.enemyLevel - lo.enemyLevel)
  const lerp = (a: number, b: number): number => Math.round(a + (b - a) * ratio)
  return {
    baseExp: lerp(lo.baseExp, hi.baseExp),
    goldMin: lerp(lo.goldMin, hi.goldMin),
    goldMax: lerp(lo.goldMax, hi.goldMax),
  }
}

/**
 * 敌人奖励结算核心：基准 × 角色倍率（文档 §2.2 运行时取值规则，钳制到 >= 1）。
 * 等级差倍率由调用方另乘（calcLevelDiffMultiplier）；此处不含随机金钱 roll。
 */
export function calcEnemyReward(
  table: EnemyRewardTableConfig,
  enemyLevel: number,
  role = 'normal',
): { baseExp: number; goldMin: number; goldMax: number; exp: number; goldMinFinal: number; goldMaxFinal: number } {
  const base = interpolateEnemyReward(table, enemyLevel)
  const roleMult = table.roleMultiplier[role] ?? 1
  const exp = Math.max(1, Math.round(base.baseExp * roleMult))
  const goldMinFinal = Math.max(1, Math.round(base.goldMin * roleMult))
  const goldMaxFinal = Math.max(1, Math.round(base.goldMax * roleMult))
  return { ...base, exp, goldMinFinal, goldMaxFinal }
}
