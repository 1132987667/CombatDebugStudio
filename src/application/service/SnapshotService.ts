/**
 * SnapshotService.ts — 数值快照归档与回退（路线图 B2 交付闭环）
 *
 * ValueSnapshot：选定表集的「行 id → 实体」全量拷贝，存 snapshots store；
 * 列表索引（SnapshotMeta[]）单独存同 store 一个文档，列表页免读大对象。
 * 保留最近 MAX_SNAPSHOTS 份，溢出删除最旧并在创建结果中带回（UI 溢出提示）。
 * 回滚 = 对快照含有的每张表 clear 后整表写回快照行（保证「与快照逐字段一致」，
 * 快照之后新增的行会被清除）+ 递增 dataVersion + 写操作日志。
 *
 * 缺省快照域 = 数值体系 4 表（params/attributes/growth/elements）：它们的唯一
 * 权威在 IndexedDB，改坏无 configs 兜底。其余表（xiyou/skills/装备等）有 configs
 * JSON 版本真相，兜底走双源漂移检查（DriftCheckService）；但 create 支持传任意
 * 表集——overwrite 导入前对「包内表」自动兜底就是用这个口子。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE, STORAGE_STORE } from '@/domain/port/IPersistentStorage'
import { diffTableSets, type TableRows, type TableSetDiffResult } from '@/domain/fengshen/snapshot-diff'
import { bumpDataVersion } from '@/application/service/FengshenDataService'
import type { DataIntegrityService } from '@/application/service/DataIntegrityService'
import type { FengshenTableName, MetaDataVersion, OperationLogEntry } from '@/domain/fengshen/types'

export interface ValueSnapshot {
  id: string
  label: string
  createdAt: number
  dataVersion: number
  /** 表名 → 行 id → 实体（创建时刻的整表拷贝，含 updatedAt 原值） */
  tables: Record<string, TableRows>
}

/** 列表索引行（不含表数据，列表页轻量渲染） */
export interface SnapshotMeta {
  id: string
  label: string
  createdAt: number
  dataVersion: number
  tables: string[]
  rowCount: number
}

export const SNAPSHOT_INDEX_KEY = 'snapshot_index'
export const MAX_SNAPSHOTS = 20

/** 缺省快照域：无 configs JSON 逐行对照的数值体系表（对照源兜底见 DriftCheckService） */
export const SNAPSHOT_DEFAULT_TABLES: readonly FengshenTableName[] = ['params', 'attributes', 'growth', 'elements']

interface SnapshotIndexDoc {
  id: string
  snapshots: SnapshotMeta[]
}

export class SnapshotService {
  constructor(
    private readonly storage: IPersistentStorage,
    private readonly integrity: DataIntegrityService,
  ) {}

  /** 归档快照：tables 缺省数值体系 4 表。写失败抛错（兜底快照失败时调用方必须阻断后续操作） */
  async create(label: string, tables?: FengshenTableName[]): Promise<{ snapshot: ValueSnapshot; pruned: SnapshotMeta[] }> {
    const selected = (tables?.length ? tables : SNAPSHOT_DEFAULT_TABLES) as FengshenTableName[]
    const tableRows: Record<string, TableRows> = {}
    let rowCount = 0
    for (const table of selected) {
      const rows: TableRows = {}
      for (const key of await this.storage.keys(table as StorageStoreName)) {
        const rec = await this.storage.get<Record<string, unknown>>(table as StorageStoreName, key)
        if (rec) {
          rows[key] = rec
          rowCount++
        }
      }
      tableRows[table] = rows
    }
    const meta = await this.storage.get<MetaDataVersion>(FENGSHEN_STORE.META, 'dataVersion')
    const snapshot: ValueSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label,
      createdAt: Date.now(),
      dataVersion: meta?.version ?? 0,
      tables: tableRows,
    }
    const written = await this.storage.set(STORAGE_STORE.SNAPSHOTS, snapshot.id, snapshot)
    if (!written) throw new Error('快照写入失败（存储已满或数据库不可用），未创建快照')

