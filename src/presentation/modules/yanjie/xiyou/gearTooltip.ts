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
import { qualityColor, qualityName, qualityOf } from './quality'

/** 悬浮卡组装所需的最小 store 接口（避免整 store 类型循环依赖） */
export interface GearTooltipSource {
  gearById: (itemId: string) => { slot: string; subType?: string; source?: string; description?: string } | undefined
  instanceStatGroups: (g: GearInstance) => { core: EquipmentStatEntry[]; main: EquipmentStatEntry[]; extra: EquipmentStatEntry[] }
  subTypeLabel: (slot: string, subType?: string) => string
}

/** 悬浮卡输入的装备实例视图（含装备定义名与品级） */
export type GearTooltipView = GearInstance & { name: string; rarity: number }

/** 单条属性文案："攻击 +16" / "连击率 +5%" */
export function statText(s: EquipmentStatEntry): string {
  const suffix = s.modifierType === 'percent' ? '%' : ''
  return `${attrShortName(s.attribute)} ${s.value >= 0 ? '+' : ''}${s.value}${suffix}`
}

/** 品质系数文案：×0.85（百分数展示，保留两位小数） */
export function factorText(factor: number): string {
  return (Math.round(factor * 100) / 100).toFixed(2)
}

export function gearTooltipData(
  pack: GearTooltipSource,
  slotLabels: Record<string, string>,
  g: GearTooltipView,
): TooltipData {
  const def = pack.gearById(g.itemId)
  const groups = pack.instanceStatGroups(g)
  const rowsOf = (list: EquipmentStatEntry[]) =>
    list.map((s) => ({
      label: attrShortName(s.attribute),
      value: `${s.value >= 0 ? '+' : ''}${s.value}${s.modifierType === 'percent' ? '%' : ''}`,
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
      { label: '品质', value: `${qualityName(g.quality)} · ×${factorText(g.qualityFactor)}` },
      { label: '强化', value: g.enhance > 0 ? `+${g.enhance}` : '未强化' },
      ...grouped('核心属性', groups.core),
      ...grouped('主要属性', groups.main),
      ...grouped('附加属性', groups.extra),
    ],
    source: def?.source,
  }
}
