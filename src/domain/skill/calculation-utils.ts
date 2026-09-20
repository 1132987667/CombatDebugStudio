/**
 * 效果计算共享工具
 * DamageCalculator / HealCalculator 中重复的 extraValues、targetModifiers 处理逻辑收拢至此。
 * 修改一处逻辑时无需在两个计算器中各改一次。
 */
import type { BattleEntity } from '@/domain/battle/type/types'
import { ATTRIBUTE_CODE, AttributeMetaMap } from '@/domain/attribute/types'
import { StepEffectType, type DamageHealCalculationConfig, type ExtendedSkillStep, type SkillConfig } from '@/domain/skill/types'

/** extraValues 中单个条目的处理结果 */
export interface ExtraValueResult {
  attribute: ATTRIBUTE_CODE | 'level'
  value: number
  ratio: number
}

/** targetModifiers 中单个条目的处理结果 */
export interface TargetModifierResult {
  attribute: ATTRIBUTE_CODE
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
  extras: Array<{ attribute: ATTRIBUTE_CODE | 'level'; ratio: number }>,
  resolveAttr: (attr: ATTRIBUTE_CODE | 'level') => number,
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
  modifiers: Partial<Record<ATTRIBUTE_CODE, number>> | undefined,
  target: BattleEntity,
  baseValue: number,
): { result: number; effects: TargetModifierResult[] } {
  if (!modifiers) return { result: baseValue, effects: [] }

  let value = baseValue
  const effects: TargetModifierResult[] = []

  for (const [attr, modifier] of Object.entries(modifiers) as Array<[ATTRIBUTE_CODE, number | undefined]>) {
    if (modifier === undefined) continue
    const targetAttrValue = target.getAttribute(attr) || 0
    const modifierEffect = (modifier * targetAttrValue) / 100
    value *= 1 + modifierEffect
    value = Math.floor(value)
    effects.push({ attribute: attr, multiplier: modifier, effect: modifierEffect })
  }

  return { result: value, effects }
}

/**
 * 获取实体的属性值（含特殊属性的处理 hook）
 * 各计算器传入自己的特殊处理逻辑（如 damageDealt→context.damage）
 */
export function resolveAttributeValue(
  attr: ATTRIBUTE_CODE | 'level',
  source: BattleEntity,
  target: BattleEntity,
): number {
  // level 为实体级字段（非属性系统属性），直接取 source.level
  if (attr === 'level') return source.level
  // 默认：尝试从目标读取，否则从来源读取
  const entity = (attr === 'maxHealth' || attr === 'currentHealth') ? target : source
  return entity.getAttribute(attr) || 0
}

// ========== 描述模板渲染 ==========
// NOTE: {{damage}}/{{heal}} 模板让 description 与 calculation 配置同源，
// 根治手写描述与数值脱节（如佛光普照描述"等级×10"实际 level×5×2）。
// 渲染幂等：无 {{ 的描述原样返回，重复调用/缓存安全。

/** 数值显示：消除浮点误差尾数（1.2*100=120.000...01 → 120） */
function formatNumber(n: number): string {
  return String(Number(n.toFixed(2)))
}

/**
 * 将伤害/治疗计算配置转为公式描述
 * 如 {baseValue:0, attack×1} → "100% 攻击力"；{baseValue:50, level×5} → "50+等级×5"
 * 约定：属性加成用百分比（attack×1 → "100% 攻击力"），等级加成用倍数（level×5 → "等级×5"）；
 * 相同属性的加成合并显示（两条 level×5 → "等级×10"），与手写描述习惯一致
 */
export function describeCalculation(calc: DamageHealCalculationConfig): string {
  const parts: string[] = []
  if (calc.baseValue) parts.push(String(calc.baseValue))
  const ratioByAttr = new Map<string, number>()
  for (const extra of calc.extraValues ?? []) {
    ratioByAttr.set(extra.attribute, (ratioByAttr.get(extra.attribute) ?? 0) + extra.ratio)
  }
  for (const [attr, ratio] of ratioByAttr) {
    if (attr === 'level') {
      parts.push(`等级×${formatNumber(ratio)}`)
    } else {
      const attrName = AttributeMetaMap[attr as ATTRIBUTE_CODE]?.name ?? attr
      parts.push(`${formatNumber(ratio * 100)}% ${attrName}`)
    }
  }
  return parts.join('+')
}

/**
 * 渲染技能描述中的 {{damage}} / {{heal}} 模板变量
 * 变量取自 steps 中全部 deal_damage / heal 步骤的 calculation 公式描述（多段用 " + " 拼接）；
 * 描述不含模板或对应步骤无 calculation 时原样返回（保留模板原文，便于配置作者发现问题）
 */
export function renderSkillDescription(config: SkillConfig): string {
  const desc = config.description
  if (!desc || !desc.includes('{{')) return desc ?? ''

  // steps 声明为 SkillStep[]，实际携带扩展字段（calculation 挂在 ExtendedSkillStep 上）
  const steps = (config.steps ?? []) as ExtendedSkillStep[]
  const calcTextOf = (stepType: string): string | null => {
    const texts = steps
      .filter((s) => s.type === stepType && s.calculation)
      .map((s) => describeCalculation(s.calculation!))
      .filter(Boolean)
    return texts.length > 0 ? texts.join(' + ') : null
  }
  const damageText = calcTextOf(StepEffectType.DEAL_DAMAGE)
  const healText = calcTextOf(StepEffectType.HEAL)

  // replace 用函数形式，避免结果含 $ 字符时被展开
  return desc
    .replace(/\{\{\s*damage\s*\}\}/g, () => damageText ?? '{{damage}}')
    .replace(/\{\{\s*heal\s*\}\}/g, () => healText ?? '{{heal}}')
}
