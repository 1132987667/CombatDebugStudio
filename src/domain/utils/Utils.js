const Utils = {}

/**
 * 保留几位小数，四舍五入
 * @param {number|string} number 数值
 * @param {number} precision 保留几位小数
 * @returns
 */
Utils.round = function (number, precision = 0) {
  if (precision < 0) {
    precision = 0
  }
  let factor = Math.pow(10, precision)
  return Math.round(Number(number) * factor) / factor
}

Utils.floor = function (number) {
  return Math.floor(Number(number))
}

export default Utils