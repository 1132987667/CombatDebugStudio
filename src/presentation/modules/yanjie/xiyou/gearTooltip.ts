/**
 * gearTooltip.ts — 装备实例悬浮卡数据（PRD §21 三属性分组：核心/主要/附加；空组不显示）
 *
 * NOTE: EquipPanel 与行囊 PackItemCard（gear 模式）共用此单一组装源，
 *       避免同一实例在两处面板长出两套悬浮信息。
 */
import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import type { EquipmentStatEntry } from '@/domain/fengshen/types'
import { equipRollParams, type GearInstance } from '@/presentation/stores/packStore'
import { attrShortName, resolveAttrRange } from '@/domain/fengshen/equipment-overview'
import { TIER_TO_QUALITY } from '@/domain/fengshen/gear-generate'
import { enhanceFactor, gearDisplayName, starFactor } from './caveLogic'
import { qualityColor, qualityLabel, qualityOf } from './quality'
import type { StatCondition } from './statFilter'

/** 悬浮卡组装所需的最小 store 接口（避免整 store 类型循环依赖） */
export interface GearTooltipSource {
  gearById: (itemId: string) => { slot: string; subType?: string; tier?: string; itemLevel?: number; source?: string; description?: string } | undefined
  instanceStatGroups: (g: GearInstance) => { core: EquipmentStatEntry[]; main: EquipmentStatEntry[]; extra: EquipmentStatEntry[] }
  subTypeLabel: (slot: string, subType?: string) => string
}

/** 悬浮卡输入的装备实例视图（含装备定义名与品级） */
export type GearTooltipView = GearInstance & { name: string; rarity: number }

/** 属性行是否命中筛选条件：任一条件在该属性同口径上成立即高亮（与列表过滤同口径；'has' 恒成立） */
function rowAccented(
  row: EquipmentStatEntry,
  conditions: readonly StatCondition[],
): boolean {
  return conditions.some(
    (cond) =>
      cond.attribute === row.attribute &&
      (row.modifierType === 'percent' ? 'pct' : 'flat') === cond.flavor &&
      (cond.op === 'has' || (cond.op === 'gte' ? row.value >= cond.value : row.value <= cond.value)),
  )
}

/**
 * 属性行值文本 = 当前值 + 该属性在本装备（子类型/品阶/等级）上的可能 roll 范围。
 * 口径与生成一致（resolveAttrRange = 品阶 × 浮动外包络，rollAttrValue 在其中取值）：
 * 核心条范围同乘品质系数与强化/升星倍率（与悬浮卡当前值口径一致），词条不吃养成。
 * 曲线缺口（source none，该属性不可投放）不显示范围。
 */
function valueWithRange(
  s: EquipmentStatEntry,
  g: GearTooltipView,
  def: ReturnType<GearTooltipSource['gearById']>,
  kind: 'core' | 'affix',
): string {
  const base = `${s.value >= 0 ? '+' : ''}${s.value}${s.modifierType === 'percent' ? '%' : ''}`
  if (!def) return base
  const { cfg, formula, conversion } = equipRollParams()
  const core = kind === 'core' ? cfg.core_affix_ratio?.[def.subType ?? def.slot] : undefined
  const range = resolveAttrRange(
    cfg,
    formula,
    conversion,
    s.attribute,
    Math.max(1, def.itemLevel ?? 1),
    TIER_TO_QUALITY[(def.tier ?? 't1') as keyof typeof TIER_TO_QUALITY] ?? 'fan',
    kind === 'core' ? formula.coreWeight : formula.affixWeight,
    kind === 'core' ? (core?.ratio ?? 1) : 1,
  )
  if (range.source === 'none') return base
  const scale = kind === 'core' ? g.qualityFactor * enhanceFactor(g.enhance) * starFactor(g.star ?? 0) : 1
  const fmt = (v: number): string =>
    s.modifierType === 'percent' ? String(Math.round(v * 10) / 10) : String(Math.round(v))
  return `${base}（${fmt(range.min * scale)}~${fmt(range.max * scale)}${s.modifierType === 'percent' ? '%' : ''}）`
}
export function gearTooltipData(
  pack: GearTooltipSource,
  slotLabels: Record<string, string>,
  g: GearTooltipView,
  conditions: readonly StatCondition[] = [],
): TooltipData {
  const def = pack.gearById(g.itemId)
  const groups = pack.instanceStatGroups(g)
  const rowsOf = (list: EquipmentStatEntry[], kind: 'core' | 'affix') =>
    list.map((s) => ({
      label: attrShortName(s.attribute),
      value: valueWithRange(s, g, def, kind),
      accent: conditions.length > 0 && rowAccented(s, conditions),
    }))
  const section = (label: string) => ({ label, value: '', section: true })
  const grouped = (label: string, list: EquipmentStatEntry[], kind: 'core' | 'affix') =>
    list.length ? [section(label), ...rowsOf(list, kind)] : []
  return {
    name: gearDisplayName(g.name, g.star),
    description: def?.description ?? '暂无描述',
    badge: qualityOf(g.rarity),
    nameColor: qualityColor(g.rarity),
    badgeColor: qualityColor(g.rarity),
    durationLabel: def ? pack.subTypeLabel(def.slot, def.subType) : undefined,
    details: [
      { label: '部位', value: def ? (slotLabels[def.slot] ?? def.slot) : '未知' },
      { label: '品质', value: qualityLabel(g.quality, g.qualityFactor) },
      ...(g.star > 0 ? [{ label: '星级', value: `+${g.star}（全属性 +${Math.round((starFactor(g.star) - 1) * 100)}%）` }] : []),
      ...(g.enhance > 0 ? [{ label: '强化', value: `+${g.enhance}` }] : []),
      ...grouped('核心属性', groups.core, 'core'),
      ...grouped('主要属性', groups.main, 'affix'),
      ...grouped('附加属性', groups.extra, 'affix'),
    ],
    source: def?.source,
  }
}
