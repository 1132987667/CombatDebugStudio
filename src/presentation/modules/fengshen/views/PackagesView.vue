<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      数据包管理
      <span class="fs-page-hint">JSON 完整 / 选择性导出 · 导入预演 · 双源漂移检查 · 版本迁移</span>
    </div>

    <div class="fs-stat-cards">
      <div class="fs-stat-card"><div class="fs-stat-num">{{ statCount }}</div><div class="fs-stat-label">当前表条目</div></div>
      <div class="fs-stat-card"><div class="fs-stat-num">v{{ store.dataVersion }}</div><div class="fs-stat-label">数据版本</div></div>
      <div class="fs-stat-card fs-stat-ok"><div class="fs-stat-num">{{ TABLE_OPTIONS.length }}</div><div class="fs-stat-label">数据表</div></div>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">导出 <span class="fs-page-hint">一键备份 / 版本回退 / 团队协作</span></div>
      <div class="fs-package-card">
        <div class="fs-check-list">
          <label v-for="t in TABLE_OPTIONS" :key="t.table" class="fs-check">
            <input type="checkbox" v-model="exportTables" :value="t.table" />
            {{ t.label }}
          </label>
        </div>
        <div class="fs-export-meta">
          <label class="fs-export-meta-item">导出人<input v-model="metaExportedBy" class="fs-input" placeholder="如：策划甲" /></label>
          <label class="fs-export-meta-item">用途<input v-model="metaPurpose" class="fs-input" placeholder="如：9.29 平衡调整备份" /></label>
          <label class="fs-export-meta-item">目标消费方<input v-model="metaConsumer" class="fs-input" placeholder="如：数值组 / 引擎联调" /></label>
        </div>
        <div class="fs-toolbar" style="margin: var(--space-3) 0 0;">
          <Button variant="primary" @click="doExport">导出所选 JSON</Button>
          <span class="fs-form-hint">meta：dataVersion + 导出时间 + 覆盖范围（所选表）+ 导出人 / 用途 / 消费方</span>
        </div>
      </div>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">导入 <span class="fs-page-hint">先预演后落库 · 全量覆盖自动创建兜底快照</span></div>
      <div class="fs-package-card">
        <div class="fs-drop-zone" role="button" tabindex="0" aria-label="选择 JSON 数据包"
          @click="fileInput?.click()" @dragover.prevent @drop.prevent="onDrop"
          @keydown.enter.prevent="fileInput?.click()" @keydown.space.prevent="fileInput?.click()">
          <div class="fs-dz-main">将 JSON 数据包拖拽到此处，或点击选择文件</div>
          <div class="fs-form-hint">支持 .json · 完整包或选择性导出包 · 覆盖导入会自动创建兜底快照</div>
        </div>
        <input ref="fileInput" type="file" accept=".json" style="display: none" @change="onPick" />

        <div v-if="pendingPkg" class="fs-pkg-preview">
          <div class="fs-pkg-preview-title">待导入数据包</div>
          <div class="fs-pkg-preview-meta">
            导出版本 v{{ pendingPkg.meta.dataVersion }} · {{ formatTime(pendingPkg.meta.exportedAt) }} · 共 {{ pendingPkg.meta.count }} 条
            <template v-if="pendingPkg.meta.exportedBy"> · 导出人：{{ pendingPkg.meta.exportedBy }}</template>
            <template v-if="pendingPkg.meta.purpose"> · 用途：{{ pendingPkg.meta.purpose }}</template>
            <template v-if="pendingPkg.meta.consumer"> · 消费方：{{ pendingPkg.meta.consumer }}</template>
          </div>
          <div class="fs-pkg-preview-tables">
            <span v-for="t in pendingPkg.meta.tables" :key="t" class="fs-tag fs-tag-buff">
              {{ tableLabel(t) }} · {{ rowCount(t) }}
            </span>
          </div>
        </div>

        <!-- 导入预演（dry-run）：按当前策略输出新增 / 覆盖 / 跳过 / 将删除 清单，不写库 -->
        <div v-if="pendingPkg && dryRun" class="fs-pkg-preview">
          <div class="fs-pkg-preview-title">导入预演（{{ strategyLabel }}）</div>
          <div class="fs-dryrun-summary">
            <span class="fs-tag fs-tag-ok">将新增 {{ dryRun.add.length }}</span>
            <span class="fs-tag fs-tag-buff">将覆盖 {{ dryRun.overwrite.length }}</span>
            <span class="fs-tag fs-tag-muted">保持现状 {{ dryRun.skip.length }}</span>
            <span v-if="dryRun.removed.length" class="fs-tag fs-tag-danger">将删除 {{ dryRun.removed.length }}</span>
            <span v-if="dryRun.invalid" class="fs-tag fs-tag-danger">无 id 跳过 {{ dryRun.invalid }}</span>
          </div>
          <details v-if="dryRun.add.length" class="fs-dryrun-detail">
            <summary>将新增明细（前 {{ PREVIEW_LIMIT }} 条 / 共 {{ dryRun.add.length }}）</summary>
            <div v-for="e in dryRun.add.slice(0, PREVIEW_LIMIT)" :key="`a-${e.table}/${e.id}`" class="fs-dryrun-row">
              <span class="fs-tag fs-tag-muted">{{ tableLabel(e.table) }}</span>{{ e.id }}<span v-if="e.name" class="fs-form-hint">{{ e.name }}</span>
            </div>
          </details>
          <details v-if="dryRun.overwrite.length" class="fs-dryrun-detail">
            <summary>将覆盖明细（前 {{ PREVIEW_LIMIT }} 条 / 共 {{ dryRun.overwrite.length }}）——展开看字段级差异</summary>
            <div v-for="e in dryRun.overwrite.slice(0, PREVIEW_LIMIT)" :key="`o-${e.table}/${e.id}`" class="fs-dryrun-row">
              <span class="fs-tag fs-tag-muted">{{ tableLabel(e.table) }}</span>{{ e.id }}<span v-if="e.name" class="fs-form-hint">{{ e.name }}</span>
              <span v-for="d in e.fieldDiffs ?? []" :key="d.key" class="fs-dryrun-field"><b>{{ d.key }}</b>: {{ d.before }} → {{ d.after }}</span>
            </div>
          </details>
          <details v-if="dryRun.removed.length" class="fs-dryrun-detail">
            <summary>将删除明细（前 {{ PREVIEW_LIMIT }} 条 / 共 {{ dryRun.removed.length }}）——被清表中包未携带的现有行</summary>
            <div v-for="e in dryRun.removed.slice(0, PREVIEW_LIMIT)" :key="`r-${e.table}/${e.id}`" class="fs-dryrun-row">
              <span class="fs-tag fs-tag-muted">{{ tableLabel(e.table) }}</span>{{ e.id }}<span v-if="e.name" class="fs-form-hint">{{ e.name }}</span>
            </div>
          </details>
        </div>

        <div class="fs-toolbar" style="margin-top: 12px;">
          <TacticalSelect v-model="strategy" size="md" :options="strategyOptions" />
          <Button variant="primary" :disabled="!pendingPkg" @click="doImport">开始导入</Button>
          <span v-if="importResult" class="fs-form-hint">
            导入 {{ importResult.importedCount }} 条 / 跳过 {{ importResult.skippedCount }} 条<template v-if="importResult.invalidCount"> / 无 id 跳过 {{ importResult.invalidCount }} 条</template> · 版本 v{{ importResult.version }}
            <span v-if="importResult.backupSnapshotId" class="fs-dryrun-hint">已自动创建兜底快照（见「快照与对比」）</span>
            <span v-if="importResult.issues?.length" class="fs-form-error">断裂引用 {{ importResult.issues.length }} 处（见健康检查）</span>
          </span>
        </div>
      </div>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">
        双源漂移检查
        <span class="fs-page-hint">库内数据 vs configs/ 项目文件（种子同源构建链），交付前确认差异都出自策划手笔</span>
      </div>
      <div class="fs-package-card">
        <div class="fs-toolbar">
          <Button variant="primary" :loading="driftLoading" @click="doDriftCheck">检查漂移</Button>
          <Button v-if="driftReport && driftTables.length" variant="warning" @click="confirmReloadDrift = true">仅重载差异表</Button>
          <span class="fs-form-hint">全量重置请用顶栏「从项目文件重载」</span>
        </div>
        <div v-if="driftReport" class="fs-dryrun-summary" style="margin-top: var(--space-3, 12px);">
          <span class="fs-tag fs-tag-muted">检查 {{ driftReport.checkedTables.length }} 表</span>
          <span class="fs-tag fs-tag-buff">手改 {{ driftReport.modified.length }}</span>
          <span class="fs-tag fs-tag-ok">库内新增 {{ driftReport.addedInDb.length }}</span>
          <span class="fs-tag fs-tag-danger">库内缺失 {{ driftReport.missingInDb.length }}</span>
          <span v-if="noDrift" class="fs-form-hint">库与 configs 完全一致</span>
        </div>
        <details v-if="driftReport?.modified.length" class="fs-dryrun-detail">
          <summary>手改明细（前 {{ PREVIEW_LIMIT }} 条 / 共 {{ driftReport.modified.length }}）——库内相对 configs 的字段差异</summary>
          <div v-for="e in driftReport.modified.slice(0, PREVIEW_LIMIT)" :key="`m-${e.table}/${e.id}`" class="fs-dryrun-row">
            <span class="fs-tag fs-tag-muted">{{ tableLabel(e.table) }}</span>{{ e.id }}<span v-if="e.name" class="fs-form-hint">{{ e.name }}</span>
            <span v-for="d in e.fieldDiffs ?? []" :key="d.key" class="fs-dryrun-field"><b>{{ d.key }}</b>: {{ d.before }} → {{ d.after }}</span>
          </div>
        </details>
        <details v-if="driftReport?.addedInDb.length" class="fs-dryrun-detail">
          <summary>库内新增明细（前 {{ PREVIEW_LIMIT }} 条 / 共 {{ driftReport.addedInDb.length }}）</summary>
          <div v-for="e in driftReport.addedInDb.slice(0, PREVIEW_LIMIT)" :key="`ad-${e.table}/${e.id}`" class="fs-dryrun-row">
            <span class="fs-tag fs-tag-muted">{{ tableLabel(e.table) }}</span>{{ e.id }}<span v-if="e.name" class="fs-form-hint">{{ e.name }}</span>
          </div>
        </details>
        <details v-if="driftReport?.missingInDb.length" class="fs-dryrun-detail">
          <summary>库内缺失明细（前 {{ PREVIEW_LIMIT }} 条 / 共 {{ driftReport.missingInDb.length }}）——configs 有而库内没有</summary>
          <div v-for="e in driftReport.missingInDb.slice(0, PREVIEW_LIMIT)" :key="`md-${e.table}/${e.id}`" class="fs-dryrun-row">
            <span class="fs-tag fs-tag-muted">{{ tableLabel(e.table) }}</span>{{ e.id }}<span v-if="e.name" class="fs-form-hint">{{ e.name }}</span>
          </div>
        </details>
      </div>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">版本迁移记录</div>
      <div class="fs-table-wrap">
        <table class="fs-table">
          <thead>
            <tr><th>DB 版本</th><th>变更内容</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="m in STORAGE_MIGRATIONS" :key="m.version">
              <td class="fs-cell-num">v{{ m.version }}</td>
              <td>{{ m.note }}</td>
              <td><span class="fs-tag fs-tag-ok">已应用</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 覆盖导入二次确认：先自动兜底快照（失败即取消），再清包内表写入 -->
    <ConfirmDialog v-model="confirmOverwrite" title="全量导入（覆盖）"
      message="「全量导入（覆盖）」将清空库内与包内同表的全部现有条目，以包内数据为准；包里未携带的表保持原样。执行前会自动创建一份兜底快照（快照失败则取消导入），之后可在「快照与对比」页回滚。确定继续吗？"
      confirm-text="覆盖导入" danger @confirm="runImport" />
    <ConfirmDialog v-model="confirmReloadDrift" title="仅重载差异表"
      :message="`将把检出差异的 ${driftTables.length} 张表整体恢复为 configs 内容：表内手改会被覆盖、库内新增行会被删除。确定继续吗？`"
      confirm-text="重载差异表" danger @confirm="runReloadDrift" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { container } from '@/infrastructure/di/Container'

