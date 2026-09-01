/**
 * player-config.ts — 玩家成长与装备数值计算纯函数（封神榜「玩家配置」功能域）
 *
 * 对齐 exp-reward.ts 模式：全部纯函数、无 IO、数据形态对齐 domain/fengshen/types.ts 的三个 params 结构化表。
 * - computePlayerBase：基础 + 等级成长（不含自由点）
 * - calcTotalSap：满级属性点总量（固定 + 自由 + 丹药）
 * - computePlayerPreview：按自由点分配计算属性预览 + SAP 分摊
 * - fillExpFromFormula：按经验公式展开经验表
 * - calcEquipBaseValue：装备数值公式（§3.7 策划公式，核心/附加 × 品阶权重 × 转化系数）
 */

import type { EquipFormulaConfig, PlayerGrowthConfig } from '@/domain/fengshen/types'
import type { PlayerBaseAttrCode } from '@/domain/fengshen/types'

/** 玩家基础属性六维顺序（展示/迭代稳定） */
export const PLAYER_BASE_ATTRS: readonly PlayerBaseAttrCode[] = [
  'maxHealth',
  'attack',
  'defense',
  'hitValue',
  'dodgeValue',
  'speed',
]

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return v
  return Math.min(max, Math.max(min, v))
}

/** 固定成长六维合计折算的属性点数（按 conversion 转化率求和；用于校验"每级固定 = 12 属性点"） */
export function fixedGrowthSap(config: PlayerGrowthConfig): number {
  return PLAYER_BASE_ATTRS.reduce((sum, attr) => sum + (config.growth[attr] ?? 0) / (config.conversion[attr] || 1), 0)
}

/** 自由属性点合计（每级自由点 × 满级） */
export function freePointsTotal(config: PlayerGrowthConfig): number {
  return (config.freePointsPerLevel ?? 0) * config.maxLevel
}

/** 满级属性点总量 = 固定成长 SAP × 满级 + 自由点总量 + 丹药（预期值由 PlayerGrowthConfig.expectedTotalSap 决定） */
export function calcTotalSap(config: PlayerGrowthConfig): { fixed: number; free: number; pill: number; total: number } {
  const fixed = fixedGrowthSap(config) * config.maxLevel
  const free = freePointsTotal(config)
  const pill = config.pillBonusPoints ?? 0
  return { fixed, free, pill, total: fixed + free + pill }
}

/** 基础 + 等级成长（不含自由点分配）：base + (level-1) × growth */
export function computePlayerBase(config: PlayerGrowthConfig, level: number): Record<PlayerBaseAttrCode, number> {
  const g = Math.max(0, level - 1)
  const out = {} as Record<PlayerBaseAttrCode, number>
  for (const attr of PLAYER_BASE_ATTRS) {
    out[attr] = (config.base[attr] ?? 0) + g * (config.growth[attr] ?? 0)
  }
  return out
}

/**
 * 属性预览：stats = base + (level-1)×growth + 自由点分配×转化率；sapByAttr 按转化率折算各属性 SAP 量。
 * alloc 为自由点在各属性的分配数（点），总分配不得超过该等级可得自由点（level-1）×freePointsPerLevel。
 */
export function computePlayerPreview(
  config: PlayerGrowthConfig,
  level: number,
  alloc: Partial<Record<PlayerBaseAttrCode, number>>,
): { stats: Record<PlayerBaseAttrCode, number>; sapByAttr: Record<PlayerBaseAttrCode, number>; totalSap: number; usedPoints: number } {
  const base = computePlayerBase(config, level)
  const stats = {} as Record<PlayerBaseAttrCode, number>
  const sapByAttr = {} as Record<PlayerBaseAttrCode, number>
  let usedPoints = 0
  for (const attr of PLAYER_BASE_ATTRS) {
    const conv = config.conversion[attr] ?? 1
    const pts = alloc[attr] ?? 0
    stats[attr] = base[attr] + pts * conv
    sapByAttr[attr] = stats[attr] / conv
    usedPoints += pts
  }
  const totalSap = PLAYER_BASE_ATTRS.reduce((sum, attr) => sum + sapByAttr[attr], 0)
  return { stats, sapByAttr, totalSap, usedPoints }
}

