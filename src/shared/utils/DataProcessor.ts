/**
 * 文件: DataProcessor.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 通用数据处理工具类
 * 描述: 提供通用的数据处理功能，包括过滤、搜索、转换、排序等操作
 * 版本: 1.0.0
 */

/**
 * 数据处理工具类
 */
export class DataProcessor {
  private static cache: Map<string, { data: unknown; timestamp: number }> = new Map()

  constructor() {}

  /**
   * 数据查找方法
   */
  static find<T>(data: T[], condition: (item: T) => boolean): T | undefined {
    return data.find(condition)
  }

  /**
   * 获取缓存数据
   */
  static getCachedData<T>(key: string): T | null {
    const cached = this.cache.get(key)
    if (!cached) return null
    return cached.data as T
  }

  /**
   * 设置缓存数据
   */
  static setCachedData<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    })
  }

  /**
   * 清除缓存
   */
  static clearCache(key?: string): void {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }
}