import {
  DataPackageService,
  type DataPackage,
  type DryRunReport,
  type ImportResult,
  type ImportStrategy,
} from '@/application/service/DataPackageService'
import { DriftCheckService, type DriftReport } from '@/application/service/DriftCheckService'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import { STORAGE_MIGRATIONS } from '@/infrastructure/adapters/storage/IndexedDbStorage'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { FengshenTableName } from '@/domain/fengshen/types'

// NOTE: 导出清单从 schema 派生，新增表自动进入"全量备份"，避免硬编码漏表
const TABLE_OPTIONS: Array<{ table: FengshenTableName; label: string }> = Object.values(
  TABLE_SCHEMAS,
).map((s) => ({ table: s.table, label: s.label }))

// HACK: 预演明细全量渲染会卡（大包数千行），先截断展示；B6 虚拟滚动落地后移除
const PREVIEW_LIMIT = 50

const store = useFengshenStore()
const notification = useNotificationStore()
const pkgService = container.resolve<DataPackageService>('DataPackageService')
const driftService = container.resolve<DriftCheckService>('DriftCheckService')

const exportTables = ref<FengshenTableName[]>(TABLE_OPTIONS.map((t) => t.table))
const metaExportedBy = ref('')
const metaPurpose = ref('')
const metaConsumer = ref('')
const strategy = ref<ImportStrategy>('merge-keep-existing')
const strategyOptions: TSelectOption[] = [
  { value: 'merge-keep-existing', label: '增量合并（保留现有）' },
  { value: 'merge-package-wins', label: '增量合并（以包内为准）' },
  { value: 'overwrite', label: '全量导入（覆盖）' },
]
const strategyLabel = computed(() => strategyOptions.find((o) => o.value === strategy.value)?.label ?? strategy.value)
const pendingPkg = ref<DataPackage | null>(null)
const dryRun = ref<DryRunReport | null>(null)
const importResult = ref<ImportResult | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const driftReport = ref<DriftReport | null>(null)
const driftLoading = ref(false)
const confirmReloadDrift = ref(false)

