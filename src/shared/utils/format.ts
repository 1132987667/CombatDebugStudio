/**
 * 文件: format.ts
 * 功能: 通用格式化工具函数
 * 描述: 数值格式化、加成值显示等展示层工具
 */

/**
 * 格式化修饰符值（带 +/- 符号）
 * @param value 修饰符数值
 * @param type 修饰符类型（'PERCENTAGE' 或其它）
 * @returns 格式化后的字符串，如 "+12.5" 或 "-8%"
 */
export function formatModifierValue(value: number, type: string): string {
  const rounded = Math.round(value * 100) / 100
  if (type === 'PERCENTAGE') {
    return rounded > 0 ? `+${rounded}%` : `${rounded}%`
  }
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

/**
 * 从可能为 AttributeValue 对象的值中提取数值
 */
function getNumericValue(value: number | { value: number }): number {
  if (typeof value === 'number') return value
  if (typeof value === 'object' && value !== null && typeof value.value === 'number') return value.value
  return 0
}

/**
 * 格式化加成值显示（始终以百分比形式）
 * @param value 加成属性值（数值或 { value: number } 对象）
 * @returns 格式化后的字符串，如 "+12.5%" 或 "-8%"
 */
export function formatBonusValue(value: number | { value: number }): string {
  const numValue = getNumericValue(value)
  if (isNaN(numValue)) return '0%'
  if (numValue === 0) return '0%'
  const roundedValue = Math.round(numValue * 100) / 100
  return roundedValue > 0 ? `+${roundedValue}%` : `${roundedValue}%`
}
