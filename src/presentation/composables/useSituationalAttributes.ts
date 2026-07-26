/**
 * 文件: useSituationalAttributes.ts
 * 功能: 情境属性 Composable — 动态计算当前上下文中已激活的 situational 属性
 * 描述: 根据当前选中的目标、技能，从 attributeDisplay 中过滤 displayTier==='situational'
 *       且在上下文中"有意义"的属性（如元素抗性在对应元素技能下激活、对妖加成在选中妖族时激活）
 * ponytail: 用 group 推导匹配规则，而非每个属性配一个函数——够用且简单。
 *           如需更精细化匹配，可扩展为 getAttributeDisplayConfig().situationalMatcher。
 */

import { computed, toValue, type ComputedRef, type Ref } from 'vue'
import { AttributeMetaMap, type ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { BattleEntity } from '@/domain/battle/type/types'
import type { SkillConfig } from '@/domain/skill/types'
import { getAttributeDisplayConfig } from '@/presentation/config/attributeDisplay'

export interface SituationalAttribute {
  code: string
  label: string
  value: number
  group: string
}

/**
 * @param participant 属性持有者
 * @param target 当前选中的目标（可选）
 * @param skill 当前准备的技能（可选）
 */
export function useSituationalAttributes(
  participant: ComputedRef<BattleEntity | null> | Ref<BattleEntity | null>,
  target: ComputedRef<BattleEntity | null> | Ref<BattleEntity | null>,
  skill: ComputedRef<SkillConfig | null> | Ref<SkillConfig | null>,
  versionTick?: ComputedRef<number> | Ref<number>,
) {
  return computed<SituationalAttribute[]>(() => {
    // 建立响应式依赖：版本戳变化时重新求值
    void (versionTick ? toValue(versionTick) : 0)

    const p = toValue(participant)
    const t = toValue(target)
    const s = toValue(skill)
    if (!p) return []

    const active: SituationalAttribute[] = []

    for (const [code, meta] of Object.entries(AttributeMetaMap)) {
      const display = getAttributeDisplayConfig(code)
      if (display.displayTier !== 'situational') continue

      // 从 participant 读取属性值
      const attrValue = p.getAttribute(code as ATTRIBUTE_CODE) ?? 0
      if (attrValue <= 0) continue

      // 按 group 推导是否在当前上下文中"有意义"
      if (!isContextRelevant(code, display.group, t, s)) continue

      active.push({
        code,
        label: meta.displayName,
        value: attrValue,
        group: display.group,
      })
    }

    return active
  })
}

/**
 * 判断一个 situational 属性在当前上下文中是否"有意义"
 * ponytail: 用 group 做粗粒度匹配，不引入每个属性的匹配函数
 */
function isContextRelevant(
  code: string,
  group: string | undefined,
  target: BattleEntity | null,
  skill: SkillConfig | null,
): boolean {
  // 没有 target 也没有 skill 时，只显示最通用的情境属性
  if (!target && !skill) return false

  switch (group) {
    case 'elemental':
      // 元素抗性：当技能存在时激活（有技能步骤指定元素类型）
      return skill !== null

    case 'offense':
      // 进攻型情境属性：damageToDemon/damageToLowHp/fireSkillDmgBonus 等
      // 有目标或有技能时即可激活
      return target !== null || skill !== null

    case 'control':
      // 控制类：poisonRes — 有目标时激活
      return target !== null

    default:
      return true
  }
}
