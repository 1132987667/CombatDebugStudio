<template>
  <div class="fs-field">
    <label class="fs-field-label">
      {{ field.label }}
      <span v-if="field.required" class="fs-required">*</span>
    </label>

    <!-- 数字 -->
    <input v-if="field.type === 'number'" type="number" class="fs-input"
      :value="(modelValue as number | undefined) ?? ''"
      :min="field.min" :max="field.max"
      @change="emit('update:modelValue', parseNumber(($event.target as HTMLInputElement).value))" />

    <!-- 文本 -->
    <input v-else-if="field.type === 'text'" type="text" class="fs-input"
      :value="(modelValue as string | undefined) ?? ''"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)" />

    <!-- 单选下拉 -->
    <TacticalSelect v-else-if="field.type === 'select'" size="sm"
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
        <input class="fs-input" :value="entry.key" placeholder="属性名"
          @input="setMapKey(idx, ($event.target as HTMLInputElement).value)" />
        <input class="fs-input" type="number" :value="entry.value" placeholder="数值"
          @input="setMapValue(idx, ($event.target as HTMLInputElement).value)" />
        <button class="fs-btn fs-btn-sm fs-btn-danger" @click="removeMapRow(idx)">×</button>
      </div>
      <button class="fs-btn fs-btn-sm" @click="addMapRow">＋ 添加属性</button>
    </div>

    <!-- 数组（先以 JSON 文本编辑，复杂子项编辑后续增强） -->
    <textarea v-else-if="field.type === 'array'" class="fs-input fs-textarea" rows="3"
      :value="arrayJson"
      @input="emit('update:modelValue', parseArray(($event.target as HTMLTextAreaElement).value))"
      placeholder='[{"key":"value"}]' />

    <div v-if="field.description" class="fs-field-hint">{{ field.description }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FieldSchema } from '@/domain/fengshen/schema'
import type { OptionItem } from '@/presentation/modules/fengshen/stores/fengshenStore'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'

const props = defineProps<{
  field: FieldSchema
  modelValue: unknown
  options?: OptionItem[]
}>()

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()

interface SelectOption {
  id: string
  label: string
}

const selectOptions = computed<SelectOption[]>(() => {
  if (props.field.enum) {
    return props.field.enum.map((v) => ({ id: v, label: v }))
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

function parseNumber(v: string): number | undefined {
  if (v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

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
  updateMap((prev) => ({ ...prev, attribute: 0 }))
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

// ── array 编辑（JSON 文本）──
const arrayJson = computed(() => {
  const v = props.modelValue
  return Array.isArray(v) ? JSON.stringify(v, null, 2) : ''
})

function parseArray(v: string): unknown {
  if (!v.trim()) return undefined
  try {
    return JSON.parse(v)
  } catch {
    return props.modelValue
  }
}
</script>
