/**
 * IndexedDbStorage.ts — IndexedDB 持久化存储实现
 *
 * 实现 IPersistentStorage 端口接口，提供基于 IndexedDB 的永久存储。
 * 支持 recordings（战斗录像）和 snapshots（状态快照）两个 store。
 *
 * 设计原则：
 * - 所有操作返回 Promise，与 IPersistentStorage 接口一致
 * - 单例模式，复用同一 DB 连接
 * - DB 版本管理：版本 1 创建 stores，后续升级走 versionchange 事件
 */

import type { IPersistentStorage, StorageStoreName, StorageStats } from '@/domain/port/IPersistentStorage'
import { ALL_STORES, FENGSHEN_STORE, SAVE_STORE } from '@/domain/port/IPersistentStorage'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { LogLevel } from '@/shared/types/battle-log'

const DB_NAME = 'combat-debug-studio'
// NOTE: v1 = recordings/snapshots；v2 = 封神榜 14 数据表；v3 = 新增 affixes 词缀表（封神榜词缀管理）；
//       v4 = 新增 items（物品主键索引）/ gears（装备详情）表；
//       v5 = 新增 equipment_affixes（装备词条库，独立于敌人词缀）；
//       v6 = 新增 saves（演劫台存档）表
const DB_VERSION = 6

/** 存储迁移历史（PackagesView「版本迁移记录」读取；新增迁移在此追加即可，UI 自动更新） */
export const STORAGE_MIGRATIONS: Array<{ version: number; note: string }> = [
  { version: 1, note: '创建 recordings / snapshots store' },
  { version: 2, note: '新增封神榜数据表（14 store + meta）' },
  { version: 3, note: '新增 affixes 词缀数据表' },
  { version: 4, note: '新增 items（物品主键索引）/ gears（装备详情）数据表' },
  { version: 5, note: '新增 equipment_affixes（装备词条库）数据表' },
  { version: 6, note: '新增 saves（演劫台存档）数据表' },
]

