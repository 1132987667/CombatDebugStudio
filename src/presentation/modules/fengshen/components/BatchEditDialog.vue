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

      <div class="fs-form-hint">将应用到当前选中的 {{ count }} 条{{ schema.label }}记录，保存时仍走完整性校验。</div>
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
import type { OptionItem } from '@/presentation/modules/fengshen/stores/fengshenStore'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'

const props = defineProps<{
  open: boolean
  schema: TableSchema
  count: number
  loadOptions: (table: string) => Promise<OptionItem[]>
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
      if (field.refTable && !refOptions.value[field.refTable]) {
        void props.loadOptions(field.refTable).then((items) => {
          refOptions.value[field.refTable] = items
        })
      }
    }
  },
)

function onFieldChange(v: string): void {
  fieldKey.value = v ?? ''
  rawValue.value = ''
}

function setValue(v: unknown): void {
  rawValue.value = String(v ?? '')
}

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
