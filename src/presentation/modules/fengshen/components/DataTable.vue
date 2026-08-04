<template>
  <div class="fs-table-wrap">
    <table class="fs-table">
      <thead>
        <tr>
          <th class="fs-col-check">
            <input type="checkbox" :checked="allSelected" @change="toggleAll" aria-label="全选" />
          </th>
          <th v-for="col in columns" :key="col" class="fs-th"
            :class="{ 'fs-sorted': sortKey === col }"
            :aria-sort="sortAria(col)"
            :title="`按「${fieldLabel(col)}」排序`"
            @click="emit('sort', col)">
            {{ fieldLabel(col) }}
            <span class="fs-sort-ico">{{ sortIco(col) }}</span>
          </th>
          <th class="fs-col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)"
          :class="{ 'is-detail-selected': detailId === String(row.id) }">
          <td class="fs-col-check">
            <input type="checkbox" :checked="selectedIds.includes(String(row.id))"
              @change="emit('toggle-select', String(row.id))" :aria-label="`选择 ${row.id}`" />
          </td>
          <td v-for="col in columns" :key="col" :class="cellClass(row, col)"
            :title="previewOf(row, col) ?? undefined">
            <template v-if="tagInfo(row, col)">
              <span class="fs-tag" :class="tagInfo(row, col)!.cls">{{ tagInfo(row, col)!.text }}</span>
            </template>
            <button v-else-if="isClickableField(col)" type="button" class="fs-link"
              @click="emit('detail', row)">{{ cellText(row, col) }}</button>
            <template v-else>{{ cellText(row, col) }}</template>
          </td>
          <td class="fs-col-actions">
            <Button size="small" @click="emit('edit', row)">编辑</Button>
            <Button size="small" title="复制选中数据为模板" @click="emit('copy', row)">复制</Button>
            <Button size="small" variant="danger" @click="emit('remove', row)">删</Button>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="columns.length + 2" class="fs-empty">
            <div class="fs-empty-title">{{ loading ? '加载中…' : '暂无数据' }}</div>
            <div v-if="!loading" class="fs-empty-hint">点击右上角「新增」创建第一条记录，或调整搜索 / 筛选条件</div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/presentation/components/Button.vue'
import type { TableSchema } from '@/domain/fengshen/schema'

const props = defineProps<{
  schema: TableSchema
  rows: Record<string, unknown>[]
  selectedIds: string[]
  loading?: boolean
  /** 右侧详情面板当前选中的行 id（用于行高亮） */
  detailId?: string | null
  /** 当前排序列（表头点击切换） */
  sortKey?: string
  sortDir?: 'asc' | 'desc'
}>()

const emit = defineEmits<{
  'toggle-select': [id: string]
  edit: [row: Record<string, unknown>]
  copy: [row: Record<string, unknown>]
  remove: [row: Record<string, unknown>]
  /** 点击可点击字段（名称等）→ 右侧详情面板 */
  detail: [row: Record<string, unknown>]
  /** 点击表头按该列排序 */
  sort: [col: string]
}>()

const columns = computed(() => props.schema.columns)

function sortAria(col: string): 'ascending' | 'descending' | 'none' {
  if (props.sortKey !== col) return 'none'
  return props.sortDir === 'asc' ? 'ascending' : 'descending'
}

function sortIco(col: string): string {
  if (props.sortKey !== col) return ''
  return props.sortDir === 'asc' ? '↑' : '↓'
}

/** 可点击字段：默认名称列；schema 字段可通过 column.clickable 扩展 */
const clickableFields = computed(() =>
  props.schema.fields.filter((f) => f.key === 'name' || f.column?.clickable).map((f) => f.key),
)

function isClickableField(col: string): boolean {
  return clickableFields.value.includes(col)
}

const allSelected = computed(
  () => props.rows.length > 0 && props.rows.every((r) => props.selectedIds.includes(String(r.id))),
)

