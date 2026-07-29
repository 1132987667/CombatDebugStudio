/**
 * 存储工具模块入口
 * 导出所有存储相关的工具类和函数
 */

export * from '@/infrastructure/adapters/storage/LocalStorage'
export { IndexedDbStorage } from '@/infrastructure/adapters/storage/IndexedDbStorage'
export { migrateLegacyLocalStorage } from '@/infrastructure/adapters/storage/migration'

import { IndexedDbStorage } from '@/infrastructure/adapters/storage/IndexedDbStorage'

/** 全局持久化存储单例 */
export const persistentStorage = new IndexedDbStorage()
