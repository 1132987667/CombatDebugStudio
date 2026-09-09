<template>
  <div class="fs-table-wrap">
    <table class="fs-table">
      <thead>
        <tr>
          <th class="fs-col-check">
            <input type="checkbox" :checked="allSelected" @change="toggleAll" aria-label="全选" />
          </th>
          <th v-for="col in displayColumns" :key="col" class="fs-th" :class="{ 'fs-sorted': sortKey === col }"
            :aria-sort="sortAria(col)" :title="`按「${fieldLabel(col)}」排序`" @click="emit('sort', col)">
            {{ fieldLabel(col) }}
            <span class="fs-sort-ico">{{ sortIco(col) }}</span>
          </th>
          <th class="fs-col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="group in groups" :key="group.key || '__all__'">
          <tr v-if="groupBy && group.rows.length > 0" class="fs-group-row" :title="`点击${isCollapsed(group.key) ? '展开' : '折叠'}该分组`"
            @click="toggleGroup(group.key)">
            <td class="fs-col-check"></td>
            <td :colspan="displayColumns.length" class="fs-group-cell">
              <span class="fs-group-arrow" :class="{ 'is-collapsed': isCollapsed(group.key) }" aria-hidden="true">▾</span>
              <span class="fs-group-title">{{ group.meta?.label ?? (group.key || '未分组') }}</span>
              <span v-if="group.meta?.hint" class="fs-group-hint">{{ group.meta.hint }}</span>
              <span class="fs-group-count">{{ group.rows.length }} 条</span>
              <Button size="small" class="fs-group-edit" title="编辑该分组对应的上级实体" @click.stop="emit('edit-group', group.key)">编辑</Button>
            </td>
            <td class="fs-col-actions"></td>
          </tr>
          <template v-if="!groupBy || !isCollapsed(group.key)">
            <tr v-for="row in group.rows" :key="String(row.id)"
              :class="{ 'is-detail-selected': detailId === String(row.id) }">
              <td class="fs-col-check">
                <input type="checkbox" :checked="selectedIds.includes(String(row.id))"
                  @change="emit('toggle-select', String(row.id))" :aria-label="`选择 ${row.id}`" />
              </td>
              <td v-for="col in displayColumns" :key="col" :class="cellClass(row, col)"
                :title="cellTitle(row, col) ?? undefined">
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
          </template>
        </template>
        <tr v-if="rows.length === 0">
          <td :colspan="displayColumns.length + 2" class="fs-empty">
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
import { computed, ref } from 'vue'

import type { TableSchema } from '@/domain/fengshen/schema'
import { POLARITY_VALUE_LABEL, SLOT_VALUE_LABEL } from '@/domain/fengshen/schema'
import { resolveRefName, resolveRefNames } from '@/domain/fengshen/refNames'
import { ENEMY_ROLE_LABELS } from '@/domain/fengshen/role-grades'

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
    /** 分组字段（如 scenes 的 regionId）：按该字段把行归入分组头下，分组列本身不再渲染 */
    groupBy?: string
    /** 分组键 → 组头展示信息（label/hint）；无 meta 的组回退显示原始键值 */
    groupMeta?: Record<string, GroupMetaInfo>
  }>(),
  { refIndex: () => ({}), groupMeta: () => ({}) },
)

/** 分组头展示信息：label = 上级实体名（如区域名），hint = 辅助摘要（如副标题 + 等级区间） */
export interface GroupMetaInfo {
  label: string
  hint?: string
}

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
  /** 点击分组头「编辑」→ 打开上级实体（如区域）编辑抽屉 */
  'edit-group': [groupKey: string]
}>()

const columns = computed(() => props.schema.columns)

/** 分组模式下隐藏分组列本身（组头已承载该信息） */
const displayColumns = computed(() =>
  props.groupBy ? columns.value.filter((c) => c !== props.groupBy) : columns.value,
)

// ── 分组渲染：组间顺序按 groupMeta 键序（如区域表权威顺序），无 meta 的组（悬空键）排尾部 ──
interface RowGroup {
  key: string
  meta: GroupMetaInfo | null
  rows: Record<string, unknown>[]
}

const groups = computed<RowGroup[]>(() => {
  if (!props.groupBy) return [{ key: '', meta: null, rows: props.rows }]
  const byKey = new Map<string, Record<string, unknown>[]>()
  for (const row of props.rows) {
    const key = String(row[props.groupBy] ?? '')
    const bucket = byKey.get(key)
    if (bucket) bucket.push(row)
    else byKey.set(key, [row])
  }
  const out: RowGroup[] = []
  for (const key of Object.keys(props.groupMeta)) {
    const rows = byKey.get(key)
    if (!rows?.length) continue
    out.push({ key, meta: props.groupMeta[key] ?? null, rows })
    byKey.delete(key)
  }
  for (const [key, rows] of byKey) out.push({ key, meta: null, rows })
  return out
})

/** 折叠状态：整组 Set 替换赋值保证响应性 */
const collapsedGroups = ref(new Set<string>())

function isCollapsed(key: string): boolean {
  return collapsedGroups.value.has(key)
}

function toggleGroup(key: string): void {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedGroups.value = next
}

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
  polarity: POLARITY_VALUE_LABEL,
  // 与 schema 权威表文案刻意不同（attribute 显示「属性修正」），属列表标签文案域
  category: {
    attribute: '属性修正', aura: '光环', dot: '持续伤害', hot: '持续治疗',
    shield: '护盾', control: '控制', immunity: '免疫', trigger: '触发',
  },
  // 与 schema 权威表文案刻意不同（ultimate 显示「大技能」）+ 物品类型键，属列表标签文案域
  type: { small: '小技能', ultimate: '大技能', passive: '被动', material: '材料', consumable: '消耗品' },
  slot: SLOT_VALUE_LABEL,
  rank: { ...ENEMY_ROLE_LABELS },
}

const KIND_CLS: Record<string, (v: string) => string> = {
  polarity: (v) => (v === 'positive' ? 'fs-tag-buff' : 'fs-tag-danger'),
  category: (v) => (v === 'control' || v === 'dot' ? 'fs-tag-danger' : v === 'aura' || v === 'immunity' ? 'fs-tag-aura' : v === 'shield' || v === 'hot' || v === 'trigger' ? 'fs-tag-aura' : 'fs-tag-buff'),
  type: (v) => (v === 'passive' || v === 'material' ? 'fs-tag-muted' : v === 'consumable' ? 'fs-tag-buff' : 'fs-tag-aura'),
  slot: () => 'fs-tag-aura',
  // 品阶：灰(小妖)→绿(妖兵)→紫(妖徒/妖魁)→红(妖王/妖尊)
  rank: (v) => (v === 'xiaoyao' ? 'fs-tag-muted' : v === 'yaobing' ? 'fs-tag-buff' : v === 'yaowang' || v === 'yaozun' ? 'fs-tag-danger' : 'fs-tag-aura'),
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
