import { ModifierType } from '@/domain/attribute/types'

/**
 * 解析属性值字符串为修饰符数值和类型
 *
 * 规则：
 * - "20%" → PERCENTAGE 20（20% 加成，计算时做 (100+20)/100 = 1.2）
 * - "0.1" → PERCENTAGE 10（小数转为百分比，×100）
 * - "15"  → ADDITIVE 15（绝对值加法）
 */
export function parseAttributeValue(value: string): {
  value: number
  type: ModifierType
} {
  const trimmed = value.trim()
  const isPercent = trimmed.includes('%')
  const numericStr = trimmed.replace('%', '')
  const numValue = parseFloat(numericStr)
  if (isNaN(numValue)) return { value: 0, type: ModifierType.ADDITIVE }

  if (isPercent) {
    return { value: numValue, type: ModifierType.PERCENTAGE }
  }
  if (Math.abs(numValue) < 1) {
    return { value: numValue * 100, type: ModifierType.PERCENTAGE }
  }
  return { value: numValue, type: ModifierType.ADDITIVE }
}
