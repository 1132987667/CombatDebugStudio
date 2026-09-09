<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      全局健康检查
      <span class="fs-page-hint">引用断裂 · 命名重复 · 字段重复 · 数值校验 扫描</span>
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
      <div class="fs-stat-card" :class="(store.numericReport?.errorCount ?? 0) > 0 ? 'fs-stat-warn' : 'fs-stat-ok'">
        <div class="fs-stat-num">{{ numericTotal }}</div><div class="fs-stat-label">数值问题</div>
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
      <Button variant="primary" @click="rescan">重新扫描</Button>
    </div>

    <div class="fs-table-wrap">
      <table class="fs-table">
        <thead>
          <tr><th>类别</th><th>级别</th><th>引用方</th><th>引用字段</th><th>问题对象</th><th>目标表</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="(issue, i) in paged" :key="i">
            <td><span class="fs-kind" :class="`fs-kind-${issue.kind}`">{{ kindLabel(issue.kind) }}</span></td>
            <td>
              <span v-if="issue.severity" class="fs-sev" :class="`fs-sev-${issue.severity}`">{{ severityLabel(issue.severity) }}</span>
              <span v-else class="fs-sev-none">—</span>
            </td>
            <td class="fs-cell-id">{{ issue.sourceId }}</td>
            <td>{{ issue.field }}</td>
            <td class="fs-cell-missing">
              {{ issue.missingId }}
              <span v-if="issue.detail" class="fs-kind-detail">{{ issue.detail }}</span>
            </td>
            <td :title="`表名：${issue.targetTable}`">{{ tableLabel(issue.targetTable) }}</td>
            <td class="fs-col-actions">
              <Button v-if="issue.quickFix" size="small" variant="primary"
                :title="`应用修复：${issue.quickFix.label}（写入 ${issue.quickFix.field} = ${issue.quickFix.value}）`"
                @click="store.applyQuickFix(issue.raw)">一键修复</Button>
              <Button size="small" :title="`跳转到「${tableLabel(issue.navTable)}」表并定位该实体`"
                @click="store.navigateTo(issue.navTable, issue.sourceId)">定位引用方</Button>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td colspan="7" class="fs-empty">{{ emptyText }}</td>
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
import type { ValidationIssue } from '@/domain/fengshen/validators/registry'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'
import { downloadCsv } from '@/shared/utils/csv'

const PAGE_SIZE = 50

const store = useFengshenStore()
const report = computed(() => store.healthReport)

/** 统一展示行：引用级 HealthCheckIssue + 数值级 ValidationIssue 合并（§5.5 数值 issue 挂靠同一面板） */
type IssueKind = HealthCheckKind | 'numeric'
interface IssueRow {
  kind: IssueKind
  severity: ValidationIssue['severity'] | ''
  sourceId: string
  field: string
  missingId: string
  targetTable: string
  detail?: string
  quickFix?: ValidationIssue['quickFix']
  /** 跳转定位用表名（数值级 issue.table；引用级 sourceTable） */
  navTable: FengshenTableName
  /** 透传原始数值 issue（applyQuickFix 消费） */
  raw?: ValidationIssue
}

const kindFilter = ref<'' | IssueKind>('')
const search = ref('')
const page = ref(1)

const kindOptions: TSelectOption[] = [
  { value: '', label: '全部类别' },
  { value: 'integrity', label: '引用断裂' },
  { value: 'duplicate_name', label: '命名重复' },
  { value: 'duplicate_ref', label: '字段重复' },
  { value: 'numeric', label: '数值校验' },
]

const KIND_LABEL: Record<IssueKind, string> = {
  integrity: '引用断裂',
  duplicate_name: '命名重复',
  duplicate_ref: '字段重复',
  numeric: '数值校验',
}

const SEVERITY_LABEL: Record<ValidationIssue['severity'], string> = {
  error: '错误',
  warn: '警告',
  info: '参考',
}

