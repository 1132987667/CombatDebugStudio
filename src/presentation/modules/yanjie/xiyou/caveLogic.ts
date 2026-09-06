/**
 * 洞府 · 纯逻辑层
 *
 * 职责：物品名 ↔ items.json ID 索引、配方材料文本解析、强化/升星数值、
 *       碎片合成规则。组件只消费本层导出，不内联解析逻辑。
 */
import type { XiyouCatalogItem, XiyouQuality } from './types'
import itemsJson from '@configs/xiyou/items.json'
import equipmentSystemJson from '@configs/xiyou/equipment/equipment-system.json'
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

/** 强化材料（槽位 → 材料映射值） */
export interface MaterialCost {
  name: string
  itemId: string
  count: number
}

/** 装备槽位 → 强化材料（设计：武器异矿 / 衣甲灵气·强化 / 头盔/靴子/护符/护手 灵水） */
const ENHANCE_MATERIAL_BY_SLOT: Record<string, MaterialCost> = {
  weapon: { name: '异矿', itemId: 'mat_yikuang', count: 1 },
  armor: { name: '灵气·强化', itemId: 'mat_lingqi', count: 1 },
  helmet: { name: '灵水', itemId: 'mat_lingshui', count: 1 },
  boots: { name: '灵水', itemId: 'mat_lingshui', count: 1 },
  charm: { name: '灵水', itemId: 'mat_lingshui', count: 1 },
  glove: { name: '灵水', itemId: 'mat_lingshui', count: 1 },
}

export function enhanceMaterialOf(slot: string): MaterialCost | null {
  return ENHANCE_MATERIAL_BY_SLOT[slot] ?? null
}

/** 强化成功率：分档制（P0 裁定，失败不降级）——+1~+5:80%、+6~+10:70%、+11~+15:60%；上限 +15（equipment-system.json enhance_max_by_tier），超限输入属非法，clamp 最高档 */
export function enhanceSuccessRate(enhance: number): number {
  if (enhance <= 5) return 80
  if (enhance <= 10) return 70
  return 60
}

/** 强化上限按阶位（equipment-system.json enhance_max_by_tier：凡+3 玄+6 地+9 天+12 仙+15） */
const ENHANCE_MAX_BY_TIER = (equipmentSystemJson as unknown as { enhance_max_by_tier: Record<string, number> }).enhance_max_by_tier
const TIER_KEY_BY_RARITY: Record<number, string> = { 1: 'fan', 2: 'xuan', 3: 'di', 4: 'tian', 5: 'xian' }

export function enhanceMaxByRarity(rarity: number): number {
  return ENHANCE_MAX_BY_TIER[TIER_KEY_BY_RARITY[rarity] ?? 'fan'] ?? 5
}

/** 强化金钱单价按阶位（凡/玄/地/天/仙 → 20/50/100/150/200 铜钱 × 强化次数） */
const ENHANCE_COST_BY_RARITY: Record<number, number> = { 1: 20, 2: 50, 3: 100, 4: 150, 5: 200 }

/** 强化金钱消耗：阶位单价 × (强化前等级 + 1)，即第 n 次强化花 单价×n */
export function enhanceCost(enhance: number, rarity: number): number {
  return (ENHANCE_COST_BY_RARITY[rarity] ?? 20) * (enhance + 1)
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
 *  点源 = 升星石（上3/中2/下1 点）+ 装备残魂 decomp_soul（1 点/个）+ 同名未穿戴装备（1 点/件），可混合支付（§21 装备养成操作与材料）。 */
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

/** 升星石点数（附录B 升星石·上/中/下 → 3/2/1 点，贪心支付不溢出） */
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
  directed: '定向洗练石',
  locked: '锁词条符',
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
