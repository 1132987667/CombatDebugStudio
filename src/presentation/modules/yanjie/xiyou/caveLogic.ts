/**
 * 洞府 · 纯逻辑层
 *
 * 职责：物品名 ↔ ID 索引（items.json + equipment.json 合并目录）、配方材料文本解析、
 *       强化/升星数值、碎片合成规则。组件只消费本层导出，不内联解析逻辑。
 */
import type { EquipmentData } from '@/domain/fengshen/types'
import { EquipmentSlot, EQUIPMENT_SLOT_LABELS } from '@/shared/types/Item'
import type { XiyouCatalogItem, XiyouQuality } from './types'
import itemsJson from '@configs/xiyou/items.json'
import equipmentJson from '@configs/equipment/equipment.json'
import equipmentSystemJson from '@configs/xiyou/equipment/equipment-system.json'
import { qualityOf as qualityByRarity } from './quality'

/** 装备目录条目：由 equipment.json 派生（装备详情唯一数据源；原 items.json 重复内联的
 *  158 条装备 name/rarity/value 已删除，type 按 slot 映射中文） */
const EQUIPMENT_CATALOG: XiyouCatalogItem[] = (equipmentJson as unknown as EquipmentData[]).map((e) => ({
  id: e.id,
  name: e.name,
  type: EQUIPMENT_SLOT_LABELS[e.slot] ?? e.slot,
  rarity: e.rarity,
  value: e.value,
  source: e.source,
  description: e.description,
}))

/** 物品全量目录：items.json（非装备物品）+ 装备派生条目（行囊展示 / 名字索引共用） */
export const catalogItems: XiyouCatalogItem[] = [
  ...(itemsJson.items as unknown as XiyouCatalogItem[]),
  ...EQUIPMENT_CATALOG,
]

const ITEMS = catalogItems