    const index = await this.readIndex()
    index.snapshots.unshift({
      id: snapshot.id,
      label: snapshot.label,
      createdAt: snapshot.createdAt,
      dataVersion: snapshot.dataVersion,
      tables: selected,
      rowCount,
    })
    // 修剪：超出上限从最旧端删除（索引按创建时间倒序，尾部即最旧）。
    // NOTE: 先写索引成功后再删旧数据——若索引写入失败抛错，安全侧是多留了几份快照，
    //       而不是「数据已删、索引仍在」的幽灵条目
    const pruned: SnapshotMeta[] = []
    while (index.snapshots.length > MAX_SNAPSHOTS) {
      const oldest = index.snapshots.pop()
      if (!oldest) break
      pruned.push(oldest)
    }
    if (!(await this.storage.set(STORAGE_STORE.SNAPSHOTS, SNAPSHOT_INDEX_KEY, index))) {
      // HACK: 索引写失败时快照数据已落库但列表不可见（孤儿数据），空间可被下一份创建的修剪回收；
      //       彻底解法是快照数据与索引同事务（IndexedDB transaction），单机工具暂接受
      throw new Error('快照已保存，但列表索引更新失败（存储不可用），本份快照可能不出现在列表中')
    }
    for (const old of pruned) {
      await this.storage.remove(STORAGE_STORE.SNAPSHOTS, old.id)
    }
    return { snapshot, pruned }
  }

  /** 快照列表（轻量索引，不含表数据），按创建时间倒序 */
  async list(): Promise<SnapshotMeta[]> {
    return (await this.readIndex()).snapshots
  }

  async get(id: string): Promise<ValueSnapshot | null> {
    return this.storage.get<ValueSnapshot>(STORAGE_STORE.SNAPSHOTS, id)
  }

  async remove(id: string): Promise<boolean> {
    const removed = await this.storage.remove(STORAGE_STORE.SNAPSHOTS, id)
    const index = await this.readIndex()
    const next = index.snapshots.filter((s) => s.id !== id)
    if (next.length !== index.snapshots.length) {
      // 数据删除失败（removed=false）只造成不可见残留，无害；索引必须与列表意图保持一致
      if (!(await this.storage.set(STORAGE_STORE.SNAPSHOTS, SNAPSHOT_INDEX_KEY, { id: SNAPSHOT_INDEX_KEY, snapshots: next }))) {
        throw new Error('快照已删除，但列表索引更新失败（存储不可用），列表可能仍显示本份快照')
      }
    }
    return removed
  }

  /**
   * 回滚：快照含有的每张表 clear 后整表写回（行内容原样含 updatedAt，保证与快照逐字段一致）。
   * 回滚删除的行可能被其他表引用——完成后跑健康检查带回断裂引用（对齐导入行为）。
   * HACK: 无跨表事务——clear 与写回之间失败会留半截表（IndexedDB transaction 为升级路径，
   * 单机工具 + 快照本身可再次回滚，先接受此天花板）。
   */
  async rollback(id: string): Promise<{
    tables: string[]
    restoredRows: number
    version: number
    issues?: Array<{ sourceId: string; missingId: string }>
  }> {
    const snapshot = await this.get(id)
    if (!snapshot) throw new Error('快照不存在或已被清理，无法回滚')
    let restoredRows = 0
    for (const [table, rows] of Object.entries(snapshot.tables)) {
      const store = table as StorageStoreName
      await this.storage.clear(store)
      for (const [rowId, entity] of Object.entries(rows)) {
        const written = await this.storage.set(store, rowId, entity)
        if (!written) throw new Error(`回滚写入失败（表 ${table}），已恢复内容可能不完整`)
        restoredRows++
      }
    }
    const version = await bumpDataVersion(this.storage, null)
    if (version === null) throw new Error('回滚已完成，但数据版本更新失败（存储不可用）')
    await this.logOp(snapshot)
    const report = await this.integrity.runHealthCheck()
    return {
      tables: Object.keys(snapshot.tables),
      restoredRows,
      version,
      issues: report.issues.map((i) => ({ sourceId: i.sourceId, missingId: i.missingId })),
    }
  }

  /** 快照（before）vs 当前库（after），对比范围 = 快照含有的表集 */
  async diffWithCurrent(id: string): Promise<TableSetDiffResult> {
    const snapshot = await this.get(id)
    if (!snapshot) throw new Error('快照不存在或已被清理，无法对比')
    const current: Record<string, TableRows> = {}
    for (const table of Object.keys(snapshot.tables)) {
      const rows: TableRows = {}
      for (const key of await this.storage.keys(table as StorageStoreName)) {
        const rec = await this.storage.get<Record<string, unknown>>(table as StorageStoreName, key)
        if (rec) rows[key] = rec
      }
      current[table] = rows
    }
    return diffTableSets(snapshot.tables, current)
  }

  /** 两份快照互比：a 为 before，b 为 after，范围 = 两表集并集 */
  async diffSnapshots(aId: string, bId: string): Promise<TableSetDiffResult> {
    const [a, b] = await Promise.all([this.get(aId), this.get(bId)])
    if (!a || !b) throw new Error('快照不存在或已被清理，无法对比')
    return diffTableSets(a.tables, b.tables)
  }

  private async readIndex(): Promise<SnapshotIndexDoc> {
    const doc = await this.storage.get<SnapshotIndexDoc>(STORAGE_STORE.SNAPSHOTS, SNAPSHOT_INDEX_KEY)
    return doc && Array.isArray(doc.snapshots) ? doc : { id: SNAPSHOT_INDEX_KEY, snapshots: [] }
  }

  private async logOp(snapshot: ValueSnapshot): Promise<void> {
    const now = new Date().toISOString()
    const tables = Object.keys(snapshot.tables).join(',')
    const entry: OperationLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      op: 'rollback',
      table: 'package',
      entityId: tables,
      entityName: `回滚「${snapshot.label}」`,
      timestamp: now,
      detail: `整表回写 ${tables}`,
      updatedAt: now,
    }
    await this.storage.set(FENGSHEN_STORE.META, entry.id, entry)
  }
}
