<template>
  <div class="fs-list-view">
    <div class="fs-page-title">
      属性中心
      <span class="fs-page-hint">以属性代码为入口，列出该属性在全系统的出现位置、承载值与口径</span>
    </div>

    <div class="ac-layout">
      <!-- 左：属性清单 -->
      <aside class="ac-attr-pane">
        <input v-model="search" type="search" class="fs-input ac-search"
          placeholder="搜索属性名称 / 代码" aria-label="搜索属性" />
        <div class="ac-attr-list">
          <button v-for="a in filteredAttrs" :key="a.code" type="button" class="ac-attr-item"
            :class="{ active: a.code === activeCode }" @click="selectAttribute(a.code)">
            <span class="ac-attr-name">{{ a.name }}</span>
            <span class="ac-attr-code">{{ a.code }}</span>
          </button>
          <div v-if="!filteredAttrs.length" class="fs-empty">无匹配属性</div>
        </div>
      </aside>

      <!-- 右：出现位置 -->
      <section class="ac-detail-pane">
        <div v-if="!activeCode" class="fs-empty ac-placeholder">请选择左侧属性，查看其全系统出现位置</div>

        <template v-else>
          <div class="fs-toolbar">
            <span class="ac-current-name">{{ activeName }}</span>
            <span class="ac-current-code">{{ activeCode }}</span>
            <span class="fs-spacer"></span>
            <span class="fs-version">共 {{ occurrences.length }} 处出现</span>
          </div>

          <div v-if="!occurrences.length" class="fs-empty">该属性在配置中暂无出现位置</div>

          <div v-for="kindGroup in kindGroups" :key="kindGroup.kind" class="ac-kind">
            <div class="ac-kind-title" :class="`ac-kind-${kindGroup.kind}`">{{ kindGroup.label }}</div>
            <div v-for="labelGroup in kindGroup.labels" :key="labelGroup.label" class="fs-exp-block">
              <div class="fs-block-title">
                {{ labelGroup.label }}
                <span class="ac-count">{{ labelGroup.rows.length }}</span>
              </div>
              <div class="fs-table-wrap">
                <table class="fs-table">
                  <thead>
                    <tr><th>来源表</th><th>行</th><th>字段路径</th><th>值</th><th>操作</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="(occ, i) in labelGroup.rows" :key="i">
                      <td>{{ tableLabel(occ.table) }}</td>
                      <td>{{ occ.rowName }}</td>
                      <td class="ac-field">{{ occ.field }}</td>
                      <td class="fs-cell-num">{{ occ.valueText }}</td>
                      <td class="fs-col-actions">
                        <Button size="small" @click="jump(occ)">定位</Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { container } from '@/infrastructure/di/Container'
import { GameDataApi } from '@/application/service/GameDataApi'
import { TABLE_SCHEMAS } from '@/domain/fengshen/schema'
import {
  ATTRIBUTE_OCCURRENCE_KIND_LABEL,
  type AttributeOccurrence,
  type AttributeOccurrenceKind,
} from '@/domain/fengshen/attribute-occurrences'
import type { AttributeDef, FengshenTableName } from '@/domain/fengshen/types'
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore'
import Button from '@/presentation/components/Button.vue'

const api = container.resolve<GameDataApi>('GameDataApi')
const store = useFengshenStore()

const attributes = ref<AttributeDef[]>([])
const search = ref('')
const activeCode = ref('')
const occurrences = ref<AttributeOccurrence[]>([])

const filteredAttrs = computed(() => {
  const kw = search.value.trim().toLowerCase()
  if (!kw) return attributes.value
  return attributes.value.filter((a) => `${a.name} ${a.code}`.toLowerCase().includes(kw))
})

const activeName = computed(
  () => attributes.value.find((a) => a.code === activeCode.value)?.name ?? activeCode.value,
)

/** 按口径（基准值 / 派生值 / 引用值）分组 → 组内按规则标签（口径 · 位置）分组 */
const kindGroups = computed(() => {
  const kinds: AttributeOccurrenceKind[] = ['baseline', 'derived', 'reference']
  return kinds
    .map((kind) => {
      const rows = occurrences.value.filter((o) => o.kind === kind)
      const labelMap = new Map<string, AttributeOccurrence[]>()
      for (const row of rows) {
        const list = labelMap.get(row.label)
        if (list) list.push(row)
        else labelMap.set(row.label, [row])
      }
      return {
        kind,
        label: ATTRIBUTE_OCCURRENCE_KIND_LABEL[kind],
        labels: Array.from(labelMap, ([label, groupRows]) => ({ label, rows: groupRows })),
      }
    })
    .filter((group) => group.labels.length > 0)
})

/** 来源表的中文名（取 schema label；未知表回退原始表名） */
function tableLabel(table: FengshenTableName): string {
  return TABLE_SCHEMAS[table]?.label ?? table
}

async function selectAttribute(code: string): Promise<void> {
  activeCode.value = code
  occurrences.value = await api.findAttributeOccurrences(code)
}

/** 定位到来源实体：切换数据域列表并预置详情高亮 */
function jump(occ: AttributeOccurrence): void {
  store.navigateTo(occ.table, occ.rowId)
}

onMounted(async () => {
  attributes.value = await api.listAttributes()
  if (attributes.value.length) await selectAttribute(attributes.value[0].code)
})
</script>

<style scoped>
.ac-layout {
  display: flex;
  gap: var(--space-3);
  align-items: flex-start;
}

.ac-attr-pane {
  flex: 0 0 260px;
  min-width: 0;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  padding: var(--space-2);
}

.ac-search {
  width: 100%;
  margin-bottom: var(--space-2);
}

.ac-attr-list {
  max-height: calc(100vh - 260px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ac-attr-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: var(--font-size-md);
  line-height: 1.4;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.ac-attr-item:hover:not(.active) {
  background: rgba(var(--rgb-neutral), var(--alpha-wash));
}

.ac-attr-item.active {
  background: var(--color-bg-tertiary);
  color: var(--color-energy);
}

.ac-attr-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  bottom: 5px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-energy);
}

.ac-attr-name {
  font-weight: var(--font-weight-medium);
}

.ac-attr-code {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-md);
}

.ac-detail-pane {
  flex: 1;
  min-width: 0;
}

.ac-placeholder {
  padding: var(--space-5) 0;
}

.ac-current-name {
  font-weight: var(--font-weight-bold);
  letter-spacing: 1px;
}

.ac-current-code {
  color: var(--color-energy);
  font-size: var(--font-size-md);
}

.ac-kind-title {
  margin: var(--space-3) 0 var(--space-2);
  padding-left: var(--space-2);
  border-left: 3px solid var(--color-border-strong);
  font-weight: var(--font-weight-bold);
  letter-spacing: 2px;
}

.ac-kind-baseline {
  border-left-color: var(--color-energy);
}

.ac-kind-derived {
  border-left-color: var(--color-warning);
}

.ac-kind-reference {
  border-left-color: var(--color-text-tertiary);
}

.ac-count {
  margin-left: var(--space-2);
  color: var(--color-text-tertiary);
  font-weight: var(--font-weight-regular);
  letter-spacing: 0;
}

.ac-field {
  color: var(--color-text-secondary);
}
</style>