const idToItem = new Map<string, XiyouCatalogItem>()
const nameToId = new Map<string, string>()
for (const it of ITEMS) {
  idToItem.set(it.id, it)
  // 同名取首个，保证引用稳定
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

/** 强化材料（槽位 → 材料映射值） */
export interface MaterialCost {
  name: string
  itemId: string
  count: number
}

/** 配方材料行（丹炉/炼器/符纸面板共用的展示行：持有量与是否够用） */
export interface MatView {
  name: string
  count: number
  have: number
  enough: boolean
}

/** 强化材料：统一强化石（六部位/全品阶通用；2026-09-06 裁定）
 *  消耗 = 目标强化等级 L（当前 enhance + 1），线性增长（§21 装备强化） */
const ENHANCE_STONE_ID = 'enh_stone'

export function enhanceMaterialOf(enhance: number): MaterialCost {
  return { name: '强化石', itemId: ENHANCE_STONE_ID, count: enhance + 1 }
}

/** 强化成功率（%）：P = min(100, max(40, 100 − 5×(L−1)) + 10×F)
 *  L = 目标强化等级（当前 enhance + 1），F = 连败次数（成功清零；失败 +1）。
 *  保底：+15 基础 40%，失败 6 次后 100%，即最多尝试 7 次必成（§21 装备强化）。失败不降级。 */
export function enhanceSuccessRate(enhance: number, failStreak = 0): number {
  const L = enhance + 1
  return Math.min(100, Math.max(40, 100 - 5 * (L - 1)) + 10 * failStreak)
}

/** 强化上限按阶位（equipment-system.json enhance_max_by_tier：凡+3 玄+6 地+9 天+12 仙+15） */
const ENHANCE_MAX_BY_TIER = (equipmentSystemJson as unknown as { enhance_max_by_tier: Record<string, number> }).enhance_max_by_tier
const TIER_KEY_BY_RARITY: Record<number, string> = { 1: 'fan', 2: 'xuan', 3: 'di', 4: 'tian', 5: 'xian' }

export function enhanceMaxByRarity(rarity: number): number {
  return ENHANCE_MAX_BY_TIER[TIER_KEY_BY_RARITY[rarity] ?? 'fan'] ?? 5
}

/** 强化品阶系数 K（凡/玄/地/天/仙 → 1.0/1.2/1.4/1.6/1.8，§21 装备强化） */
const ENHANCE_TIER_K: Record<number, number> = { 1: 1, 2: 1.2, 3: 1.4, 4: 1.6, 5: 1.8 }

/** 强化金钱消耗：⌊50 × L² × K⌋（L = 目标强化等级 = 当前 enhance + 1；二次方增长，品阶越高倍数越大） */
export function enhanceCost(enhance: number, rarity: number): number {
  const L = enhance + 1
  return Math.floor(50 * L * L * (ENHANCE_TIER_K[rarity] ?? 1))
}

/** 装备属性提升倍率：每级 +4%（§21 装备强化：4%/级 × 上限+15 = 总效果 60%，锚定 §18 养成权重 强化15(1.6)） */
export function enhanceFactor(level: number): number {
  return 1 + 0.04 * level
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

/** 升星残魂点需求：升到 targetStar 星的本次消耗 = 配置累计值差值（cost_by_star 3/6/9 → 每星 3 点）。
 *  点源 = 破境耀星石（上3/中2/下1 点）+ 兵解残魄晶 decomp_soul（1 点/个）+ 同名未穿戴装备（1 点/件），可混合支付（§21 装备养成操作与材料）。 */
const STAR_COST_BY_STAR = (equipmentSystemJson as unknown as { star_system: { cost_by_star: Record<string, number> } }).star_system.cost_by_star

export function starCost(targetStar: number): number {
  const total = (n: number): number => (n <= 0 ? 0 : (STAR_COST_BY_STAR[String(n)] ?? n * 3))
  return total(targetStar) - total(targetStar - 1)
}

/** 升星上限（§21：星级 0-3，全品阶可升星；加成 +5%/+10%/+10% 累计 25%） */
export const STAR_MAX = 3

/** 升星属性倍率：+5%/+10%/+10%（累计 5/15/25%，§21 装备升星表；旧「每星 +10%」口径作废） */
const STAR_FACTOR = [1, 1.05, 1.15, 1.25] as const

export function starFactor(star: number): number {
  return STAR_FACTOR[Math.min(Math.max(star, 0), STAR_MAX)]!
}

/** 破境耀星石点数（附录B 破境耀星石·上/中/下 → 3/2/1 点，贪心支付不溢出） */
export const STAR_STONES: ReadonlyArray<readonly [string, number]> = [
  ['star_up_high', 3],
  ['star_up_mid', 2],
  ['star_up_low', 1],
]

// ════════════ 洗练（更换词条）════════════

export type WashMode = 'normal' | 'directed' | 'locked'

/** 洗练材料（§21 装备养成操作与材料；「精洗石/锁词符/洗髓液/天命洗炼符」已裁定作废/不采纳） */
export const WASH_MATERIALS: Record<WashMode, string> = {
  normal: 'wash_stone',
  directed: 'wash_directed',
  locked: 'wash_lock',
}

export const WASH_MATERIAL_NAMES: Record<WashMode, string> = {
  normal: '洗练石',
  directed: '天衍定元玉',
  locked: '九宫锁灵印',
}

/** 洗练金钱：每档统一 200 金/次 */
export const WASH_COST_GOLD = 200

/** 洗练开放品质（§8.4.4 洗练权限：凡 普通起 / 精 定向起 / 超 锁词条起，绝/神全开） */
export function washAllowed(mode: WashMode, quality: number): boolean {
  if (mode === 'normal') return true
  if (mode === 'directed') return quality >= 2
  return quality >= 3
}

/** 碎片合成规则（frag 碎片 → 完整物品，比例来自 items.json source 文案） */
export interface FragmentRule {
  fragId: string
  outId: string
  need: number
}

export const FRAGMENT_RULES: FragmentRule[] = [
  { fragId: 'mat_tiangang_suipian', outId: 'mat_tiangang', need: 3 },
  { fragId: 'mat_hunyuan_suipian', outId: 'mat_hunyuan', need: 5 },
  { fragId: 'frag_003', outId: 'mat_jiuzhuan_jindan', need: 5 },
  { fragId: 'frag_004', outId: 'mat_yufoxiang', need: 5 },
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
