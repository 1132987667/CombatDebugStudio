/**
 * GameDataApi.ts — 封神榜数据访问 API（封神榜开发计划 §3.3 / 规格说明书 §6.1）
 *
 * 面向界面层/其他模块的 Promise 只读接口，唯一读取入口（不直接操作 IndexedDB）。
 * 底层经 IPersistentStorage 端口读取封神榜 store，写操作走 FengshenDataService。
 */

import type { IPersistentStorage, StorageStoreName } from '@/domain/port/IPersistentStorage'
import { FENGSHEN_STORE } from '@/domain/port/IPersistentStorage'
import type {
  ActorData,
  BattleParamData,
  DropGroupData,
  ElementsData,
  EquipmentData,
  GrowthCurveData,
  LineupData,
  MetaDataVersion,
  OperationLogEntry,
  FengshenTableName,
} from '@/domain/fengshen/types'
import type { SkillConfig } from '@/domain/skill/types'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene'
import type { FormationConfig } from '@/shared/types/formation'
import type { ElementDef } from '@/domain/fengshen/types'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import { buildElementIndex, buildNameIndex } from '@/domain/fengshen/refNames'

export interface ListQuery {
  /** 按 name 模糊搜索 */
  search?: string
  limit?: number
  offset?: number
}

/**
 * 自然排序（数字感知字典序）：actors_002 < actors_010（数字按数值），
 * growth_attack < growth_balanced（无数字段按字典序）。
 * 封神榜 id 含补零自增（hero_001）、固定名（elements / growth_balanced / guardian_fire）等混合格式，统一按此排序。
 */
const idCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** 按 id 升序（原地排序） */
function sortById<T>(rows: T[]): T[] {
  return rows.sort((a, b) =>
    idCollator.compare(String((a as { id?: unknown }).id ?? ''), String((b as { id?: unknown }).id ?? '')),
  )
}

/** 字段值搜索文本：map 按「键:值」拼接、数组 JSON 序列化、其余字符串化 */
function fieldSearchText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') {
    if (Array.isArray(value)) return JSON.stringify(value)
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ')
  }
  return String(value)
}

export class GameDataApi {
  constructor(private readonly storage: IPersistentStorage) {}

  // ── 单实体查询 ──────────────────────────────────────────────

  async getActorById(id: string): Promise<ActorData | null> {
    return this.storage.get<ActorData>(FENGSHEN_STORE.ACTORS, id)
  }

  async getBuffDef(id: string): Promise<BuffJsonEntry | null> {
    return this.storage.get<BuffJsonEntry>(FENGSHEN_STORE.BUFFS, id)
  }

  async getEnemyById(id: string): Promise<Enemy | null> {
    return this.storage.get<Enemy>(FENGSHEN_STORE.ENEMIES, id)
  }

  async getScene(id: string): Promise<SceneData | null> {
    return this.storage.get<SceneData>(FENGSHEN_STORE.SCENES, id)
  }

  async getFormation(id: string): Promise<FormationConfig | null> {
    return this.storage.get<FormationConfig>(FENGSHEN_STORE.FORMATIONS, id)
  }

  async getLineup(id: string): Promise<LineupData | null> {
    return this.storage.get<LineupData>(FENGSHEN_STORE.LINEUPS, id)
  }

  async getEquipment(id: string): Promise<EquipmentData | null> {
    return this.storage.get<EquipmentData>(FENGSHEN_STORE.EQUIPMENT, id)
  }

  async getGrowthCurve(id: string): Promise<GrowthCurveData | null> {
    return this.storage.get<GrowthCurveData>(FENGSHEN_STORE.GROWTH, id)
  }

  async getDropGroup(id: string): Promise<DropGroupData | null> {
    return this.storage.get<DropGroupData>(FENGSHEN_STORE.DROPS, id)
  }

  async getBattleParam(id: string): Promise<BattleParamData | null> {
    return this.storage.get<BattleParamData>(FENGSHEN_STORE.PARAMS, id)
  }

  async listBattleParams(): Promise<BattleParamData[]> {
    const keys = await this.storage.keys(FENGSHEN_STORE.PARAMS)
    const out: BattleParamData[] = []
    for (const key of keys) {
      const rec = await this.storage.get<BattleParamData>(FENGSHEN_STORE.PARAMS, key)
      if (rec) out.push(rec)
    }
    return sortById(out)
  }

  async getElementMatrix(): Promise<ElementsData | null> {
    return this.storage.get<ElementsData>(FENGSHEN_STORE.ELEMENTS, 'elements')
  }

