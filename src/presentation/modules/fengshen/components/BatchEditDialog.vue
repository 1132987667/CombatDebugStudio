<template>
  <Dialog :model-value="open" :title="`批量编辑${schema.label}`" width="440px" @update:model-value="onModelValue">
    <div class="fs-batch-body">
      <div class="fs-form-group">
        <label class="fs-field-label">选择字段</label>
        <TacticalSelect :model-value="fieldKey" size="md" placeholder="— 选择字段 —" :options="fieldOptions"
          @update:model-value="onFieldChange" />
      </div>

      <div v-if="selectedField" class="fs-form-group">
        <label class="fs-field-label">{{ selectedField.label }}</label>
        <!-- 标量广播：number/text/select 直接覆盖；boolean 广播开关；array/map/multi/object 走 JSON 模板广播 -->
        <TacticalInput v-if="selectedField.type === 'number'" type="number" :model-value="rawValue"
          @update:model-value="setValue($event)" />
        <TacticalInput v-else-if="selectedField.type === 'text'" :model-value="rawValue"
          @update:model-value="setValue($event)" />
        <TacticalSelect v-else-if="selectedField.type === 'select'" size="md" :model-value="rawValue"
          :options="valueOptions" placeholder="— 未选择 —" @update:model-value="setValue($event ?? '')" />
        <label v-else-if="selectedField.type === 'boolean'" class="fs-batch-bool">
          <input type="checkbox" :checked="boolValue"
            @change="boolValue = ($event.target as HTMLInputElement).checked" />
          设为 true（取消勾选 = false）
        </label>
        <template v-else>
          <textarea v-model="rawValue" class="fs-batch-json" rows="6" spellcheck="false"
            placeholder='JSON 模板，广播到全部选中行，如 [{"itemId":"mat_taomu","quantity":1,"chance":0.5}]'></textarea>
          <div v-if="jsonError" class="fs-batch-json-error">{{ jsonError }}</div>
        </template>
      </div>

      <div v-if="selectedField && previewRows.length" class="fs-batch-preview">
        <div class="fs-batch-preview-head">
          将改动 <strong>{{ changedCount }}</strong> 条
          <span v-if="unchangedCount > 0"> · {{ unchangedCount }} 条值无变化（仍走校验）</span>
        </div>
        <div class="fs-batch-preview-list">
          <div v-for="r in previewRows" :key="String(r.id)" class="fs-batch-preview-row"
            :class="{ 'fs-batch-preview-row--muted': !isChanged(r) }">
            <span class="fs-batch-preview-name" :title="`id: ${String(r.id)}`">{{ String(r.name ?? r.id) }}</span>
            <span class="fs-batch-preview-diff">
              {{ previewOld(r) }}
              <span class="fs-batch-preview-arrow" :class="{ same: !isChanged(r) }">→</span>
              {{ displayValue }}
            </span>
          </div>
        </div>
      </div>

      <div class="fs-form-hint">将应用到当前选中的 {{ count }} 条{{ schema.label }}记录，保存时仍走完整性校验；应用后可一键撤销整批改动。</div>
    </div>

    <template #footer>
      <Button variant="ghost" @click="emit('close')">取消</Button>
      <Button variant="primary" :disabled="!fieldKey || !selectedField || !!jsonError" @click="apply">应用</Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TableSchema } from '@/domain/fengshen/schema'
import type { FengshenTableName } from '@/domain/fengshen/types'
import type { OptionItem } from '@/presentation/modules/fengshen/stores/fengshenStore'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'

const props = defineProps<{
  open: boolean
  schema: TableSchema
  count: number
  /** 选中行实体（应用前预览旧值 → 新值 diff 用） */
  selectedRows: Array<Record<string, unknown>>
  loadOptions: (table: FengshenTableName) => Promise<OptionItem[]>
}>()

const emit = defineEmits<{
  close: []
  apply: [fieldKey: string, value: unknown]
}>()

/** 可批量编辑字段：标量覆盖 + boolean 开关 + 结构字段的 JSON 模板广播 */
const JSON_TYPES = ['array', 'map', 'multi', 'object']
const batchFields = computed(() =>
  props.schema.fields.filter(
    (f) => f.key !== 'id' && ['text', 'number', 'select', 'boolean', ...JSON_TYPES].includes(f.type),
  ),
)

