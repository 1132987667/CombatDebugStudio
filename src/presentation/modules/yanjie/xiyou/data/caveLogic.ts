/**
 * 洞府 · 纯逻辑层（无 Vue / Store 依赖，供单元测试）
 *
 * 职责：物品名 ↔ items.json ID 索引、配方材料文本解析、强化/升星数值、
 *       碎片合成规则。组件只消费本层导出，不内联解析逻辑。
 */
import type { XiyouCatalogItem, XiyouQuality } from './mock'
import itemsJson from '@configs/xiyou/items.json'
import { qualityOf as qualityByRarity } from './quality'

const ITEMS = itemsJson.items as unknown as XiyouCatalogItem[]

const idToItem = new Map<string, XiyouCatalogItem>()
const nameToId = new Map<string, string>()
for (const it of ITEMS) {
  idToItem.set(it.id, it)
  // 同名（如装备在 items/equipment 双注册）取首个，保证引用稳定
  if (!nameToId.has(it.name)) nameToId.set(it.name, it.id)
}

export function catalogById(itemId: string): XiyouCatalogItem | undefined {
  return idToItem.get(itemId)
}

export function itemIdByName(name: string): string | null {
  return nameToId.get(name) ?? null
}

export function itemName(itemId: string): string {
  return idToItem.get(itemId)?.name ?? itemId
}

/** items.json rarity 1-5 → 品质名（凡/玄/地/天/仙），映射源在 quality.ts 统一表 */
export function qualityOf(itemId: string): XiyouQuality {
  return qualityByRarity(idToItem.get(itemId)?.rarity ?? 1)
}

/** 装备槽位 → 强化材料（设计：武器异矿 / 衣服灵气·强化 / 饰品灵水） */
const ENHANCE_MATERIAL_BY_SLOT: Record<string, MaterialCost> = {
  武器: { name: '异矿', itemId: 'mat_enh_01', count: 1 },
  衣服: { name: '灵气·强化', itemId: 'mat_enh_03', count: 1 },
  头盔: { name: '灵水', itemId: 'mat_enh_02', count: 1 },
  靴子: { name: '灵水', itemId: 'mat_enh_02', count: 1 },
  护符: { name: '灵水', itemId: 'mat_enh_02', count: 1 },
  戒指: { name: '灵水', itemId: 'mat_enh_02', count: 1 },
}

export function enhanceMaterialOf(slot: string): MaterialCost | null {
  return ENHANCE_MATERIAL_BY_SLOT[slot] ?? null
}

/** 强化成功率：随等级递减，地板 50% */
export function enhanceSuccessRate(enhance: number): number {
  return Math.max(50, 100 - enhance * 5)
}

/** 强化金钱消耗：20 + 20×当前等级 */
export function enhanceCost(enhance: number): number {
  return 20 + enhance * 20
}

/** 装备属性提升倍率：每级 +5% */
export function enhanceFactor(level: number): number {
  return 1 + 0.05 * level
}

/** 重算 effect 文案："攻击 +24" + level=7 → "攻击 +25"（百分比保留 %） */
export function formatEffect(effect: string, level: number): string {
  const m = /^([^\d+-]*)([+-])(\d+(?:\.\d+)?)(%)?/.exec(effect)
  if (!m) return effect
  const prefix = m[1]
  const sign = m[2]
  const base = parseFloat(m[3])
  const isPercent = !!m[4]
  const next = Math.round(base * enhanceFactor(level))
  const suffix = isPercent ? '%' : ''
  return `${prefix}${sign}${next}${suffix}`
}

/** 升星消耗：当前星级 → 需魂玉数（0 星 1 颗，之后每星 +1） */
export function starCost(star: number): number {
  return star + 1
}

/** 升星上限 */
export const STAR_MAX = 5

/** 碎片合成规则（frag 碎片 → 完整物品，比例来自 items.json source 文案） */
export interface FragmentRule {
  fragId: string
  outId: string
  need: number
}

export const FRAGMENT_RULES: FragmentRule[] = [
  { fragId: 'frag_001', outId: 'ess_002', need: 10 },
  { fragId: 'frag_002', outId: 'ess_003', need: 10 },
  { fragId: 'frag_003', outId: 'elix_007', need: 5 },
  { fragId: 'frag_004', outId: 'mat_026', need: 5 },
]

/** 合成规则视图（带名称，供列表渲染；无引用断裂是 items.json 硬性约束） */
export interface FragmentRuleView extends FragmentRule {
  fragName: string
  outName: string
  outQuality: XiyouQuality
}

export function fragmentRuleViews(): FragmentRuleView[] {
  return FRAGMENT_RULES.map((r) => ({
    ...r,
    fragName: itemName(r.fragId),
    outName: itemName(r.outId),
    outQuality: qualityOf(r.outId),
  }))
}
