/**
 * FengshenDataService.ts — 封神榜写操作门面（封神榜开发计划 §3.3）
 *
 * 唯一的写入口：保存前经 DataIntegrityService 校验、删除前检查被引用；
 * 写成功后递增全局 dataVersion 并触发 onDataChanged 回调（界面订阅刷新），
 * 同时写入操作日志（meta store）。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import type { DataIntegrityService } from '@/application/service/DataIntegrityService'
import type { FengshenTableName, MetaDataVersion, OperationKind, OperationLogEntry } from '@/domain/fengshen/types'
import { computeFieldDiff, type FieldDiff } from '@/shared/utils/entity-diff'

export interface SaveResult {
  ok: boolean
  errors?: string[]
}

export class FengshenDataService {
  /** 写操作后回调（UI 订阅 dataVersion 变更） */
  onDataChanged: ((version: number) => void) | null = null

  constructor(
    private readonly storage: IPersistentStorage,
    private readonly integrity: DataIntegrityService,
  ) {}

  /** 新增 / 修改实体：校验通过则写入并递增版本 + 记录日志 */
  async save<T extends { id: string }>(table: FengshenTableName, entity: T): Promise<SaveResult> {
    if (!entity || typeof entity.id !== 'string' || !entity.id.trim()) {
      return { ok: false, errors: ['缺少 id，无法保存'] }
    }
    const validation = await this.integrity.validateOnSave(table, entity)
    if (!validation.valid) {
      return { ok: false, errors: validation.errors }
    }
    const store = table as StorageStoreName
    const existed = await this.storage.get(store, entity.id)
    const now = new Date().toISOString()
    // NOTE: set() 底层 QuotaExceeded 等写失败返回 false（promisify 兜底），必须检查，
    //       否则 UI 误报「已保存」而数据未落盘
    const written = await this.storage.set(store, entity.id, {
      ...(entity as object),
      updatedAt: now,
    })
    if (!written) {
      return { ok: false, errors: ['数据写入失败（存储已满或数据库不可用），请清理数据后重试'] }
    }
    await this.bumpVersion()
    const diffs: FieldDiff[] = existed
      ? computeFieldDiff(
          existed as unknown as Record<string, unknown>,
          entity as unknown as Record<string, unknown>,
        )
      : []
    await this.logOp(existed ? 'update' : 'create', table, entity.id, (entity as { name?: string }).name, diffs)
    return { ok: true }
  }

  /** 删除实体：被引用时拦截；删除后递增版本 + 记录日志 */
  async remove(table: FengshenTableName, id: string): Promise<SaveResult> {
    const block = await this.integrity.assertDeletable(table, id)
    if (!block.allowed) {
      const detail = block.blockers.map((b) => `${b.table}(${b.entityIds.join(',')})`).join('；')
      return { ok: false, errors: [`实体 ${id} 被以下数据引用，无法删除：${detail}`] }
    }
    const removed = await this.storage.remove(table as StorageStoreName, id)
    if (!removed) {
      return { ok: false, errors: ['数据删除失败（数据库不可用），请重试'] }
    }
    await this.bumpVersion()
    await this.logOp('delete', table, id)
    return { ok: true }
  }

  /** 递增全局 dataVersion 并通知订阅方 */
  private async bumpVersion(): Promise<number> {
    const meta = await this.storage.get<MetaDataVersion>(FENGSHEN_STORE.META, 'dataVersion')
    const next = (meta?.version ?? 0) + 1
    await this.storage.set(FENGSHEN_STORE.META, 'dataVersion', {
      id: 'dataVersion',
      version: next,
      updatedAt: new Date().toISOString(),
    })
    this.onDataChanged?.(next)
    return next
  }

  private async logOp(
    op: OperationKind,
    table: string,
    entityId: string,
    entityName?: string,
    diffs: FieldDiff[] = [],
  ): Promise<void> {
    const now = new Date().toISOString()
    const entry: OperationLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      op,
      table,
      entityId,
      entityName,
      timestamp: now,
      // update 记录字段级 diff（JSON 序列化），create/delete 无对比对象
      detail: diffs.length ? JSON.stringify(diffs) : undefined,
      updatedAt: now,
    }
    await this.storage.set(FENGSHEN_STORE.META, entry.id, entry)
  }
}
