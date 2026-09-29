/**
 * DataPackageService.ts — 封神榜数据包管理（封神榜开发计划 §M2 / 规格说明书 §5 / 路线图 B2）
 *
 * 完整 / 选择性导出为单 JSON 包（meta：dataVersion / 导出时间 / 表清单 + 导出人 / 用途 / 目标消费方）；
 * 导入支持全量覆盖 / 增量合并（保留现有 / 以包内为准）；导入前可 dryRunImport 预演
 * 「新增 / 覆盖 / 跳过 / 将删除」四类清单（覆盖项含字段级 diff）；overwrite 策略执行前
 * 自动对包内表创建兜底快照（SnapshotService 注入时），失败即阻断导入。
 * overwrite 语义：只清包内清单里列出的表，包里未携带的表原样保留（非整库重置）。
 * 导入后递增版本 + 记录导入日志 + 健康检查返回断裂引用报告（界面提示，不强制拒绝）。
 * diffPackages：两个数据包按「新增 / 删除 / 字段变更」对比（快照对比共用 snapshot-diff 口径）。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE, STORAGE_STORE } from '@/domain/port/IPersistentStorage'
import type { DataIntegrityService } from '@/application/service/DataIntegrityService'
import type { SnapshotService } from '@/application/service/SnapshotService'
import { diffTableSets, type TableRows, type TableSetDiffResult } from '@/domain/fengshen/snapshot-diff'
import { bumpDataVersion } from '@/application/service/FengshenDataService'
import { computeFieldDiff, type FieldDiff } from '@/shared/utils/entity-diff'
import type { FengshenTableName, MetaDataVersion, OperationLogEntry } from '@/domain/fengshen/types'

export interface PackageMeta {
  dataVersion: number
  exportedAt: string
  tables: FengshenTableName[]
  count: number
  exportedBy?: string
  purpose?: string
  consumer?: string
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
  /** 无合法 id 被跳过的行数（与预演 invalid 同口径；不计入 skippedCount） */
  invalidCount: number
  version: number
  /** overwrite 策略导入前自动创建的兜底快照 id（供 UI 提示回滚入口） */
  backupSnapshotId?: string
  issues?: Array<{ sourceId: string; missingId: string }>
  errors?: string[]
}

/** dry-run 预演单行：overwrite 项附字段级 diff（diffValueText 字符串化，与操作日志同口径） */
export interface DryRunRowEntry {
  table: string
  id: string
  name?: string
  fieldDiffs?: FieldDiff[]
}

export interface DryRunReport {
  strategy: ImportStrategy
  /** 包内新 id，将新增 */
  add: DryRunRowEntry[]
  /** 包内已存在 id（merge-package-wins / overwrite），将以包内为准覆盖 */
  overwrite: DryRunRowEntry[]
  /** 已存在且保留现状（merge-keep-existing） */
  skip: DryRunRowEntry[]
  /** 仅 overwrite 策略：库内被清表中「包未携带」的现有行，导入后消失 */
  removed: DryRunRowEntry[]
  /** 无合法 id，导入时跳过 */
  invalid: number
}

const DATA_TABLES = Object.values(FENGSHEN_STORE).filter((t) => t !== FENGSHEN_STORE.META) as FengshenTableName[]

export class DataPackageService {
  /** 导入完成后回调（与 FengshenDataService.onDataChanged 同机制，供 UI 刷新版本/列表/引擎数据源） */
  onDataChanged: ((version: number) => void) | null = null

  constructor(
    private readonly storage: IPersistentStorage,
    private readonly integrity: DataIntegrityService,
    /** 注入后 overwrite 导入前自动创建兜底快照；缺省（旧调用方/单测）保持原行为 */
    private readonly snapshots?: SnapshotService,
  ) {}

