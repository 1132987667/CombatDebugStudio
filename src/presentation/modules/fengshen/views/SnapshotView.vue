<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      快照与对比
      <span class="fs-page-hint">数值快照归档 · 一键回滚 · 快照 / 数据包三色对比</span>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">
        快照归档
        <span class="fs-page-hint">缺省归档数值体系 4 表（战斗规则参数 / 属性 / 成长 / 克制）· 保留最近 20 份 · 溢出自动清理最旧</span>
      </div>
      <div class="fs-package-card">
        <div class="fs-toolbar">
          <input v-model="newLabel" class="fs-input snap-label-input" placeholder="快照命名（如：9.29 平衡版）" @keydown.enter="doCreate" />
          <Button variant="primary" @click="doCreate">创建快照</Button>
        </div>
        <div class="fs-table-wrap" style="margin-top: var(--space-3, 12px);">
          <table class="fs-table">
            <thead>
              <tr><th>名称</th><th>时间</th><th>数据版本</th><th>快照范围</th><th>行数</th><th>操作</th></tr>
            </thead>
            <tbody>
              <tr v-if="!snapshots.length"><td colspan="6" class="fs-form-hint">暂无快照——改动数值前先归档一份，可随时对比与回滚</td></tr>
              <tr v-for="s in snapshots" :key="s.id">
                <td>{{ s.label }}</td>
                <td>{{ formatTime(s.createdAt) }}</td>
                <td class="fs-cell-num">v{{ s.dataVersion }}</td>
                <td>
                  <span v-for="t in s.tables" :key="t" class="fs-tag fs-tag-muted" style="margin-right: 4px;">{{ tableLabel(t) }}</span>
                </td>
                <td class="fs-cell-num">{{ s.rowCount }}</td>
                <td>
                  <Button size="tiny" variant="secondary" @click="doCompare(s)">对比当前库</Button>
                  <Button size="tiny" variant="warning" style="margin-left: 4px;" @click="askRollback(s)">回滚</Button>
                  <Button size="tiny" variant="ghost" style="margin-left: 4px;" @click="askRemove(s)">删除</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div v-if="snapDiff" class="fs-block">
      <div class="fs-block-title">快照对比结果 <span class="fs-page-hint">{{ snapDiffLabels[0] }} → {{ snapDiffLabels[1] }}</span></div>
      <div class="fs-package-card">
        <DiffResultPanel :result="snapDiff" :before-label="snapDiffLabels[0]" :after-label="snapDiffLabels[1]" />
      </div>
    </div>

    <div class="fs-block">
      <div class="fs-block-title">
        数据包对比
        <span class="fs-page-hint">选两份导出包 JSON，按 表 → 行 → 字段 三级输出新增 / 删除 / 变更，可导出报告</span>
      </div>
      <div class="fs-package-card">
        <div class="fs-toolbar pkg-compare-toolbar">
          <div class="pkg-slot">
            <span class="pkg-slot-label">基准包 A</span>
            <Button size="small" variant="secondary" @click="pickPkg('a')">{{ pkgA ? pkgA.meta.dataVersion + ' 版 · ' + pkgA.meta.count + ' 条' : '选择 JSON' }}</Button>
          </div>
          <div class="pkg-slot">
            <span class="pkg-slot-label">目标包 B</span>
            <Button size="small" variant="secondary" @click="pickPkg('b')">{{ pkgB ? pkgB.meta.dataVersion + ' 版 · ' + pkgB.meta.count + ' 条' : '选择 JSON' }}</Button>
          </div>
          <Button variant="primary" :disabled="!pkgA || !pkgB" @click="doPkgDiff">对比 A → B</Button>
        </div>
        <input ref="pkgInputA" type="file" accept=".json" style="display: none" @change="onPkgPick($event, 'a')" />
        <input ref="pkgInputB" type="file" accept=".json" style="display: none" @change="onPkgPick($event, 'b')" />
        <div v-if="pkgDiff" style="margin-top: var(--space-3, 12px);">
          <DiffResultPanel :result="pkgDiff" before-label="基准包 A" after-label="目标包 B" />
        </div>
      </div>
    </div>

    <!-- 回滚确认：整表写回会清除快照之后新增的行，且可能引发引用断裂（健康检查兜底提示） -->
    <ConfirmDialog v-model="confirmRollback" title="回滚到快照"
      :message="rollbackHint"
      confirm-text="回滚" danger @confirm="runRollback" />
    <ConfirmDialog v-model="confirmRemove" title="删除快照"
      :message="`删除快照「${removeTarget?.label ?? ''}」？删除后无法用它回滚。`"
      confirm-text="删除" danger @confirm="runRemove" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { SnapshotService, type SnapshotMeta } from '@/application/service/SnapshotService'
import { DataPackageService, type DataPackage } from '@/application/service/DataPackageService'
import type { TableSetDiffResult } from '@/domain/fengshen/snapshot-diff'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import { useNotificationStore } from '@/presentation/stores/notificationStore'
import Button from '@/presentation/components/Button.vue'
import ConfirmDialog from '@/presentation/components/ConfirmDialog.vue'
import DiffResultPanel from '@/presentation/modules/fengshen/components/DiffResultPanel.vue'

