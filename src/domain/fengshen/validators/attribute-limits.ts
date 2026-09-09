/**
 * attribute-limits.ts — 属性上限约束规则（数值体系扩展 3.3）
 *
 * 三个检查口径（attribute_limit.checkScopes 控制开关）：
 * - playerMax：满级玩家最坏情况——固定成长 + 全部自由点/丹药投到单属性，vs limits.max
 * - equipAffix：装备词条 valueRange.max vs limits.max（flat 词条按绝对值；
 *   percent 词条仅当属性条目 kind='percent' 时判断，kind='base' 的相对加成需基础值，不静态判）
 * - buffStacked：buff 属性效果 × 叠满层数（perStack=false 不放大）vs limits.max，
 *   PERCENTAGE 且 kind='base' 同理跳过
 *
 * 违规处置（limits[attr].onViolation）：block → error（无 quickFix，需回改配置）；
 * clamp → error + quickFix 钳回上限；warn → warn。
 */

import type {
  AttributeLimitConfig,
  AttributeLimitEntry,
  BuffJsonEntry,
  EquipmentAffixData,
  PlayerGrowthConfig,
  PlayerBaseAttrCode,
} from '@/domain/fengshen/types'
import { computePlayerPreview, PLAYER_BASE_ATTRS, PLAYER_BASE_ATTR_LABELS } from '@/domain/fengshen/player-config'
import type { ValidationContext, ValidationIssue } from './registry'

function makeIssue(
  limit: AttributeLimitEntry,
  table: string,
  rowId: string,
  field: string,
  message: string,
  quickFix?: ValidationIssue['quickFix'],
): ValidationIssue {
  return {
    ruleId: 'attribute_limits',
    severity: limit.onViolation === 'warn' ? 'warn' : 'error',
    table,
    rowId,
    field,
    message,
    quickFix: limit.onViolation === 'clamp' ? quickFix : undefined,
  }
}

/** playerMax：满级最坏情况（全部自由点 + 丹药投入单属性）超出上限 */
function checkPlayerMax(cfg: AttributeLimitConfig, pc: PlayerGrowthConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const freeTotal = (pc.freePointsPerLevel ?? 0) * pc.maxLevel + (pc.pillBonusPoints ?? 0)
  for (const attr of PLAYER_BASE_ATTRS) {
    const limit = cfg.limits[attr]
    if (!limit) continue
    const worst = computePlayerPreview(pc, pc.maxLevel, { [attr]: freeTotal } as Partial<Record<PlayerBaseAttrCode, number>>).stats[attr]
    if (worst > limit.max) {
      issues.push(makeIssue(limit, 'params', 'player_config', `base.${attr}`,
        `满级玩家最坏情况（全部 ${freeTotal} 自由点投入${PLAYER_BASE_ATTR_LABELS[attr]}）${PLAYER_BASE_ATTR_LABELS[attr]} = ${Math.round(worst)}，超出上限 ${limit.max}`))
    } else if (worst < limit.min) {
      issues.push(makeIssue(limit, 'params', 'player_config', `base.${attr}`,
        `满级玩家 ${attr} = ${Math.round(worst)}，低于下限 ${limit.min}（下限配置高于可达值，请检查配置）`))
    }
  }
  return issues
}

/** equipAffix：装备词条区间上限超出属性上限 */
function checkEquipAffix(cfg: AttributeLimitConfig, affixes: EquipmentAffixData[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const affix of affixes) {
    const limit = cfg.limits[affix.attribute]
    if (!limit) continue
    if (affix.modifierType === 'percent' && limit.kind === 'base') continue
    if (affix.valueRange.max > limit.max) {
      issues.push(makeIssue(limit, 'equipment_affixes', affix.id, 'valueRange.max',
        `词条「${affix.name}」(${affix.id}) valueRange.max = ${affix.valueRange.max}，超出属性 ${affix.attribute} 上限 ${limit.max}`,
        { field: 'valueRange.max', value: limit.max, label: `钳回 ${limit.max}` }))
    }
  }
  return issues
}

/** buffStacked：buff 属性效果叠满层后的量超出属性上限（静态近似，不跑战斗） */
function checkBuffStacked(cfg: AttributeLimitConfig, buffs: BuffJsonEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const buff of buffs) {
    if (!buff.attributes) continue
    const stacks = buff.maxStacks ?? 1
    for (const [attr, conf] of Object.entries(buff.attributes)) {
      const limit = cfg.limits[attr]
      if (!limit) continue
      const value = typeof conf?.value === 'number' ? conf.value : Number(conf)
      if (!Number.isFinite(value)) continue
      // PERCENTAGE（相对加成）在 base 口径属性上无静态终值，跳过
      const isPercentage = conf && typeof conf === 'object' && (conf as { type?: string }).type === 'PERCENTAGE'
      if (isPercentage && limit.kind === 'base') continue
      const perStack = !conf || typeof conf !== 'object' || (conf as { perStack?: boolean }).perStack !== false
      const stacked = value * (perStack ? stacks : 1)
      if (stacked > limit.max) {
        issues.push(makeIssue(limit, 'buffs', buff.id, `attributes.${attr}.value`,
          `buff「${buff.name ?? buff.id}」叠满 ${stacks} 层后 ${attr} +${Math.round(stacked)}，超出上限 ${limit.max}`,
          { field: `attributes.${attr}.value`, value: Math.round((limit.max / (perStack ? stacks : 1)) * 100) / 100, label: `钳回（叠满恰好 ${limit.max}）` }))
      }
    }
  }
  return issues
}

/** 属性上限规则入口：attribute_limit 未配置时返回空；scope 未开或数据缺失时对应检查跳过 */
export function checkAttributeLimits(ctx: ValidationContext): ValidationIssue[] {
  const cfg = ctx.attributeLimit
  if (!cfg) return []
  const scopes = cfg.checkScopes ?? ['playerMax', 'equipAffix', 'buffStacked']
  const issues: ValidationIssue[] = []
  if (scopes.includes('playerMax') && ctx.playerConfig) issues.push(...checkPlayerMax(cfg, ctx.playerConfig))
  if (scopes.includes('equipAffix') && ctx.equipmentAffixes) issues.push(...checkEquipAffix(cfg, ctx.equipmentAffixes))
  if (scopes.includes('buffStacked') && ctx.buffs) issues.push(...checkBuffStacked(cfg, ctx.buffs))
  return issues
}
