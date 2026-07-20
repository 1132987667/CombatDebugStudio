/**
 * 文件: attributeSync.ts
 * 功能: 属性加成同步工具 — 主属性 ⇄ 加成属性、attack → minAttack/maxAttack
 * 描述: 抽取 SkillExecutor.executeModifyAttribute 和 GameDataProcessor.pushModifier
 *       中重复的加成同步逻辑，统一维护。
 */
import { ATTRIBUTE_CODE, ModifierType, ModifierSourceType, type Modifier } from '@/domain/attribute/types'
import type { BattleEntity } from '@/domain/battle/type/types'

/** 主属性 → 加成属性映射 */
export const BONUS_ATTR_MAP: Partial<Record<string, string>> = {
  [ATTRIBUTE_CODE.maxHealth]: ATTRIBUTE_CODE.healthBonus,
  [ATTRIBUTE_CODE.minAttack]: ATTRIBUTE_CODE.attackBonus,
  [ATTRIBUTE_CODE.maxAttack]: ATTRIBUTE_CODE.attackBonus,
  [ATTRIBUTE_CODE.defense]: ATTRIBUTE_CODE.defenseBonus,
  [ATTRIBUTE_CODE.speed]: ATTRIBUTE_CODE.speedBonus,
}

/** 加成属性 → 主属性映射（反向传播用） */
export const REVERSE_BONUS_ATTR_MAP: Partial<Record<string, string>> = {
  [ATTRIBUTE_CODE.healthBonus]: ATTRIBUTE_CODE.maxHealth,
  [ATTRIBUTE_CODE.attackBonus]: ATTRIBUTE_CODE.attack,
  [ATTRIBUTE_CODE.defenseBonus]: ATTRIBUTE_CODE.defense,
  [ATTRIBUTE_CODE.speedBonus]: ATTRIBUTE_CODE.speedBonus,
}

/**
 * 同步 PERCENTAGE 修饰符到加成属性
 * 例：defense PERCENTAGE → defenseBonus ADDITIVE
 */
export function syncBonusAttribute(
  participant: BattleEntity,
  attrCode: string,
  mod: Modifier,
  sourceKey: string,
): void {
  const bonusAttr = BONUS_ATTR_MAP[attrCode]
  if (!bonusAttr) return
  const bonusData = participant.getAttrValue(bonusAttr as ATTRIBUTE_CODE)
  if (!bonusData) return
  bonusData.modifiers = bonusData.modifiers.filter(m => m.sourceKey !== sourceKey)
  bonusData.modifiers.push({ ...mod, attribute: bonusAttr as ATTRIBUTE_CODE, type: ModifierType.ADDITIVE })
  bonusData.cachedVersion = -1
}

/**
 * 反向同步：加成属性的 PERCENTAGE 修饰符同步回主属性
 * 例：attackBonus PERCENTAGE → attack PERCENTAGE
 */
export function syncReverseBonusAttribute(
  participant: BattleEntity,
  attrCode: string,
  mod: Modifier,
  sourceKey: string,
): void {
  const mainAttr = REVERSE_BONUS_ATTR_MAP[attrCode]
  if (!mainAttr) return
  const mainData = participant.getAttrValue(mainAttr as ATTRIBUTE_CODE)
  if (!mainData) return
  mainData.modifiers = mainData.modifiers.filter(m => m.sourceKey !== sourceKey)
  mainData.modifiers.push({ ...mod, attribute: mainAttr as ATTRIBUTE_CODE })
  mainData.cachedVersion = -1
}

/**
 * 同步 attack 的修饰符到 minAttack/maxAttack
 * 类型和值保持不变（PERCENTAGE → PERCENTAGE, ADDITIVE → ADDITIVE）
 */
export function syncAttackRange(
  participant: BattleEntity,
  mod: Modifier,
  sourceKey: string,
): void {
  if (mod.attribute !== ATTRIBUTE_CODE.attack) return
  for (const targetAttr of [ATTRIBUTE_CODE.minAttack, ATTRIBUTE_CODE.maxAttack]) {
    const targetData = participant.getAttrValue(targetAttr)
    if (!targetData) continue
    targetData.modifiers = targetData.modifiers.filter(m => m.sourceKey !== sourceKey)
    targetData.modifiers.push({ ...mod, attribute: targetAttr })
    targetData.cachedVersion = -1
  }
}
