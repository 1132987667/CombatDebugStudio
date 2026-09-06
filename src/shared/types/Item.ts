/**
 * 物品类型枚举
 * 对应 materials.json 中的 type 字段
 * NOTE: 斗战西游物品分类（木材/矿石/金属/玉石/丹药/强化/灵气/碎片/货币等）为自由字符串，
 *       枚举保留通用二分（material/consumable）供旧消费方兼容，新数据直接使用语义化分类。
 */
export const ItemType = {
  MATERIAL: 'material', // 材料
  CONSUMABLE: 'consumable', // 消耗品
  EQUIPMENT: 'equipment', // 装备
  QUEST: 'quest', // 任务物品
}
export type ItemType = (typeof ItemType)[keyof typeof ItemType]

/**
 * 装备槽位枚举（8 类标准槽位）
 * 对应封神榜 equipment 表的 slot 字段，统一使用小写英文作为存储值
 */
export const EquipmentSlot = {
  WEAPON: 'weapon', // 武器
  ARMOR: 'armor', // 衣甲
  HELMET: 'helmet', // 头盔
  BOOTS: 'boots', // 靴子
  CHARM: 'charm', // 护符
  GLOVE: 'glove', // 护手
  ARTIFACT: 'artifact', // 法宝
  RELIC: 'relic', // 神器
}
export type EquipmentSlot = (typeof EquipmentSlot)[keyof typeof EquipmentSlot]

/** 装备槽位 → 中文显示名（标准 8 槽） */
export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  [EquipmentSlot.WEAPON]: '武器',
  [EquipmentSlot.ARMOR]: '衣甲',
  [EquipmentSlot.HELMET]: '头盔',
  [EquipmentSlot.BOOTS]: '靴子',
  [EquipmentSlot.CHARM]: '护符',
  [EquipmentSlot.GLOVE]: '护手',
  [EquipmentSlot.ARTIFACT]: '法宝',
  [EquipmentSlot.RELIC]: '神器',
}

/**
 * 物品效果定义
 * 用于消耗品或特殊物品
 */
export interface ItemEffect {
  /** 效果类型：如 heal（恢复气血）、mpRestore（恢复能量）、buff（施加增益）等 */
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
  /** 气血值加成（可选） */
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

  /** 物品类型（分类自由字符串：material/consumable 或语义化中文分类如 木材/丹药/强化） */
  type: string

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