function fieldLabel(col: string): string {
  return props.schema.fields.find((f) => f.key === col)?.label ?? col
}

function cellText(row: Record<string, unknown>, col: string): string {
  const v = row[col]
  if (v === undefined || v === null) return '—'
  if (Array.isArray(v)) return v.length > 0 ? `×${v.length}` : '—'
  if (typeof v === 'object') return '···'
  return String(v)
}

/** 数组/对象单元格的悬浮预览：展示前几项，帮助用户不用点开就能了解内容 */
function previewOf(row: Record<string, unknown>, col: string): string | null {
  const v = row[col]
  if (Array.isArray(v)) {
    if (!v.length) return null
    const head = v.slice(0, 3).map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' · ')
    return v.length > 3 ? `${head} …（共 ${v.length} 项）` : head
  }
  if (typeof v === 'object' && v !== null) {
    const entries = Object.entries(v as Record<string, unknown>).slice(0, 4)
    if (!entries.length) return null
    const head = entries.map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : String(x)}`).join(' · ')
    return Object.keys(v as Record<string, unknown>).length > 4 ? `${head} …` : head
  }
  return null
}

function cellClass(row: Record<string, unknown>, col: string): Record<string, boolean> {
  const field = props.schema.fields.find((f) => f.key === col)
  const format = field?.column?.format
  return {
    'fs-cell-id': format === 'id' || col === 'id',
    'fs-cell-num': format === 'number',
  }
}

/** Demo 式多色标签：按字段 tagKind 映射语义色 + 中文名 */
interface TagInfo {
  text: string
  cls: string
}

const KIND_LABEL: Record<string, Record<string, string>> = {
  polarity: { positive: '增益', negative: '减益' },
  category: {
    attribute: '属性修正', aura: '光环', dot: '持续伤害', hot: '持续治疗',
    shield: '护盾', control: '控制', immunity: '免疫', trigger: '触发',
  },
  side: { ally: '我方', enemy: '敌方' },
  type: { small: '小技能', ultimate: '大技能', passive: '被动', material: '材料', consumable: '消耗品' },
  slot: { weapon: '武器', armor: '防具', accessory: '饰品' },
}

const KIND_CLS: Record<string, (v: string) => string> = {
  polarity: (v) => (v === 'positive' ? 'fs-tag-buff' : 'fs-tag-danger'),
  category: (v) => (v === 'control' || v === 'dot' ? 'fs-tag-danger' : v === 'aura' || v === 'immunity' ? 'fs-tag-aura' : v === 'shield' || v === 'hot' || v === 'trigger' ? 'fs-tag-aura' : 'fs-tag-buff'),
  side: (v) => (v === 'ally' ? 'fs-tag-ok' : 'fs-tag-danger'),
  type: (v) => (v === 'passive' || v === 'material' ? 'fs-tag-muted' : v === 'consumable' ? 'fs-tag-buff' : 'fs-tag-aura'),
  slot: (v) => (v === 'accessory' ? 'fs-tag-buff' : 'fs-tag-aura'),
  neutral: () => 'fs-tag-aura',
}

function tagInfo(row: Record<string, unknown>, col: string): TagInfo | null {
  const field = props.schema.fields.find((f) => f.key === col)
  const kind = field?.column?.tagKind
  if (!kind) return null
  const v = row[col]
  if (v === undefined || v === null || v === '') return null
  const key = String(v)
  const text = KIND_LABEL[kind]?.[key] ?? key
  return { text, cls: KIND_CLS[kind](key) }
}

function toggleAll(): void {
  if (allSelected.value) {
    for (const r of props.rows) {
      if (props.selectedIds.includes(String(r.id))) emit('toggle-select', String(r.id))
    }
    return
  }
  for (const r of props.rows) {
    if (!props.selectedIds.includes(String(r.id))) emit('toggle-select', String(r.id))
  }
}
</script>
