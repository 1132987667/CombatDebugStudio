/**
 * affix.ts — 词缀应用工具（纯函数，可测）
 *
 * 将词缀（AffixData）的属性修正注入到参战角色（BattleEntity）对应属性的
 * PERCENTAGE 修饰符上，复用属性系统的 modifier 注入模式，属性拆解可见来源。
 * 「随机词缀」按钮复用本工具：随机为参战角色附加若干词缀。
 */

import type { BattleEntity } from '@/domain/battle/type/types'
import { ModifierSourceType, ModifierType } from '@/domain/attribute/types'
import type { AffixData } from '@/domain/fengshen/types'

/** 应用结果：角色 id → 已附加的词缀 id 列表 */
export type AffixApplyResult = Map<string, string[]>

/**
 * 将单个词缀的属性修正注入参战角色。
 * 每个 statModifier 作为 PERCENTAGE 修饰符写入对应属性（value 为百分数，如 20 表示 +20%）。
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
    attrValue.modifiers.push({
      sourceKey: `affix:${affix.id}`,
      sourceType: ModifierSourceType.AFFIX,
      attribute: mod.attribute as never,
      value: mod.percent,
      type: ModifierType.PERCENTAGE,
      description: `词缀·${affix.name}（${affix.description ?? ''}）`,
    })
    applied = true
  }
  if (applied) participant.recalcAll()
  return applied
}

/**
 * 随机为参战角色附加词缀。
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

  // Fisher-Yates 洗牌（拷贝，不改原池）：保证均匀随机，避免 sort(()=>rng()-0.5) 的稳定性陷阱
  const shuffled = [...affixes]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  for (const participant of participants) {
    const count = randInt(countRange[0], countRange[1])
    const assigned: string[] = []
    for (let i = 0; i < count && i < shuffled.length; i++) {
      const affix = shuffled[i]
      if (applyAffixToParticipant(participant, affix)) {
        assigned.push(affix.id)
      }
    }
    if (assigned.length > 0) result.set(participant.id, assigned)
  }
  return result
}
