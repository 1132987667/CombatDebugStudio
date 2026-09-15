<template>
  <div class="fs-list-view">
    <div class="fs-list-layout">
      <!-- 左：列表（18/24 栅格） -->
      <div class="fs-list-main">
        <div class="fs-page-title">
          {{ schema.label }}管理
          <span class="fs-page-hint">{{ tableHint }}</span>
        </div>

    <div class="fs-toolbar">
      <div class="fs-search-box">
        <TacticalInput :model-value="store.search" placeholder="按名称模糊搜索…" aria-label="按名称搜索"
          @update:model-value="store.search = String($event ?? '')">
          <template #icon>
            <IconSearch />
          </template>
        </TacticalInput>
      </div>

      <template v-for="f in schema.filters ?? []" :key="f.key">
        <TacticalSelect v-if="f.type === 'select'" v-model="filterState[f.key]" size="md" :placeholder="`全部${f.label}`"
          :options="filterOptions(f)" @change="page = 1" />
        <span v-else-if="f.type === 'range'" class="fs-range">
          <span class="fs-range-label">{{ f.label }}</span>
          <!-- NOTE: 过滤边界是查询条件而非受校验字段，不传 min/max 避免 blur 时被 clamp 篡改过滤语义 -->
          <TacticalInput type="number" size="md" :model-value="rangeState[f.key]?.min ?? ''" placeholder="最小"
            @update:model-value="(v: string | number | null) => setRange(f.key, 'min', String(v ?? ''))" />
          <span class="fs-range-sep">—</span>
          <TacticalInput type="number" size="md" :model-value="rangeState[f.key]?.max ?? ''" placeholder="最大"
            @update:model-value="(v: string | number | null) => setRange(f.key, 'max', String(v ?? ''))" />
        </span>
      </template>

      <span class="fs-spacer"></span>
      <span class="fs-version" title="任何写操作都会递增全局数据版本号">数据版本 v{{ store.dataVersion }}</span>
      <Button variant="primary" size="small" @click="store.openCreate">＋ 新增{{ schema.label }}</Button>
      <Button v-if="store.currentTable === 'scenes'" size="small" title="新增大场景（区域），场景列表按其分组"
        @click="openRegionCreate">＋ 新增区域</Button>
      <Button size="small" title="复制选中数据为模板" :disabled="!store.selectedIds.length"
        @click="duplicateFirst">复制为模板</Button>
      <Button size="small" title="批量修改选中记录的同一字段（应用前可预览改动）" :disabled="!store.selectedIds.length"
        @click="batchDialogOpen = true">批量编辑</Button>
      <Button v-if="canUndoBatch" size="small" variant="danger" :title="`撤销上次批量改动（${undoBatchSummary}）`"
        @click="confirmUndoBatch = true">撤销上次批量</Button>
      <Button v-if="store.currentTable === 'enemies'" size="small" title="并排对比所选敌人的属性（2~4 条）"
        :disabled="compareRows.length < 2 || compareRows.length > 4" @click="compareOpen = true">对比所选（{{
        compareRows.length }}）</Button>
      <Button v-if="store.currentTable === 'enemies'" size="small" :disabled="rebuilding"
        title="按生成模型（等级模板曲线 × 品阶系数，见敌人生成设计.md）重算全部敌人的 stats；技能/掉落/奖励/剧情不动"
        @click="confirmRebuild = true">重算全部敌人属性</Button>
      <Button v-if="store.currentTable === 'enemies'" size="small" title="导出当前 enemies 表为规范 JSON，可替换 configs/enemies/enemies.json"
        @click="requestExportEnemiesJson">导出 enemies.json</Button>
      <Button v-if="store.selectedIds.length" variant="danger" size="small" @click="requestRemoveSelected">删除所选（{{
        store.selectedIds.length }}）</Button>
    </div>

    <DataTable :schema="schema" :rows="pagedRows" :selected-ids="store.selectedIds" :loading="store.loading"
      :has-filter="hasFilter" :detail-id="detailId" :sort-key="sortKey" :sort-dir="sortDir" :ref-index="store.refIndex"
      :group-by="store.currentTable === 'scenes' ? 'regionId' : undefined" :group-meta="regionGroupMeta"
      @toggle-select="store.toggleSelect"
      @edit="store.openEdit" @copy="onCopy" @remove="requestRemove" @detail="onDetail" @sort="onSort"
      @edit-group="openRegionEditor" @clear-filters="onClearFilters" />

    <div v-if="totalPages > 1" class="fs-pagination" role="navigation" aria-label="分页">
      <span class="fs-page-info">共 {{ filteredRows.length }} 条 · 第 {{ page }}/{{ totalPages }} 页</span>
      <button class="fs-page-btn" :disabled="page <= 1" aria-label="上一页" @click="go(page - 1)">«</button>
      <button v-for="p in pageButtons" :key="p" class="fs-page-btn" :class="{ active: p === page }"
        :aria-label="`第 ${p} 页`" :aria-current="p === page ? 'page' : undefined" @click="go(p)">{{ p
        }}</button>
      <button class="fs-page-btn" :disabled="page >= totalPages" aria-label="下一页" @click="go(page + 1)">»</button>
    </div>
      </div>

      <!-- 右：实体详情（6/24 栅格，预留扩展） -->
      <aside class="fs-list-detail" role="region" aria-label="实体详情">
        <EntityDetailPanel v-if="detailEntity" :schema="schema" :entity="detailEntity" :references="store.references"
          :ref-index="store.refIndex"
          @edit="store.openEdit(detailEntity)" @goto="onGotoTable" @open-in-huanling="onOpenInHuanling" />
        <div v-else class="fs-detail-empty">
          <span class="fs-detail-empty-title">实体详情</span>
          <span class="fs-detail-empty-hint">点击列表中的名称查看对应信息</span>
        </div>
      </aside>
    </div>

    <EntityDrawer :open="store.drawerOpen" :schema="schema" :entity="store.editingEntity" :is-new="store.isNew"
      :errors="store.formErrors" :load-options="store.loadOptions" @save="onSave" @close="store.closeDrawer"
      @validate="store.validateEntity" />

    <!-- 区域编辑抽屉（scenes 分组头的上级实体；独立于主抽屉因主抽屉绑定 currentTable） -->
    <EntityDrawer :open="regionDrawerOpen" :schema="TABLE_SCHEMAS.regions" :entity="regionEntity" :is-new="regionIsNew"
      :errors="regionErrors" :load-options="store.loadOptions" @save="saveRegion" @close="regionDrawerOpen = false"
      @validate="validateRegion" />

    <BatchEditDialog :open="batchDialogOpen" :schema="schema" :count="store.selectedIds.length"
      :selected-rows="selectedRows" :load-options="store.loadOptions" @close="batchDialogOpen = false"
      @apply="onBatchApply" />

    <!-- 敌人横向对比（仅 enemies 表；勾选 2~4 行并排） -->
    <EnemyCompareDialog :open="compareOpen" :rows="compareRows" @close="compareOpen = false" />

    <!-- 危险操作二次确认 + 统一提示 -->
    <ConfirmDialog v-model="confirmRemove" :title="`删除${schema.label}`" :message="removeMessage"
      confirm-text="删除" danger @confirm="doRemove" />

    <!-- 撤销上次批量编辑：二次确认（覆盖写走同一条校验管线） -->
    <ConfirmDialog v-model="confirmUndoBatch" title="撤销上次批量编辑"
      :message="`将把上次批量改动的 ${store.lastBatch?.updates.length ?? 0} 条「${schema.label}」写回改动前的值（${undoBatchSummary}）。${undoExportHint}`"
      confirm-text="撤销" @confirm="onUndoBatch" />

    <!-- 一键重算敌人属性：覆盖性写二次确认 + 完成后 diff 摘要 -->
    <ConfirmDialog v-model="confirmRebuild" title="重算全部敌人属性"
      :message="`将按生成模型（等级模板曲线 × 品阶系数）覆盖 enemies 表全部 ${store.rows.length} 条记录的 stats（血/攻/防/速/命中/闪避/暴击/能量）。
