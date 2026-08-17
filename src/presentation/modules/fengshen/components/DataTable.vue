<template>
  <div class="fs-table-wrap">
    <table class="fs-table">
      <thead>
        <tr>
          <th class="fs-col-check">
            <input type="checkbox" :checked="allSelected" @change="toggleAll" aria-label="全选" />
          </th>
          <th v-for="col in columns" :key="col" class="fs-th" :class="{ 'fs-sorted': sortKey === col }"
            :aria-sort="sortAria(col)" :title="`按「${fieldLabel(col)}」排序`" @click="emit('sort', col)">
            {{ fieldLabel(col) }}
            <span class="fs-sort-ico">{{ sortIco(col) }}</span>
          </th>
          <th class="fs-col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)" :class="{ 'is-detail-selected': detailId === String(row.id) }">
          <td class="fs-col-check">
            <input type="checkbox" :checked="selectedIds.includes(String(row.id))"
              @change="emit('toggle-select', String(row.id))" :aria-label="`选择 ${row.id}`" />
          </td>
          <td v-for="col in columns" :key="col" :class="cellClass(row, col)" :title="cellTitle(row, col) ?? undefined">
            <template v-if="tagInfo(row, col)">
              <span class="fs-tag" :class="tagInfo(row, col)!.cls">{{ tagInfo(row, col)!.text }}</span>
            </template>
            <button v-else-if="isClickableField(col)" type="button" class="fs-link" @click="emit('detail', row)">{{
              cellText(row,
              col) }}</button>
            <template v-else>{{ cellText(row, col) }}</template>
          </td>
          <td class="fs-col-actions">
            <Button size="small" @click="emit('edit', row)">编辑</Button>
            <Button size="small" title="复制选中数据为模板" @click="emit('copy', row)">复制</Button>
            <Button size="small" variant="danger" @click="emit('remove', row)">删除</Button>
          </td>
        </tr>
        <tr v-if="rows.length === 0">
          <td :colspan="columns.length + 2" class="fs-empty">
            <template v-if="loading">
              <div class="fs-empty-title">加载中…</div>
            </template>
            <template v-else-if="hasFilter">
              <div class="fs-empty-title">无匹配结果</div>
              <div class="fs-empty-hint">当前搜索 / 筛选条件下没有数据</div>
              <button type="button" class="fs-empty-action" @click="emit('clear-filters')">清除搜索与筛选</button>
            </template>
            <template v-else>
              <div class="fs-empty-title">暂无数据</div>
              <div class="fs-empty-hint">点击右上角「新增」创建第一条记录</div>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import type { TableSchema } from '@/domain/fengshen/schema'
import { resolveRefName, resolveRefNames } from '@/domain/fengshen/refNames'

const props = withDefaults(
  defineProps<{
    schema: TableSchema
    rows: Record<string, unknown>[]
    selectedIds: string[]
    loading?: boolean
    /** 是否处于搜索/筛选过滤态（空态时提示「清除搜索与筛选」） */
    hasFilter?: boolean
    /** 右侧详情面板当前选中的行 id（用于行高亮） */
    detailId?: string | null
    /** 当前排序列（表头点击切换） */
    sortKey?: string
    sortDir?: 'asc' | 'desc'
    /** 全表引用字典（id → 中文名）：refTable 列优先显示中文，缺省回退原始 id */
    refIndex?: Record<string, string>
  }>(),
  { refIndex: () => ({}) },
)

const emit = defineEmits<{
  'toggle-select': [id: string]
  edit: [row: Record<string, unknown>]
  copy: [row: Record<string, unknown>]
  remove: [row: Record<string, unknown>]
  /** 点击可点击字段（名称等）→ 右侧详情面板 */
  detail: [row: Record<string, unknown>]
  /** 点击表头按该列排序 */
  sort: [col: string]
  /** 空态「清除搜索与筛选」 */
  'clear-filters': []
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

function fieldOf(col: string) {
  return props.schema.fields.find((f) => f.key === col)
}

function cellText(row: Record<string, unknown>, col: string): string {
  const v = row[col]
  if (v === undefined || v === null) return '—'
  // 引用字段优先中文（skillIds → 技能名、formationId → 阵型名）；数组取前 3 项 + 计数
  if (fieldOf(col)?.refTable) {
    if (Array.isArray(v)) {
      const names = resolveRefNames(v.filter((x): x is string => typeof x === 'string'), props.refIndex)
      if (!names.length) return '—'
      return names.length > 3 ? `${names.slice(0, 3).join('、')}… ×${names.length}` : names.join('、')
    }
    return resolveRefName(String(v), props.refIndex)
  }
  if (Array.isArray(v)) return v.length > 0 ? `×${v.length}` : '—'
  if (typeof v === 'object') return '···'
  return String(v)
}

/** 单元格悬浮：引用字段 title 保留原始英文 id（不丢调试语义），其余为内容预览 */
function cellTitle(row: Record<string, unknown>, col: string): string | null {
  const field = fieldOf(col)
  const v = row[col]
  if (field?.refTable) {
    if (Array.isArray(v)) {
      const ids = v.filter((x): x is string => typeof x === 'string')
      return ids.length ? `id: ${ids.join('、')}` : null
    }
    if (v === undefined || v === null || v === '') return null
    return `id: ${String(v)}`
  }
  return previewOf(row, col)
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
  type: { small: '小技能', ultimate: '大技能', passive: '被动', material: '材料', consumable: '消耗品' },
  slot: { weapon: '武器', armor: '衣服', helmet: '头盔', boots: '靴子', charm: '护符', ring: '戒指' },
  rank: {
    normal: '小妖', yaobing: '妖兵', yaotu: '妖徒',
    yaokui: '妖魁', yaowang: '妖王', yaozun: '妖尊',
  },
}

const KIND_CLS: Record<string, (v: string) => string> = {
  polarity: (v) => (v === 'positive' ? 'fs-tag-buff' : 'fs-tag-danger'),
  category: (v) => (v === 'control' || v === 'dot' ? 'fs-tag-danger' : v === 'aura' || v === 'immunity' ? 'fs-tag-aura' : v === 'shield' || v === 'hot' || v === 'trigger' ? 'fs-tag-aura' : 'fs-tag-buff'),
  type: (v) => (v === 'passive' || v === 'material' ? 'fs-tag-muted' : v === 'consumable' ? 'fs-tag-buff' : 'fs-tag-aura'),
  slot: () => 'fs-tag-aura',
  // 品阶：灰(小妖)→绿(精英)→紫(头目/妖魁)→红(妖王/妖尊)
  rank: (v) => (v === 'normal' ? 'fs-tag-muted' : v === 'elite' ? 'fs-tag-buff' : v === 'yaowang' || v === 'yaozun' ? 'fs-tag-danger' : 'fs-tag-aura'),
  neutral: () => 'fs-tag-aura',
}

function tagInfo(row: Record<string, unknown>, col: string): TagInfo | null {
  const field = props.schema.fields.find((f) => f.key === col)
  const kind = field?.column?.tagKind
  if (!kind) return null
  const v = row[col]
  if (v === undefined || v === null || v === '') return null
  const key = String(v)
  // 优先 schema.valueLabel（数据即真相，与详情面板一致），无映射时回退 Demo 标签表
  const text = field?.valueLabel?.[key] ?? KIND_LABEL[kind]?.[key] ?? key
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
