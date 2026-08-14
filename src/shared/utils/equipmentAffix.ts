/**
 * equipmentAffix.ts — 装备词条纯函数（slotKey 校验 / 部位匹配 / 按部位抽池 / 数值随机）
 *
 * 词条库（equipment_affixes）独立于封神榜敌人词缀（affixes），词条 attribute 映射 attributes.json，
 * applicableSlots 用 slotKey 表达部位约束，装备生成词条（掉落/洗炼/重铸）只能从对应 slot/subType 池抽取。
 */

import type { EquipmentAffixData } from '@/domain/fengshen/types'

/** 装备部位枚举（与 equipment.json slot 字段一致） */
export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'] as const

/** 部位 → 合法子类型（子类型为自由中文名，此处以 equipment.json 现有数据为权威枚举） */
export const SLOT_SUB_TYPES: Record<string, readonly string[]> = {
  weapon: ['轻型', '中型', '重型'],
  armor: ['皮甲', '木甲', '铠甲', '天衣'],
  accessory: ['护符', '戒指', '项链', '腰带', '手镯', '冠冕'],
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

/** 从词条池中按 weight 加权随机抽取一条适用于指定 slot/subType 的词条。
 * weight=0 视为不参与随机（与敌人词缀「天命」语义一致）；无可用词条、池为空或候选全为 weight=0 时返回 null */
export function rollEquipmentAffix(
  pool: readonly EquipmentAffixData[],
  slot: string,
  subType?: string,
  rng: () => number = Math.random,
): EquipmentAffixData | null {
  const candidates = pool.filter((a) => affixAppliesTo(a, slot, subType) && (a.weight ?? 0) > 0)
  if (candidates.length === 0) return null
  const total = candidates.reduce((sum, a) => sum + (a.weight ?? 0), 0)
  let roll = rng() * total
  for (const affix of candidates) {
    roll -= affix.weight ?? 0
    if (roll < 0) return affix
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
