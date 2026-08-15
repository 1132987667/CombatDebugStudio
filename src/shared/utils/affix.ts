/**
 * affix.ts — 词缀应用工具（纯函数，可测）
 *
 * 将词缀（AffixData）的属性修正注入到参战角色（BattleEntity）对应属性的
 * PERCENTAGE 修饰符上，复用属性系统的 modifier 注入模式，属性拆解可见来源。
 * 「随机词缀」按钮复用本工具：随机为参战角色附加若干词缀。
 */

import type { BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE, getAttrMeta, ModifierSourceType, ModifierType } from '@/domain/attribute/types'
import type { AffixData } from '@/domain/fengshen/types'
import { AffixTier, type AffixTier as AffixTierType } from '@/shared/constants/affix'
import type { EnemyAffixPool } from '@/shared/types/enemy'

/** 应用结果：角色 id → 已附加的词缀 id 列表 */
export type AffixApplyResult = Map<string, string[]>

/** buffTier 数字 → 词缀档位（对齐设计稿 §7：0 无、1-4 → yao_1~4、5 → mandate） */
const BUFF_TIER_TO_TIER: Record<number, AffixTierType> = {
  1: AffixTier.YAO_1,
  2: AffixTier.YAO_2,
  3: AffixTier.YAO_3,
  4: AffixTier.YAO_4,
  5: AffixTier.MANDATE,
}

/**
 * 按敌人 affixPool 解析其可获得的词缀池与数量。
 * - 天命绑定优先：enemy.id 命中 mandate_bindings → 直接附加绑定天命词缀（不可随机），
 *   不依赖 buffTier 判定（数据两处维护，绑定表是唯一权威）
 * - buffTier 0 / 缺省 → 无词缀（返回 null）
 * - buffTier 1-4 → 对应增益档位池（target=enemy），数量取 count（缺省 1）
 * - buffTier 5 → 天命：未命中绑定表则无词缀（天命不可随机）
 */
export function resolveAffixPlan(
  enemy: { id: string; affixPool?: EnemyAffixPool },
  affixes: readonly AffixData[],
  mandateBindings: ReadonlyMap<string, string>,
): { pool: AffixData[]; count: number } | null {
  // 天命绑定优先：绑定表命中即附加，buffTier 是否 5 不再作为判定条件
  const mandateId = mandateBindings.get(enemy.id)
  if (mandateId) {
    const mandate = affixes.find((a) => a.id === mandateId)
    return mandate ? { pool: [mandate], count: 1 } : null
  }
  const buffTier = enemy.affixPool?.buffTier ?? 0
  if (buffTier <= 0) return null
  const tier = BUFF_TIER_TO_TIER[buffTier]
  if (!tier || tier === AffixTier.MANDATE) return null
  const pool = affixes.filter((a) => a.tier === tier && a.target === 'enemy')
  if (pool.length === 0) return null
  return { pool, count: enemy.affixPool?.count ?? 1 }
}

/** 从池中随机附加 count 个词缀（洗牌 + conflict_group 冲突过滤），返回实际附加的词缀 id */
function pickAndApplyAffixes(
  participant: BattleEntity,
  pool: readonly AffixData[],
  count: number,
  rng: () => number,
): string[] {
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  const assigned: string[] = []
  const usedGroups = new Set<string>()
  for (let i = 0; i < count && i < shuffled.length; i++) {
    const affix = shuffled[i]
    if (affix.conflict_group && usedGroups.has(affix.conflict_group)) continue
    if (applyAffixToParticipant(participant, affix)) {
      assigned.push(affix.id)
      if (affix.conflict_group) usedGroups.add(affix.conflict_group)
    }
  }
  return assigned
}

/**
 * 清除角色身上全部词缀修饰符（sourceKey 前缀 `affix:`）。
 * 用于「随机词缀」重新附加前先移除旧词缀，避免重复累积。
 * @returns 是否清除了至少一个词缀修饰符
 */
export function clearAffixesFromParticipant(
  participant: BattleEntity,
): boolean {
  let cleared = false
  for (const code of Object.values(ATTRIBUTE_CODE)) {
    const attrValue = participant.getAttrValue(code)
    if (!attrValue) continue
    const before = attrValue.modifiers.length
    attrValue.modifiers = attrValue.modifiers.filter(
      (m) => !m.sourceKey.startsWith('affix:'),
    )
    if (attrValue.modifiers.length !== before) cleared = true
  }
  if (cleared) participant.recalcAll()
  return cleared
}

