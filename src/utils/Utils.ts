
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