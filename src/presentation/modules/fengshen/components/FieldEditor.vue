<template>
  <div class="fs-field" :class="{ 'has-error': error }">
    <label class="fs-field-label">
      {{ field.label }}
      <span v-if="field.required" class="fs-required">*</span>
    </label>

    <!-- 数字：校验 + 限制由 TacticalInput 托管（过滤/越界提示/clamp） -->
    <TacticalInput v-if="field.type === 'number'" type="number"
      :model-value="(modelValue as number | undefined) ?? null"
      :min="field.min" :max="field.max" :hint="field.description"
      @update:model-value="(v) => emit('update:modelValue', v)" />

    <!-- 文本 -->
    <TacticalInput v-else-if="field.type === 'text'"
      :model-value="(modelValue as string | undefined) ?? ''" :hint="field.description"
      @update:model-value="(v) => emit('update:modelValue', v)" />

    <!-- 单选下拉 -->
    <TacticalSelect v-else-if="field.type === 'select'" size="md"
      :model-value="(modelValue as string | undefined) ?? ''"
      :options="tacticalSelectOptions" placeholder="— 未选择 —"
      @update:model-value="(v) => emit('update:modelValue', v ?? '')" />

    <!-- 多选（refTable 选项勾选 / 标签文本） -->
    <div v-else-if="field.type === 'multi'" class="fs-multi">
      <label v-for="opt in selectOptions" :key="opt.id" class="fs-check">
        <input type="checkbox" :checked="(modelValue as string[] | undefined)?.includes(opt.id)"
          @change="toggleMulti(opt.id)" />
        {{ opt.label }}
      </label>
    </div>

    <!-- 布尔 -->
    <label v-else-if="field.type === 'boolean'" class="fs-check">
      <input type="checkbox" :checked="Boolean(modelValue)"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)" />
      开启
    </label>

    <!-- 键值对（map：属性名 + 数值） -->
    <div v-else-if="field.type === 'map'" class="fs-map">
      <div v-for="(entry, idx) in mapEntries" :key="idx" class="fs-map-row">
        <TacticalInput size="md" :model-value="entry.key" :placeholder="mapKeyPlaceholder"
          :list="mapKeyListId" :aria-label="`${field.label}键名`"
          @update:model-value="(v) => setMapKey(idx, String(v ?? ''))" />
        <datalist v-if="mapKeyOptions?.length" :id="mapKeyListId">
          <option v-for="k in mapKeyOptions" :key="k" :value="k"></option>
        </datalist>
        <TacticalInput size="md" type="number" :model-value="entry.value" placeholder="数值"
          :aria-label="`${field.label}数值`"
          @update:model-value="(v) => setMapValue(idx, String(v ?? ''))" />
        <Button size="small" variant="danger" @click="removeMapRow(idx)">×</Button>
      </div>
      <Button size="small" @click="addMapRow">＋ 添加属性</Button>
    </div>

    <!-- 数组 / 对象（JSON 文本编辑 + 实时合法性提示 + 格式化） -->
    <div v-else-if="field.type === 'array' || field.type === 'object'" class="fs-array">
      <div class="fs-array-hd">
        <span class="fs-array-state" :class="jsonState.cls">{{ jsonState.text }}</span>
        <span class="fs-array-spacer"></span>
        <Button size="tiny" title="填入结构示例" :disabled="jsonTemplate === undefined" @click="fillTemplate">示例</Button>
        <Button size="tiny" title="格式化 JSON" :disabled="!jsonCanFormat" @click="formatJson">格式化</Button>
        <Button size="tiny" title="清空" :disabled="!jsonHasValue" @click="clearJson">清空</Button>
      </div>
      <textarea class="fs-input fs-textarea" rows="4"
        :value="jsonDraft" :aria-label="field.label"
        @input="onJsonInput" :placeholder="jsonPlaceholder" />
    </div>

    <!-- description 提示：number/text/array/object 在各自控件内显示，其余在此统一显示 -->
    <div v-if="field.description && !['number', 'text', 'array', 'object'].includes(field.type)" class="fs-field-hint">{{ field.description }}</div>

    <div v-if="error" class="fs-field-error" role="alert">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/presentation/components/Button.vue'
import type { FieldSchema } from '@/domain/fengshen/schema'
import type { OptionItem } from '@/presentation/modules/fengshen/stores/fengshenStore'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'

