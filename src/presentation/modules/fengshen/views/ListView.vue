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
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"
              stroke-linecap="round" aria-hidden="true">
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3.5 3.5" />
            </svg>
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
            @update:model-value="(v) => setRange(f.key, 'min', String(v ?? ''))" />
          <span class="fs-range-sep">—</span>
          <TacticalInput type="number" size="md" :model-value="rangeState[f.key]?.max ?? ''" placeholder="最大"
            @update:model-value="(v) => setRange(f.key, 'max', String(v ?? ''))" />
        </span>
      </template>

      <span class="fs-spacer"></span>
      <span class="fs-version" title="任何写操作都会递增全局数据版本号">数据版本 v{{ store.dataVersion }}</span>
      <Button variant="primary" size="small" @click="store.openCreate">＋ 新增{{ schema.label }}</Button>
      <Button size="small" title="复制选中数据为模板" :disabled="!store.selectedIds.length"
        @click="duplicateFirst">复制为模板</Button>
      <Button v-if="store.selectedIds.length" variant="danger" size="small" @click="requestRemoveSelected">删除所选（{{
        store.selectedIds.length }}）</Button>
    </div>

    <DataTable :schema="schema" :rows="pagedRows" :selected-ids="store.selectedIds" :loading="store.loading"
      :detail-id="detailId" :sort-key="sortKey" :sort-dir="sortDir" @toggle-select="store.toggleSelect"
      @edit="store.openEdit" @copy="onCopy" @remove="requestRemove" @detail="onDetail" @sort="onSort" />

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
          @edit="store.openEdit(detailEntity)" @goto="onGotoTable" />
        <div v-else class="fs-detail-empty">
          <span class="fs-detail-empty-title">实体详情</span>
          <span class="fs-detail-empty-hint">点击列表中的名称查看对应信息</span>
        </div>
      </aside>
    </div>

    <EntityDrawer :open="store.drawerOpen" :schema="schema" :entity="store.editingEntity" :is-new="store.isNew"
      :errors="store.formErrors" :load-options="store.loadOptions" @save="onSave" @close="store.closeDrawer" />

    <!-- 危险操作二次确认 + 统一提示 -->
    <ConfirmDialog v-model="confirmRemove" :title="`删除${schema.label}`" :message="removeMessage"
      confirm-text="删除" danger @confirm="doRemove" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import type { TableFilter } from '@/domain/fengshen/schema'
import type { OptionItem } from '@/presentation/modules/fengshen/stores/fengshenStore'
import DataTable from '@/presentation/modules/fengshen/components/DataTable.vue'
import Button from '@/presentation/components/Button.vue'
import EntityDrawer from '@/presentation/modules/fengshen/components/EntityDrawer.vue'
import EntityDetailPanel from '@/presentation/modules/fengshen/components/EntityDetailPanel.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'
import ConfirmDialog from '@/presentation/components/ConfirmDialog.vue'
import { useNotificationStore } from '@/presentation/stores/notificationStore'

const PAGE_SIZE = 20

const store = useFengshenStore()
const schema = computed(() => store.currentSchema())
const page = ref(1)
const filterState = reactive<Record<string, string>>({})
const rangeState = reactive<Record<string, { min: string; max: string }>>({})
const optionsCache = ref<Record<string, OptionItem[]>>({})

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

const tableHint = computed(() => {
  const hints: Record<string, string> = {
    actors: '基础属性 / 成长曲线 / 技能绑定 / 阵营元素',
    skills: '主动 / 被动 · 能量消耗 · 步骤编排 · 效果组合',
    buffs: '增益 / 减益 / 控制 · 叠加规则 · 效果链',
    enemies: '属性 / 技能组 / 掉落物',
    scenes: '多难度敌人编组 · 所需等级 · 通关奖励',
    formations: '站位布局 / 阵型增益 / 前排保护',
    lineups: '角色组合 + 阵型绑定 · 供场景引用与一键布阵',
    materials: '材料与消耗品 · 稀有度 · 使用效果',
    equipment: '部位 / 属性加成 / 穿戴门槛',
    elements: '阵营元素定义 · 克制矩阵驱动伤害修正',
    growth: '每级属性增量 · 经验表',
    drops: '物品组 + 概率 · 供敌人引用',
    params: '伤害倍率 / 暴击概率 / Buff 上限',
  }
  return hints[store.currentTable] ?? ''
})

/** 客户端过滤：name 搜索 + select 精确 + range 范围（搜索与筛选同节奏，输入即见） */
const filteredRows = computed(() => {
  let rows = store.rows
  if (store.search) {
    const kw = store.search.toLowerCase()
    rows = rows.filter((r) => String(r.name ?? r.id ?? '').toLowerCase().includes(kw))
  }
  for (const f of schema.value.filters ?? []) {
    if (f.type === 'select') {
      const v = filterState[f.key]
      if (v) rows = rows.filter((r) => String(r[f.key] ?? '') === v)
    } else if (f.type === 'range') {
      const r = rangeState[f.key]
      if (r?.min !== undefined && r.min !== '') rows = rows.filter((row) => Number(row[f.key]) >= Number(r.min))
      if (r?.max !== undefined && r.max !== '') rows = rows.filter((row) => Number(row[f.key]) <= Number(r.max))
    }
  }
  return rows
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / PAGE_SIZE)))

// 过滤条件（搜索/筛选）变化导致结果收缩时，当前页可能超出范围——自动回到有效页
watch(totalPages, (total) => {
  if (page.value > total) page.value = total
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
  const start = (page.value - 1) * PAGE_SIZE
  return sortedRows.value.slice(start, start + PAGE_SIZE)
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
  if (f.options) return f.options.map((o) => ({ id: o, label: o }))
  if (f.refTable) return optionsCache.value[f.refTable] ?? []
  return []
}

/** 筛选下拉选项：含「全部」空值项 */
function filterOptions(f: TableFilter): TSelectOption[] {
  return [
    { value: '', label: `全部${f.label}` },
    ...selectOptions(f).map((o) => ({ value: o.id, label: o.label })),
  ]
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

/** 详情面板「被引用」跳转到引用方表 */
function onGotoTable(table: string): void {
  store.navigateTo(table as never)
}

// 表切换：重置筛选 / 分页 / 排序 / 预载 refTable 选项（immediate：首次挂载即预填 select 键，避免 v-model 绑 undefined）
watch(
  () => store.currentTable,
  () => {
    resetFilters()
    sortKey.value = ''
    sortDir.value = 'asc'
    detailId.value = null
    for (const f of schema.value.filters ?? []) {
      if (f.refTable && !optionsCache.value[f.refTable]) {
        void store.loadOptions(f.refTable).then((items) => {
          optionsCache.value[f.refTable] = items
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
</script>

