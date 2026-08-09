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

/** 封神榜数据表 store 名（IndexedDB DB v2 起，见封神榜开发计划 §3.2） */
export const FENGSHEN_STORE = {
  ACTORS: 'actors',
  SKILLS: 'skills',
  BUFFS: 'buffs',
  ENEMIES: 'enemies',
  SCENES: 'scenes',
  FORMATIONS: 'formations',
  LINEUPS: 'lineups',
  MATERIALS: 'materials',
  EQUIPMENT: 'equipment',
  ELEMENTS: 'elements',
  GROWTH: 'growth',
  DROPS: 'drops',
  PARAMS: 'params',
  AFFIXES: 'affixes',
  META: 'meta',
} as const
export type FengshenStoreName = (typeof FENGSHEN_STORE)[keyof typeof FENGSHEN_STORE]

/** 全部 store 名（基础 + 封神榜），供迁移/统计遍历 */
export const ALL_STORES = [...Object.values(STORAGE_STORE), ...Object.values(FENGSHEN_STORE)] as const

export type StorageStoreName = (typeof STORAGE_STORE)[keyof typeof STORAGE_STORE] | FengshenStoreName

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
