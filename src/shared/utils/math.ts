/**
 * 数学工具函数
 * 从 src/domain/utils/Utils.js 迁移而来（死代码，原文件无 import 引用）
 * 保留 round/floor/ceil 作为共享工具
 */

/**
 * 保留几位小数，四舍五入
 * @param number - 数值
 * @param precision - 保留几位小数（默认 0）
 * @returns 四舍五入后的数值，若输入无效则返回 NaN
 */
export function round(number: number | string, precision = 0): number {
  if (precision < 0) {
    precision = 0
  }

  const num = Number(number)
  if (Number.isNaN(num)) {
    return NaN
  }

  const factor = Math.pow(10, precision)
  // ponytail: 引入 Number.EPSILON 解决 1.005 * 100 = 100.49999999999999 的精度丢失问题
  return Math.round((num + Number.EPSILON) * factor) / factor
}

/**
 * 保留几位小数，向下取整
 * @param number - 数值
 * @param precision - 保留几位小数（默认 0）
 * @returns 向下取整后的数值，若输入无效则返回 NaN
 */
export function floor(number: number | string, precision = 0): number {
  if (precision < 0) {
    precision = 0
  }

  const num = Number(number)
  if (Number.isNaN(num)) {
    return NaN
  }

  const factor = Math.pow(10, precision)
  // floor 不需要加 Number.EPSILON，否则会导致 1.005 向下取整变成 1.01，违背语义
  return Math.floor(num * factor) / factor
}

/**
 * 保留几位小数，向上取整
 * @param number - 数值
 * @param precision - 保留几位小数（默认 0）
 * @returns 向上取整后的数值，若输入无效则返回 NaN
 */
export function ceil(number: number | string, precision = 0): number {
  if (precision < 0) {
    precision = 0
  }

  const num = Number(number)
  if (Number.isNaN(num)) {
    return NaN
  }

  const factor = Math.pow(10, precision)
  // ponytail: 减去极小值，解决 1.01 变成 1.0100000000000002 导致错误向上进位的问题
  return Math.ceil((num - Number.EPSILON) * factor) / factor
}
