<template>
  <Dialog :model-value="open" :title="`${isNew ? '新增' : '编辑'} ${schema.label}`" width="480px"
    placement="right" content-class="dialog-content--flush" @update:model-value="onModelValue">
    <template #header-actions>
      <span v-if="entity?.id" class="fs-drawer-id">{{ entity.id }}</span>
    </template>

    <div class="fs-drawer-body">
      <div v-if="isNew && !readonlyId" class="fs-form-group">
        <TacticalInput :model-value="String(entity?.id ?? '')" disabled label="ID" required
          hint="新实体 ID 自动生成，保存后不可修改" aria-label="实体 ID" />
      </div>

      <template v-for="field in editableFields" :key="field.key">
        <FieldEditor :field="field" :model-value="entity?.[field.key]"
          :options="options[field.refTable ?? '']"
          @update:model-value="setField(field.key, $event)" />
      </template>

      <div v-if="errors.length" class="fs-form-errors" role="alert">
        <div v-for="(err, i) in errors" :key="i" class="fs-form-error">{{ err }}</div>
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" @click="close">取消</Button>
      <Button variant="primary" :disabled="saving" @click="onSave">
        {{ saving ? '保存中…' : '保存' }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TableSchema } from '@/domain/fengshen/schema'
import type { OptionItem } from '@/presentation/modules/fengshen/stores/fengshenStore'
import Dialog from '@/presentation/components/Dialog.vue'
import Button from '@/presentation/components/Button.vue'
import FieldEditor from './FieldEditor.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'

const props = defineProps<{
  open: boolean
  schema: TableSchema
  entity: Record<string, unknown> | null
  isNew: boolean
  errors: string[]
  loadOptions: (table: string) => Promise<OptionItem[]>
}>()

const emit = defineEmits<{
  save: []
  close: []
}>()

const saving = ref(false)
const options = ref<Record<string, OptionItem[]>>({})

/** elements 单文档固定 id，无需 ID 输入框 */
const readonlyId = computed(() => props.schema.table === 'elements')

const editableFields = computed(() => props.schema.fields)

function setField(key: string, value: unknown): void {
  if (!props.entity) return
  ;(props.entity as Record<string, unknown>)[key] = value
}

// NOTE: ESC 关闭 / Tab 焦点陷阱 / body 滚动锁由 Dialog 基座托管
watch(
  () => [props.open, props.schema.table],
  () => {
    if (!props.open) {
      saving.value = false
      return
    }
    saving.value = false
    // 预载引用字段选项
    for (const field of props.schema.fields) {
      if (field.refTable && !options.value[field.refTable]) {
        void props.loadOptions(field.refTable).then((items) => {
          options.value[field.refTable] = items
        })
      }
    }
  },
)

const onModelValue = (val: boolean): void => {
  if (!val) emit('close')
}

const close = (): void => emit('close')

async function onSave(): Promise<void> {
  saving.value = true
  await emit('save')
  saving.value = false
}
</script>