function countByKind(kind: IssueKind): number {
  return allIssues.value.filter((i) => i.kind === kind).length
}

function kindLabel(kind: IssueKind): string {
  return KIND_LABEL[kind] ?? kind
}

function severityLabel(severity: ValidationIssue['severity']): string {
  return SEVERITY_LABEL[severity] ?? severity
}

function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as FengshenTableName]?.label ?? table
}

/** 两源合并：引用级 issue 原样映射；数值级 issue 的 message 进「问题对象」列，severity 徽标 + quickFix 为增量 */
const allIssues = computed<IssueRow[]>(() => {
  const refIssues: IssueRow[] = (report.value?.issues ?? []).map((i: HealthCheckIssue) => ({
    kind: i.kind,
    severity: '',
    sourceId: i.sourceId,
    field: i.field,
    missingId: i.missingId,
    targetTable: i.targetTable,
    detail: i.detail,
    navTable: i.sourceTable,
  }))
  const numericIssues: IssueRow[] = (store.numericReport?.issues ?? []).map((i: ValidationIssue) => ({
    kind: 'numeric' as const,
    severity: i.severity,
    sourceId: i.rowId,
    field: i.field ?? i.ruleId,
    missingId: i.message,
    targetTable: i.table,
    quickFix: i.quickFix,
    navTable: i.table as FengshenTableName,
    raw: i,
  }))
  return [...refIssues, ...numericIssues]
})

const numericTotal = computed(() => store.numericReport?.issues.length ?? 0)

/** 类别筛选 + 关键词搜索（匹配引用方/问题对象/字段/目标表） */
const filtered = computed<IssueRow[]>(() => {
  const kw = search.value.trim().toLowerCase()
  return allIssues.value.filter((i) => {
    if (kindFilter.value && i.kind !== kindFilter.value) return false
    if (!kw) return true
    return [i.sourceId, i.missingId, i.field, i.targetTable, i.detail, i.quickFix?.label]
      .some((v) => v != null && String(v).toLowerCase().includes(kw))
  })
})

const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

const emptyText = computed(() => {
  if (!report.value && !store.numericReport) return '尚未扫描，点击「重新扫描」'
  return filtered.value.length ? '' : allIssues.value.length ? '当前筛选无结果' : '未发现问题，数据自洽'
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

function rescan(): void {
  void store.runHealth()
  void store.runNumericValidation()
}

function exportCsv(): void {
  downloadCsv('health-issues.csv', ['类别', '级别', '引用方表', '引用方', '引用字段', '问题对象', '目标表', '说明'],
    filtered.value.map((i) => [kindLabel(i.kind), i.severity ? severityLabel(i.severity) : '', tableLabel(i.navTable), i.sourceId, i.field, i.missingId, tableLabel(i.targetTable), i.detail ?? '']))
}
</script>

<style scoped>
.fs-sev {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 3px;
  font-size: var(--font-size-md);
  line-height: 1.6;
}
.fs-sev-error {
  color: var(--color-danger, #e2545a);
  background: rgba(226, 84, 90, 0.12);
  border: 1px solid rgba(226, 84, 90, 0.35);
}
.fs-sev-warn {
  color: var(--color-warning, #d9a441);
  background: rgba(217, 164, 65, 0.12);
  border: 1px solid rgba(217, 164, 65, 0.35);
}
.fs-sev-info {
  color: var(--color-text-secondary, #8a93a6);
  background: rgba(138, 147, 166, 0.12);
  border: 1px solid rgba(138, 147, 166, 0.3);
}
.fs-sev-none {
  color: var(--color-text-secondary, #6b7385);
}
.fs-kind-numeric {
  /* 数值校验类别标签：紫系区分引用级三色 */
  color: #a78bda;
  border-color: rgba(167, 139, 218, 0.45);
  background: rgba(167, 139, 218, 0.1);
}
</style>
