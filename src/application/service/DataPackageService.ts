/**
 * DataPackageService.ts — 封神榜数据包管理（封神榜开发计划 §M2 / 规格说明书 §5）
 *
 * 完整 / 选择性导出为单 JSON 包（含 meta：dataVersion / 导出时间 / 表清单）；
 * 导入支持全量覆盖 / 增量合并（保留现有 / 以包内为准）；导入后递增版本 + 记录导入日志，
 * 并运行健康检查返回断裂引用报告（界面提示，不强制拒绝——备份还原可能含历史断裂引用）。
 * buildSnapshot：打包全部表 + dataVersion 存入 snapshots store（战斗数据快照基础版）。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE, STORAGE_STORE } from '@/domain/port/IPersistentStorage'
import type { DataIntegrityService } from '@/application/service/DataIntegrityService'
import type { FengshenTableName, MetaDataVersion, OperationLogEntry } from '@/domain/fengshen/types'

export interface PackageMeta {
  dataVersion: number
  exportedAt: string
  tables: FengshenTableName[]
  count: number
}

export interface DataPackage {
  meta: PackageMeta
  [table: string]: unknown
}

export type ImportStrategy = 'overwrite' | 'merge-keep-existing' | 'merge-package-wins'

export interface ImportResult {
  ok: boolean
  importedCount: number
  skippedCount: number
  version: number
  issues?: Array<{ sourceId: string; missingId: string }>
  errors?: string[]
}

const DATA_TABLES = Object.values(FENGSHEN_STORE).filter((t) => t !== FENGSHEN_STORE.META) as FengshenTableName[]

export class DataPackageService {
  /** 导入完成后回调（与 FengshenDataService.onDataChanged 同机制，供 UI 刷新版本/列表/引擎数据源） */
  onDataChanged: ((version: number) => void) | null = null

  constructor(
    private readonly storage: IPersistentStorage,
    private readonly integrity: DataIntegrityService,
  ) {}

  /** 导出：按表集合（缺省全部数据表）打包 */
  async exportPackage(tables?: FengshenTableName[]): Promise<DataPackage> {
    const selected = (tables?.length ? tables : DATA_TABLES) as FengshenTableName[]
    const meta = await this.storage.get<MetaDataVersion>(FENGSHEN_STORE.META, 'dataVersion')
    const pkg: DataPackage = {
      meta: {
        dataVersion: meta?.version ?? 0,
        exportedAt: new Date().toISOString(),
        tables: selected,
        count: 0,
      },
    }
    let count = 0
    for (const table of selected) {
      const store = table as StorageStoreName
      const keys = await this.storage.keys(store)
      const rows: unknown[] = []
      for (const key of keys) {
        const rec = await this.storage.get(store, key)
        if (rec) rows.push(rec)
      }
      pkg[table] = rows
      count += rows.length
    }
    pkg.meta.count = count
    return pkg
  }

  /** 导入：全量覆盖或增量合并 */
  async importPackage(pkg: DataPackage, strategy: ImportStrategy = 'merge-keep-existing'): Promise<ImportResult> {
    if (!pkg || typeof pkg !== 'object' || !Array.isArray(pkg.meta?.tables)) {
      return { ok: false, importedCount: 0, skippedCount: 0, version: 0, errors: ['数据包格式不合法：缺少 meta.tables'] }
    }
    let importedCount = 0
    let skippedCount = 0
    const tables = (pkg.meta.tables as string[]).filter((t) => DATA_TABLES.includes(t as FengshenTableName))

    if (strategy === 'overwrite') {
      // 全量覆盖：先清空涉及的表再写入
      for (const table of tables) {
        await this.storage.clear(table as StorageStoreName)
      }
    }

    for (const table of tables) {
      const rows = pkg[table]
      if (!Array.isArray(rows)) continue
      for (const row of rows) {
        const entity = row as { id?: unknown; updatedAt?: unknown }
        if (!entity || typeof entity.id !== 'string' || !entity.id) {
          skippedCount++
          continue
        }
        const exists = (await this.storage.get(table as StorageStoreName, entity.id)) != null
        if (exists && strategy === 'merge-keep-existing') {
          skippedCount++
          continue
        }
        await this.storage.set(table as StorageStoreName, entity.id, {
          ...(row as object),
          updatedAt: entity.updatedAt ?? new Date().toISOString(),
        })
        importedCount++
      }
    }

    // 递增版本 + 记录导入日志
    const meta = await this.storage.get<MetaDataVersion>(FENGSHEN_STORE.META, 'dataVersion')
    const next = (meta?.version ?? 0) + 1
    await this.storage.set(FENGSHEN_STORE.META, 'dataVersion', {
      id: 'dataVersion',
      version: next,
      updatedAt: new Date().toISOString(),
    })
    await this.logImport(pkg.meta.tables.join(','), importedCount, next)
    this.onDataChanged?.(next)

    // 导入后健康检查（报告断裂引用，不强制拒绝）
    const report = await this.integrity.runHealthCheck()
    return {
      ok: true,
      importedCount,
      skippedCount,
      version: next,
      issues: report.issues.map((i) => ({ sourceId: i.sourceId, missingId: i.missingId })),
    }
  }

  /** 战斗数据快照：打包全部表 + dataVersion → snapshots store（规格说明书 §6.3 基础版） */
  async buildSnapshot(battleId: string): Promise<{ key: string; version: number } | null> {
    try {
      const pkg = await this.exportPackage()
      const key = `fengshen_snapshot_${battleId}`
      await this.storage.set(STORAGE_STORE.SNAPSHOTS, key, {
        battleId,
        dataVersion: pkg.meta.dataVersion,
        exportedAt: pkg.meta.exportedAt,
        tables: pkg,
      })
      return { key, version: pkg.meta.dataVersion }
    } catch {
      return null
    }
  }

  private async logImport(tables: string, count: number, version: number): Promise<void> {
    const now = new Date().toISOString()
    const entry: OperationLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      op: 'import',
      table: 'package',
      entityId: tables,
      entityName: `导入 ${count} 条`,
      timestamp: now,
      detail: `数据版本 -> v${version}`,
      updatedAt: now,
    }
    await this.storage.set(FENGSHEN_STORE.META, entry.id, entry)
  }
}
