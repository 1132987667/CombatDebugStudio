/**
 * DataIntegrityService.ts — 数据完整性服务（封神榜开发计划 §3.5 / 规格说明书 §4）
 *
 * 保存校验（必填 / 数值范围 / 唯一性 / 引用完整性）、删除保护（被引用拦截）、
 * 全局健康检查。引用检查与删除保护共享 schema.ts 的 REFERENCE_RULES 注册表。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { TABLE_SCHEMAS, REFERENCE_RULES, extractReferenceIds } from '@/domain/fengshen/schema'
import type { FengshenTableName } from '@/domain/fengshen/types'
import type { ElementsData } from '@/domain/fengshen/types'
import { validateBuffConfigShape } from '@/domain/buff/buffConfigValidation'
import { normalizeBuffEntries } from '@/shared/types/effects-json'

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface DeleteBlocker {
  table: FengshenTableName
  entityIds: string[]
}

export interface DeleteBlock {
  allowed: boolean
  blockers: DeleteBlocker[]
}

export interface HealthCheckIssue {
  sourceTable: FengshenTableName
  sourceId: string
  field: string
  missingId: string
  targetTable: FengshenTableName
}

export interface HealthCheckReport {
  scannedRules: number
  checkedEntities: number
  issues: HealthCheckIssue[]
}

export class DataIntegrityService {
  constructor(private readonly storage: IPersistentStorage) {}

  /** 保存前校验：必填 / 数值范围 / 唯一性 / 引用完整性 */
  async validateOnSave(table: FengshenTableName, entity: Record<string, unknown>): Promise<ValidationResult> {
    const errors: string[] = []
    const schema = TABLE_SCHEMAS[table]
    if (!schema) return { valid: true, errors }

    for (const field of schema.fields) {
      const value = entity[field.key]
      if (field.required && isEmpty(value)) {
        errors.push(`字段「${field.label}」为必填`)
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (field.min !== undefined && value < field.min) {
          errors.push(`字段「${field.label}」不能小于 ${field.min}（当前 ${value}）`)
        }
        if (field.max !== undefined && value > field.max) {
          errors.push(`字段「${field.label}」不能大于 ${field.max}（当前 ${value}）`)
        }
      }
    }

    if (schema.uniqueFields?.length) {
      const all = await this.listAll(table)
      for (const uf of schema.uniqueFields) {
        const v = entity[uf]
        if (isEmpty(v)) continue
        const dup = all.find((r) => r[uf] === v && r.id !== entity.id)
        if (dup) {
          errors.push(`字段「${uf}」与现有记录「${dup.id}」重复（唯一性检测）`)
        }
      }
    }

    // Buff 结构校验：buffs 表混合格式（BuffJsonEntry / effects 条目），先归一化再校验，
    // 拦截引擎运行期会抛错的坏数据（未知效果类型 / polarity 缺失 / 非法触发阶段）
    if (table === 'buffs') {
      const [normalized] = normalizeBuffEntries([entity as unknown])
      if (normalized) errors.push(...validateBuffConfigShape(normalized as unknown as Record<string, unknown>))
    }

    for (const rule of REFERENCE_RULES.filter((r) => r.sourceTable === table)) {
      const refIds = extractReferenceIds(entity, rule.path)
      if (refIds.length === 0 && rule.optional) continue
      for (const refId of refIds) {
        if (!(await this.existsIn(rule.targetTables, refId))) {
          errors.push(`引用 ${rule.path} → ${refId} 不存在（目标表：${rule.targetTables.join('|')}）`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /** 删除前置检查：其他表是否引用该 ID，被引用则拦截并提示引用方 */
  async assertDeletable(table: FengshenTableName, id: string): Promise<DeleteBlock> {
    const blockers: DeleteBlocker[] = []
    for (const rule of REFERENCE_RULES) {
      if (!rule.targetTables.includes(table)) continue
      const entities = await this.listAll(rule.sourceTable)
      const referencing = entities
        .filter((e) => extractReferenceIds(e, rule.path).includes(id))
        .map((e) => e.id)
      if (referencing.length) {
        blockers.push({ table: rule.sourceTable, entityIds: referencing })
      }
    }
    return { allowed: blockers.length === 0, blockers }
  }

  /** 全局健康检查：按 REFERENCE_RULES 扫描全部引用，输出断裂引用报告 */
  async runHealthCheck(): Promise<HealthCheckReport> {
    const issues: HealthCheckIssue[] = []
    let checkedEntities = 0
    for (const rule of REFERENCE_RULES) {
      const entities = await this.listAll(rule.sourceTable)
      for (const entity of entities) {
        checkedEntities++
        const refIds = extractReferenceIds(entity, rule.path)
        if (refIds.length === 0 && rule.optional) continue
        for (const refId of refIds) {
          if (!(await this.existsIn(rule.targetTables, refId))) {
            issues.push({
              sourceTable: rule.sourceTable,
              sourceId: entity.id,
              field: rule.path,
              missingId: refId,
              targetTable: rule.targetTables[0],
            })
          }
        }
      }
    }
    return { scannedRules: REFERENCE_RULES.length, checkedEntities, issues }
  }

  /** 反向引用：哪些表的哪些实体引用了指定 id（供详情面板「被引用」视图） */
  async findReferencing(
    table: FengshenTableName,
    id: string,
  ): Promise<Array<{ sourceTable: FengshenTableName; ids: string[] }>> {
    const out: Array<{ sourceTable: FengshenTableName; ids: string[] }> = []
    for (const rule of REFERENCE_RULES) {
      if (!rule.targetTables.includes(table)) continue
      const entities = await this.listAll(rule.sourceTable)
      const ids = entities
        .filter((e) => extractReferenceIds(e, rule.path).includes(id))
        .map((e) => e.id)
      if (ids.length) out.push({ sourceTable: rule.sourceTable, ids })
    }
    return out
  }

  // ── 内部工具 ────────────────────────────────────────────────

  private async listAll(table: FengshenTableName): Promise<Array<Record<string, unknown> & { id: string }>> {
    // NOTE: 表名与 store 名一致（FENGSHEN_STORE 值），直接用表名作 store
    const keys = await this.storage.keys(table as StorageStoreName)
    const out: Array<Record<string, unknown> & { id: string }> = []
    for (const key of keys) {
      const rec = await this.storage.get<Record<string, unknown>>(table as StorageStoreName, key)
      if (rec && typeof rec.id === 'string') out.push(rec as Record<string, unknown> & { id: string })
    }
    return out
  }

  private async existsIn(tables: FengshenTableName[], id: string): Promise<boolean> {
    for (const table of tables) {
      if (table === 'elements') {
        const doc = await this.storage.get<ElementsData>(FENGSHEN_STORE.ELEMENTS, 'elements')
        if (doc?.elements?.some((e) => e.id === id)) return true
        continue
      }
      const rec = await this.storage.get(table as StorageStoreName, id)
      if (rec) return true
    }
    return false
  }
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}
