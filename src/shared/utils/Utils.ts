/**
 * 文件: Utils.ts
 * 创建日期: 2026-02-09
 * 功能: 通用工具函数
 * 描述: 提供通用的工具函数
 * 版本: 1.0.0
 */

/**
 * 将可能的数组转换为数组
 * @param array - 可能的数组或非数组对象
 * @returns 转换后的数组
 */
export function toArray<T>(array: T[]): T[] {
  if (!array) {
    return [];
  }
  if (Array.isArray(array)) {
    return array;
  }
  return [array];
}