const props = defineProps<{
  field: FieldSchema
  modelValue: unknown
  options?: OptionItem[]
  /** map 键名可选枚举（如属性码），提供时键名输入框出现下拉建议 */
  mapKeyOptions?: string[]
  /** 字段级校验错误（内联显示） */
  error?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

interface SelectOption {
  id: string
  label: string
}

const selectOptions = computed<SelectOption[]>(() => {
  if (props.field.enum) {
    return props.field.enum.map((v) => ({ id: v, label: props.field.valueLabel?.[v] ?? v }))
  }
  if (props.field.refTable) {
    return (props.options ?? []).map((o) => ({ id: o.id, label: `${o.id} · ${o.name}` }))
  }
  return []
})

/** 战术下拉选项：含「— 未选择 —」空值项，保持与原生 select 一致的可回选行为 */
const tacticalSelectOptions = computed<TSelectOption[]>(() => [
  { value: '', label: '— 未选择 —' },
  ...selectOptions.value.map((o) => ({ value: o.id, label: o.label })),
])

function toggleMulti(id: string): void {
  const cur = Array.isArray(props.modelValue) ? (props.modelValue as string[]) : []
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  emit('update:modelValue', next)
}

// ── map 编辑（键值对）──
interface MapEntry {
  key: string
  value: number
}

const mapKeyListId = computed(() => `fs-map-list-${props.field.key}`)
const mapKeyPlaceholder = computed(() => (props.mapKeyOptions?.length ? '选择或输入键名' : '属性名'))

const mapEntries = computed<MapEntry[]>(() => {
  const raw = props.modelValue as Record<string, number> | undefined
  return Object.entries(raw ?? {}).map(([key, value]) => ({ key, value: Number(value) }))
})

function setMapKey(idx: number, key: string): void {
  updateMap((prev) => {
    const next: Record<string, number> = {}
    const entries = Object.entries(prev)
    entries.forEach(([k, v], i) => {
      next[i === idx ? key : k] = v
    })
    return next
  })
}

function setMapValue(idx: number, v: string): void {
  updateMap((prev) => {
    const next = { ...prev }
    const key = Object.keys(prev)[idx]
    if (key !== undefined) next[key] = Number(v)
    return next
  })
}

function addMapRow(): void {
  updateMap((prev) => {
    const next = { ...prev }
    const base = props.mapKeyOptions?.[0]
    const key = base ?? 'attribute'
    next[key] = 0
    return next
  })
}

function removeMapRow(idx: number): void {
  updateMap((prev) => {
    const next = { ...prev }
    const key = Object.keys(prev)[idx]
    if (key !== undefined) delete next[key]
    return next
  })
}

function updateMap(fn: (prev: Record<string, number>) => Record<string, number>): void {
  const prev = (props.modelValue as Record<string, number> | undefined) ?? {}
  emit('update:modelValue', fn(prev))
}

// ── array / object 编辑（JSON 文本 + 合法性提示 + 格式化）──
const isJsonArray = computed(() => props.field.type === 'array')

const jsonValue = computed(() => {
  const v = props.modelValue
  if (isJsonArray.value) return Array.isArray(v) ? JSON.stringify(v, null, 2) : ''
  return isPlainObject(v) ? JSON.stringify(v, null, 2) : ''
})

/** 本地草稿：输入中的中间态（含非法 JSON）不回弹，仅提交合法值 */
const jsonDraft = ref('')
watch(
  () => jsonValue.value,
  (v) => {
    if (jsonDraft.value !== v) jsonDraft.value = v
  },
  { immediate: true },
)

const jsonHasValue = computed(() => jsonDraft.value.trim() !== '')

/** 顶层解析结果：合法 JSON 时返回解析值，否则 undefined（基于草稿实时判断） */
const jsonParsed = computed<unknown>(() => {
  const t = jsonDraft.value.trim()
  if (!t) return undefined
  try {
    return JSON.parse(t)
  } catch {
    return undefined
  }
})

const jsonState = computed<{ cls: string; text: string }>(() => {
  const t = jsonDraft.value.trim()
  if (!t) return { cls: 'empty', text: isJsonArray.value ? '空数组' : '空对象' }
  const parsed = jsonParsed.value
  if (parsed === undefined) return { cls: 'err', text: 'JSON 语法错误' }
  if (isJsonArray.value) {
    return Array.isArray(parsed)
      ? { cls: 'ok', text: `合法数组 · ${parsed.length} 项` }
      : { cls: 'warn', text: '顶层应为数组' }
  }
  return isPlainObject(parsed)
    ? { cls: 'ok', text: `合法对象 · ${Object.keys(parsed).length} 个键` }
    : { cls: 'warn', text: '顶层应为对象' }
})

const jsonCanFormat = computed(() => {
  const parsed = jsonParsed.value
  return typeof parsed === 'object' && parsed !== null && jsonDraft.value !== JSON.stringify(parsed, null, 2)
})

/** 结构示例：array 用 arrayTemplate，object 用 objectTemplate */
const jsonTemplate = computed<unknown>(() =>
  isJsonArray.value ? props.field.arrayTemplate : props.field.objectTemplate,
)

/** 占位示例：优先字段描述，否则通用占位（供用户对照结构） */
const jsonPlaceholder = computed(() => {
  const sample = isJsonArray.value ? '[{"key":"value"}]' : '{"key":"value"}'
  if (props.field.description) return `示例（${props.field.description}）：\n${sample}`
  return isJsonArray.value ? 'JSON 数组，如 [{"key":"value"}]' : 'JSON 对象，如 {"key":"value"}'
})

function onJsonInput(e: Event): void {
  const v = (e.target as HTMLTextAreaElement).value
  jsonDraft.value = v
  if (!v.trim()) {
    emit('update:modelValue', undefined)
    return
  }
  const parsed = tryParse(v)
  // 语法合法才提交，避免把中间态非法 JSON 写进实体
  if (parsed !== undefined) emit('update:modelValue', parsed)
}

function tryParse(v: string): unknown {
  try {
    return JSON.parse(v)
  } catch {
    return undefined
  }
}

function formatJson(): void {
  if (jsonParsed.value !== undefined) emit('update:modelValue', jsonParsed.value)
}

/** 填入 schema 声明的结构示例（供对照编辑，覆盖当前值） */
function fillTemplate(): void {
  if (jsonTemplate.value !== undefined) emit('update:modelValue', jsonTemplate.value)
}

function clearJson(): void {
  emit('update:modelValue', undefined)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
</script>
