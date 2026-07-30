/**
 * 效果计算共享工具
 * DamageCalculator / HealCalculator 中重复的 extraValues、targetModifiers 处理逻辑收拢至此。
 * 修改一处逻辑时无需在两个计算器中各改一次。
 */
import type { BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'

/** extraValues 中单个条目的处理结果 */
export interface ExtraValueResult {
  attribute: string
  value: number
  ratio: number
}

/** targetModifiers 中单个条目的处理结果 */
export interface TargetModifierResult {
  attribute: string
  multiplier: number
  effect: number
}

/**
 * 处理 extraValues 加成
 * @param extras extraValues 配置数组
 * @param resolveAttr 属性值解析函数（各计算器传入自己的特殊逻辑）
 * @returns { total, contributions }
 */
export function processExtraValues(
  extras: Array<{ attribute: string; ratio: number }>,
  resolveAttr: (attr: string) => number,
): { total: number; contributions: ExtraValueResult[] } {
  let total = 0
  const contributions: ExtraValueResult[] = []

  for (const extra of extras) {
    const attrValue = resolveAttr(extra.attribute)
    const extraValue = attrValue * extra.ratio
    total += extraValue
    contributions.push({ attribute: extra.attribute, value: extraValue, ratio: extra.ratio })
  }

  return { total, contributions }
}

/**
 * 处理 targetModifiers 目标属性修正
 * @param modifiers targetModifiers 配置（key=属性名, value=系数）
 * @param target 目标实体
 * @param baseValue 修正前的基础值
 * @returns { result, effects }
 */
export function processTargetModifiers(
  modifiers: Record<string, number> | undefined,
  target: BattleEntity,
  baseValue: number,
): { result: number; effects: TargetModifierResult[] } {
  if (!modifiers) return { result: baseValue, effects: [] }

  let value = baseValue
  const effects: TargetModifierResult[] = []

  for (const [attr, modifier] of Object.entries(modifiers)) {
    const targetAttrValue = target.getAttribute(attr as ATTRIBUTE_CODE) || 0
    const modifierEffect = (modifier * targetAttrValue) / 100
    value *= 1 + modifierEffect
    value = Math.floor(value)
    effects.push({ attribute: attr, multiplier: modifier, effect: modifierEffect })
  }

  return { result: value, effects }
}

/**
 * 获取实体的属性值（含特殊属性的处理 hook）
 * 各计算器传入自己的特殊处理逻辑（如 attack→getRandomAttackDamage, damageDealt→context.damage）
 */
export function resolveAttributeValue(
  attr: string,
  source: BattleEntity,
  target: BattleEntity,
  customResolvers: Record<string, () => number>,
): number {
  const custom = customResolvers[attr]
  if (custom) return custom()

  // 默认：尝试从目标读取，否则从来源读取
  const entity = (attr === 'maxHealth' || attr === 'currentHealth') ? target : source
  return entity.getAttribute(attr as ATTRIBUTE_CODE) || 0
}