const statCount = computed(() => store.rows.length)
const noDrift = computed(() =>
  driftReport.value != null &&
  !driftReport.value.modified.length &&
  !driftReport.value.addedInDb.length &&
  !driftReport.value.missingInDb.length,
)
const driftTables = computed<string[]>(() => {
  const r = driftReport.value
  if (!r) return []
  return [...new Set([...r.modified, ...r.addedInDb, ...r.missingInDb].map((i) => i.table))]
})

onMounted(() => {
  void store.refreshVersion()
})

// 选包 / 切策略后自动重跑预演（dry-run 只读库，无写入副作用）
watch([pendingPkg, strategy], () => {
  if (!pendingPkg.value) {
    dryRun.value = null
    return
  }
  void pkgService.dryRunImport(pendingPkg.value, strategy.value).then((r) => (dryRun.value = r))
})

function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as keyof typeof TABLE_SCHEMAS]?.label ?? table
}

function rowCount(table: string): number {
  const rows = pendingPkg.value?.[table]
  return Array.isArray(rows) ? rows.length : 0
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

function doExport(): void {
  void pkgService
    .exportPackage(exportTables.value, {
      exportedBy: metaExportedBy.value.trim() || undefined,
      purpose: metaPurpose.value.trim() || undefined,
      consumer: metaConsumer.value.trim() || undefined,
    })
    .then((pkg) => {
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `taichu_package_v${pkg.meta.dataVersion}.json`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 500)
    })
}

