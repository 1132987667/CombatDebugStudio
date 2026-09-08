/**
 * items-json.ts — items.json 的共享层数据出口（与 buffs-json.ts 同模式）
 *
 * 供引擎侧（如 BattleSystem.executeItem）按 id 查询物品定义；
 * UI 侧的目录/背包仍走 xiyouData / packStore，不经过此处。
 */
import itemsDataRaw from '@configs/xiyou/items.json'

/** 物品效果（战斗可解析子集：heal=百分比最大气血 / energy=固定能量 / buff=标准 Buff 管线） */
export interface BattleItemEffect {
  type: string
  value?: number
  buffId?: string
}

export interface XiyouItemDef {
  id: string
  name: string
  type: string
  rarity?: number
  /** 战斗效果声明（无 effects 的物品不可在战斗中使用） */
  effects?: BattleItemEffect[]
  /** 使用场景标注（含「战斗」方可战斗中使用的白名单依据） */
  usage?: string
  description?: string
}

export const itemsData: XiyouItemDef[] = (itemsDataRaw as { items: XiyouItemDef[] }).items

export function getItemDef(itemId: string): XiyouItemDef | undefined {
  return itemsData.find((i) => i.id === itemId)
}