const fieldOptions = computed<TSelectOption[]>(() =>
  batchFields.value.map((f) => ({ value: f.key, label: f.label })),
)

const fieldKey = ref('')
const rawValue = ref('')
const boolValue = ref(false)

const selectedField = computed(() => batchFields.value.find((f) => f.key === fieldKey.value))

const isJsonField = computed(() => !!selectedField.value && JSON_TYPES.includes(selectedField.value.type))
const isBoolField = computed(() => selectedField.value?.type === 'boolean')

/** JSON 输入实时校验；空串视为未填写（清空结构请显式输入 [] 或 {}，避免误清批量字段） */
const jsonError = computed(() => {
  if (!isJsonField.value) return ''
  if (!rawValue.value.trim()) return '请输入 JSON 模板（清空结构请显式输入 [] 或 {}）'
  try {
    JSON.parse(rawValue.value)
    return ''
  } catch (e) {
    return `JSON 解析失败: ${String(e)}`
  }
})

/** select 字段选项：enum 或 refTable（异步预载） */
const valueOptions = computed<TSelectOption[]>(() => {
  const field = selectedField.value
  if (!field || field.type !== 'select') return []
  if (field.enum) return field.enum.map((v) => ({ value: v, label: v }))
  if (field.refTable) return (refOptions.value[field.refTable] ?? []).map((o) => ({ value: o.id, label: `${o.id} · ${o.name}` }))
  return []
})

const refOptions = ref<Record<string, OptionItem[]>>({})

watch(
  () => [props.open, props.schema.table],
  () => {
    if (!props.open) return
    fieldKey.value = ''
    rawValue.value = ''
    boolValue.value = false
    // 预载 refTable 选项
    for (const field of batchFields.value) {
      const rt = field.refTable
      if (rt && !refOptions.value[rt]) {
        void props.loadOptions(rt).then((items) => {
          refOptions.value[rt] = items
        })
      }
    }
  },
)

function onFieldChange(v: string | number | null): void {
  fieldKey.value = String(v ?? '')
  rawValue.value = ''
  boolValue.value = false
}

function setValue(v: unknown): void {
  rawValue.value = String(v ?? '')
}

// ════ 应用前预览：选中行的旧值 → 新值对照 ════
/** 应用值（number 空串 → undefined 清空；JSON 字段 parse 后为结构值） */
const applyValue = computed<unknown>(() => {
  const field = selectedField.value
  if (!field) return undefined
  if (field.type === 'number') return rawValue.value === '' ? undefined : Number(rawValue.value)
  if (isBoolField.value) return boolValue.value
  if (isJsonField.value) {
    try {
      return JSON.parse(rawValue.value) as unknown
    } catch {
      return undefined
    }
  }
  return rawValue.value
})

/** 结构值摘要（数组 ×n 项 / 对象 n 键），全文见输入框 */
function summarizeJson(v: unknown): string {
  if (Array.isArray(v)) return `数组 ×${v.length} 项`
  if (v && typeof v === 'object') return `对象 ${Object.keys(v).length} 键`
  return JSON.stringify(v)
}

/** 新值展示文本（undefined 显示为「清空」；JSON 校验失败时不误标「清空」） */
const displayValue = computed(() => {
  if (isJsonField.value && jsonError.value) return '无效 JSON'
  const v = applyValue.value
  if (v === undefined) return '清空'
  if (isJsonField.value) return summarizeJson(v)
  return String(v)
})

/** 旧值展示文本（结构字段显示摘要，避免 [object Object]） */
function previewOld(r: Record<string, unknown>): string {
  const v = r[fieldKey.value]
  if (v === undefined || v === null) return '—'
  if (typeof v === 'object') return summarizeJson(v)
  return String(v)
}

function isChanged(r: Record<string, unknown>): boolean {
  return JSON.stringify(r[fieldKey.value] ?? null) !== JSON.stringify(applyValue.value ?? null)
}

const previewRows = computed(() => (selectedField.value ? props.selectedRows : []))
const changedCount = computed(() => previewRows.value.filter((r) => isChanged(r)).length)
const unchangedCount = computed(() => previewRows.value.length - changedCount.value)

function onModelValue(v: boolean): void {
  if (!v) emit('close')
}

function apply(): void {
  const field = selectedField.value
  if (!field || jsonError.value) return
  emit('apply', field.key, applyValue.value)
}
</script>
