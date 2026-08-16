/**
 * DataIntegrityService.ts — 数据完整性服务（封神榜开发计划 §3.5 / 规格说明书 §4）
 *
 * 保存校验（必填 / 数值范围 / 唯一性 / 引用完整性）、删除保护（被引用拦截）、
 * 全局健康检查。引用检查与删除保护共享 schema.ts 的 REFERENCE_RULES 注册表。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import { TABLE_SCHEMAS, REFERENCE_RULES, extractReferenceIds } from '@/domain/fengshen/schema'
import type { FengshenTableName, XiyouData } from '@/domain/fengshen/types'
import type { ElementsData } from '@/domain/fengshen/types'
import { AttributeMetaMap } from '@/domain/attribute/types'
import { validateSlotKey, affixConflictFor } from '@/shared/utils/equipmentAffix'
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

/** 健康检查问题类别：integrity=断裂/非法引用，duplicate_name=命名重复，duplicate_ref=字段内重复引用 */
export type HealthCheckKind = 'integrity' | 'duplicate_name' | 'duplicate_ref'

export interface HealthCheckIssue {
  kind: HealthCheckKind
  sourceTable: FengshenTableName
  sourceId: string
  field: string
  missingId: string
  /** 权威源：封神榜表名 / attributes / schools / slot / valueRange 等外部权威 */
  targetTable: string
  /** 人类可读补充说明（如命名重复列出的全部冲突 id） */
  detail?: string
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

    // 装备词条强校验：attribute 必须存在于 attributes.json / slotKey 合法 / school 存在于 schools.json / valueRange 完整
    if (table === 'equipment_affixes') {
      const schoolNames = await this.getSchoolNames()
      errors.push(...this.equipmentAffixIssues(entity, schoolNames).map((i) => i.message))
    }

    // 经验与金钱结构化参数强校验：params 表 data 字段按 id 匹配对应表结构
    if (table === 'params') {
      errors.push(...this.expGoldIssues(entity as { id?: unknown; data?: unknown }))
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

  /** 全局健康检查：按 REFERENCE_RULES 扫描全部引用 + 装备词条强约束，输出断裂/非法报告 */
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
              kind: 'integrity',
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

    // 装备词条强约束扫描（attribute / slotKey / school / valueRange）
    const schoolNames = await this.getSchoolNames()
    const eqAffixes = await this.listAll('equipment_affixes')
    for (const entity of eqAffixes) {
      checkedEntities++
      for (const issue of this.equipmentAffixIssues(entity, schoolNames)) {
        issues.push({ kind: 'integrity', sourceTable: 'equipment_affixes', sourceId: entity.id, ...issue })
      }
    }

    // 经验与金钱结构化参数扫描（exp_table / enemy_reward_table / level_diff_bonus）
    const params = await this.listAll('params')
    for (const entity of params) {
      if (!['exp_table', 'enemy_reward_table', 'level_diff_bonus'].includes(entity.id)) continue
      checkedEntities++
      for (const message of this.expGoldIssues(entity)) {
        issues.push({
          kind: 'integrity',
          sourceTable: 'params',
          sourceId: entity.id,
          field: 'data',
          missingId: message,
          targetTable: 'params',
        })
      }
    }

    // 命名重复（表内 / items×equipment 跨表）：名称 → 组内去重 id，不同 id 数 >1 即重复
    checkedEntities += await this.scanNameDuplicates(issues)

    // 字段内重复引用：数组路径（skillIds / drops[].itemId / steps[].buffId 等）同一 id 出现多次
    checkedEntities += await this.scanDuplicateRefs(issues)

    return { scannedRules: REFERENCE_RULES.length, checkedEntities, issues }
  }

