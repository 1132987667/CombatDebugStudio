/**
 * gearTooltip.ts — 装备实例悬浮卡数据（PRD §21 三属性分组：核心/主要/附加；空组不显示）
 *
 * NOTE: EquipPanel 与行囊 PackItemCard（gear 模式）共用此单一组装源，
 *       避免同一实例在两处面板长出两套悬浮信息。
 */
import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import type { EquipmentStatEntry } from '@/domain/fengshen/types'
import type { GearInstance } from '@/presentation/stores/packStore'
import { attrShortName } from '@/domain/fengshen/equipment-overview'
import { qualityColor, qualityLabel, qualityOf } from './quality'
import type { StatCondition } from './statFilter'

/** 悬浮卡组装所需的最小 store 接口（避免整 store 类型循环依赖） */
export interface GearTooltipSource {
  gearById: (itemId: string) => { slot: string; subType?: string; source?: string; description?: string } | undefined
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

export function gearTooltipData(
  pack: GearTooltipSource,
  slotLabels: Record<string, string>,
  g: GearTooltipView,
  conditions: readonly StatCondition[] = [],
): TooltipData {
  const def = pack.gearById(g.itemId)
  const groups = pack.instanceStatGroups(g)
  const rowsOf = (list: EquipmentStatEntry[]) =>
    list.map((s) => ({
      label: attrShortName(s.attribute),
      value: `${s.value >= 0 ? '+' : ''}${s.value}${s.modifierType === 'percent' ? '%' : ''}`,
      accent: conditions.length > 0 && rowAccented(s, conditions),
    }))
  const section = (label: string) => ({ label, value: '', section: true })
  const grouped = (label: string, list: EquipmentStatEntry[]) =>
    list.length ? [section(label), ...rowsOf(list)] : []
  return {
    name: g.name,
    description: def?.description ?? '暂无描述',
    badge: qualityOf(g.rarity),
    nameColor: qualityColor(g.rarity),
    badgeColor: qualityColor(g.rarity),
    durationLabel: def ? pack.subTypeLabel(def.slot, def.subType) : undefined,
    details: [
      { label: '部位', value: def ? (slotLabels[def.slot] ?? def.slot) : '未知' },
      { label: '品质', value: qualityLabel(g.quality, g.qualityFactor) },
      { label: '强化', value: g.enhance > 0 ? `+${g.enhance}` : '未强化' },
      ...grouped('核心属性', groups.core),
      ...grouped('主要属性', groups.main),
      ...grouped('附加属性', groups.extra),
    ],
    source: def?.source,
  }
}