const store = useFengshenStore()
const notification = useNotificationStore()
const snapService = container.resolve<SnapshotService>('SnapshotService')
const pkgService = container.resolve<DataPackageService>('DataPackageService')

const snapshots = ref<SnapshotMeta[]>([])
const newLabel = ref('')
const snapDiff = ref<TableSetDiffResult | null>(null)
const snapDiffId = ref('')
const snapDiffLabels = ref<string[]>(['', ''])
const pkgA = ref<DataPackage | null>(null)
const pkgB = ref<DataPackage | null>(null)
const pkgDiff = ref<TableSetDiffResult | null>(null)
const pkgInputA = ref<HTMLInputElement | null>(null)
const pkgInputB = ref<HTMLInputElement | null>(null)

const confirmRollback = ref(false)
const confirmRemove = ref(false)
const rollbackTarget = ref<SnapshotMeta | null>(null)
const removeTarget = ref<SnapshotMeta | null>(null)

const rollbackHint = ref('')

onMounted(() => {
  void store.refreshVersion()
  void loadSnapshots()
})

async function loadSnapshots(): Promise<void> {
  snapshots.value = await snapService.list()
}

function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as keyof typeof TABLE_SCHEMAS]?.label ?? table
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString()
}

async function doCreate(): Promise<void> {
  const label = newLabel.value.trim() || `手动归档 v${store.dataVersion}`
  try {
    const { snapshot, pruned } = await snapService.create(label)
    newLabel.value = ''
    notification.notify('快照已创建', `「${snapshot.label}」共 ${countRows(snapshot)} 行`, 'success')
    if (pruned.length) {
      notification.notify('快照溢出清理', `超出 ${pruned.length} 份上限，已删除最旧：${pruned.map((p) => p.label).join('、')}`, 'info')
    }
    await loadSnapshots()
  } catch (err) {
    notification.notify('快照创建失败', err instanceof Error ? err.message : String(err), 'error')
  }
}

function countRows(s: { tables: Record<string, Record<string, unknown>> }): number {
  return Object.values(s.tables).reduce((n, rows) => n + Object.keys(rows).length, 0)
}

function doCompare(s: SnapshotMeta): void {
  void (async () => {
    try {
      snapDiff.value = await snapService.diffWithCurrent(s.id)
      snapDiffId.value = s.id
      snapDiffLabels.value = [`快照「${s.label}」v${s.dataVersion}`, `当前库 v${store.dataVersion}`]
    } catch (err) {
      notification.notify('对比失败', err instanceof Error ? err.message : String(err), 'error')
    }
  })()
}

function askRollback(s: SnapshotMeta): void {
  rollbackTarget.value = s
  rollbackHint.value =
    `将把「${s.label}」（v${s.dataVersion}）包含的每张表整表写回快照内容：` +
    `快照之后在这些表新增的行会被删除，表内改动会被覆盖。` +
    `回滚完成后可先导出全量包再复核。确定继续吗？`
  confirmRollback.value = true
}

async function runRollback(): Promise<void> {
  if (!rollbackTarget.value) return
  try {
    const result = await snapService.rollback(rollbackTarget.value.id)
    store.notifyDataChanged(result.version)
    snapDiff.value = null
    await loadSnapshots()
    notification.notify('回滚完成', `已恢复 ${result.tables.length} 张表共 ${result.restoredRows} 行，当前 v${result.version}`, 'success')
    if (result.issues?.length) {
      // 对齐导入行为：回滚删除的行可能被其他表引用，完成后回报断裂引用
      notification.notify('回滚后健康检查', `发现断裂引用 ${result.issues.length} 处，请到「健康检查」页定位修复`, 'warning')
    }
  } catch (err) {
    notification.notify('回滚失败', err instanceof Error ? err.message : String(err), 'error')
  }
}

function askRemove(s: SnapshotMeta): void {
  removeTarget.value = s
  confirmRemove.value = true
}

async function runRemove(): Promise<void> {
  if (!removeTarget.value) return
  await snapService.remove(removeTarget.value.id)
  // 删除的若是正在对比的快照，残留报告已无语义
  if (snapDiff.value && removeTarget.value.id === snapDiffId.value) snapDiff.value = null
  await loadSnapshots()
}

function pickPkg(slot: 'a' | 'b'): void {
  ;(slot === 'a' ? pkgInputA : pkgInputB).value?.click()
}

async function onPkgPick(e: Event, slot: 'a' | 'b'): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const pkg = JSON.parse(await file.text()) as DataPackage
    if (!Array.isArray(pkg.meta?.tables)) {
      notification.notify('解析失败', '数据包格式不合法：缺少 meta.tables', 'error')
      return
    }
    if (slot === 'a') pkgA.value = pkg
    else pkgB.value = pkg
    pkgDiff.value = null
  } catch {
    notification.notify('解析失败', 'JSON 解析失败，请确认选择的是数据包文件', 'error')
  }
}

async function doPkgDiff(): Promise<void> {
  if (!pkgA.value || !pkgB.value) return
  pkgDiff.value = await pkgService.diffPackages(pkgA.value, pkgB.value)
}
</script>

<style scoped>
.snap-label-input {
  min-width: 240px;
}
.pkg-compare-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  flex-wrap: wrap;
}
.pkg-slot {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}
.pkg-slot-label {
  color: var(--text-secondary, #9aa);
  font-size: var(--font-size-md);
}
</style>
