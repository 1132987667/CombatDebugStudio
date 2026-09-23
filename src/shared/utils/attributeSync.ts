/**
 * 文件: attributeSync.ts
 * 功能: 属性加成同步工具 — 主属性 ⇄ 加成属性
 * 描述: 抽取 SkillExecutor.executeModifyAttribute 和 GameDataProcessor.pushModifier
 *       中重复的加成同步逻辑，统一维护。
 */
import { ATTRIBUTE_CODE, ModifierType, type Modifier } from '@/domain/attribute/types'
import type { BattleEntity } from '@/domain/battle/type/types'

/** 主属性 → 加成属性映射（键为调用方传入的属性码，运行时校验命中） */
export const BONUS_ATTR_MAP: Partial<Record<ATTRIBUTE_CODE, ATTRIBUTE_CODE>> = {
  [ATTRIBUTE_CODE.maxHealth]: ATTRIBUTE_CODE.healthBonus,
  [ATTRIBUTE_CODE.attack]: ATTRIBUTE_CODE.attackBonus,
  [ATTRIBUTE_CODE.defense]: ATTRIBUTE_CODE.defenseBonus,
  [ATTRIBUTE_CODE.speed]: ATTRIBUTE_CODE.speedBonus,
}

/** 加成属性 → 主属性映射（反向传播用） */
export const REVERSE_BONUS_ATTR_MAP: Partial<Record<ATTRIBUTE_CODE, ATTRIBUTE_CODE>> = {
  [ATTRIBUTE_CODE.healthBonus]: ATTRIBUTE_CODE.maxHealth,
  [ATTRIBUTE_CODE.attackBonus]: ATTRIBUTE_CODE.attack,
  [ATTRIBUTE_CODE.defenseBonus]: ATTRIBUTE_CODE.defense,
  [ATTRIBUTE_CODE.hitBonus]: ATTRIBUTE_CODE.hitValue,
  [ATTRIBUTE_CODE.dodgeBonus]: ATTRIBUTE_CODE.dodgeValue,
  [ATTRIBUTE_CODE.speedBonus]: ATTRIBUTE_CODE.speed,
}

/**
 * 六维「加成(L2)/系数(L3)」独立属性键 → 主属性 + 乘区层（单一映射源）。
 * 《属性监控显示设计.md》四层模型：基础数值(ADDITIVE) × 属性加成(PERCENTAGE, L2) × 独立乘区(MULTIPLICATIVE, L3) × 最终乘区(FINAL)。
 * 消费方：GameDataProcessor.enemyToParticipant（键值注入为主属性的乘区修饰符）、
 *        xiyou/battle.ts（面板分层计算与悬浮来源分解）。多个乘区各自相乘，禁止折算合并。
 */
export const LAYERED_ATTR_TO_MAIN: Partial<
  Record<ATTRIBUTE_CODE, { main: ATTRIBUTE_CODE; layer: 'bonus' | 'coefficient' }>
> = {
  [ATTRIBUTE_CODE.healthBonus]: { main: ATTRIBUTE_CODE.maxHealth, layer: 'bonus' },
  [ATTRIBUTE_CODE.attackBonus]: { main: ATTRIBUTE_CODE.attack, layer: 'bonus' },
  [ATTRIBUTE_CODE.defenseBonus]: { main: ATTRIBUTE_CODE.defense, layer: 'bonus' },
  [ATTRIBUTE_CODE.hitBonus]: { main: ATTRIBUTE_CODE.hitValue, layer: 'bonus' },
  [ATTRIBUTE_CODE.dodgeBonus]: { main: ATTRIBUTE_CODE.dodgeValue, layer: 'bonus' },
  [ATTRIBUTE_CODE.speedBonus]: { main: ATTRIBUTE_CODE.speed, layer: 'bonus' },
  [ATTRIBUTE_CODE.healthCoefficient]: { main: ATTRIBUTE_CODE.maxHealth, layer: 'coefficient' },
  [ATTRIBUTE_CODE.attackCoefficient]: { main: ATTRIBUTE_CODE.attack, layer: 'coefficient' },
  [ATTRIBUTE_CODE.defenseCoefficient]: { main: ATTRIBUTE_CODE.defense, layer: 'coefficient' },
  [ATTRIBUTE_CODE.hitCoefficient]: { main: ATTRIBUTE_CODE.hitValue, layer: 'coefficient' },
  [ATTRIBUTE_CODE.dodgeCoefficient]: { main: ATTRIBUTE_CODE.dodgeValue, layer: 'coefficient' },
  [ATTRIBUTE_CODE.speedCoefficient]: { main: ATTRIBUTE_CODE.speed, layer: 'coefficient' },
}

/**
 * 同步 PERCENTAGE 修饰符到加成属性
 * 例：defense PERCENTAGE → defenseBonus ADDITIVE
 */
export function syncBonusAttribute(
  participant: BattleEntity,
  attrCode: ATTRIBUTE_CODE,
  mod: Modifier,
  sourceKey: string,
): void {
  const bonusAttr = BONUS_ATTR_MAP[attrCode]
  if (!bonusAttr) return
  const bonusData = participant.getAttrValue(bonusAttr)
  if (!bonusData) return
  bonusData.modifiers = bonusData.modifiers.filter(m => m.sourceKey !== sourceKey)
  bonusData.modifiers.push({ ...mod, attribute: bonusAttr, type: ModifierType.ADDITIVE })
  bonusData.cachedVersion = -1
}

/**
 * 反向同步：加成属性的 PERCENTAGE 修饰符同步回主属性
 * 例：attackBonus PERCENTAGE → attack PERCENTAGE
 */
export function syncReverseBonusAttribute(
  participant: BattleEntity,
  attrCode: ATTRIBUTE_CODE,
  mod: Modifier,
  sourceKey: string,
): void {
  const mainAttr = REVERSE_BONUS_ATTR_MAP[attrCode]
  if (!mainAttr) return
  const mainData = participant.getAttrValue(mainAttr)
  if (!mainData) return
  mainData.modifiers = mainData.modifiers.filter(m => m.sourceKey !== sourceKey)
  mainData.modifiers.push({ ...mod, attribute: mainAttr })
  mainData.cachedVersion = -1
}
