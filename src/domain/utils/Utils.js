/**
 * 数学工具类
 */

/**
 * 保留几位小数，四舍五入
 * @param {number|string} number 数值
 * @param {number} [precision=0] 保留几位小数
 * @returns {number} 四舍五入后的数值，若输入无效则返回 NaN
 */
export function round(number, precision = 0) {
  if (precision < 0) {
    precision = 0
  }
  
  const num = Number(number)
  // 边界处理：如果转换后为 NaN，直接返回
  if (Number.isNaN(num)) {
    return NaN 
  }

  const factor = Math.pow(10, precision)
  // 引入 Number.EPSILON 解决 1.005 * 100 = 100.49999999999999 的精度丢失问题
  return Math.round((num + Number.EPSILON) * factor) / factor
}

/**
 * 向下取整（支持指定小数位数）
 * @param {number|string} number 数值
 * @param {number} [precision=0] 保留几位小数
 * @returns {number} 向下取整后的数值，若输入无效则返回 NaN
 */
export function floor(number, precision = 0) {
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
 * @param {number|string} number 数值
 * @param {number} [precision=0] 保留几位小数
 * @returns {number} 向上取整后的数值，若输入无效则返回 NaN
 */
export function ceil(number, precision = 0) {
  if (precision < 0) {
    precision = 0
  }

  const num = Number(number)
  if (Number.isNaN(num)) {
    return NaN
  }

  const factor = Math.pow(10, precision)
  // 减去极小值，解决 1.01 变成 1.0100000000000002 导致错误向上进位的问题
  return Math.ceil((num - Number.EPSILON) * factor) / factor
}