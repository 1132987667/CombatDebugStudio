<template>
  <Dialog :model-value="open" :title="`${isNew ? '新增' : '编辑'} ${schema.label}`" width="480px"
    placement="right" content-class="dialog-content--flush" @update:model-value="onModelValue">
    <template #header-actions>
      <span v-if="entity?.id" class="fs-drawer-id">{{ entity.id }}</span>
    </template>

    <div class="fs-drawer-body">
      <div v-if="readonlyId" class="fs-drawer-note">「{{ schema.label }}」为全局唯一文档（固定 id），直接修改即可，保存后影响全部战斗。</div>

      <!-- 影响面推演：编辑既有实体时，改动前即显示会波及哪些实体（直接/间接分层，可点击跳转） -->
      <div v-if="impact?.total" class="fs-drawer-impact">
        <div class="fs-drawer-impact-head">
          <span class="fs-drawer-impact-title">改动影响面：将波及 {{ impact.total }} 个实体</span>
          <span class="fs-drawer-impact-sub">
            直接 {{ impact.directCount }} · 间接 {{ impact.indirectCount }}<template v-if="impact.truncated">（仅列出前 {{ impact.nodes.length }} 个）</template>
          </span>
        </div>
        <div v-for="layer in impactLayers" :key="layer.depth" class="fs-drawer-impact-layer">
          <span class="fs-drawer-impact-depth">{{ layer.depth === 1 ? '直接引用' : `间接引用 · 第 ${layer.depth} 级` }}</span>
          <div v-for="g in layer.groups" :key="g.table" class="fs-drawer-impact-row">
            <button type="button" class="fs-link" :title="`跳转到${tableLabel(g.table)}表`"
              @click="emit('goto', g.table, g.ids[0])">{{ tableLabel(g.table) }}</button>
            <span class="fs-drawer-impact-ids">
              <template v-for="(id, i) in g.ids" :key="id">
                <button type="button" class="fs-drawer-impact-id" :title="`id: ${id}`"
                  @click="emit('goto', g.table, id)">{{ refName(id) }}</button>{{ i < g.ids.length - 1 ? '、' : '' }}
              </template>
            </span>
          </div>
        </div>
      </div>

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
import { TABLE_SCHEMAS, type TableSchema, type FieldSchema } from '@/domain/fengshen/schema'
import type { FengshenTableName } from '@/domain/fengshen/types'
import type { ReferenceTreeReport } from '@/application/service/DataIntegrityService'
import type { OptionItem } from '@/presentation/modules/fengshen/stores/fengshenStore'
import { ATTRIBUTE_CODE } from '@/domain/attribute/types'
import { resolveRefName } from '@/domain/fengshen/refNames'
import FieldEditor from './FieldEditor.vue'

const props = defineProps<{
  open: boolean
  schema: TableSchema
  entity: Record<string, unknown> | null
  isNew: boolean
  errors: string[]
  loadOptions: (table: FengshenTableName) => Promise<OptionItem[]>
  /** 改动影响面（引用树）；仅编辑既有实体时传入 */
  impact?: ReferenceTreeReport | null
  /** 全表引用字典（id → 中文名）：影响面条目优先中文，缺省回退原始 id */
  refIndex?: Record<string, string>
}>()

const emit = defineEmits<{
  save: []
  close: []
  validate: []
  /** 跳转到影响面中某引用方实体（切换列表并定位详情） */
  goto: [table: string, id: string]
}>()

const saving = ref(false)
const options = ref<Record<string, OptionItem[]>>({})

/** 表名 → 中文标签（影响面分组标题） */
function tableLabel(table: string): string {
  return TABLE_SCHEMAS[table as keyof typeof TABLE_SCHEMAS]?.label ?? table
}

/** 引用值 → 中文名（未命中回退原 id，保留调试语义） */
function refName(id: string): string {
  return resolveRefName(id, props.refIndex ?? {})
}

/** 影响面按深度分层 → 层内按来源表分组（保持引用树节点顺序） */
const impactLayers = computed(() => {
  const layers: Array<{ depth: number; groups: Array<{ table: string; ids: string[] }> }> = []
  for (const node of props.impact?.nodes ?? []) {
    let layer = layers.find((l) => l.depth === node.depth)
    if (!layer) {
      layer = { depth: node.depth, groups: [] }
      layers.push(layer)
    }
    let group = layer.groups.find((g) => g.table === node.table)
    if (!group) {
      group = { table: node.table, ids: [] }
      layer.groups.push(group)
    }
    group.ids.push(node.id)
  }
  return layers
})

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
      const rt = field.refTable
      if (rt && !options.value[rt]) {
        void props.loadOptions(rt).then((items) => {
          options.value[rt] = items
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
