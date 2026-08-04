<!--
* 文件: EntityDetailPanel.vue
* 功能: 封神榜列表右侧详情面板（只读）
* 描述: 点击列表中的名称等可点击字段后，在右侧（6/24 栅格）展示该实体的全部字段值。
*       数组 / Map 做格式化展示；引用字段显示原始值（保留数据语义，不做翻译）。
* 依赖: tokens.scss 设计令牌；无额外 JS 依赖
-->
<template>
  <div v-if="entity" class="fs-detail">
    <header class="fs-detail-head">
      <span class="fs-detail-id">{{ entity.id }}</span>
      <h3 class="fs-detail-title">{{ detailName }}</h3>
      <span class="fs-detail-table">{{ schema.label }}</span>
      <Button size="small" title="在编辑器中打开该实体" @click="emit('edit')">编辑</Button>
    </header>

    <dl class="fs-detail-body">
      <template v-for="field in schema.fields" :key="field.key">
        <div class="fs-detail-row">
          <dt class="fs-detail-label">{{ field.label }}</dt>
          <dd class="fs-detail-value">
            <template v-if="isEmpty(entity[field.key])">—</template>
            <template v-else-if="Array.isArray(entity[field.key])">
              <ul class="fs-detail-list">
                <li v-for="(item, i) in entity[field.key] as unknown[]" :key="i" class="fs-detail-list-item">
                  <template v-if="isObject(item)">
                    <dl class="fs-detail-map">
                      <div v-for="(v, k) in item as Record<string, unknown>" :key="k" class="fs-detail-map-row">
                        <dt class="fs-detail-map-key">{{ k }}</dt>
                        <dd class="fs-detail-map-val">{{ renderScalar(v) }}</dd>
                      </div>
                    </dl>
                  </template>
                  <template v-else>{{ renderScalar(item) }}</template>
                </li>
              </ul>
            </template>
            <template v-else-if="isStatsField(field)">
              <dl class="fs-detail-map">
                <div v-for="(v, k) in entity[field.key] as Record<string, unknown>" :key="k" class="fs-detail-map-row">
                  <dt class="fs-detail-map-key">{{ attrLabel(String(k)) }}</dt>
                  <dd class="fs-detail-map-val">{{ attrValue(String(k), v) }}</dd>
                </div>
              </dl>
            </template>
            <template v-else-if="isObject(entity[field.key])">
              <dl class="fs-detail-map">
                <div v-for="(v, k) in entity[field.key] as Record<string, unknown>" :key="k" class="fs-detail-map-row">
                  <dt class="fs-detail-map-key">{{ k }}</dt>
                  <dd class="fs-detail-map-val">{{ renderScalar(v) }}</dd>
                </div>
              </dl>
            </template>
            <template v-else>{{ String(entity[field.key]) }}</template>
          </dd>
        </div>
      </template>
    </dl>

    <div v-if="references?.length" class="fs-detail-refs">
      <div class="fs-detail-refs-title">被引用（{{ refCount }} 处）</div>
      <div v-for="g in references" :key="g.sourceTable" class="fs-detail-refs-row">
        <button type="button" class="fs-link" :title="`跳转到${tableLabel(g.sourceTable)}表`"
          @click="emit('goto', g.sourceTable)">{{ tableLabel(g.sourceTable) }}</button>
        <span class="fs-detail-refs-ids">{{ g.ids.join('、') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TableSchema } from '@/domain/fengshen/schema'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import { ATTRIBUTE_CODE, getAttrMeta } from '@/domain/attribute/types'
import Button from '@/presentation/components/Button.vue'

const props = defineProps<{
  schema: TableSchema
  entity: Record<string, unknown>
  /** 反向引用：哪些表的哪些实体引用了当前实体 */
  references?: Array<{ sourceTable: string; ids: string[] }>
}>()

const emit = defineEmits<{
  edit: []
  /** 跳转到引用方所在表 */
  goto: [table: string]
}>()

const detailName = computed(() => String(props.entity.name ?? props.entity.id ?? '未命名'))

/** stats 字段 = 属性统计对象（actors/enemies 的 `{ attrCode: number }`），走友好属性面板渲染 */
function isStatsField(field: TableSchema['fields'][number]): boolean {
  return field.type === 'map' && field.key === 'stats'
}

/** 属性 code → 展示名（无元数据时回退原 code） */
function attrLabel(code: string): string {
  return getAttrMeta(code as ATTRIBUTE_CODE)?.displayName ?? code
}

/** 属性值格式化：百分比属性追加 %，其余保持原有展示 */
function attrValue(code: string, v: unknown): string {
  if (typeof v === 'number' && getAttrMeta(code as ATTRIBUTE_CODE)?.isPercentage) {
    return `${v}%`
  }
  return renderScalar(v)
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === ''
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 标量 / 对象渲染：对象转紧凑 JSON，其余转字符串（数组元素对象在此做键值对展示） */
function renderScalar(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as keyof typeof TABLE_SCHEMAS]?.label ?? table
}

const refCount = computed(() => props.references?.reduce((n, g) => n + g.ids.length, 0) ?? 0)
</script>

<style scoped lang="scss">
.fs-detail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  overflow: hidden;
}

.fs-detail-head {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-6) var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-tertiary);
}

.fs-detail-edit {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
}

.fs-detail-id {
  font-family: var(--font-family-mono);
  color: var(--color-text-tertiary);
}

.fs-detail-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.fs-detail-table {
  color: var(--color-text-tertiary);
}

.fs-detail-body {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: var(--space-2) var(--space-3);
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.fs-detail-row {
  padding: var(--space-2) 0;
  border-bottom: 1px dashed var(--color-border-default);

  &:last-child {
    border-bottom: none;
  }
}

.fs-detail-label {
  color: var(--color-text-tertiary);
  margin-bottom: var(--space-1);
}

.fs-detail-value {
  margin: 0;
  color: var(--color-text-primary);
  word-break: break-word;
  white-space: pre-wrap;
}

.fs-detail-list {
  margin: 0;
  padding-left: var(--space-4);
}

.fs-detail-list-item {
  line-height: var(--line-height-md);
}

.fs-detail-map {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
}

.fs-detail-map-row {
  display: flex;
  gap: var(--space-2);
}

.fs-detail-map-key {
  flex-shrink: 0;
  min-width: 5em;
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
}

.fs-detail-map-val {
  margin: 0;
  color: var(--color-text-primary);
  word-break: break-word;
}

.fs-detail-refs {
  flex-shrink: 0;
  border-top: 1px solid var(--color-border-default);
  background: var(--color-bg-tertiary);
  padding: var(--space-2) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.fs-detail-refs-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.fs-detail-refs-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--font-size-md);
}

.fs-detail-refs-ids {
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  word-break: break-all;
}
</style>
