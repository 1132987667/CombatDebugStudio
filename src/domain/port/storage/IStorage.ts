/**
 * 存储端口接口
 *
 * 领域层通过此接口声明持久化需求，不依赖基础设施层的具体实现。
 * 基础设施层提供适配器实现此接口（如 LocalStorageAdapter）。
 */
export interface IStorage {
  /** 存储数据 */
  set<T>(key: string, value: T): boolean
  /** 读取数据（无默认值） */
  get<T>(key: string): T | null
  /** 读取数据（有默认值） */
  get<T>(key: string, defaultValue: T): T
  /** 删除数据 */
  remove(key: string): boolean
  /** 清空所有数据 */
  clear(): boolean
  /** 检查键是否存在 */
  has(key: string): boolean
}
