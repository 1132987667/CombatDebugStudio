/**
 * 共享显示映射 — 枚举值 → 中文标签
 *
 * 集中管理展示层的中文映射，避免每个组件各自定义一份 Record。
 * 键名优先使用现有枚举常量，无枚举覆盖的保留字符串字面量。
 */
import { EquipmentSlot } from '@/shared/types/Item'
import { ActionResultType } from '@/domain/skill/types'

// ───── 装备槽位 ─────

export const slotLabels: Record<string, string> = {
  [EquipmentSlot.WEAPON]: '武器',
  [EquipmentSlot.ARMOR]: '护甲',
  [EquipmentSlot.ACCESSORY]: '饰品',
  [EquipmentSlot.HELM]: '头盔',
  [EquipmentSlot.BOOTS]: '鞋子',
  [EquipmentSlot.RING]: '戒指',
  [EquipmentSlot.NECKLACE]: '项链',
  [EquipmentSlot.BRACELET]: '手镯',
  [EquipmentSlot.BELT]: '腰带',
}

export function getSlotText(slot: string): string {
  return slotLabels[slot] || slot
}

// ───── 物品类型 ─────

export const itemTypeLabels: Record<string, string> = {
  [EquipmentSlot.WEAPON]: '武器',
  [EquipmentSlot.ARMOR]: '防具',
  [EquipmentSlot.ACCESSORY]: '饰品',
  [EquipmentSlot.HELM]: '头盔',
  material: '材料',
  consumable: '消耗品',
  quest: '任务物品',
}

export function getItemTypeText(type: string): string {
  return itemTypeLabels[type] || type
}

// ───── 效果类型 ─────

export const effectTypeLabels: Record<string, string> = {
  [ActionResultType.HEAL]: '气血恢复',
  [ActionResultType.BUFF]: '增益效果',
  [ActionResultType.DAMAGE]: '伤害',
  mpRestore: '能量恢复',
  shield: '护盾',
}

export function getEffectTypeText(type: string): string {
  return effectTypeLabels[type] || type
}