技能、掉落、经验金钱、剧情与阶段配置保持不变；写库后可通过「导出 enemies.json」回写项目配置。`"
      confirm-text="重算" @confirm="doRebuildStats" />

    <Dialog v-model="rebuildOpen" title="敌人属性重算结果" width="720px">
      <div v-if="rebuildReport" class="fs-rebuild">
        <p class="fs-rebuild-summary">
          模型管辖 {{ rebuildReport.total }} 只 · 变更 {{ rebuildReport.changedCount }} 只 · 与模型一致的 {{ rebuildReport.total - rebuildReport.changedCount }} 只<template v-if="rebuildReport.skippedCount"> · 跳过 {{ rebuildReport.skippedCount }} 只（非模型管辖，见下方提示）</template>
        </p>
        <div v-if="rebuildFailures.length" class="fs-rebuild-fail">
          <p class="fs-rebuild-fail-title">
            写入失败 {{ rebuildFailures.length }} 只（数值未落盘；常见原因：与存量数据重名触发唯一性校验）
          </p>
          <div class="fs-rebuild-fail-list">
            <p v-for="f in rebuildFailures" :key="f.id" class="fs-rebuild-warn">{{ f.name }}（{{ f.id }}）：{{ f.reason }}</p>
          </div>
        </div>
        <p v-for="w in rebuildReport.warnings.slice(0, 5)" :key="w" class="fs-rebuild-warn">{{ w }}</p>
        <p v-if="rebuildReport.warnings.length > 5" class="fs-rebuild-warn">
          ……等共 {{ rebuildReport.warnings.length }} 条档位回退/等级修正提示
        </p>
        <div class="fs-rebuild-table-wrap">
          <table class="fs-rebuild-table">
            <thead>
              <tr>
                <th>敌人</th><th>等级</th><th>档位</th>
                <th>血量</th><th>攻击</th><th>防御</th><th>速度</th><th>闪避</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in rebuildReport.entries" :key="e.id"
                :class="{ changed: e.changed && !failedIds.has(e.id), failed: failedIds.has(e.id) }">
                <td class="fs-rebuild-name">{{ e.name }}<span class="fs-rebuild-id">{{ e.id }}</span></td>
                <td>L{{ e.level }}</td>
                <td>{{ tierLabel(e.tier) }}</td>
                <td v-for="k in ['maxHealth', 'attack', 'defense', 'speed', 'dodge'] as const" :key="k">
                  <span v-if="e.before[k] !== e.after[k]" class="fs-rebuild-delta">{{ e.before[k] }} → {{ e.after[k] }}</span>
                  <span v-else>{{ e.after[k] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <template #footer>
        <Button variant="ghost" @click="rebuildOpen = false">关闭</Button>
      </template>
    </Dialog>

    <!-- 导出防御确认：库与 configs 权威集合存在差异时二次确认，防历史残留污染权威配置 -->
    <ConfirmDialog v-model="confirmExportAudit" title="导出前提醒" :message="exportAuditMessage"
      confirm-text="仍要导出" @confirm="exportEnemiesJson" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import IconSearch from '~icons/app/search'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import type { TableFilter } from '@/domain/fengshen/schema'
import type { OptionItem } from '@/presentation/modules/fengshen/stores/fengshenStore'
import DataTable from '@/presentation/modules/fengshen/components/DataTable.vue'
import EntityDrawer from '@/presentation/modules/fengshen/components/EntityDrawer.vue'
import BatchEditDialog from '@/presentation/modules/fengshen/components/BatchEditDialog.vue'
import EnemyCompareDialog from '@/presentation/modules/fengshen/components/EnemyCompareDialog.vue'
import EntityDetailPanel from '@/presentation/modules/fengshen/components/EntityDetailPanel.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'

import { useNotificationStore } from '@/presentation/stores/notificationStore'
import { uiNavBus, OPEN_LINEUP_EVENT } from '@/presentation/uiEvents'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { FengshenDataService } from '@/application/service/FengshenDataService'
import { DataIntegrityService } from '@/application/service/DataIntegrityService'
import { buildEnemySceneIndex, buildSceneRegionIndex } from '@/domain/fengshen/sceneIndex'
import { resolveRefName } from '@/domain/fengshen/refNames'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import { nextEntityId } from '@/domain/fengshen/types'
import type { RegionData } from '@/domain/fengshen/types'
import {
  auditEnemyStore,
  rebuildAllEnemies,
  toExportableEnemies,
  type EnemyStatsRebuildReport,
  type EnemyStatsRow,
  type EnemyTier,
} from '@/domain/fengshen/enemy-generate'

const PAGE_SIZE = 20

/** 分页大小：场景表按区域分组呈现，分页截断分组会产生误导性组内计数——量级小（数十条），单页全显 */
const pageSize = computed(() => (store.currentTable === 'scenes' ? 500 : PAGE_SIZE))

const store = useFengshenStore()
const schema = computed(() => store.currentSchema())
const page = ref(1)
const filterState = reactive<Record<string, string>>({})
const rangeState = reactive<Record<string, { min: string; max: string }>>({})
const optionsCache = ref<Record<string, OptionItem[]>>({})

/** 敌人→场景反向索引：敌人记录无 sceneId 字段，场景归属反向持有（scenes.enemies[].id / yaotu.id） */
const enemySceneIndex = ref<Map<string, string>>(new Map())
/** 场景→区域索引：敌人区域筛选经 敌人→场景→区域 两跳解析；场景下拉分组/联动同源 */
const sceneRegionIndex = ref<Map<string, string>>(new Map())

// ── 场景表的区域分组：区域不单独占菜单，与场景一体管理（分组头可编辑区域，工具条可新增） ──
const gameDataApi = container.resolve<GameDataApi>('GameDataApi')
const writeService = container.resolve<FengshenDataService>('FengshenDataService')
const regionIntegrity = container.resolve<DataIntegrityService>('DataIntegrityService')

/** 区域行缓存：分组头展示（名称/副标题/等级区间）与区域编辑抽屉的数据源 */
const regionsCache = ref<RegionData[]>([])

/** DataTable 分组头展示信息：label = 区域名，hint = 副标题 + 等级区间 */
const regionGroupMeta = computed<Record<string, { label: string; hint: string }>>(() => {
  const meta: Record<string, { label: string; hint: string }> = {}
  for (const r of regionsCache.value) {
    const range = Array.isArray(r.levelRange) ? `Lv.${r.levelRange[0]}-${r.levelRange[1]}` : ''
    meta[r.id] = { label: r.name, hint: [r.sub, range].filter(Boolean).join(' · ') }
  }
  return meta
})

async function reloadRegions(): Promise<void> {
  regionsCache.value = await gameDataApi.listByTable<RegionData>('regions', { limit: 100 })
}

/** 区域编辑抽屉（独立于主实体抽屉：主抽屉绑定 currentTable，区域是 scenes 的上级实体） */
const regionDrawerOpen = ref(false)
const regionEntity = ref<Record<string, unknown> | null>(null)
const regionIsNew = ref(false)
const regionErrors = ref<string[]>([])

function openRegionEditor(groupKey: string): void {
  const row = regionsCache.value.find((r) => r.id === groupKey)
  if (!row) return
  regionEntity.value = { ...row }
  regionIsNew.value = false
  regionErrors.value = []
  regionDrawerOpen.value = true
}

function openRegionCreate(): void {
  regionEntity.value = { id: nextEntityId(regionsCache.value.map((r) => String(r.id)), 'region_') }
  regionIsNew.value = true
  regionErrors.value = []
  regionDrawerOpen.value = true
}

/** 保存区域：走通用写服务（校验/版本/日志同主流程）；成功后刷新分组数据与翻译底表 */
async function saveRegion(): Promise<void> {
  if (!regionEntity.value) return
  const result = await writeService.save('regions', regionEntity.value as { id: string })
  if (!result.ok) {
    regionErrors.value = result.errors ?? []
    return
  }
  regionDrawerOpen.value = false
  await reloadRegions()
  store.invalidateRefIndex()
  void store.loadRefIndex()
  notification.notify('已保存', `已保存区域「${String(regionEntity.value.name ?? regionEntity.value.id)}」 · 数据版本 v${store.dataVersion}`, 'success')
}

/** 编辑过程实时校验：与保存共用 validateOnSave（必填/唯一/引用） */
async function validateRegion(): Promise<void> {
  if (!regionEntity.value) return
  const result = await regionIntegrity.validateOnSave('regions', regionEntity.value)
  regionErrors.value = result.errors
}

/** 右侧详情面板：当前选中行 id 与实体（点击列表中的名称触发） */
const detailId = ref<string | null>(null)
const detailEntity = computed(() => store.rows.find((r) => String(r.id) === detailId.value) ?? null)

/** 表头排序状态（客户端排序，作用于过滤后的结果） */
const sortKey = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')

function onSort(col: string): void {
  if (sortKey.value === col) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = col
    sortDir.value = 'asc'
  }
  page.value = 1
}

function onDetail(row: Record<string, unknown>): void {
  detailId.value = String(row.id)
}

/** 是否处于搜索 / 列级筛选过滤态（空态据此提示「清除搜索与筛选」） */
const hasFilter = computed(() => {
  if (store.search) return true
  if (Object.values(filterState).some((v) => v !== '' && v !== undefined)) return true
  return Object.values(rangeState).some((r) => r?.min !== '' || r?.max !== '')
})

/** 空态「清除搜索与筛选」：清空搜索词与全部列级筛选，回到全量列表 */
function onClearFilters(): void {
  store.search = ''
  resetFilters()
}

const tableHint = computed(() => {
  const hints: Record<string, string> = {
    actors: '基础属性 / 成长曲线 / 技能绑定 / 阵营元素',
    skills: '主动 / 被动 · 能量消耗 · 步骤编排 · 效果组合',
    buffs: '增益 / 减益 / 控制 · 叠加规则 · 效果链',
    enemies: '品阶 / 属性 / 技能组 / 掉落物',
    scenes: '多难度敌人编组 · 所需等级 · 通关奖励',
    formations: '站位布局 / 阵型增益 / 前排保护',
    lineups: '角色组合 + 阵型绑定 · 供场景引用与一键布阵',
    materials: '材料与消耗品 · 稀有度 · 使用效果',
    equipment: '部位 / 属性加成 / 穿戴门槛',
    elements: '阵营元素定义 · 克制矩阵驱动伤害修正',
    growth: '每级属性增量 · 经验表',
    drops: '物品组 + 概率 · 供敌人引用',
  }
  return hints[store.currentTable] ?? ''
})

/** 客户端过滤：select 精确 + range 范围（搜索已在 API 层按 name/id + searchable 字段过滤，此处仅叠加列级筛选） */
const filteredRows = computed(() => {
  let rows = store.rows
  for (const f of schema.value.filters ?? []) {
    if (f.type === 'select') {
      const v = filterState[f.key]
      if (v) {
        if (f.key === 'sceneId') {
          // NOTE: 敌人记录无 sceneId 字段（场景关系反向持有：scenes.enemies[].id / yaotu.id），
          //       schema 的 refTable 只提供下拉选项，匹配走反向索引（表切换为 enemies 时重建）
          rows = rows.filter((r) => enemySceneIndex.value.get(String(r.id)) === v)
        } else if (f.key === 'regionId' && store.currentTable === 'enemies') {
          // NOTE: 敌人无 regionId 字段：敌人→场景（反向索引）→区域（场景归属）两跳解析；
          //       敌人未挂任何场景时选任何区域都不命中
          rows = rows.filter((r) => {
            const sceneId = enemySceneIndex.value.get(String(r.id))
            return sceneId !== undefined && sceneRegionIndex.value.get(sceneId) === v
          })
        } else if (f.labelMap) {
          // 档位过滤：选中项显示名反查该档全部字段值，全匹配
          const labelMap = f.labelMap
          const label = labelMap[v] ?? v
          const codes = Object.keys(labelMap).filter((k) => labelMap[k] === label)
          rows = rows.filter((r) => codes.includes(String(r[f.key] ?? '')))
        } else {
          rows = rows.filter((r) => String(r[f.key] ?? '') === v)
        }
      }
    } else if (f.type === 'range') {
      const r = rangeState[f.key]
      if (r?.min !== undefined && r.min !== '') rows = rows.filter((row) => Number(row[f.key]) >= Number(r.min))
      if (r?.max !== undefined && r.max !== '') rows = rows.filter((row) => Number(row[f.key]) <= Number(r.max))
    }
  }
  return rows
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / pageSize.value)))

// 搜索输入防抖后下沉 API 层过滤（IDB 本地读取，往返开销小）
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(() => store.search, () => {
  page.value = 1
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    void store.refreshList()
  }, 250)
})

// 过滤条件（搜索/筛选）变化导致结果收缩时，当前页可能超出范围——自动回到有效页
watch(totalPages, (total) => {
  if (page.value > total) page.value = total
})

// 区域筛选变化：已选场景若不属于新区域则清空（场景下拉已联动收敛，此处防索引未就绪时的脏组合）
watch(() => filterState.regionId, (region) => {
  if (!region) return
  const sceneId = filterState.sceneId
  if (sceneId && sceneRegionIndex.value.get(sceneId) !== region) filterState.sceneId = ''
})

/** 排序（数字列按数值，其余按本地化字符串；升/降切换） */
const sortedRows = computed(() => {
  if (!sortKey.value) return filteredRows.value
  const key = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...filteredRows.value].sort((a, b) => {
    const va = a[key]
    const vb = b[key]
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va ?? '').localeCompare(String(vb ?? ''), 'zh-Hans-CN') * dir
  })
})

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return sortedRows.value.slice(start, start + pageSize.value)
})

/** 页码按钮：总页数 ≤7 全显，否则首尾 + 当前附近 */
const pageButtons = computed(() => {
  const total = totalPages.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const cur = page.value
  const set = new Set([1, total, cur - 1, cur, cur + 1])
  return [...set].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
})

function selectOptions(f: TableFilter): OptionItem[] {
  if (f.options) {
    // 值→显示名映射：优先 filter.labelMap，缺省回退同名字段的 valueLabel（schema 已有翻译，不再双份维护）
    const labelMap = f.labelMap ?? schema.value.fields.find((x) => x.key === f.key)?.valueLabel
    if (labelMap) {
      // 同名档位合并为一个下拉项（id 取该档首个值，过滤时按档位全匹配）
      const seen = new Set<string>()
      const items: OptionItem[] = []
      for (const o of f.options) {
        const label = labelMap[o] ?? o
        if (seen.has(label)) continue
        seen.add(label)
        items.push({ id: o, name: label })
      }
      return items
    }
    return f.options.map((o) => ({ id: o, name: o }))
  }
  if (f.refTable) return optionsCache.value[f.refTable] ?? []
  return []
}

/** 筛选下拉选项：含「全部」空值项；敌人表的场景下拉按区域分组并联动区域筛选收敛 */
function filterOptions(f: TableFilter): TSelectOption[] {
  if (f.key === 'sceneId' && store.currentTable === 'enemies') {
    return [{ value: '', label: `全部${f.label}` }, ...groupedSceneOptions()]
  }
  return [
    { value: '', label: `全部${f.label}` },
    ...selectOptions(f).map((o) => ({ value: o.id, label: o.name })),
  ]
}

/** 场景下拉（敌人表）：按区域分组展示「大场景→小场景」层级；已选区域时仅保留该区域的场景 */
function groupedSceneOptions(): TSelectOption[] {
  const pickedRegion = filterState.regionId ?? ''
  return (optionsCache.value.scenes ?? [])
    .filter((o) => !pickedRegion || sceneRegionIndex.value.get(o.id) === pickedRegion)
    .map((o) => ({
      value: o.id,
      label: o.name,
      group: resolveRefName(sceneRegionIndex.value.get(o.id) ?? '', store.refIndex),
    }))
}

function setRange(key: string, side: 'min' | 'max', v: string): void {
  if (!rangeState[key]) rangeState[key] = { min: '', max: '' }
  rangeState[key][side] = v
  page.value = 1
}

function go(p: number): void {
  if (p < 1 || p > totalPages.value) return
  page.value = p
}

/** 重置筛选：select 键重置为空串而非删除 —— v-model="filterState[f.key]" 动态键绑定下，
 * 键不存在会传 undefined 给 TacticalSelect（其 modelValue 为 required，触发 prop 类型检查警告） */
function resetFilters(): void {
  for (const key of Object.keys(filterState)) delete filterState[key]
  for (const f of schema.value.filters ?? []) {
    if (f.type === 'select') filterState[f.key] = ''
  }
  for (const key of Object.keys(rangeState)) delete rangeState[key]
  page.value = 1
}

/** 复制首个选中项为模板（工具条批量复制）；不可复制（elements）时统一提示 */
async function duplicateFirst(): Promise<void> {
  if (!store.selectedIds.length) return
  const row = store.rows.find((r) => String(r.id) === store.selectedIds[0])
  if (!row) return
  const ok = await store.duplicateAsTemplate(row)
  if (!ok) notification.notify('提示', '阵营克制为全局唯一文档，无需复制，直接编辑即可', 'warning')
}

/** 行内复制；不可复制（elements）时统一提示 */
async function onCopy(row: Record<string, unknown>): Promise<void> {
  const ok = await store.duplicateAsTemplate(row)
  if (!ok) notification.notify('提示', '阵营克制为全局唯一文档，无需复制，直接编辑即可', 'warning')
}

/** 保存成功反馈：抽屉直接关闭，需显式确认 + 版本增量感知 */
async function onSave(): Promise<void> {
  const name = String(store.editingEntity?.name ?? store.editingEntity?.id ?? '')
  const ok = await store.save()
  if (ok) {
    notification.notify('已保存', `已保存「${name}」 · 数据版本 v${store.dataVersion}`, 'success')
  }
}

/** 批量编辑弹窗 */
const batchDialogOpen = ref(false)

/** 敌人横向对比：选中行按当前列表顺序取行实体（跨页勾选保留，超 4 条由按钮禁用兜底） */
const compareOpen = ref(false)
/** 选中行实体（批量编辑预览 / 敌人对比共用） */
const selectedRows = computed(() =>
  store.selectedIds
    .map((id) => store.rows.find((r) => String(r.id) === id))
    .filter((r): r is Record<string, unknown> => !!r),
)
const compareRows = selectedRows

/** 撤销上次批量编辑：仅当前表匹配且批次存在时可用 */
const confirmUndoBatch = ref(false)
const canUndoBatch = computed(() =>
  !!store.lastBatch && store.lastBatch.table === store.currentTable,
)
const undoBatchSummary = computed(() => {
  const b = store.lastBatch
  if (!b) return ''
  const label = schema.value.fields.find((f) => f.key === b.field)?.label ?? b.field
  return `共 ${b.updates.length} 条「${label}」`
})
/** 导出回写通道目前仅 enemies 表提供，其余表不冒充有逃生口 */
const undoExportHint = computed(() =>
  store.currentTable === 'enemies'
    ? '写库后可通过「导出 enemies.json」回写项目配置。'
    : '当前表暂无导出回写通道，改动保留在沙盒库中。',
)

/** 撤销上次批量：逐条写回旧值，结果走通知反馈 */
async function onUndoBatch(): Promise<void> {
  const result = await store.undoLastBatch()
  if (result.ok > 0) {
    notification.notify('已撤销批量改动', `已写回 ${result.ok} 条记录 · 数据版本 v${store.dataVersion}`, 'success')
  }
  if (result.failed.length) {
    notification.notify('撤销部分失败', `${result.failed.length} 条未通过校验：${result.failed.join(', ')}`, 'error')
  }
}

/** 批量应用字段值：成功通知 + 失败列出 ID + 批量后健康扫描（非阻断） */
async function onBatchApply(field: string, value: unknown): Promise<void> {
  const fieldLabel = schema.value.fields.find((f) => f.key === field)?.label ?? field
  const result = await store.batchUpdate(field, value)
  batchDialogOpen.value = false
  if (result.ok > 0) {
    notification.notify('批量已保存', `已更新 ${result.ok} 条「${fieldLabel}」 · 数据版本 v${store.dataVersion}`, 'success')
  }
  if (result.failed.length) {
    notification.notify('批量部分失败', `${result.failed.length} 条未通过校验：${result.failed.join(', ')}`, 'error')
  }
  await postBatchHealthScan(store.currentTable)
}

/** 批量后局部健康扫描：只在本表出现健康问题时非阻断警告（清单见健康检查页），扫描失败不掩盖批量结果 */
async function postBatchHealthScan(table: string): Promise<void> {
  try {
    await store.runHealth()
    const own = (store.healthReport?.issues ?? []).filter((i) => i.sourceTable === table)
    if (own.length) {
      notification.notify(
        '批量完成，健康检查有提示',
        `「${schemaLabel(table)}」表现有 ${own.length} 个健康问题（首条涉及 ${own[0]?.sourceId ?? '—'}），可在「健康检查」页查看`,
        'warning',
      )
    }
  } catch { /* 扫描是增量保障，失败静默 */ }
}

function schemaLabel(table: string): string {
  return TABLE_SCHEMAS[table as keyof typeof TABLE_SCHEMAS]?.label ?? table
}

/** 详情面板「被引用」跳转到引用方表 */
function onGotoTable(table: string): void {
  store.navigateTo(table as never)
}

/** 详情面板「在唤灵台打开」：发布跨模块导航事件（BattleArena 切 tab + ParticipantPanel 加载阵容） */
function onOpenInHuanling(): void {
  if (!detailId.value) return
  uiNavBus.emit(OPEN_LINEUP_EVENT, detailId.value)
}

// 表切换：重置筛选 / 分页 / 排序 / 预载 refTable 选项（immediate：首次挂载即预填 select 键，避免 v-model 绑 undefined）
watch(
  () => store.currentTable,
  () => {
    resetFilters()
    sortKey.value = ''
    sortDir.value = 'asc'
    detailId.value = null
    // 首次进入加载全表引用字典（懒加载单次；写操作后 store 失效重建）
    void store.loadRefIndex()
    // 敌人表：重建场景反向索引 + 场景→区域索引（scenes 表量小，IDB 本地读；场景编辑后切表必经此处刷新）
    if (store.currentTable === 'enemies') {
      void gameDataApi
        .listByTable<{ id: unknown; regionId?: unknown; enemies?: Array<{ id: unknown }>; yaotu?: { id: unknown } }>('scenes', { limit: 500 })
        .then((scenes) => {
          enemySceneIndex.value = buildEnemySceneIndex(scenes)
          sceneRegionIndex.value = buildSceneRegionIndex(scenes)
        })
    }
    // 场景表：加载区域行缓存（分组头 + 区域编辑抽屉数据源；区域保存后 reloadRegions 已刷新）
    if (store.currentTable === 'scenes') {
      void reloadRegions()
    }
    for (const f of schema.value.filters ?? []) {
      const rt = f.refTable
      if (rt && !optionsCache.value[rt]) {
        void store.loadOptions(rt).then((items) => {
          optionsCache.value[rt] = items
        })
      }
    }
  },
  { immediate: true },
)

// 跨表定位（健康检查 / 反向引用跳转）：待定位 id 在表切换后应用为详情高亮
watch(
  () => store.pendingDetailId,
  (id) => {
    if (!id) return
    detailId.value = id
    store.pendingDetailId = null
  },
)

// 详情行变化：加载该实体的反向引用（谁引用了它）
watch(detailId, (id) => {
  if (id) void store.loadReferences(id)
})

// ── 删除：ConfirmDialog 二次确认 + 全局通知结果反馈 ──
const notification = useNotificationStore()
const confirmRemove = ref(false)
const removeMessage = ref('')
let removeTarget: (() => Promise<void>) | null = null

function requestRemove(row: Record<string, unknown>): void {
  const name = String(row.name ?? row.id)
  removeMessage.value = `确定删除 ${schema.value.label}「${name}」？此操作不可恢复。`
  removeTarget = async () => {
    const errors = await store.remove(String(row.id))
    if (errors) notification.notify('删除失败', errors.join('\n'), 'error')
    else notification.notify('已删除', `「${name}」已删除`, 'success')
  }
  confirmRemove.value = true
}

function requestRemoveSelected(): void {
  const count = store.selectedIds.length
  removeMessage.value = `确定删除所选 ${count} 条 ${schema.value.label}？此操作不可恢复。`
  removeTarget = async () => {
    await store.removeSelected()
    notification.notify('已删除', `已删除所选 ${count} 条记录`, 'success')
  }
  confirmRemove.value = true
}

async function doRemove(): Promise<void> {
  await removeTarget?.()
}

// ── 一键重算全部敌人属性（生成模型见 @/domain/fengshen/enemy-generate） ──
const confirmRebuild = ref(false)
const rebuilding = ref(false)
const rebuildReport = ref<EnemyStatsRebuildReport | null>(null)
/** 写入被校验拦截的条目（如存量重名数据触发唯一性校验）；失败不中断其余写入 */
const rebuildFailures = ref<Array<{ id: string; name: string; reason: string }>>([])
const rebuildOpen = ref(false)
const failedIds = computed(() => new Set(rebuildFailures.value.map((f) => f.id)))

/** 档位中文（含特殊档；普通档与 ENEMY_ROLE_LABELS 同名） */
const TIER_LABELS: Record<EnemyTier, string> = {
  xiaoyao: '小妖',
  yaotu: '妖徒',
  yaokui: '妖魁',
  yaowang: '妖王',
  yaozun: '妖尊',
  king: '王级',
  final: '终局',
}
const tierLabel = (tier: EnemyTier): string => TIER_LABELS[tier]

async function doRebuildStats(): Promise<void> {
  if (rebuilding.value) return
  rebuilding.value = true
  try {
    // 全量取表（与过滤/分页无关）：重算对象是全部敌人
    const rows = await gameDataApi.listByTable<EnemyStatsRow>('enemies', { limit: 500 })
    const report = rebuildAllEnemies(rows)
    if (!report.entries.length) {
      notification.notify('无可重算数据', 'enemies 表为空', 'warning')
      return
    }
    const byId = new Map(rows.map((r) => [r.id, r]))
    const failures: Array<{ id: string; name: string; reason: string }> = []
    let written = 0
    for (const entry of report.entries) {
      // 与模型一致的行不写库：避免无意义地递增数据版本 + 刷操作日志
      if (!entry.changed) continue
      const row = byId.get(entry.id)
      if (!row) continue
      const result = await writeService.save('enemies', { ...row, stats: entry.after })
      if (result.ok) written++
      else failures.push({ id: entry.id, name: entry.name, reason: result.errors?.[0] ?? '未知错误' })
    }
    await store.refreshVersion()
    rebuildReport.value = report
    rebuildFailures.value = failures
    rebuildOpen.value = true
    notification.notify(
      failures.length ? '重算部分完成' : '重算完成',
      failures.length
        ? `更新 ${written} 只，${failures.length} 只写入失败（详见结果表，其数值未落盘）`
        : `共 ${report.total} 只，更新 ${written} 只（其余与模型一致）· 数据版本 v${store.dataVersion}`,
      failures.length ? 'warning' : 'success',
    )
  } finally {
    rebuilding.value = false
  }
}

/** 导出当前 enemies 表为规范 JSON（剥离 updatedAt + id 排序），替换 configs/enemies/enemies.json 后「从项目文件重载」即生效 */
async function exportEnemiesJson(): Promise<void> {
  const rows = await gameDataApi.listByTable<EnemyStatsRow>('enemies', { limit: 500 })
  const json = JSON.stringify(toExportableEnemies(rows), null, 2) + '\n'
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'enemies.json'
  a.click()
  URL.revokeObjectURL(url)
  notification.notify(
    '已导出规范 enemies.json',
    '替换 configs/enemies/enemies.json 后，侧栏「从项目文件重载」即全量生效（不替换则重载会还原旧值）',
    'success',
  )
}

// ── 导出防御：运行时表与 configs 权威集合不一致时（历史残留/沙盒新增/缺记录），二次确认防污染权威配置 ──
const exportAuditMessage = ref('')
const confirmExportAudit = ref(false)

async function requestExportEnemiesJson(): Promise<void> {
  const rows = await gameDataApi.listByTable<EnemyStatsRow>('enemies', { limit: 500 })
  const { extraIds, missingIds } = auditEnemyStore(rows)
  if (extraIds.length || missingIds.length) {
    const parts: string[] = []
    if (extraIds.length) {
      parts.push(`库中有 ${extraIds.length} 条 configs 权威配置不存在的记录（如 ${extraIds.slice(0, 3).join('、')}——可能是旧体系残留或沙盒新增）`)
    }
    if (missingIds.length) {
      parts.push(`configs 权威配置中有 ${missingIds.length} 条记录不在库中（如 ${missingIds.slice(0, 3).join('、')}）`)
    }
    exportAuditMessage.value = `${parts.join('；')}。当前导出将包含库内全部 ${rows.length} 条记录，直接替换 configs 前请确认。建议先「从项目文件重载」同步权威配置后再重算、导出。`
    confirmExportAudit.value = true
    return
  }
  await exportEnemiesJson()
}
</script>

<style scoped>
.fs-rebuild-summary {
  margin: 0 0 8px;
  color: var(--color-text-secondary, #9db4cc);
  font-size: var(--font-size-md);
}
.fs-rebuild-warn {
  margin: 0 0 6px;
  color: var(--color-warning, #d9a441);
  font-size: var(--font-size-md);
}
.fs-rebuild-fail {
  margin-bottom: 8px;
}
.fs-rebuild-fail-title {
  margin: 0 0 4px;
  color: var(--color-danger, #e06c5a);
  font-size: var(--font-size-md);
  font-weight: 600;
}
.fs-rebuild-fail-list {
  max-height: 18vh;
  overflow: auto;
}
.fs-rebuild-table tr.failed td {
  color: var(--color-text-tertiary, #5f7a99);
  text-decoration: line-through;
}
.fs-rebuild-table-wrap {
  max-height: 52vh;
  overflow: auto;
  border: 1px solid rgba(127, 176, 232, 0.2);
}
.fs-rebuild-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-md);
}
.fs-rebuild-table th,
.fs-rebuild-table td {
  padding: 4px 10px;
  text-align: left;
  border-bottom: 1px solid rgba(127, 176, 232, 0.12);
  white-space: nowrap;
}
.fs-rebuild-table th {
  position: sticky;
  top: 0;
  background: rgba(20, 32, 48, 0.96);
  color: var(--color-text-secondary, #9db4cc);
}
.fs-rebuild-table tr.changed td {
  color: var(--color-primary, #7fb0e8);
}
.fs-rebuild-name {
  font-weight: 600;
}
.fs-rebuild-id {
  margin-left: 8px;
  color: var(--color-text-tertiary, #5f7a99);
  font-size: var(--font-size-sm);
}
.fs-rebuild-delta {
  font-variant-numeric: tabular-nums;
}
</style>