  // ── 批量查询 ────────────────────────────────────────────────

  async getSkillList(ids: string[]): Promise<SkillConfig[]> {
    return this.loadByIds<SkillConfig>(FENGSHEN_STORE.SKILLS, ids)
  }

  async getEnemyList(ids: string[]): Promise<Enemy[]> {
    return this.loadByIds<Enemy>(FENGSHEN_STORE.ENEMIES, ids)
  }

  async listLineups(): Promise<LineupData[]> {
    return sortById(await this.listAll<LineupData>(FENGSHEN_STORE.LINEUPS))
  }

  async listEquipment(filter?: { slot?: EquipmentData['slot'] }): Promise<EquipmentData[]> {
    const all = sortById(await this.listAll<EquipmentData>(FENGSHEN_STORE.EQUIPMENT))
    return filter?.slot ? all.filter((e) => e.slot === filter.slot) : all
  }

  /** 通用分页 / 搜索查询（辅助功能用） */
  async listByTable<T>(table: FengshenTableName, query?: ListQuery): Promise<T[]> {
    // NOTE: 表名与 store 名一致（FENGSHEN_STORE 值），直接用表名作 store
    const store = table as StorageStoreName
    let rows = await this.listAll<T>(store)
    if (query?.search) {
      const kw = query.search.toLowerCase()
      // 搜索覆盖 name/id + schema 标注的 searchable 字段（含 map「键:值」/ 数组 JSON）
      const searchableKeys = TABLE_SCHEMAS[table]?.fields
        .filter((f) => f.searchable)
        .map((f) => f.key) ?? []
      rows = rows.filter((r) => {
        const row = r as Record<string, unknown>
        const haystack = [
          String(row.name ?? row.id ?? ''),
          ...searchableKeys.map((k) => fieldSearchText(row[k])),
        ].join(' ').toLowerCase()
        return haystack.includes(kw)
      })
    }
    // 按 id 升序（自然排序）：列表 / 下拉选项 / 自增 id 计算共用同一稳定顺序
    sortById(rows)
    if (query?.offset) rows = rows.slice(query.offset)
    if (query?.limit) rows = rows.slice(0, query.limit)
    return rows
  }

  // ── 元数据 ──────────────────────────────────────────────────

  /** 阵营元素定义选项（elements 单文档，元素在 elements[].id/name；编辑下拉数据源） */
  async listElementDefs(): Promise<ElementDef[]> {
    const doc = await this.getElementMatrix()
    return doc?.elements ?? []
  }

  /**
   * 全表引用字典：id → 中文名（列表 / 详情 / 悬浮预览的"优先中文"翻译底表）。
   * 全局合并各表，天然覆盖跨表引用（roles[].roleId → actors+enemies）；
   * elements 取元素定义（elements[].name），不参与行级 id。
   */
  async loadRefNameIndex(): Promise<Record<string, string>> {
    const index: Record<string, string> = {}
    for (const table of Object.keys(TABLE_SCHEMAS) as FengshenTableName[]) {
      if (table === 'elements') {
        Object.assign(index, buildElementIndex(await this.getElementMatrix()))
        continue
      }
      Object.assign(index, buildNameIndex(await this.listByTable<{ id?: unknown; name?: unknown }>(table, { limit: 1000 })))
    }
    return index
  }

  async getDataVersion(): Promise<number> {
    const meta = await this.storage.get<MetaDataVersion>(FENGSHEN_STORE.META, 'dataVersion')
    return meta?.version ?? 0
  }

  /** 操作日志（meta store，按时间倒序） */
  async listOperationLogs(limit = 50): Promise<OperationLogEntry[]> {
    const keys = await this.storage.keys(FENGSHEN_STORE.META)
    const logs: OperationLogEntry[] = []
    for (const key of keys) {
      const rec = await this.storage.get<OperationLogEntry>(FENGSHEN_STORE.META, key)
      if (rec && rec.op) logs.push(rec)
    }
    logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return logs.slice(0, limit)
  }

  // ── 内部工具 ────────────────────────────────────────────────

  private async loadByIds<T>(store: StorageStoreName, ids: string[]): Promise<T[]> {
    const out: T[] = []
    for (const id of ids) {
      const rec = await this.storage.get<T>(store, id)
      if (rec) out.push(rec)
    }
    return out
  }

  private async listAll<T>(store: StorageStoreName): Promise<T[]> {
    const keys = await this.storage.keys(store)
    const out: T[] = []
    for (const key of keys) {
      const rec = await this.storage.get<T>(store, key)
      if (rec) out.push(rec)
    }
    return out
  }
}
