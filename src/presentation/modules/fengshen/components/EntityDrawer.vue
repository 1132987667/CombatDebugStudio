<template>
  <Dialog :model-value="open" :title="`${isNew ? '新增' : '编辑'} ${schema.label}`" width="480px"
    placement="right" content-class="dialog-content--flush" @update:model-value="onModelValue">
    <template #header-actions>
      <span v-if="entity?.id" class="fs-drawer-id">{{ entity.id }}</span>
    </template>

    <div class="fs-drawer-body">
      <div v-if="readonlyId" class="fs-drawer-note">「{{ schema.label }}」为全局唯一文档（固定 id），直接修改即可，保存后影响全部战斗。</div>

      <div v-if="isNew && !readonlyId" class="fs-form-group">
        <TacticalInput :model-value="String(entity?.id ?? '')" disabled label="ID" required
          hint="新实体 ID 自动生成，保存后不可修改" aria-label="实体 ID" />
      </div>

      <template v-for="field in editableFields" :key="field.key">
        <FieldEditor :field="field" :model-value="entity?.[field.key]"
          :options="options[field.refTable ?? '']"
          :map-key-options="mapKeyOptionsOf(field)"
          :error="errorOf(field.key)"
          @update:model-value="setField(field.key, $event)" />
      </template>

      <div v-if="unplacedErrors.length" class="fs-form-errors" role="alert">
        <div v-for="(err, i) in unplacedErrors" :key="i" class="fs-form-error">{{ err }}</div>
      </div>
    </div>

    <template #footer>
      <Button variant="ghost" :disabled="!snapshot" title="放弃本次修改，还原为打开时的值" @click="reset">还原修改</Button>
      <Button variant="ghost" @click="close">取消</Button>
      <Button variant="primary" :disabled="saving" @click="onSave">
        {{ saving ? '保存中…' : '保存' }}
      </Button>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TableSchema, FieldSchema } from '@/domain/fengshen/schema'
import type { OptionItem } from '@/presentation/modules/fengshen/stores/fengshenStore'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
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
  validate: []
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

/** map 键名建议：属性统计 / 每级增量字段的键是属性码，给下拉建议防手输错误 */
const ATTR_KEYS = Object.values(ATTRIBUTE_CODE) as string[]

function mapKeyOptionsOf(field: FieldSchema): string[] | undefined {
  if (field.type === 'map' && (field.key === 'stats' || field.key === 'perLevel')) return ATTR_KEYS
  return undefined
}

/** 字段级错误内联：错误消息含「字段label」则归属该字段；其余留在底部汇总 */
function errorOf(key: string): string {
  const field = props.schema.fields.find((f) => f.key === key)
  if (!field) return ''
  return props.errors.find((e) => e.includes(`「${field.label}」`)) ?? ''
}

const unplacedErrors = computed(() => {
  const labels = props.schema.fields.map((f) => f.label)
  return props.errors.filter((e) => !labels.some((l) => e.includes(`「${l}」`)))
})

// 打开时记录初始快照，供「还原修改」
let snapshot: string | null = null

function reset(): void {
  if (!props.entity || snapshot == null) return
  const s = JSON.parse(snapshot) as Record<string, unknown>
  for (const k of Object.keys(props.entity)) delete props.entity[k]
  Object.assign(props.entity, s)
}

// NOTE: ESC 关闭 / Tab 焦点陷阱 / body 滚动锁由 Dialog 基座托管
watch(
  () => [props.open, props.schema.table],
  () => {
    if (!props.open) {
      saving.value = false
      snapshot = null
      return
    }
    saving.value = false
    snapshot = props.entity ? JSON.stringify(props.entity) : null
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

// 编辑过程实时校验：字段变化防抖 300ms 后触发（必填/范围/唯一/引用，保存时仍作权威校验）
let validateTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => props.entity,
  () => {
    if (!props.open || !props.entity) return
    if (validateTimer) clearTimeout(validateTimer)
    validateTimer = setTimeout(() => emit('validate'), 300)
  },
  { deep: true },
)

async function onSave(): Promise<void> {
  saving.value = true
  await emit('save')
  saving.value = false
}
</script>
