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
  return Math.ceil((num - Number.EPSILON) * factor) / factor
}

/**
 * 战斗数值（气血 / 能量 / 伤害 / 治疗）允许的最大小数位数。
 * 单源哨兵：状态写入量化与显示格式化都引用此处，不各自内联 1/2 位判断。
 * 口径见 documents/功能文档/数值精度规范.md
 */
export const COMBAT_PRECISION = 1

/**
 * 显示层数值格式化：消除二进制浮点尾数，供所有面向玩家的数值文本单源使用。
 *
 * 先 toPrecision(12) 折回人类预期的十进制值（119.80000000000001 → 119.8、
 * 0.1+0.2 → 0.3），再按 maxDecimals 四舍五入。
 * 不传 maxDecimals 时不截断真实精度——区别于 toFixed 的定长补零语义。
 *
 * 口径见 documents/功能文档/数值精度规范.md
 * @param n - 原始数值
 * @param maxDecimals - 最多保留几位小数（省略则只清洗浮点尾数）
 */
export function formatDisplayNumber(n: number, maxDecimals?: number): string {
  if (!Number.isFinite(n)) return String(n)
  // 12 位有效数字对战斗数值足够；量级到 1e15 以上时它反而会截掉有效位，原样输出
  if (Math.abs(n) >= 1e15) return String(n)
  const cleaned = Number(n.toPrecision(12))
  return String(maxDecimals === undefined ? cleaned : round(cleaned, maxDecimals))
}

/**
 * 将小数比率转为百分比数值（0.15 → 15），保留 2 位小数
 * 用于把配置中的 PERCENTAGE 比率值对齐 ModifierType 的百分比单位
 * @param value - 比率值（如 0.15 表示 15%）
 * @returns 百分比数值，若输入无效则返回 NaN
 */
export function percentage(value: number): number {
  return round(value * 100, 2)
}

/**
 * 将数值限制在 [lo, hi] 范围内
 * @param n - 原始数值
 * @param lo - 下界（可省略）
 * @param hi - 上界（可省略）
 * @returns 限制后的数值
 */
export function clamp(n: number, lo?: number, hi?: number): number {
  if (lo !== undefined && n < lo) return lo
  if (hi !== undefined && n > hi) return hi
  return n
}
