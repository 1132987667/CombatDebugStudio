/**
 * 物品类型枚举
 * 对应 materials.json 中的 type 字段
 */
export enum ItemType {
  MATERIAL = 'material', // 材料
  CONSUMABLE = 'consumable', // 消耗品
  EQUIPMENT = 'equipment', // 装备
  QUEST = 'quest', // 任务物品
}

/**
 * 装备槽位枚举
 */
export enum EquipmentSlot {
  WEAPON = 'weapon', // 武器
  ARMOR = 'armor', // 护甲
  ACCESSORY = 'accessory', // 饰品
  HELM = 'helm', // 头盔
  BOOTS = 'boots', // 鞋子
  RING = 'ring', // 戒指
  NECKLACE = 'necklace', // 项链
  BRACELET = 'bracelet', // 手镯
  BELT = 'belt', // 腰带
}

/**
 * 物品效果定义
 * 用于消耗品或特殊物品
 */
export interface ItemEffect {
  /** 效果类型：如 heal（恢复生命）、mpRestore（恢复能量）、buff（施加增益）等 */
  type: string
  /** 效果数值 */
  value: number
  /** 可选，效果持续时间（回合数） */
  duration?: number
  /** 可选，效果ID（若为buff） */
  buffId?: string
}

/**
 * 装备属性加成
 * 对应 equipment 类型物品的 stats 字段
 */
export interface EquipmentStats {
  /** 攻击力加成（可选） */
  attack?: number
  /** 防御力加成（可选） */
  defense?: number
  /** 速度加成（可选） */
  speed?: number
  /** 生命值加成（可选） */
  health?: number
  /** 暴击率加成（可选，百分比） */
  critRate?: number
  /** 暴击伤害加成（可选，百分比） */
  critDamage?: number
  /** 其他自定义属性 */
  [key: string]: number | undefined
}

export const rarityNames = ['普通', '稀有', '史诗', '传说']

/**
 * 物品基础接口
 * 所有物品都应包含以下字段
 */
export interface Item {
  /** 物品唯一标识符（对应配置中的 id） */
  id: string

  /** 物品名称 */
  name: string

  /** 物品类型 */
  type: ItemType

  /** 物品描述 */
  description: string

  /** 稀有度（1-4，1普通，2稀有，3史诗，4传说） */
  rarity: number

  /** 物品效果列表（仅 consumable 类型有） */
  effects?: ItemEffect[]

  /** 装备属性加成（仅 equipment 类型有） */
  stats?: EquipmentStats

  /** 装备槽位（仅 equipment 类型有） */
  slot?: EquipmentSlot

  /** 图标路径（可选） */
  icon?: string

  /** 堆叠上限（可选，默认1） */
  maxStack?: number

  /** 是否可出售（可选） */
  sellable?: boolean

  /** 出售价格（可选） */
  price?: number

  /** 物品数量（默认1） */
  quantity?: number
}

/**
 * 类型守卫：判断是否为装备
 */
export function isEquipment(
  item: Item,
): item is Item & { slot: EquipmentSlot; stats: EquipmentStats } {
  return item.type === ItemType.EQUIPMENT && !!item.slot
}

/**
 * 类型守卫：判断是否为消耗品
 */
export function isConsumable(
  item: Item,
): item is Item & { effects: ItemEffect[] } {
  return item.type === ItemType.CONSUMABLE && !!item.effects
}