/** 解析经验公式模板（仅支持 'round(A × L^B + C × L)' 形态），返回 { A, B, C }；不匹配返回 null */
export function parseExpFormula(formula: string): { a: number; b: number; c: number } | null {
  const m = String(formula ?? '').replace(/\s+/g, '').match(/^round\((\d+(?:\.\d+)?)×L\^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)×L\)$/)
  if (!m) return null
  return { a: Number(m[1]), b: Number(m[2]), c: Number(m[3]) }
}

/** 按公式展开升级经验表（level 1..maxLevel）；公式不匹配返回空数组（视图提示手填） */
export function fillExpFromFormula(expFormula: string, maxLevel: number): Array<{ level: number; expRequired: number }> {
  const p = parseExpFormula(expFormula)
  if (!p || !Number.isFinite(maxLevel) || maxLevel < 1) return []
  const out: Array<{ level: number; expRequired: number }> = []
  for (let lv = 1; lv <= maxLevel; lv++) {
    out.push({ level: lv, expRequired: Math.round(p.a * Math.pow(lv, p.b) + p.c * lv) })
  }
  return out
}

/** 单位基数（= baseSap ÷ slotCount ÷ weightPerSlot ÷ maxLevel，预期 900/6/3/50 = 1） */
export function equipBaseUnit(cfg: EquipFormulaConfig): number {
  const denom = (cfg.slotCount || 1) * (cfg.weightPerSlot || 1) * (cfg.maxLevel || 1)
  return (cfg.baseSap ?? 0) / denom
}

/**
 * 装备基础属性值 = 单位基数 × 装备等级 × 属性权重（核心/附加）× 品阶权重 × 属性转化系数。
 * 返回区间 [min, max] = 基准值 × floatRange。
 */
export function calcEquipBaseValue(
  cfg: EquipFormulaConfig,
  level: number,
  kind: 'core' | 'affix',
  tierWeight: number,
  convert: number,
): { base: number; min: number; max: number } {
  const unit = equipBaseUnit(cfg)
  const weight = kind === 'core' ? cfg.coreWeight : cfg.affixWeight
  const base = unit * level * weight * tierWeight * convert
  const min = base * cfg.floatRange.min
  const max = base * cfg.floatRange.max
  return { base, min: Math.round(min), max: Math.round(max) }
}

/** 装备品阶权重取值：取区间上限（对齐策划示例：仙品 0.9~1.0 取 1.0）；无档位返回 1 兜底 */
export function tierWeightValue(cfg: EquipFormulaConfig, tier: string): number {
  const range = cfg.tierWeight?.[tier]
  if (!range) return 1
  return clamp(range.max, 0, 2)
}

/** 校验玩家成长配置自洽性：固定成长 SAP = 12、自由点非负、conversion 全 > 0；返回错误文案列表 */
export function validatePlayerConfig(config: PlayerGrowthConfig): string[] {
  const errors: string[] = []
  const growthSap = fixedGrowthSap(config)
  if (Math.abs(growthSap - 12) > 0.01) errors.push(`每级固定成长折算属性点 = ${growthSap.toFixed(2)}，应为 12`)
  if ((config.freePointsPerLevel ?? 0) < 0) errors.push('每级自由属性点不能为负')
  for (const attr of PLAYER_BASE_ATTRS) {
    if ((config.conversion[attr] ?? 0) <= 0) errors.push(`转化率 conversion.${attr} 必须 > 0`)
    if ((config.growth[attr] ?? 0) < 0) errors.push(`成长 growth.${attr} 不能为负`)
  }
  return errors
}