  /**
   * 命名重复扫描：收集 items + equipment 两表的 (id, name)，按 name 分组、组内按 id 去重，
   * 去重后仍多出 1 个不同 id 即报「同名不同 id」。
   * NOTE: 派生关系（materials⊂items / gears⊂equipment）与装备注册（装备同 id 同时在 items 与 equipment）
   *       天然同 id 同名，经 id 去重后不计为重复；只有真正「不同 id 共用一名」才报。
   */
  private async scanNameDuplicates(issues: HealthCheckIssue[]): Promise<number> {
    const byName = new Map<string, Map<string, FengshenTableName>>()
    const collect = (table: FengshenTableName, entities: Array<Record<string, unknown> & { id: string }>) => {
      for (const e of entities) {
        const name = typeof e.name === 'string' ? e.name.trim() : ''
        if (!name) continue
        if (!byName.has(name)) byName.set(name, new Map())
        byName.get(name)!.set(e.id, table)
      }
    }
    const items = await this.listAll('items')
    const equipment = await this.listAll('equipment')
    collect('items', items)
    collect('equipment', equipment)

    for (const [name, idMap] of byName) {
      if (idMap.size < 2) continue
      const entries = Array.from(idMap.entries())
      issues.push({
        kind: 'duplicate_name',
        sourceTable: 'items',
        sourceId: entries[0][0],
        field: 'name',
        missingId: name,
        targetTable: 'items/equipment',
        detail: `名称「${name}」被多个不同 id 共用：${entries.map(([id, t]) => `${t}:${id}`).join(', ')}`,
      })
    }
    return items.length + equipment.length
  }

