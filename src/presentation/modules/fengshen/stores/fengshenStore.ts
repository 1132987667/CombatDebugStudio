/**
 * 文件: fengshenStore.ts
 * 功能: 封神榜后台数据管理状态中枢
 * 描述: 持有当前数据域/视图切换、dataVersion、列表搜索选中、编辑抽屉状态，
 *       读写经 GameDataApi / FengshenDataService（写后 dataVersion 递增 + 自动刷新）。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { persistentStorage } from '@/infrastructure/adapters/storage'
import { GameDataApi } from '@/application/service/GameDataApi'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { BattleDataLoader } from '@/application/service/BattleDataLoader'
import { DataPackageService } from '@/application/service/DataPackageService'
import { DataIntegrityService, type HealthCheckReport } from '@/application/service/DataIntegrityService'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import { nextEntityId, type FengshenTableName } from '@/domain/fengshen/types'
import type { OperationLogEntry } from '@/domain/fengshen/types'
import { useBattleStore } from '@/presentation/stores'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

export type FengshenView = 'domain' | 'formulas' | 'packages' | 'health' | 'logs' | 'expgold'

export interface OptionItem {
  id: string
  name: string
}

export const useFengshenStore = defineStore('fengshen', () => {
  const api = container.resolve<GameDataApi>('GameDataApi')
  const write = container.resolve<FengshenDataService>('FengshenDataService')
  const pkgService = container.resolve<DataPackageService>('DataPackageService')
  const integrity = container.resolve<DataIntegrityService>('DataIntegrityService')

  const activeView = ref<FengshenView>('domain')
  const currentTable = ref<FengshenTableName>('actors')
  const dataVersion = ref(0)
  const search = ref('')
  const selectedIds = ref<string[]>([])
  const loading = ref(false)
  const rows = ref<Record<string, unknown>[]>([])

  // 编辑抽屉
  const drawerOpen = ref(false)
  /** 编辑草稿：必有 id（保存/校验前置要求），其余字段任意 */
  type EntityDraft = { id: string } & Record<string, unknown>
  const editingEntity = ref<EntityDraft | null>(null)
  const isNew = ref(false)
  const formErrors = ref<string[]>([])

  // 系统视图数据
  const healthReport = ref<HealthCheckReport | null>(null)
  const logs = ref<OperationLogEntry[]>([])

  // 引用选项缓存（下拉：技能/阵型/元素/成长曲线等）
  const optionsCache = ref<Record<string, OptionItem[]>>({})

  // 全表引用字典（id → 中文名）：列表列 / 详情 / 悬浮预览的"优先中文"翻译底表，写操作后失效重建
  const refIndex = ref<Record<string, string>>({})
  let refIndexLoaded = false

  // 详情面板：当前实体的反向引用（谁引用了它）与跨表定位待办
  const references = ref<Array<{ sourceTable: FengshenTableName; ids: string[] }>>([])
  const pendingDetailId = ref<string | null>(null)

  const currentSchema = () => TABLE_SCHEMAS[currentTable.value]

  // ── dataVersion 订阅：任何写操作（增/删/改/导入）后刷新版本 + 当前列表；未开战时重载引擎数据源 ──
  // NOTE: FengshenDataService 与 DataPackageService 共享同一回调（封神榜开发计划 §3.4 关键路径）——
  // 导入（数据包）与常规写操作统一触发，避免遗漏。
  const onDataChanged = (version: number): void => {
    dataVersion.value = version
    if (activeView.value === 'domain') void refreshList()
    const battleStore = useBattleStore()
    const notif = useNotificationStore()
    if (!battleStore.isBattleActive) {
      void new BattleDataLoader(persistentStorage)
        .reload()
        .then(() => notif.toast(`数据已更新（v${version}），引擎数据源已重载`, 'info', 3500))
    } else {
      // NOTE: 战斗中数据经快照冻结，改动本局不生效（规格说明书 §6.2）
      notif.toast(`数据已更新（v${version}），战斗进行中，下一局生效`, 'info', 3500)
    }
  }
  write.onDataChanged = onDataChanged
  pkgService.onDataChanged = onDataChanged

  async function refreshVersion(): Promise<void> {
    try {
      dataVersion.value = await api.getDataVersion()
    } catch {
      dataVersion.value = 0
    }
  }

  let listReqSeq = 0
  async function refreshList(): Promise<void> {
    const seq = ++listReqSeq
    loading.value = true
    try {
      // NOTE: 搜索下沉到 API 层（listByTable 匹配 name/id + searchable 字段），
      //       数据量级几十~几百条，select/range 筛选留在客户端即时叠加；limit/offset 为大数据量预留。
      const result = await api.listByTable<Record<string, unknown>>(currentTable.value, search.value ? { search: search.value } : undefined)
      // 仅接受最新一次请求的结果，防止搜索/表切换并发刷新时旧结果后到覆盖新结果
      if (seq === listReqSeq) rows.value = result
    } finally {
      if (seq === listReqSeq) loading.value = false
    }
  }

  async function loadOptions(table: FengshenTableName): Promise<OptionItem[]> {
    if (optionsCache.value[table]) return optionsCache.value[table]
    // NOTE: elements 为单文档，元素定义在 elements[].id/name，行级 id='elements' 无选项意义
    const items: OptionItem[] =
      table === 'elements'
        ? (await api.listElementDefs()).map((e) => ({ id: e.id, name: e.name }))
        : (await api.listByTable<Record<string, unknown>>(table, { limit: 500 })).map((r) => ({
            id: String(r.id),
            name: String(r.name ?? r.id),
          }))
    optionsCache.value[table] = items
    return items
  }

  function invalidateOptions(): void {
    optionsCache.value = {}
  }

  /** 懒加载全局引用字典（只拉一次；写操作后失效重建） */
  async function loadRefIndex(): Promise<void> {
    if (refIndexLoaded) return
    refIndex.value = await api.loadRefNameIndex()
    refIndexLoaded = true
  }

  function invalidateRefIndex(): void {
    refIndexLoaded = false
    refIndex.value = {}
  }

  function setTable(table: FengshenTableName): void {
    currentTable.value = table
    selectedIds.value = []
    search.value = ''
    void refreshList()
  }

  /** 跨表定位（健康检查 / 反向引用跳转）：切换列表并预置详情面板高亮行 */
  function navigateTo(table: FengshenTableName, id?: string): void {
    currentTable.value = table
    activeView.value = 'domain'
    selectedIds.value = []
    search.value = ''
    pendingDetailId.value = id ?? null
    void refreshList()
  }

  /** 加载指定实体的反向引用（谁引用了它） */
  async function loadReferences(id: string): Promise<void> {
    try {
      references.value = await integrity.findReferencing(currentTable.value, id)
    } catch {
      references.value = []
    }
  }

  async function openCreate(): Promise<void> {
    const existing = await api.listByTable<Record<string, unknown>>(currentTable.value, { limit: 1000 })
    // elements 为单文档（固定 id），其余表按前缀自增生成
    editingEntity.value = currentTable.value === 'elements'
      ? { id: 'elements' }
      : { id: nextEntityId(existing.map((r) => String(r.id)), `${currentTable.value}_`) }
    isNew.value = true
    formErrors.value = []
    drawerOpen.value = true
  }

  function setView(view: FengshenView): void {
    activeView.value = view
    if (view === 'health') void runHealth()
    if (view === 'logs') void loadLogs()
  }

  function openEdit(entity: Record<string, unknown>, isNewEntity = false): void {
    // NOTE: 实体必带 id（列表行/新建/复制均生成）；断言保留运行时原样，id 异常时由 save 前置校验拦截
    editingEntity.value = { ...entity } as EntityDraft
    isNew.value = isNewEntity
    formErrors.value = []
    drawerOpen.value = true
  }

  /** 复制为模板：新 ID 派生 + 名称加副本后缀，进入编辑抽屉（新增态）；不可复制时返回 false 由界面提示 */
  async function duplicateAsTemplate(row: Record<string, unknown>): Promise<boolean> {
    if (currentTable.value === 'elements') return false
    const existing = await api.listByTable<Record<string, unknown>>(currentTable.value, { limit: 1000 })
    const newId = nextEntityId(existing.map((r) => String(r.id)), `${currentTable.value}_`)
    const name = String(row.name ?? newId)
    openEdit({ ...row, id: newId, name: `${name}·副本` }, true)
    return true
  }

  function closeDrawer(): void {
    drawerOpen.value = false
    editingEntity.value = null
    formErrors.value = []
  }

  async function save(): Promise<boolean> {
    if (!editingEntity.value) return false
    const result = await write.save(currentTable.value, editingEntity.value)
    if (!result.ok) {
      formErrors.value = result.errors ?? []
      return false
    }
    closeDrawer()
    invalidateOptions()
    invalidateRefIndex()
    await refreshList()
    await refreshVersion()
    return true
  }

  /** 编辑过程实时校验：与保存共用 validateOnSave（必填/范围/唯一/引用），防抖后由 EntityDrawer 触发 */
  async function validateEntity(): Promise<void> {
    if (!editingEntity.value) return
    const result = await integrity.validateOnSave(currentTable.value, editingEntity.value)
    formErrors.value = result.errors
  }

  async function remove(id: string): Promise<string[] | null> {
    const result = await write.remove(currentTable.value, id)
    if (!result.ok) {
      return result.errors ?? []
    }
    invalidateOptions()
    invalidateRefIndex()
    await refreshList()
    await refreshVersion()
    return null
  }

  async function toggleSelect(id: string): Promise<void> {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((x) => x !== id)
      : [...selectedIds.value, id]
  }

  async function removeSelected(): Promise<void> {
    for (const id of selectedIds.value) {
      await write.remove(currentTable.value, id)
    }
    selectedIds.value = []
    invalidateOptions()
    invalidateRefIndex()
    await refreshList()
    await refreshVersion()
  }

  /** 批量改字段：对选中行应用同一值（逐条走保存校验），返回成功数与失败 ID 列表 */
  async function batchUpdate(field: string, value: unknown): Promise<{ ok: number; failed: string[] }> {
    const ids = [...selectedIds.value]
    let ok = 0
    const failed: string[] = []
    for (const id of ids) {
      const row = rows.value.find((r) => String(r.id) === id)
      if (!row) continue
      const result = await write.save(currentTable.value, { ...row, [field]: value } as EntityDraft)
      if (result.ok) ok++
      else failed.push(id)
    }
    if (ok > 0) {
      invalidateOptions()
      invalidateRefIndex()
      await refreshList()
      await refreshVersion()
    }
    return { ok, failed }
  }

  // ── 系统视图数据装载 ──

  async function runHealth(): Promise<void> {
    healthReport.value = await integrity.runHealthCheck()
  }

  async function loadLogs(): Promise<void> {
    logs.value = await api.listOperationLogs(200)
  }

  return {
    activeView,
    currentTable,
    dataVersion,
    search,
    selectedIds,
    loading,
    rows,
    drawerOpen,
    editingEntity,
    isNew,
    formErrors,
    healthReport,
    logs,
    optionsCache,
    refIndex,
    references,
    pendingDetailId,
    currentSchema,
    refreshVersion,
    refreshList,
    loadOptions,
    invalidateOptions,
    loadRefIndex,
    invalidateRefIndex,
    setTable,
    navigateTo,
    loadReferences,
    setView,
    openCreate,
    openEdit,
    duplicateAsTemplate,
    closeDrawer,
    save,
    validateEntity,
    remove,
    toggleSelect,
    removeSelected,
    batchUpdate,
    runHealth,
    loadLogs,
  }
})
