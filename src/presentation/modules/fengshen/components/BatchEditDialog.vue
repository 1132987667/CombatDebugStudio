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
        <!-- number/text/select 标量字段可批量覆盖；map/array 值不固定，不提供批量改 -->
        <TacticalInput v-if="selectedField.type === 'number'" type="number" :model-value="rawValue"
          @update:model-value="setValue($event)" />
        <TacticalInput v-else-if="selectedField.type === 'text'" :model-value="rawValue"
          @update:model-value="setValue($event)" />
        <TacticalSelect v-else-if="selectedField.type === 'select'" size="md" :model-value="rawValue"
          :options="valueOptions" placeholder="— 未选择 —" @update:model-value="setValue($event ?? '')" />
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
              {{ String(r[fieldKey] ?? '—') }}
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
      <Button variant="primary" :disabled="!fieldKey || !selectedField" @click="apply">应用</Button>
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

/** 可批量编辑的标量字段（map/array 结构不定，交由逐条编辑） */
const batchFields = computed(() =>
  props.schema.fields.filter((f) => f.key !== 'id' && ['text', 'number', 'select'].includes(f.type)),
)

const fieldOptions = computed<TSelectOption[]>(() =>
  batchFields.value.map((f) => ({ value: f.key, label: f.label })),
)

const fieldKey = ref('')
const rawValue = ref('')

const selectedField = computed(() => batchFields.value.find((f) => f.key === fieldKey.value))

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
}

function setValue(v: unknown): void {
  rawValue.value = String(v ?? '')
}

// ════ 应用前预览：选中行的旧值 → 新值对照 ════
/** 应用值（number 字段空串 → undefined，与 apply 同口径） */
const applyValue = computed(() => {
  const field = selectedField.value
  if (!field) return undefined
  return field.type === 'number'
    ? (rawValue.value === '' ? undefined : Number(rawValue.value))
    : rawValue.value
})

/** 新值展示文本（undefined 显示为「清空」） */
const displayValue = computed(() => (applyValue.value === undefined ? '清空' : String(applyValue.value)))

function isChanged(r: Record<string, unknown>): boolean {
  return String(r[fieldKey.value] ?? '') !== String(applyValue.value ?? '')
}

const previewRows = computed(() => (selectedField.value ? props.selectedRows : []))
const changedCount = computed(() => previewRows.value.filter((r) => isChanged(r)).length)
const unchangedCount = computed(() => previewRows.value.length - changedCount.value)

function onModelValue(v: boolean): void {
  if (!v) emit('close')
}

function apply(): void {
  const field = selectedField.value
  if (!field) return
  const value = field.type === 'number'
    ? (rawValue.value === '' ? undefined : Number(rawValue.value))
    : rawValue.value
  emit('apply', field.key, value)
}
</script>