  /** 字段内重复引用扫描：REFERENCE_RULES 各路径下，同一实体对某 id 引用多次（数组字段重复项） */
  private async scanDuplicateRefs(issues: HealthCheckIssue[]): Promise<number> {
    let checked = 0
    for (const rule of REFERENCE_RULES) {
      const entities = await this.listAll(rule.sourceTable)
      for (const entity of entities) {
        checked++
        const refIds = extractReferenceIds(entity, rule.path)
        if (refIds.length < 2) continue
        const seen = new Set<string>()
        for (const refId of refIds) {
          if (seen.has(refId)) {
            issues.push({
              kind: 'duplicate_ref',
              sourceTable: rule.sourceTable,
              sourceId: entity.id,
              field: rule.path,
              missingId: refId,
              targetTable: rule.targetTables[0],
              detail: `字段「${rule.path}」内重复引用 ${refId}`,
            })
          } else {
            seen.add(refId)
          }
        }
      }
    }
    return checked
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

  /** 学校（流派）name 集合：读封神榜 xiyou 表 schools 文档（seed 自 configs/xiyou/schools.json，data 为 { schools: [...] } 包裹） */
  private async getSchoolNames(): Promise<Set<string>> {
    const doc = await this.storage.get<XiyouData>(FENGSHEN_STORE.XIYOU, 'schools')
    const data = doc?.data
    const names = new Set<string>()
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { schools?: unknown[] } | undefined)?.schools)
        ? (data as { schools: unknown[] }).schools
        : []
    for (const s of rows) {
      if (s && typeof (s as Record<string, unknown>).name === 'string') names.add((s as { name: string }).name)
    }
    return names
  }

  /**
   * 经验与金钱结构化参数强校验（保存校验与健康检查共用）。
   * 按 params 记录 id 匹配对应表：exp_table / enemy_reward_table / level_diff_bonus。
   * 返回问题列表（不符合规则的错误消息）。
   */
  private expGoldIssues(entity: { id?: unknown; data?: unknown }): string[] {
    if (typeof entity.id !== 'string') return []
    const data = entity.data as Record<string, unknown> | undefined
    if (!data || typeof data !== 'object') {
      return entity.id.startsWith('exp_table') || entity.id.startsWith('enemy_reward_table') || entity.id.startsWith('level_diff_bonus')
        ? ['结构化参数缺少 data 字段']
        : []
    }
    switch (entity.id) {
      case 'exp_table':
        return this.validateExpTable(data)
      case 'enemy_reward_table':
        return this.validateEnemyRewardTable(data)
      case 'level_diff_bonus':
        return this.validateLevelDiffBonus(data)
      default:
        return []
    }
  }

  private validateExpTable(data: Record<string, unknown>): string[] {
    const errors: string[] = []
    const maxLevel = data.maxLevel
    if (typeof maxLevel !== 'number' || !Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 100) {
      errors.push('最大等级超出允许范围（1~100）')
    }
    const entries = data.entries
    if (!Array.isArray(entries)) {
      return [...errors, '升级经验表缺少 entries 数组']
    }
    const levels = new Set<number>()
    for (const e of entries) {
      const entry = e as { level?: unknown; expRequired?: unknown }
      if (typeof entry.level !== 'number' || typeof entry.expRequired !== 'number' || !Number.isInteger(entry.expRequired) || entry.expRequired <= 0) {
        errors.push(`等级 ${String(entry.level)}：升级经验必须为正整数`)
      }
      if (typeof entry.level === 'number') levels.add(entry.level)
    }
    if (typeof maxLevel === 'number' && maxLevel >= 1 && maxLevel <= 100) {
      for (let lv = 1; lv <= maxLevel; lv++) {
        if (!levels.has(lv)) errors.push(`等级 ${lv} 缺失，请补全`)
      }
    }
    return errors
  }

  private validateEnemyRewardTable(data: Record<string, unknown>): string[] {
    const errors: string[] = []
    const entries = data.entries
    if (!Array.isArray(entries)) return ['敌人奖励基准缺少 entries 数组']
    for (const e of entries) {
      const entry = e as { enemyLevel?: unknown; baseExp?: unknown; goldMin?: unknown; goldMax?: unknown }
      if (typeof entry.baseExp !== 'number' || !Number.isInteger(entry.baseExp) || entry.baseExp <= 0) {
        errors.push(`敌人等级 ${String(entry.enemyLevel)}：基础经验必须为正整数`)
      }
      if (typeof entry.goldMin !== 'number' || typeof entry.goldMax !== 'number' || entry.goldMin > entry.goldMax) {
        errors.push(`敌人等级 ${String(entry.enemyLevel)}：金钱下限不能大于上限`)
      }
    }
    const roleMult = data.roleMultiplier
    if (roleMult && typeof roleMult === 'object') {
      for (const [key, v] of Object.entries(roleMult as Record<string, unknown>)) {
        if (typeof v !== 'number' || !(v > 0)) errors.push(`角色倍率「${key}」必须大于 0`)
      }
    }
    return errors
  }

  private validateLevelDiffBonus(data: Record<string, unknown>): string[] {
    const errors: string[] = []
    const rules = data.rules
    if (!Array.isArray(rules) || rules.length === 0) return ['等级差规则为空']
    let hasEvenRule = false
    for (const r of rules) {
      const rule = r as { label?: unknown; condition?: { diff?: unknown }; expMultiplier?: unknown; goldMultiplier?: unknown }
      const label = typeof rule.label === 'string' ? rule.label : ''
      for (const key of ['expMultiplier', 'goldMultiplier'] as const) {
        const v = rule[key]
        if (typeof v !== 'number' || v < 0.01 || v > 10) errors.push(`规则「${label}」倍率超出合理范围（0.01~10）`)
      }
      const cond = rule.condition?.diff
      if (typeof cond === 'number') {
        if (cond === 0) hasEvenRule = true
      } else if (!Array.isArray(cond) && typeof cond !== 'string') {
        errors.push(`规则「${label}」等级差条件格式非法`)
      }
    }
    if (!hasEvenRule) errors.push('缺少同级（diff=0）规则')
    return errors
  }

  /** 装备词条强约束检查：attribute ∈ attributes.json / modifierType ∈ {flat,percent} / valueRange 完整 /
   *  applicableSlots 每个 slotKey 合法 / school ∈ schools.json / weight 非负。返回结构化问题列表（保存校验与健康检查共用） */
  private equipmentAffixIssues(
    entity: Record<string, unknown>,
    schoolNames: Set<string>,
  ): Array<{ field: string; missingId: string; targetTable: string; message: string }> {
    const issues: Array<{ field: string; missingId: string; targetTable: string; message: string }> = []

    const attribute = entity.attribute
    if (typeof attribute !== 'string' || !attribute.trim()) {
      issues.push({ field: 'attribute', missingId: '—', targetTable: 'attributes', message: '字段「属性」为必填' })
    } else if (!Object.prototype.hasOwnProperty.call(AttributeMetaMap, attribute)) {
      issues.push({ field: 'attribute', missingId: attribute, targetTable: 'attributes', message: `属性「${attribute}」不存在于 attributes.json` })
    }

    if (entity.modifierType !== 'flat' && entity.modifierType !== 'percent') {
      issues.push({ field: 'modifierType', missingId: String(entity.modifierType), targetTable: 'modifierType', message: `修正类型「${String(entity.modifierType)}」非法（应为 flat/percent）` })
    }

    const vr = entity.valueRange as { min?: unknown; max?: unknown } | undefined
    if (!vr || typeof vr !== 'object' || !Number.isFinite(vr.min as number) || !Number.isFinite(vr.max as number)) {
      issues.push({ field: 'valueRange', missingId: JSON.stringify(vr ?? null), targetTable: 'valueRange', message: '字段「数值区间」必须为 { min, max } 数字' })
    } else if ((vr.min as number) < 0) {
      issues.push({ field: 'valueRange', missingId: `min=${vr.min}`, targetTable: 'valueRange', message: `数值区间非法：min 不能为负数（当前 ${vr.min}）` })
    } else if ((vr.min as number) > (vr.max as number)) {
      issues.push({ field: 'valueRange', missingId: `min=${vr.min},max=${vr.max}`, targetTable: 'valueRange', message: `数值区间非法：min(${vr.min}) > max(${vr.max})` })
    }

    const slots = entity.applicableSlots
    if (!Array.isArray(slots) || slots.length === 0) {
      issues.push({ field: 'applicableSlots', missingId: '—', targetTable: 'slot', message: '字段「适用部位」为必填（至少 1 个 slotKey）' })
    } else {
      for (const key of slots) {
        if (typeof key !== 'string') {
          issues.push({ field: 'applicableSlots', missingId: JSON.stringify(key), targetTable: 'slot', message: '「适用部位」元素必须为字符串' })
          continue
        }
        const err = validateSlotKey(key)
        if (err) {
          issues.push({ field: 'applicableSlots', missingId: key, targetTable: 'slot', message: err })
          continue
        }
        // 部位冲突规则兜底（设计稿 v2.0 §14.9）：词条适用部位与该部位禁制矛盾 = 数据自相矛盾
        const [slot, subType] = key.split(':')
        if (subType !== undefined && typeof attribute === 'string') {
          const conflict = affixConflictFor(slot, subType, attribute)
          if (conflict === 'forbidden') {
            issues.push({
              field: 'applicableSlots',
              missingId: key,
              targetTable: 'equipmentConflictRules',
              message: `「${key}」与部位冲突规则矛盾：「${attribute}」在该部位被禁止`,
            })
          }
        }
      }
    }

    const school = entity.school
    if (school !== undefined && school !== null && school !== '') {
      if (typeof school !== 'string') {
        issues.push({ field: 'school', missingId: JSON.stringify(school), targetTable: 'schools', message: '「流派绑定」必须为字符串' })
      } else if (!schoolNames.has(school)) {
        issues.push({ field: 'school', missingId: school, targetTable: 'schools', message: `流派「${school}」不存在于 schools.json` })
      }
    }

    const weight = entity.weight
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
      issues.push({ field: 'weight', missingId: String(weight), targetTable: 'weight', message: '字段「抽池权重」必须为非负数字' })
    }

    return issues
  }

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
