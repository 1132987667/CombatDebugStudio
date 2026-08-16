/**
 * derive-materials.ts — 从物品主键索引（items 表）派生封神榜「材料」域
 *
 * materials.json 已合并入 configs/xiyou/items.json，封神榜 materials 表不再独立读配置文件，
 * 由 seed / ConfigDataSource 统一经本函数从 items 表派生。
 * 过滤口径 = 材料域 type 白名单（对齐 schema.ts materials 表 type 枚举），
 * 天然排除特殊/BOSS/强化材料与装备/图纸等（其 type 不在白名单内）。
 */

import type { Item } from '@/shared/types/Item'
import type { ItemData } from '@/domain/fengshen/types'

/** 材料域 type 白名单（对齐 schema.ts materials 表 type 枚举；丹药为消耗品，不归入材料） */
const MATERIAL_TYPES = ['木材', '矿石', '金属', '玉石', '水产', '皮革', '织物', '陶瓷', '古董', '液体', '毒物', '灵气', '晶球', '碎片', '货币', '草药', '药引', '种子']

export function deriveMaterials(items: ItemData[]): Item[] {
  return items
    .filter((it) => MATERIAL_TYPES.includes(it.type))
    .map((it) => ({
      id: it.id,
      name: it.name,
      type: it.type,
      rarity: it.rarity,
      description: it.description ?? '',
      usage: it.usage ?? '',
      ...(it.effects ? { effects: it.effects } : {}),
    }))
}