export class IndexedDbStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const

  private dbPromise: Promise<IDBDatabase> | null = null

  /** IndexedDB 是否可用（复用现有连接，不额外建库；供 UI 展示存储后端状态） */
  async isAvailable(): Promise<boolean> {
    try {
      await this.getDb()
      return true
    } catch {
      return false
    }
  }

  /**
   * 获取 DB 连接的 Promise（延迟初始化 + 缓存）
   */
  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result
          // Store 1: recordings — 战斗录像
          if (!db.objectStoreNames.contains('recordings')) {
            const store = db.createObjectStore('recordings')
            store.createIndex('savedAt', 'savedAt', { unique: false })
          }
          // Store 2: snapshots — 状态快照
          if (!db.objectStoreNames.contains('snapshots')) {
            db.createObjectStore('snapshots')
          }
          // 封神榜数据表（v2）：新增 store 幂等创建；meta 含 updatedAt 索引（操作日志按时间排序）
          for (const name of Object.values(FENGSHEN_STORE)) {
            if (db.objectStoreNames.contains(name)) continue
            const store = db.createObjectStore(name)
            if (name === FENGSHEN_STORE.META) {
              store.createIndex('updatedAt', 'updatedAt', { unique: false })
            }
          }
          // 存档表（v6）：演劫台存档（key: save:main / save:auto）
          for (const name of Object.values(SAVE_STORE)) {
            if (db.objectStoreNames.contains(name)) continue
            db.createObjectStore(name)
          }
        }

        request.onsuccess = (event: Event) => {
          resolve((event.target as IDBOpenDBRequest).result)
        }

        request.onerror = (event: Event) => {
          this.dbPromise = null  // 清空缓存，允许后续操作重试
          reject((event.target as IDBOpenDBRequest).error)
        }
      })
    }
    return this.dbPromise
  }

  /** 将 IDB 请求转为 Promise，并确保事务/请求错误不产生未捕获的 rejection */
  private promisify<T>(executor: (resolve: (v: T) => void, reject: (e: unknown) => void) => void, fallback: T): Promise<T> {
    try {
      return new Promise<T>(executor).catch(() => fallback)
    } catch {
      return Promise.resolve(fallback)
    }
  }

  async set<T>(store: StorageStoreName, key: string, value: T): Promise<boolean> {
    try {
      const db = await this.getDb()
      return this.promisify<boolean>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const objectStore = tx.objectStore(store)
        objectStore.put(value, key)
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => reject(tx.error)
      }, false)
    } catch {
      return false
    }
  }

  async get<T>(store: StorageStoreName, key: string): Promise<T | null> {
    try {
      const db = await this.getDb()
      return this.promisify<T | null>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const objectStore = tx.objectStore(store)
        const request = objectStore.get(key)
        request.onsuccess = () => resolve((request.result as T) ?? null)
        request.onerror = () => reject(request.error)
      }, null)
    } catch {
      return null
    }
  }

  async remove(store: StorageStoreName, key: string): Promise<boolean> {
    try {
      const db = await this.getDb()
      return this.promisify<boolean>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const objectStore = tx.objectStore(store)
        objectStore.delete(key)
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => reject(tx.error)
      }, false)
    } catch {
      return false
    }
  }

  async keys(store: StorageStoreName): Promise<string[]> {
    try {
      const db = await this.getDb()
      return this.promisify<string[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const objectStore = tx.objectStore(store)
        const request = objectStore.getAllKeys()
        request.onsuccess = () => resolve((request.result as string[]) ?? [])
        request.onerror = () => reject(request.error)
      }, [])
    } catch {
      return []
    }
  }

  async clear(store: StorageStoreName): Promise<boolean> {
    try {
      const db = await this.getDb()
      return this.promisify<boolean>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite')
        const objectStore = tx.objectStore(store)
        objectStore.clear()
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => reject(tx.error)
      }, false)
    } catch {
      return false
    }
  }

  async keysByField(store: StorageStoreName, field: string, direction: 'asc' | 'desc' = 'desc'): Promise<string[]> {
    try {
      const db = await this.getDb()
      return new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(store, 'readonly')
        const objectStore = tx.objectStore(store)
        const index = objectStore.index(field)
        const dir: IDBCursorDirection = direction === 'asc' ? 'next' : 'prev'
        const request = index.openCursor(null, dir)
        const keys: string[] = []
        request.onsuccess = (event: Event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
          if (cursor) {
            keys.push(cursor.primaryKey as string)
            cursor.continue()
          } else {
            resolve(keys)
          }
        }
        request.onerror = () => reject(request.error)
      })
    } catch (e) {
      //  索引缺失/DB 异常：静默返回 [] 会导致持久化裁剪静默失效，记录日志便于排查
      try {
        LoggerProvider.logger.addDebugLog('按字段索引读取存储键失败，返回空列表', {
          level: LogLevel.ERROR,
          context: { store, field, error: e },
        })
      } catch {
        /* DI 未初始化时忽略（绕过容器直构场景；正常路径不会发生） */
      }
      return []
    }
  }

  async getStats(): Promise<StorageStats | null> {
    try {
      const db = await this.getDb()
      let usedBytes = 0
      for (const storeName of ALL_STORES) {
        const tx = db.transaction(storeName, 'readonly')
        const objectStore = tx.objectStore(storeName)
        const cursor = objectStore.openCursor()
        await new Promise<void>((resolve, reject) => {
          cursor.onsuccess = (event: Event) => {
            const cursor2 = (event.target as IDBRequest<IDBCursorWithValue | null>).result
            if (cursor2) {
              usedBytes += new Blob([JSON.stringify(cursor2.value)]).size
              cursor2.continue()
            } else {
              resolve()
            }
          }
          cursor.onerror = () => reject(cursor.error)
        })
      }
      return { usedBytes, quotaBytes: 0 }
    } catch {
      return null
    }
  }
}
