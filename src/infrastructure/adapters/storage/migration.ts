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

// ========== 攻击模型扁平化兼容（v2.1.0） ==========
// 旧版导出的战斗状态快照（battleStateExport / debugSnapshot / interventionExport）中，
// 参与者属性可能仍含 minAttack/maxAttack。读取时合并为 attack（取平均值）并丢弃旧字段。

/** 从参与者对象中读取属性容器（兼容 Map 与普通对象两种序列化形态） */
function readAttributeContainer(
  participant: unknown,
): Map<string, unknown> | Record<string, unknown> | null {
  if (!participant || typeof participant !== 'object') return null
  const p = participant as Record<string, unknown>
  const stats = p.stats as Record<string, unknown> | undefined
  const attrs = stats?.attributes as unknown
  if (attrs instanceof Map) return attrs
  if (attrs && typeof attrs === 'object') return attrs as Record<string, unknown>
  return null
}

/**
 * 将单个参与者属性中的 minAttack/maxAttack 合并为 attack。
 * 规则：attack = Math.round((minAttack + maxAttack) / 2)；已存在 attack 则保留现值。
 * 返回是否发生了变更。
 */
function normalizeParticipantAttackRange(participant: unknown): boolean {
  const attrs = readAttributeContainer(participant)
  if (!attrs) return false

  const isMap = attrs instanceof Map
  const getAttr = (key: string): number | undefined => {
    const entry = isMap ? attrs.get(key) : (attrs as Record<string, unknown>)[key]
    const value = (entry as { value?: unknown } | undefined)?.value
    return typeof value === 'number' ? value : undefined
  }
  const hasKey = (key: string): boolean =>
    isMap ? attrs.has(key) : key in (attrs as Record<string, unknown>)

  const min = getAttr('minAttack')
  const max = getAttr('maxAttack')
  const hasAttack = hasKey('attack')

  let changed = false
  if (min !== undefined && max !== undefined && !hasAttack) {
    const merged = Math.round((min + max) / 2)
    if (isMap) {
      attrs.set('attack', { value: merged, base: merged, modifiers: [], isPercentage: false, cachedVersion: 0 })
    } else {
      ;(attrs as Record<string, unknown>).attack = { value: merged, base: merged, modifiers: [], isPercentage: false, cachedVersion: 0 }
    }
    changed = true
  }

  for (const key of ['minAttack', 'maxAttack']) {
    if (isMap ? attrs.delete(key) : delete (attrs as Record<string, unknown>)[key]) {
      changed = true
    }
  }

  return changed
}

/**
 * 反序列化后的旧版战斗状态兼容：遍历 battleCharacters / enemyParty，
 * 将其中 minAttack/maxAttack 合并为 attack。原地修改并返回。
 */
export function normalizeExportedBattleState<T>(state: T): T {
  if (!state || typeof state !== 'object') return state
  const s = state as Record<string, unknown>
  for (const key of ['battleCharacters', 'enemyParty']) {
    const team = s[key]
    if (!Array.isArray(team)) continue
    for (const participant of team) {
      normalizeParticipantAttackRange(participant)
    }
  }
  return state
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
      // v2.1.0 兼容：minAttack/maxAttack → attack
      normalizeExportedBattleState(parsed)
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
