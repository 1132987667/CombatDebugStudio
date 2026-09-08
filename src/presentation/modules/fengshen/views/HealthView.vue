<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      全局健康检查
      <span class="fs-page-hint">引用断裂 · 命名重复 · 字段重复 扫描</span>
    </div>

    <div class="fs-stat-cards">
      <div class="fs-stat-card"><div class="fs-stat-num">{{ report?.scannedRules ?? 0 }}</div><div class="fs-stat-label">检查规则</div></div>
      <div class="fs-stat-card"><div class="fs-stat-num">{{ report?.checkedEntities ?? 0 }}</div><div class="fs-stat-label">检查条目</div></div>
      <div class="fs-stat-card" :class="countByKind('integrity') > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ countByKind('integrity') }}</div><div class="fs-stat-label">断裂引用</div>
      </div>
      <div class="fs-stat-card" :class="countByKind('duplicate_name') > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ countByKind('duplicate_name') }}</div><div class="fs-stat-label">命名重复</div>
      </div>
      <div class="fs-stat-card" :class="countByKind('duplicate_ref') > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ countByKind('duplicate_ref') }}</div><div class="fs-stat-label">字段重复</div>
      </div>
    </div>

    <div class="fs-toolbar">
      <TacticalSelect v-model="kindFilter" size="md" :options="kindOptions" />
      <TacticalInput :model-value="search" placeholder="按 ID / 字段 / 目标搜索…" aria-label="搜索问题条目"
        @update:model-value="search = String($event ?? '')">
        <template #icon>
          <IconSearch />
        </template>
      </TacticalInput>
      <span class="fs-spacer"></span>
      <span class="fs-version">问题 {{ filtered.length }} 条</span>
      <Button size="small" :disabled="!filtered.length" title="导出当前筛选结果为 CSV"
        @click="exportCsv">导出 CSV</Button>
      <Button variant="primary" @click="store.runHealth">重新扫描</Button>
    </div>

    <div class="fs-table-wrap">
      <table class="fs-table">
        <thead>
          <tr><th>类别</th><th>引用方</th><th>引用字段</th><th>问题对象</th><th>目标表</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="(issue, i) in paged" :key="i">
            <td><span class="fs-kind" :class="`fs-kind-${issue.kind}`">{{ kindLabel(issue.kind) }}</span></td>
            <td class="fs-cell-id">{{ issue.sourceId }}</td>
            <td>{{ issue.field }}</td>
            <td class="fs-cell-missing">
              {{ issue.missingId }}
              <span v-if="issue.detail" class="fs-kind-detail">{{ issue.detail }}</span>
            </td>
            <td :title="`表名：${issue.targetTable}`">{{ tableLabel(issue.targetTable) }}</td>
            <td class="fs-col-actions">
              <Button size="small" :title="`跳转到「${tableLabel(issue.sourceTable)}」表并定位该实体`"
                @click="store.navigateTo(issue.sourceTable, issue.sourceId)">定位引用方</Button>
              <Button size="small" :title="`跳转到「${tableLabel(issue.targetTable)}」表`"
                @click="store.navigateTo(issue.targetTable)">目标表</Button>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="6" class="fs-empty">{{ emptyText }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pages > 1" class="fs-pagination" role="navigation" aria-label="问题列表分页">
      <span class="fs-page-info">筛选出 {{ filtered.length }} 条 · 第 {{ page }}/{{ pages }} 页</span>
      <button class="fs-page-btn" :disabled="page <= 1" aria-label="上一页" @click="go(page - 1)">«</button>
      <button class="fs-page-btn" :disabled="page >= pages" aria-label="下一页" @click="go(page + 1)">»</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import IconSearch from '~icons/app/search'

import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import type { FengshenTableName } from '@/domain/fengshen/types'
import type { HealthCheckIssue, HealthCheckKind } from '@/application/service/DataIntegrityService'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'
import { downloadCsv } from '@/shared/utils/csv'

const PAGE_SIZE = 50

const store = useFengshenStore()
const report = computed(() => store.healthReport)

const kindFilter = ref<'' | HealthCheckKind>('')
const search = ref('')
const page = ref(1)

const kindOptions: TSelectOption[] = [
  { value: '', label: '全部类别' },
  { value: 'integrity', label: '引用断裂' },
  { value: 'duplicate_name', label: '命名重复' },
  { value: 'duplicate_ref', label: '字段重复' },
]

const KIND_LABEL: Record<HealthCheckKind, string> = {
  integrity: '引用断裂',
  duplicate_name: '命名重复',
  duplicate_ref: '字段重复',
}

function countByKind(kind: HealthCheckKind): number {
  return report.value?.issues.filter((i) => i.kind === kind).length ?? 0
}

function kindLabel(kind: HealthCheckKind): string {
  return KIND_LABEL[kind] ?? kind
}

function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as FengshenTableName]?.label ?? table
}

/** 类别筛选 + 关键词搜索（匹配引用方/问题对象/字段/目标表） */
const filtered = computed<HealthCheckIssue[]>(() => {
  const issues = report.value?.issues ?? []
  const kw = search.value.trim().toLowerCase()
  return issues.filter((i) => {
    if (kindFilter.value && i.kind !== kindFilter.value) return false
    if (!kw) return true
    return [i.sourceId, i.missingId, i.field, i.targetTable, i.sourceTable, i.detail]
      .some((v) => v != null && String(v).toLowerCase().includes(kw))
  })
})

const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

const emptyText = computed(() => {
  if (!report.value) return '尚未扫描，点击「重新扫描」'
  return filtered.value.length ? '' : report.value.issues.length ? '当前筛选无结果' : '未发现问题，数据自洽'
})

// 筛选变化回首页；筛选收缩后页码越界兜底
watch([kindFilter, search], () => {
  page.value = 1
})
watch(pages, (p) => {
  if (page.value > p) page.value = p
})

function go(p: number): void {
  if (p < 1 || p > pages.value) return
  page.value = p
}

function exportCsv(): void {
  downloadCsv('health-issues.csv', ['类别', '引用方表', '引用方', '引用字段', '问题对象', '目标表', '说明'],
    filtered.value.map((i) => [kindLabel(i.kind), tableLabel(i.sourceTable), i.sourceId, i.field, i.missingId, tableLabel(i.targetTable), i.detail ?? '']))
}
</script>
