<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      操作日志
      <span class="fs-page-hint">记录每条数据的修改时间戳与操作类型（增 / 删 / 改 / 导入）</span>
      <Button size="small" @click="store.loadLogs">刷新</Button>
    </div>

    <div class="fs-toolbar">
      <TacticalSelect v-model="tableFilter" size="md" :options="tableOptions" />
      <TacticalSelect v-model="opFilter" size="md" :options="opOptions" />
      <span class="fs-spacer"></span>
      <span class="fs-version">共 {{ filtered.length }} 条</span>
    </div>

    <div v-if="paged.length" class="fs-timeline">
      <div v-for="log in paged" :key="log.id" class="fs-tl-item" :class="`op-${log.op}`">
        <div class="fs-tl-time">{{ formatTime(log.timestamp) }}</div>
        <div class="fs-tl-body">
          <button type="button" class="fs-tl-main" :disabled="!log.detail" :aria-expanded="expandedId === log.id"
            @click="toggleDetail(log.id)">
            <span class="fs-tag" :class="opTagClass(log.op)">{{ opLabel(log.op) }}</span>
            <span class="fs-tl-desc">{{ tableLabel(log.table) }} · <b>{{ log.entityName ?? log.entityId }}</b></span>
          </button>
          <div v-if="expandedId === log.id && diffOf(log).length" class="fs-tl-diff" role="region">
            <table class="fs-diff-table">
              <thead>
                <tr><th>字段</th><th>原值</th><th>新值</th></tr>
              </thead>
              <tbody>
                <tr v-for="d in diffOf(log)" :key="d.key">
                  <td class="fs-diff-key">{{ d.key }}</td>
                  <td class="fs-diff-val fs-diff-before">{{ d.before }}</td>
                  <td class="fs-diff-val fs-diff-after">{{ d.after }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="fs-empty">{{ store.logs.length ? '当前筛选无结果' : '暂无操作记录' }}</div>

    <div v-if="pages > 1" class="fs-pagination" role="navigation" aria-label="日志分页">
      <span class="fs-page-info">第 {{ page }}/{{ pages }} 页</span>
      <button class="fs-page-btn" :disabled="page <= 1" aria-label="上一页" @click="go(page - 1)">«</button>
      <button class="fs-page-btn" :disabled="page >= pages" aria-label="下一页" @click="go(page + 1)">»</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import type { OperationKind, OperationLogEntry } from '@/domain/fengshen/types'
import type { FieldDiff } from '@/shared/utils/entity-diff'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'

const PAGE_SIZE = 50

const store = useFengshenStore()
const tableFilter = ref('')
const opFilter = ref('')
const page = ref(1)
const expandedId = ref<string | null>(null)

/** 展开/收起日志条目（无 diff 的 create/delete 不可展开） */
function toggleDetail(id: string): void {
  expandedId.value = expandedId.value === id ? null : id
}

/** 解析日志 detail（update 的字段级 diff JSON） */
function diffOf(log: OperationLogEntry): FieldDiff[] {
  if (!log.detail) return []
  try {
    const parsed = JSON.parse(log.detail) as FieldDiff[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

onMounted(() => {
  void store.loadLogs()
})

const tableOptions = computed<TSelectOption[]>(() => [
  { value: '', label: '全部表' },
  ...Object.entries(TABLE_SCHEMAS).map(([key, s]) => ({ value: key, label: s.label })),
])

const OP_META: Record<OperationKind, { label: string; cls: string }> = {
  create: { label: '新增', cls: 'fs-tag-ok' },
  update: { label: '修改', cls: 'fs-tag-aura' },
  delete: { label: '删除', cls: 'fs-tag-danger' },
  import: { label: '导入', cls: 'fs-tag-buff' },
}

const opOptions: TSelectOption[] = [
  { value: '', label: '全部操作' },
  { value: 'create', label: '新增' },
  { value: 'update', label: '修改' },
  { value: 'delete', label: '删除' },
  { value: 'import', label: '导入' },
]

function opLabel(op: OperationKind): string {
  return OP_META[op].label
}

function opTagClass(op: OperationKind): string {
  return OP_META[op].cls
}

function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as keyof typeof TABLE_SCHEMAS]?.label ?? table
}

const filtered = computed(() =>
  store.logs.filter(
    (l) =>
      (!tableFilter.value || l.table === tableFilter.value) &&
      (!opFilter.value || l.op === opFilter.value),
  ),
)

const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))
const paged = computed(() => filtered.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

// 筛选变化回到首页；日志刷新后页码越界兜底
watch([tableFilter, opFilter], () => {
  page.value = 1
})
watch(pages, (p) => {
  if (page.value > p) page.value = p
})

function go(p: number): void {
  if (p < 1 || p > pages.value) return
  page.value = p
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>