/**
 * 将单个词缀的属性修正注入参战角色。
 * 每个 statModifier 写入对应属性修饰符（value 为百分数，如 20 表示 +20%）。
 * 修饰符类型规则（防 isPercentage×PERCENTAGE 无效组合）：
 * - 配置显式声明 type → 以配置为准（数据层已对百分率属性声明 ADDITIVE）
 * - 未声明 → 按属性元数据自动选择：isPercentage 属性（critRate/dodge 等）用 ADDITIVE
 *   （value 即百分点，直接相加，base=0 也生效）；数值属性用 PERCENTAGE（相对缩放）
 * @returns 是否至少注入了一个修饰符
 */
export function applyAffixToParticipant(
  participant: BattleEntity,
  affix: AffixData,
): boolean {
  let applied = false
  for (const mod of affix.statModifiers) {
    const attrValue = participant.getAttrValue(mod.attribute as never)
    if (!attrValue) continue
    const isPctAttr = getAttrMeta(mod.attribute as ATTRIBUTE_CODE)?.isPercentage ?? false
    const type = mod.type ?? (isPctAttr ? ModifierType.ADDITIVE : ModifierType.PERCENTAGE)
    attrValue.modifiers.push({
      sourceKey: `affix:${affix.id}`,
      sourceType: ModifierSourceType.AFFIX,
      attribute: mod.attribute as never,
      value: mod.percent,
      // NOTE: isPercentage 属性（critRate/dodge/damageReduction 等）基值常为 0，
      //       PERCENTAGE 相对缩放 (0+0)*1.0x 完全无效，必须用 ADDITIVE 百分点加成；
      //       词缀配置也已对百分率属性显式声明 type: 'ADDITIVE'（双保险）。
      type,
      description: `词缀·${affix.name}（${affix.description ?? ''}）`,
    })
    applied = true
  }
  if (applied) participant.recalcAll()
  return applied
}

/**
 * 随机为参战角色附加词缀。
 * 同一角色不会获得同名词缀或同一 conflict_group 的两条词缀（对齐设计稿 §7 冲突规则）。
 * @param participants 参战角色列表
 * @param affixes 可用词缀池（通常来自封神榜 affixes 表）
 * @param countRange 每个角色附加词缀数量范围（[min, max]），默认 [1, 3]
 * @param rng 可注入随机数生成器（测试确定性）；缺省用 Math.random
 */
export function applyRandomAffixes(
  participants: readonly BattleEntity[],
  affixes: readonly AffixData[],
  countRange: readonly [number, number] = [1, 3],
  rng: () => number = Math.random,
): AffixApplyResult {
  const result: AffixApplyResult = new Map()
  if (affixes.length === 0) return result

  const randInt = (min: number, max: number): number =>
    Math.floor(rng() * (max - min + 1)) + min

  for (const participant of participants) {
    const assigned = pickAndApplyAffixes(
      participant,
      affixes,
      randInt(countRange[0], countRange[1]),
      rng,
    )
    if (assigned.length > 0) result.set(participant.id, assigned)
  }
  return result
}

/**
 * 按每个参战者的词缀池随机附加词缀（不同角色可获得词缀库不一致）。
 * 池解析失败（null）的角色跳过；角色 id → 已附加词缀 id 列表。
 * @param participants 参战角色列表
 * @param resolvePool 按角色解析词缀池（enemies affixPool / 我方默认池）
 * @param rng 可注入随机数生成器（测试确定性）
 */
export function applyRandomAffixesByPool(
  participants: readonly BattleEntity[],
  resolvePool: (participant: BattleEntity) => { pool: AffixData[]; count: number } | null,
  rng: () => number = Math.random,
): AffixApplyResult {
  const result: AffixApplyResult = new Map()
  for (const participant of participants) {
    const plan = resolvePool(participant)
    if (!plan || plan.count <= 0 || plan.pool.length === 0) continue
    const assigned = pickAndApplyAffixes(participant, plan.pool, plan.count, rng)
    if (assigned.length > 0) result.set(participant.id, assigned)
  }
  return result
}
