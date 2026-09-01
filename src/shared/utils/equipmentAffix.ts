/**
 * equipmentAffix.ts — 装备词条纯函数（slotKey 校验 / 部位匹配 / 按部位抽池 / 数值随机）
 *
 * 词条库（equipment_affixes）独立于封神榜敌人词缀（affixes），词条 attribute 映射 attributes.json，
 * applicableSlots 用 slotKey 表达部位约束，装备生成词条（掉落/洗炼/重铸）只能从对应 slot/subType 池抽取。
 */

import type { EquipmentAffixData } from '@/domain/fengshen/types'

/** 装备部位枚举（与 equipment.json slot 字段一致） */
export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'helmet', 'boots', 'charm', 'glove'] as const

/** 部位 → 合法子类型（子类型为自由中文名，此处以 equipment.json 现有数据为权威枚举） */
export const SLOT_SUB_TYPES: Record<string, readonly string[]> = {
  weapon: ['轻型', '中型', '重型', '刺'],
  armor: ['皮甲', '木甲', '铠甲', '天衣'],
  helmet: ['头盔', '冠冕'],
  boots: ['靴子'],
  charm: ['护符'],
  glove: ['护手'],
}

/** 通配 slotKey：适用全部位 */
export const WILDCARD_SLOT = '*'

/** 校验 slotKey 合法性：'*' 通配 / 'weapon' 部位级 / 'weapon:轻型' 部位+子类型组合。返回错误信息，合法返回 null */
export function validateSlotKey(key: string): string | null {
  if (key === WILDCARD_SLOT) return null
  const [slot, subType] = key.split(':')
  if (!EQUIPMENT_SLOTS.includes(slot as (typeof EQUIPMENT_SLOTS)[number])) {
    return `非法部位「${slot}」（应为 ${EQUIPMENT_SLOTS.join('/')} 或 *）`
  }
  if (subType !== undefined && !SLOT_SUB_TYPES[slot].includes(subType)) {
    return `「${key}」子类型非法：${slot} 合法子类型为 ${SLOT_SUB_TYPES[slot].join('/')}`
  }
  return null
}

/** 词条是否适用于指定部位（* 通配 / 部位级匹配该部位全部子类型 / 部位+子类型精确匹配） */
export function affixAppliesTo(affix: EquipmentAffixData, slot: string, subType?: string): boolean {
  if (!affix.applicableSlots?.length) return false
  return affix.applicableSlots.some((key) => {
    if (key === WILDCARD_SLOT) return true
    const [s, st] = key.split(':')
    if (st === undefined) return s === slot
    return s === slot && st === subType
  })
}

/** 词条冲突类型：forbidden 该部位禁止抽取 / halved 该部位权重减半（不禁止） */
export type AffixConflictKind = 'forbidden' | 'halved'

/** 部位冲突规则（设计稿 v2.0 §14.9）—— 按 slot:subType 维度声明被禁止 / 权重减半的词条 attribute */
export interface EquipmentConflictRule {
  slot: string
  subType: string
  /** 禁止出现的词条 attribute（如 blockRate 格挡率） */
  forbidden?: string[]
  /** 权重减半的词条 attribute（不禁止） */
  halved?: string[]
}

/** 冲突规则表（设计稿 v2.0 §14.9）：
 * 轻型武器：格挡率禁止；重型武器：连击率权重减半（不禁止）；刺：连击率/连击伤害系数/破甲/易伤禁止；
 * 皮甲：格挡率禁止；铠甲：闪避率禁止；
 * 护符：暴击率、暴击伤害禁止；靴子：暴击伤害禁止。 */
export const EQUIPMENT_CONFLICT_RULES: EquipmentConflictRule[] = [
  { slot: 'weapon', subType: '轻型', forbidden: ['blockRate'] },
  { slot: 'weapon', subType: '刀', halved: ['comboRate'] },
  { slot: 'weapon', subType: '刺', forbidden: ['comboRate', 'comboDamageCoefficient', 'armorBreak', 'vulnerability'] },
  { slot: 'armor', subType: '皮甲', forbidden: ['blockRate'] },
  { slot: 'armor', subType: '铠甲', forbidden: ['dodge'] },
  { slot: 'charm', subType: '护符', forbidden: ['critRate', 'critDamage'] },
  { slot: 'boots', subType: '靴子', forbidden: ['critDamage'] },
]

/** 判定词条 attribute 在指定部位（slot + subType）的冲突类型；无冲突或未指定子类型返回 null */
export function affixConflictFor(
  slot: string,
  subType: string | undefined,
  attribute: string,
): AffixConflictKind | null {
  if (!subType) return null
  for (const rule of EQUIPMENT_CONFLICT_RULES) {
    if (rule.slot !== slot || rule.subType !== subType) continue
    if (rule.forbidden?.includes(attribute)) return 'forbidden'
    if (rule.halved?.includes(attribute)) return 'halved'
  }
  return null
}

/** 词条在指定部位的生效权重：禁止 → 0；权重减半 → 减半（保底 1，保持「不禁止」语义）；其余原样 */
export function affixEffectiveWeight(
  slot: string,
  subType: string | undefined,
  affix: Pick<EquipmentAffixData, 'attribute' | 'weight'>,
): number {
  const base = affix.weight ?? 0
  if (base <= 0) return 0
  const conflict = affixConflictFor(slot, subType, affix.attribute)
  if (conflict === 'forbidden') return 0
  if (conflict === 'halved') return Math.max(1, Math.floor(base / 2))
  return base
}

/** 从词条池中按 weight 加权随机抽取一条适用于指定 slot/subType 的词条。
 * 应用部位冲突规则（§14.9）：被禁止词条剔除、权重减半词条按减半后权重参与加权。
 * weight=0 视为不参与随机（与敌人词缀「天命」语义一致）；无可用词条、池为空或候选全为 weight=0 时返回 null */
export function rollEquipmentAffix(
  pool: readonly EquipmentAffixData[],
  slot: string,
  subType?: string,
  rng: () => number = Math.random,
): EquipmentAffixData | null {
  const candidates = pool.filter((a) => affixAppliesTo(a, slot, subType) && affixEffectiveWeight(slot, subType, a) > 0)
  if (candidates.length === 0) return null
  const weights = candidates.map((a) => affixEffectiveWeight(slot, subType, a))
  const total = weights.reduce((sum, w) => sum + w, 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]
    if (roll < 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

/** 在词条数值区间 [min,max] 内随机一个整数数值（区间无效时取 min） */
export function rollAffixValue(affix: EquipmentAffixData, rng: () => number = Math.random): number {
  const { min, max } = affix.valueRange
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return min
  return Math.round(min + rng() * (max - min))
}

/** 抽取词条并随机数值，产出与 equipment.json stats 条目一致的结构（可直接并入装备 stats） */
export function rollAffixStat(
  affix: EquipmentAffixData,
  rng: () => number = Math.random,
): { attribute: string; modifierType: 'flat' | 'percent'; value: number } {
  return {
    attribute: affix.attribute,
    modifierType: affix.modifierType,
    value: rollAffixValue(affix, rng),
  }
}
