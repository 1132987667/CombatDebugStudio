<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      数据包管理
      <span class="fs-page-hint">JSON 完整 / 选择性导出 · 全量 / 增量导入 · 版本迁移</span>
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
        <div class="fs-toolbar" style="margin: var(--space-3) 0 0;">
          <Button variant="primary" @click="doExport">导出所选 JSON</Button>
          <span class="fs-form-hint">包含 meta：dataVersion + 导出时间 + 表清单</span>
        </div>
      </div>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">导入 <span class="fs-page-hint">全量覆盖 / 增量合并</span></div>
      <div class="fs-package-card">
        <div class="fs-drop-zone" role="button" tabindex="0" aria-label="选择 JSON 数据包"
          @click="fileInput?.click()" @dragover.prevent @drop.prevent="onDrop"
          @keydown.enter.prevent="fileInput?.click()" @keydown.space.prevent="fileInput?.click()">
          <div class="fs-dz-main">将 JSON 数据包拖拽到此处，或点击选择文件</div>
          <div class="fs-form-hint">支持 .json · 完整包或选择性导出包 · 导入前建议先导出备份</div>
        </div>
        <input ref="fileInput" type="file" accept=".json" style="display: none" @change="onPick" />

        <div v-if="pendingPkg" class="fs-pkg-preview">
          <div class="fs-pkg-preview-title">待导入数据包</div>
          <div class="fs-pkg-preview-meta">
            导出版本 v{{ pendingPkg.meta.dataVersion }} · {{ formatTime(pendingPkg.meta.exportedAt) }} · 共 {{ pendingPkg.meta.count }} 条
          </div>
          <div class="fs-pkg-preview-tables">
            <span v-for="t in pendingPkg.meta.tables" :key="t" class="fs-tag fs-tag-buff">
              {{ tableLabel(t) }} · {{ rowCount(t) }}
            </span>
          </div>
        </div>

        <div class="fs-toolbar" style="margin-top: 12px;">
          <TacticalSelect v-model="strategy" size="md" :options="strategyOptions" />
          <Button variant="primary" :disabled="!pendingPkg" @click="doImport">开始导入</Button>
          <span v-if="importResult" class="fs-form-hint">
            导入 {{ importResult.importedCount }} 条 / 跳过 {{ importResult.skippedCount }} 条 · 版本 v{{ importResult.version }}
            <span v-if="importResult.issues?.length" class="fs-form-error">断裂引用 {{ importResult.issues.length }} 处（见健康检查）</span>
          </span>
        </div>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import Button from '@/presentation/components/Button.vue'
import { DataPackageService, type DataPackage, type ImportResult, type ImportStrategy } from '@/application/service/DataPackageService'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import { STORAGE_MIGRATIONS } from '@/infrastructure/adapters/storage/IndexedDbStorage'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import type { FengshenTableName } from '@/domain/fengshen/types'

const TABLE_OPTIONS: Array<{ table: FengshenTableName; label: string }> = [
  { table: 'actors', label: '角色' },
  { table: 'skills', label: '技能' },
  { table: 'buffs', label: 'Buff' },
  { table: 'enemies', label: '敌人' },
  { table: 'scenes', label: '场景' },
  { table: 'formations', label: '阵型' },
  { table: 'lineups', label: '预设阵容' },
  { table: 'materials', label: '材料' },
  { table: 'equipment', label: '装备' },
  { table: 'elements', label: '阵营克制' },
  { table: 'growth', label: '成长曲线' },
  { table: 'affixes', label: '词缀' },
]

const store = useFengshenStore()
const pkgService = container.resolve<DataPackageService>('DataPackageService')

const exportTables = ref<FengshenTableName[]>(TABLE_OPTIONS.map((t) => t.table))
const strategy = ref<ImportStrategy>('merge-keep-existing')
const strategyOptions: TSelectOption[] = [
  { value: 'merge-keep-existing', label: '增量合并（保留现有）' },
  { value: 'merge-package-wins', label: '增量合并（以包内为准）' },
  { value: 'overwrite', label: '全量导入（覆盖）' },
]
const pendingPkg = ref<DataPackage | null>(null)
const importResult = ref<ImportResult | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const notification = useNotificationStore()

const statCount = computed(() => store.rows.length)

onMounted(() => {
  void store.refreshVersion()
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
  void pkgService.exportPackage(exportTables.value).then((pkg) => {
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
  // NOTE: 版本刷新 / 列表刷新 / 引擎数据源重载由 DataPackageService.onDataChanged 统一订阅处理
  importResult.value = await pkgService.importPackage(pendingPkg.value, strategy.value)
  pendingPkg.value = null
}
</script>