async function readPackage(file: File): Promise<void> {
  try {
    const text = await file.text()
    const pkg = JSON.parse(text) as DataPackage
    if (!Array.isArray(pkg.meta?.tables)) {
      notification.notify('导入失败', '数据包格式不合法：缺少 meta.tables', 'error')
      return
    }
    importResult.value = null
    pendingPkg.value = pkg
  } catch {
    notification.notify('导入失败', 'JSON 解析失败，请确认选择的是数据包文件', 'error')
  }
}

function onPick(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) void readPackage(file)
}

function onDrop(e: DragEvent): void {
  const file = e.dataTransfer?.files?.[0]
  if (file) void readPackage(file)
}

async function doImport(): Promise<void> {
  if (!pendingPkg.value) return
  // 覆盖导入属不可逆操作（有兜底快照）：二次确认后再执行
  if (strategy.value === 'overwrite') {
    confirmOverwrite.value = true
    return
  }
  await runImport()
}

async function runImport(): Promise<void> {
  if (!pendingPkg.value) return
  // NOTE: 版本刷新 / 列表刷新 / 引擎数据源重载由 DataPackageService.onDataChanged 统一订阅处理
  importResult.value = await pkgService.importPackage(pendingPkg.value, strategy.value)
  pendingPkg.value = null
  dryRun.value = null
}
const confirmOverwrite = ref(false)

