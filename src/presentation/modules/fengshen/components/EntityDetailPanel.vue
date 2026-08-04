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
                  {{ formatItem(item) }}
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
                  <dd class="fs-detail-map-val">{{ formatItem(v) }}</dd>
                </div>
              </dl>
            </template>
            <template v-else>{{ String(entity[field.key]) }}</template>
          </dd>
        </div>
      </template>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TableSchema } from '@/domain/fengshen/schema'
import { ATTRIBUTE_CODE, getAttrMeta } from '@/domain/attribute/types'

const props = defineProps<{
  schema: TableSchema
  entity: Record<string, unknown>
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
  return formatItem(v)
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === ''
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 数组元素 / Map 值格式化：对象转紧凑 JSON，其余转字符串 */
function formatItem(item: unknown): string {
  if (item === null || item === undefined) return '—'
  if (typeof item === 'object') return JSON.stringify(item)
  return String(item)
}
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
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-3);
  border-bottom: 1px solid var(--color-border-default);
  background: var(--color-bg-tertiary);
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
</style>
