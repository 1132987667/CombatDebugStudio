/**
 * DriftCheckService.ts — configs 双源漂移检查（路线图 B2 交付闭环）
 *
 * 对照源 = buildSeedTableSet()（configs/ JSON + 代码构建器，与种子导入同一构建链），
 * 检出三类：库内手改（modified，附字段级 diff）/ 库内新增（addedInDb）/ 库内缺失（missingInDb）。
 * 处置分级：仅看差异（check）→ 仅重载差异表（reloadTables，差异表 clear 后重播种子行，
 * 库内新增行一并清除）→ 全量重置（fengshenStore.reloadFromProject，入口在模块顶栏）。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { buildSeedTableSet } from '@/infrastructure/adapters/storage/seed'
import { computeFieldDiff, type FieldDiff } from '@/shared/utils/entity-diff'
import { bumpDataVersion } from '@/application/service/FengshenDataService'
import type { FengshenTableName, OperationLogEntry } from '@/domain/fengshen/types'

export type DriftReason = 'modified' | 'added-in-db' | 'missing-in-db'

export interface DriftItem {
  table: string
  id: string
  name?: string
  reason: DriftReason
  /** 仅 modified：库内相对 configs 的字段级差异（before=configs 值，after=库内值；updatedAt 不参与） */
  fieldDiffs?: FieldDiff[]
}

export interface DriftReport {
  checkedTables: string[]
  modified: DriftItem[]
  addedInDb: DriftItem[]
  missingInDb: DriftItem[]
}

function rowName(entity: unknown): string | undefined {
  const name = (entity as { name?: unknown } | null)?.name
  return typeof name === 'string' && name ? name : undefined
}

export class DriftCheckService {
  constructor(private readonly storage: IPersistentStorage) {}

  /** 库内 vs configs 种子行集对比。tables 缺省 = 全部有对照源的表 */
  async check(tables?: FengshenTableName[]): Promise<DriftReport> {
    const seedSet = buildSeedTableSet()
    const checkedTables = (tables?.length ? tables : (Object.keys(seedSet) as FengshenTableName[])).filter(
      (t) => seedSet[t] != null,
    )
    const report: DriftReport = { checkedTables, modified: [], addedInDb: [], missingInDb: [] }
    for (const table of checkedTables) {
      const seedRows = seedSet[table]
      const dbRows: Record<string, Record<string, unknown>> = {}
      const store = table as StorageStoreName
      for (const key of await this.storage.keys(store)) {
        const rec = await this.storage.get<Record<string, unknown>>(store, key)
        if (rec) dbRows[key] = rec
      }
      const ids = new Set([...Object.keys(seedRows), ...Object.keys(dbRows)])
      for (const id of ids) {
        const seed = seedRows[id]
        const db = dbRows[id]
        if (seed && !db) {
          report.missingInDb.push({ table, id, name: rowName(seed), reason: 'missing-in-db' })
        } else if (!seed && db) {
          report.addedInDb.push({ table, id, name: rowName(db), reason: 'added-in-db' })
        } else {
          // 库行带 updatedAt（种子落库时刻），种子行无/带生成时刻值——computeFieldDiff 已排除该字段
          const fieldDiffs = computeFieldDiff(seed as object, db as object)
          if (fieldDiffs.length) {
            report.modified.push({ table, id, name: rowName(db), reason: 'modified', fieldDiffs })
          }
        }
      }
    }
    const byRow = (a: DriftItem, b: DriftItem): number =>
      a.table === b.table ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.table < b.table ? -1 : 1
    report.modified.sort(byRow)
    report.addedInDb.sort(byRow)
    report.missingInDb.sort(byRow)
    return report
  }

  /**
   * 仅重载指定表：clear 后重播 configs 种子行（与首次播种同构，updatedAt 刷新）。
   * 只接受有对照源的表；写后递增版本 + 记操作日志（op=rollback「回退」）。
   */
  async reloadTables(tables: FengshenTableName[]): Promise<{ tables: string[]; restoredRows: number; version: number }> {
    const seedSet = buildSeedTableSet()
    const valid = tables.filter((t) => seedSet[t] != null)
    if (!valid.length) throw new Error('所选表没有 configs 对照源，无法重载')
    let restoredRows = 0
    for (const table of valid) {
      const store = table as StorageStoreName
      await this.storage.clear(store)
      for (const [id, entity] of Object.entries(seedSet[table])) {
        const written = await this.storage.set(store, id, { ...(entity as object), updatedAt: new Date().toISOString() })
        if (!written) throw new Error(`重载写入失败（表 ${table}，存储不可用），已恢复内容可能不完整`)
        restoredRows++
      }
    }
    const version = await bumpDataVersion(this.storage, null)
    if (version === null) throw new Error('重载已完成，但数据版本更新失败（存储不可用）')
    const now = new Date().toISOString()
    const entry: OperationLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      op: 'rollback',
      table: 'package',
      entityId: valid.join(','),
      entityName: `重载 ${valid.length} 表回 configs`,
      timestamp: now,
      detail: `差异表重播种子 ${restoredRows} 行`,
      updatedAt: now,
    }
    await this.storage.set(FENGSHEN_STORE.META, entry.id, entry)
    return { tables: valid, restoredRows, version }
  }
}