async function doDriftCheck(): Promise<void> {
  driftLoading.value = true
  try {
    driftReport.value = await driftService.check()
  } catch (err) {
    notification.notify('漂移检查失败', err instanceof Error ? err.message : String(err), 'error')
  } finally {
    driftLoading.value = false
  }
}

async function runReloadDrift(): Promise<void> {
  try {
    const result = await driftService.reloadTables(driftTables.value as FengshenTableName[])
    store.notifyDataChanged(result.version)
    notification.notify('差异表已重载', `${result.tables.length} 张表恢复 configs 内容，共 ${result.restoredRows} 行`, 'success')
    await doDriftCheck()
  } catch (err) {
    notification.notify('重载失败', err instanceof Error ? err.message : String(err), 'error')
  }
}
</script>

<style scoped>
.fs-export-meta {
  display: flex;
  gap: var(--space-3, 12px);
  margin-top: var(--space-3, 12px);
  flex-wrap: wrap;
}
.fs-export-meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  color: var(--text-secondary, #9aa);
  font-size: var(--font-size-md);
}
.fs-export-meta-item .fs-input {
  min-width: 180px;
}
.fs-dryrun-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  margin-top: var(--space-2, 8px);
}
.fs-dryrun-detail {
  margin-top: var(--space-2, 8px);
}
.fs-dryrun-detail summary {
  cursor: pointer;
  color: var(--text-secondary, #9aa);
  font-size: var(--font-size-md);
  padding: 2px 0;
}
.fs-dryrun-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  padding: 3px 0;
  border-bottom: 1px dashed var(--border-color, rgba(255, 255, 255, 0.06));
  font-size: var(--font-size-md);
}
.fs-dryrun-field {
  color: var(--text-secondary, #99a);
}
.fs-dryrun-field b {
  color: var(--text-primary, #ddd);
  font-weight: 600;
}
.fs-dryrun-hint {
  color: var(--text-secondary, #9aa);
  margin-left: var(--space-2, 8px);
}
</style>
