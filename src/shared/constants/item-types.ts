/**
 * 物品类型常量定义
 *
 * 统一物品类型分类，避免各模块重复声明。
 * 数据来源：configs/xiyou/items.json
 */

/** 基础材料类型（自然资源） */
export const BASE_MATERIAL_TYPES = [
  '木材', '矿石', '金属', '玉石', '水产',
  '皮革', '织物', '陶瓷', '古董', '液体', '毒物',
] as const

/** 特殊材料类型 */
export const SPECIAL_MATERIAL_TYPES = [
  '特殊材料', 'BOSS材料', '灵气', '晶球',
] as const

/** 功能性物品类型（强化/升级/合成相关） */
export const FUNCTIONAL_ITEM_TYPES = [
  '碎片', '强化', '升星', '精锻', '洗炼', '重铸', '传承', '分解',
  '突破', '技能书', '经验', '图纸',
] as const

/** 消耗品类型 */
export const CONSUMABLE_TYPES = [
  '货币', '草药', '药引', '种子',
] as const

/** 材料域完整白名单（封神榜 derive-materials 使用） */
export const MATERIAL_DOMAIN_TYPES = [
  ...BASE_MATERIAL_TYPES,
  ...SPECIAL_MATERIAL_TYPES,
  '碎片',
  ...CONSUMABLE_TYPES,
] as const

/** 调试用完整物品类型集合（debugActions 使用，包含所有功能性类型） */
export const ALL_ITEM_TYPES_SET = new Set<string>([
  ...BASE_MATERIAL_TYPES,
  ...SPECIAL_MATERIAL_TYPES,
  ...FUNCTIONAL_ITEM_TYPES,
])

/** 类型导出 */
export type BaseMaterialType = typeof BASE_MATERIAL_TYPES[number]
export type SpecialMaterialType = typeof SPECIAL_MATERIAL_TYPES[number]
export type FunctionalItemType = typeof FUNCTIONAL_ITEM_TYPES[number]
export type ConsumableType = typeof CONSUMABLE_TYPES[number]
