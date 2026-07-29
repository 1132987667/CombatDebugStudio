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

const DB_NAME = 'combat-debug-studio'
const DB_VERSION = 1

export class IndexedDbStorage implements IPersistentStorage {
  readonly backend = 'indexeddb' as const

  private dbPromise: Promise<IDBDatabase> | null = null

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
        }

        request.onsuccess = (event: Event) => {
          resolve((event.target as IDBOpenDBRequest).result)
        }

        request.onerror = (event: Event) => {
          this.dbPromise = null  // ★ 清空缓存，允许后续操作重试
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
    } catch {
      return []
    }
  }

  async getStats(): Promise<StorageStats | null> {
    try {
      const db = await this.getDb()
      let usedBytes = 0
      for (const storeName of ['recordings', 'snapshots']) {
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
