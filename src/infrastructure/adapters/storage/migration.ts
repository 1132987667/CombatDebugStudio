/**
 * migration.ts — localStorage → IndexedDB 数据迁移
 *
 * 将旧 localStorage 中的战斗录像和状态快照迁移到 IndexedDB。
 * 幂等：首次迁移完成后设置标记 `cds:idb-migration-v1`，后续跳过。
 *
 * 迁移内容：
 * 1. recordings store：battle_recordings_list + 所有 battle_recording_* 键
 * 2. snapshots store：battleState 键（根据数据形状判断写入哪个子键）
 */

import type { IPersistentStorage } from '@/domain/port/IPersistentStorage'
import { STORAGE_STORE } from '@/domain/port/IPersistentStorage'
import { calculateChecksum } from '@/shared/utils/Checksum'

const MIGRATION_FLAG = 'cds:idb-migration-v1'

export interface MigrationResult {
  recordings: number
  snapshots: number
}

/**
 * 执行 localStorage → IndexedDB 迁移
 * @param storage IPersistentStorage 实例
 * @returns 迁移统计
 */
export async function migrateLegacyLocalStorage(storage: IPersistentStorage): Promise<MigrationResult> {
  if (typeof localStorage === 'undefined') return { recordings: 0, snapshots: 0 }
  if (localStorage.getItem(MIGRATION_FLAG)) return { recordings: 0, snapshots: 0 }

  let recordings = 0
  let snapshots = 0

  // 1. 迁移战斗录像
  const keys: string[] = JSON.parse(localStorage.getItem('battle_recordings_list') ?? '[]')
  for (const key of keys) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      // 重算 checksum（不假设旧 checksum 在结构化克隆后仍有效）
      if (data.checksum) {
        const { checksum, ...body } = data
        data.checksum = calculateChecksum(body)
      }
      await storage.set(STORAGE_STORE.RECORDINGS, key, data)
      localStorage.removeItem(key)
      recordings++
    } catch {
      // 损坏记录跳过，原样保留
    }
  }
  localStorage.removeItem('battle_recordings_list')

  // 2. 迁移状态快照（原 battleState 键）
  const state = localStorage.getItem('battleState')
  if (state) {
    try {
      const parsed = JSON.parse(state)
      // 根据数据形状判断写入哪个键
      if (parsed.battleCharacters) {
        await storage.set(STORAGE_STORE.SNAPSHOTS, 'interventionExport', parsed)
      } else if (parsed.exportTime) {
        await storage.set(STORAGE_STORE.SNAPSHOTS, 'debugSnapshot', parsed)
      }
      localStorage.removeItem('battleState')
      snapshots++
    } catch {
      // 损坏数据跳过
    }
  }

  localStorage.setItem(MIGRATION_FLAG, new Date().toISOString())
  return { recordings, snapshots }
}
