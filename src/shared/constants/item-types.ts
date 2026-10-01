/**
 * 物品类型常量定义
 *
 * 统一物品类型分类，避免各模块重复声明。
 * 数据来源：configs/xiyou/items.json
 *
 * 两份清单各司其职：
 * - ITEM_CATEGORIES 分类树：「类型 → 大类」归属的唯一清单，展示层单源——
 *   封神榜 items 表枚举/筛选器（schema.ts）与行囊页签大类（PackPane.vue）均从此派生。
 * - MATERIAL_DOMAIN_TYPES 材料域白名单：运行时行为契约（derive-materials 按它过滤），
 *   成员集合有精确语义，勿按展示需要增删。
 */
import itemsDataRaw from '@configs/xiyou/items.json'
import { EQUIPMENT_SLOT_LABELS } from '@/shared/types/Item'

/**
 * 物品大类分类树（type → 大类，展示层单源）。
 *
 * 新增物品类型先在此登记、再实配 items.json——顺序反了的话 item-types-closure
 * 测试会失败（封神榜筛选器将选不出该类型的物品）。
 * 组序即下拉分组序 / 行囊页签序；组内 types 序即枚举选项序。
 */
export const ITEM_CATEGORIES = [
  { id: 'equip', label: '装备', types: [...Object.values(EQUIPMENT_SLOT_LABELS)] },
  { id: 'consumable', label: '消耗', types: ['丹药', '永久丹药', '养成丹药', '经验丹', '符箓', '卷轴', '药引'] },
  { id: 'material', label: '材料', types: [
    '木材', '矿石', '金属', '玉石', '水产', '皮革', '织物', '陶瓷', '天材地宝', '液体', '毒物',
    '特殊矿石', '特殊材料', '首领材料', '图纸', '草药', '种子', '制造辅助',
  ] },
  { id: 'essence', label: '灵气', types: ['灵气', '碎片'] },
  // '洗练'（items.json 实配）与 '洗炼'（封神榜历史数据写法）为双写，归属同组兜住两种键
  { id: 'enhance', label: '强化', types: ['强化', '升星', '洗练', '洗炼', '重铸', '传承', '分解', '突破', '技能书', '经验'] },
  { id: 'misc', label: '杂物', types: ['货币', '杂物', '钥匙', '门票', '任务', '器灵', '套装烙印', '功能道具', '宠物养成', '宝箱'] },
] as const

/** 大类 id（行囊页签 / 筛选器分组共用） */
export type ItemCategoryId = (typeof ITEM_CATEGORIES)[number]['id']

/** 全部已登记类型（flatten；组序即选项序）——schema ITEM_TYPE_ENUM 的单源 */
export const ALL_DECLARED_ITEM_TYPES: readonly string[] =
  ITEM_CATEGORIES.flatMap((c) => [...c.types])

/** 类型 → 大类名（下拉分组头；schema TableFilter.valueGroup 的单源） */
export const ITEM_TYPE_CATEGORY: Readonly<Record<string, string>> = Object.fromEntries(
  ITEM_CATEGORIES.flatMap((c) => c.types.map((t) => [t, c.label] as const)),
)

/**
 * 材料域完整白名单（封神榜 derive-materials 使用）。
 * NOTE: 这是运行时行为契约——扩大集合会让非材料物品混进封神榜材料推导，
 * 与分类树的「材料」组（含图纸/制造辅助等）刻意不同，两份清单不互相派生。
 */
export const MATERIAL_DOMAIN_TYPES = [
  '木材', '矿石', '金属', '玉石', '水产', '皮革', '织物', '陶瓷', '天材地宝', '液体', '毒物',
  '特殊材料', '首领材料', '灵气', '碎片', '货币', '草药', '药引', '种子',
] as const

/** 调试用完整物品类型集合（debugActions 使用）——从 items.json 实配 type 派生，
 *  手写清单必与数据漂移（曾漏'洗练'/'经验丹'等 20 种实配类型），故以数据为单一来源 */
export const ALL_ITEM_TYPES_SET = new Set<string>(
  ((itemsDataRaw as { items: Array<{ type: string }> }).items ?? []).map((it) => it.type),
)
