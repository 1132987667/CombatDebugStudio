<template>
  <div class="diff-panel">
    <div class="diff-summary">
      <span class="fs-tag fs-tag-ok">新增 {{ result.added.length }}</span>
      <span class="fs-tag fs-tag-danger">删除 {{ result.removed.length }}</span>
      <span class="fs-tag fs-tag-buff">变更 {{ result.changed.length }}</span>
      <span class="fs-form-hint">{{ beforeLabel }} → {{ afterLabel }}</span>
      <span class="diff-spacer"></span>
      <Button variant="ghost" size="tiny" @click="exportReport">导出报告</Button>
    </div>

    <div v-if="isEmpty" class="fs-form-hint diff-empty">两侧数据完全一致，无差异。</div>

    <div v-else class="diff-body">
      <div v-if="result.added.length" class="diff-section">
        <div class="diff-section-title"><span class="fs-tag fs-tag-ok">新增</span> 目标侧多出（共 {{ result.added.length }} 行）</div>
        <div v-for="row in result.added.slice(0, ROW_LIMIT)" :key="`a-${row.table}/${row.id}`" class="diff-row">
          <span class="fs-tag fs-tag-muted">{{ tableLabel(row.table) }}</span>
          <span class="diff-id">{{ row.id }}</span>
        </div>
        <div v-if="result.added.length > ROW_LIMIT" class="fs-form-hint">仅显示前 {{ ROW_LIMIT }} 行，完整清单请导出报告</div>
      </div>

      <div v-if="result.removed.length" class="diff-section">
        <div class="diff-section-title"><span class="fs-tag fs-tag-danger">删除</span> 基准侧多出（共 {{ result.removed.length }} 行）</div>
        <div v-for="row in result.removed.slice(0, ROW_LIMIT)" :key="`r-${row.table}/${row.id}`" class="diff-row">
          <span class="fs-tag fs-tag-muted">{{ tableLabel(row.table) }}</span>
          <span class="diff-id">{{ row.id }}</span>
        </div>
        <div v-if="result.removed.length > ROW_LIMIT" class="fs-form-hint">仅显示前 {{ ROW_LIMIT }} 行，完整清单请导出报告</div>
      </div>

      <div v-if="result.changed.length" class="diff-section">
        <div class="diff-section-title"><span class="fs-tag fs-tag-buff">变更</span> 同 id 行内容差异（共 {{ result.changed.length }} 处字段变更）</div>
        <div v-for="(row, i) in changedRows.slice(0, ROW_LIMIT)" :key="`c-${i}`" class="diff-row diff-changed">
          <span class="fs-tag fs-tag-muted">{{ tableLabel(row.table) }}</span>
          <span class="diff-id">{{ row.id }}</span>
          <span v-for="f in row.fields" :key="f.field" class="diff-field">
            <b>{{ f.field }}</b>: {{ f.beforeText }} → {{ f.afterText }}
            <span v-if="f.hot" class="fs-tag fs-tag-buff diff-hot">Δ{{ f.deltaText }}%</span>
          </span>
        </div>
        <div v-if="result.changed.length > ROW_LIMIT" class="fs-form-hint">仅显示前 {{ ROW_LIMIT }} 处，完整清单请导出报告</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * DiffResultPanel.vue — 表集差异三色展示（快照对比 / 包 vs 包 diff 共用）
 *
 * 按 新增 / 删除 / 变更 三段渲染 diffTableSets 结果，变更行展开字段级 before → after；
 * |Δ| > 10% 的数值字段高亮（路线图 §6 B2 口径）。大 diff 截断展示 + 导出全量报告。
 */
import { computed } from 'vue'
import Button from '@/presentation/components/Button.vue'
import type { TableSetDiffResult } from '@/domain/fengshen/snapshot-diff'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'

// HACK: 大 diff 全量渲染会卡（千级字段），先按行截断 + 导出兜底；B6 虚拟滚动落地后移除
const ROW_LIMIT = 100

const props = defineProps<{
  result: TableSetDiffResult
  beforeLabel: string
  afterLabel: string
}>()

const isEmpty = computed(() => !props.result.added.length && !props.result.removed.length && !props.result.changed.length)

interface ChangedRowView {
  table: string
  id: string
  fields: Array<{ field: string; beforeText: string; afterText: string; deltaText: string; hot: boolean }>
}

/** 同表同行的字段变更合并为一行展示 */
const changedRows = computed<ChangedRowView[]>(() => {
  const map = new Map<string, ChangedRowView>()
  for (const c of props.result.changed) {
    const key = `${c.table}/${c.id}`
    let row = map.get(key)
    if (!row) {
      row = { table: c.table, id: c.id, fields: [] }
      map.set(key, row)
    }
    const pct = c.deltaPercent
    row.fields.push({
      field: c.field,
      beforeText: valueText(c.before),
      afterText: valueText(c.after),
      deltaText: pct == null ? '' : (Math.round(pct * 10) / 10).toString(),
      hot: pct != null && Math.abs(pct) > 10,
    })
  }
  return [...map.values()]
})

function valueText(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as keyof typeof TABLE_SCHEMAS]?.label ?? table
}

function exportReport(): void {
  const blob = new Blob([JSON.stringify(props.result, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `fengshen_diff_${Date.now()}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 500)
}
</script>

<style scoped>
.diff-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
.diff-summary {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
}
.diff-spacer {
  flex: 1;
}
.diff-empty {
  padding: var(--space-3, 12px) 0;
}
.diff-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1, 4px);
}
.diff-section-title {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-size: var(--font-size-md);
  color: var(--text-secondary, #9aa);
  margin-bottom: 2px;
}
.diff-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2, 8px);
  flex-wrap: wrap;
  padding: 3px 0;
  border-bottom: 1px dashed var(--border-color, rgba(255, 255, 255, 0.06));
  font-size: var(--font-size-md);
}
.diff-id {
  font-family: var(--font-mono, monospace);
  color: var(--text-primary, #eee);
}
.diff-field {
  color: var(--text-secondary, #99a);
}
.diff-field b {
  color: var(--text-primary, #ddd);
  font-weight: 600;
}
.diff-hot {
  font-weight: 600;
}
</style>