  /** 导出：按表集合（缺省全部数据表）打包；extra 补导出人 / 用途 / 目标消费方（覆盖范围即 tables） */
  async exportPackage(
    tables?: FengshenTableName[],
    extra?: Pick<PackageMeta, 'exportedBy' | 'purpose' | 'consumer'>,
  ): Promise<DataPackage> {
    const selected = (tables?.length ? tables : DATA_TABLES) as FengshenTableName[]
    const meta = await this.storage.get<MetaDataVersion>(FENGSHEN_STORE.META, 'dataVersion')
    const pkg: DataPackage = {
      meta: {
        dataVersion: meta?.version ?? 0,
        exportedAt: new Date().toISOString(),
        tables: selected,
        count: 0,
        ...extra,
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

  /** 导入预演：按策略输出「新增 / 覆盖 / 跳过 / 将删除」清单，不写库。覆盖项含字段级 diff */
  async dryRunImport(pkg: DataPackage, strategy: ImportStrategy = 'merge-keep-existing'): Promise<DryRunReport> {
    const report: DryRunReport = { strategy, add: [], overwrite: [], skip: [], removed: [], invalid: 0 }
    if (!pkg || typeof pkg !== 'object' || !Array.isArray(pkg.meta?.tables)) return report
    const tables = (pkg.meta.tables as string[]).filter((t) => DATA_TABLES.includes(t as FengshenTableName))

    for (const table of tables) {
      const rows = pkg[table]
      if (!Array.isArray(rows)) continue
      const packageIds = new Set<string>()
      for (const row of rows) {
        const entity = row as { id?: unknown; name?: unknown }
        if (!entity || typeof entity.id !== 'string' || !entity.id) {
          report.invalid++
          continue
        }
        packageIds.add(entity.id)
        const name = typeof entity.name === 'string' && entity.name ? entity.name : undefined
        const existing = await this.storage.get<Record<string, unknown>>(table as StorageStoreName, entity.id)
        if (existing && strategy === 'merge-keep-existing') {
          report.skip.push({ table, id: entity.id, name })
          continue
        }
        if (existing) {
          // merge-package-wins / overwrite：以包内为准覆盖，附字段级 diff（updatedAt 为存储时间戳，不参与）
          report.overwrite.push({
            table,
            id: entity.id,
            name,
            fieldDiffs: computeFieldDiff(existing, entity as object),
          })
        } else {
          report.add.push({ table, id: entity.id, name })
        }
      }
      if (strategy === 'overwrite') {
        // 被清表中包未携带的现有行将被删除——dry-run 必须点名，防止「整表重置」被误读
        for (const key of await this.storage.keys(table as StorageStoreName)) {
          if (packageIds.has(key)) continue
          const rec = await this.storage.get<Record<string, unknown>>(table as StorageStoreName, key)
          report.removed.push({ table, id: key, name: rec ? rowName(rec) : undefined })
        }
      }
    }
    return report
  }

  /** 导入：全量覆盖或增量合并。overwrite 策略（注入 SnapshotService 时）先自动创建兜底快照，失败阻断导入 */
  async importPackage(pkg: DataPackage, strategy: ImportStrategy = 'merge-keep-existing'): Promise<ImportResult> {
    if (!pkg || typeof pkg !== 'object' || !Array.isArray(pkg.meta?.tables)) {
      return { ok: false, importedCount: 0, skippedCount: 0, invalidCount: 0, version: 0, errors: ['数据包格式不合法：缺少 meta.tables'] }
    }
    const tables = (pkg.meta.tables as string[]).filter((t) => DATA_TABLES.includes(t as FengshenTableName))

    let backupSnapshotId: string | undefined
    if (strategy === 'overwrite' && this.snapshots) {
      try {
        const backup = await this.snapshots.create(
          `覆盖导入自动兜底 v${await this.currentVersion()}`,
          tables as FengshenTableName[],
        )
        backupSnapshotId = backup.snapshot.id
      } catch (err) {
        // 兜底是 overwrite 唯一的反悔手段：快照失败就别动库
        return {
          ok: false,
          importedCount: 0,
          skippedCount: 0,
          invalidCount: 0,
          version: await this.currentVersion(),
          errors: [`覆盖导入已取消：兜底快照创建失败（${err instanceof Error ? err.message : String(err)}）`],
        }
      }
    }

    let importedCount = 0
    let skippedCount = 0
    let invalidCount = 0

    if (strategy === 'overwrite') {
      // 全量覆盖：只清空包内清单里列出的表（未携带的表原样保留），清空前已创建兜底快照
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
          invalidCount++
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
    const next = await bumpDataVersion(this.storage, (v) => this.onDataChanged?.(v))
    if (next === null) {
      return {
        ok: false,
        importedCount,
        skippedCount,
        invalidCount,
        version: 0,
        backupSnapshotId,
        errors: ['导入数据已写入，但数据版本更新失败（存储不可用），界面版本号可能未刷新'],
      }
    }
    await this.logImport(pkg.meta.tables.join(','), importedCount, next)

    // 导入后健康检查（报告断裂引用，不强制拒绝）
    const report = await this.integrity.runHealthCheck()
    return {
      ok: true,
      importedCount,
      skippedCount,
      invalidCount,
      version: next,
      backupSnapshotId,
      issues: report.issues.map((i) => ({ sourceId: i.sourceId, missingId: i.missingId })),
    }
  }

  /** 两个数据包对比（a 为基准，b 为目标），输出新增 / 删除 / 字段变更三色 */
  async diffPackages(a: DataPackage, b: DataPackage): Promise<TableSetDiffResult> {
    return diffTableSets(packageToTableRows(a), packageToTableRows(b))
  }

  /** 战斗数据快照：打包全部表 + dataVersion → snapshots store（规格说明书 §6.3 基础版，战斗开始时冻结） */
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

  private async currentVersion(): Promise<number> {
    const meta = await this.storage.get<MetaDataVersion>(FENGSHEN_STORE.META, 'dataVersion')
    return meta?.version ?? 0
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

/**
 * 包 → 表集行映射（diffTableSets 输入口径）；缺 rows 的表忽略。
 * NOTE: 表键必须先过 DATA_TABLES 白名单——'__proto__' 这类键会绕过 `??=` 落到
 * Object.prototype 上（原型污染），dryRunImport / importPackage 已过滤，此处同规。
 */
function packageToTableRows(pkg: DataPackage): Record<string, TableRows> {
  const set: Record<string, TableRows> = {}
  if (!pkg || typeof pkg !== 'object' || !Array.isArray(pkg.meta?.tables)) return set
  for (const table of pkg.meta.tables) {
    if (!DATA_TABLES.includes(table as FengshenTableName)) continue
    const rows = pkg[table]
    if (!Array.isArray(rows)) continue
    const bucket: TableRows = (set[table] ??= {})
    for (const row of rows) {
      const entity = row as { id?: unknown }
      if (!entity || typeof entity.id !== 'string' || !entity.id) continue
      bucket[entity.id] = entity as Record<string, unknown>
    }
  }
  return set
}

function rowName(entity: Record<string, unknown>): string | undefined {
  const name = entity.name
  return typeof name === 'string' && name ? name : undefined
}
