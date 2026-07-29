/**
 * IPersistentStorage.ts — 持久化存储端口接口
 *
 * 定义领域层所需的持久化存储能力。
 * 遵循 DIP：领域层定义接口，基础设施层提供实现。
 * 当前实现：IndexedDB（IndexedDbStorage）。
 */

export const STORAGE_STORE = {
  RECORDINGS: 'recordings',
  SNAPSHOTS: 'snapshots',
} as const
export type StorageStoreName = (typeof STORAGE_STORE)[keyof typeof STORAGE_STORE]

export interface StorageStats {
  usedBytes: number
  quotaBytes: number
}

export interface IPersistentStorage {
  readonly backend: 'indexeddb'

  set<T>(store: StorageStoreName, key: string, value: T): Promise<boolean>
  get<T>(store: StorageStoreName, key: string): Promise<T | null>
  remove(store: StorageStoreName, key: string): Promise<boolean>
  keys(store: StorageStoreName): Promise<string[]>
  clear(store: StorageStoreName): Promise<boolean>

  /** 按字段排序返回键名列表（可选，用于按保存时间列出录像） */
  keysByField?(store: StorageStoreName, field: string, direction?: 'asc' | 'desc'): Promise<string[]>

  getStats(): Promise<StorageStats | null>
}
