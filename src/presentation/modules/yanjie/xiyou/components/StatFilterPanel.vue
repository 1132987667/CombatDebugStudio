<!--
* 文件: StatFilterPanel.vue
* 功能: 属性（词条）多条件筛选 + 多键排序内嵌面板（装备池 / 行囊 / 法宝 / 灵宠共用）
* 描述: 工具栏内一段可折叠控件：按钮显示生效条件数徽标，展开后逐行编辑条件（属性 + 运算符 + 数值，
*       AND 组合）与主/次排序键，并支持把当前组合存成命名预设（localStorage，不进游戏存档）。
*       纯逻辑（求值 / 排序 / 候选 / 预设读写）在 statFilter.ts，本组件只做交互与呈现。
-->
<template>
  <div class="xy-sf">
    <!-- ═══ 收起态：徽标 + 预设入口 ═══ -->
    <div class="xy-sf-bar">
      <button type="button" class="xy-sf-toggle" :class="{ 'is-open': open }" :aria-expanded="open"
        @click="open = !open">
        筛选<span v-if="activeCount > 0" class="xy-sf-badge">{{ activeCount }}</span>
      </button>
      <button v-if="activeCount > 0" type="button" class="xy-sf-textbtn" @click="clearAll">清除</button>

      <TacticalSelect v-if="presetOptions.length" :model-value="presetName" :options="presetOptions"
        placeholder="预设" class="xy-sf-preset" @update:model-value="(v) => applyPreset(String(v))" />
      <button type="button" class="xy-sf-textbtn" @click="toggleSaveRow">存预设</button>
      <button v-if="presetName" type="button" class="xy-sf-textbtn xy-sf-textbtn--danger" @click="removePreset">
        删除预设
      </button>
    </div>

    <!-- 预设命名（内联，不用原生 prompt） -->
    <div v-if="saveOpen" class="xy-sf-saverow">
      <TacticalInput v-model="presetDraft" type="text" placeholder="预设名（如 暴击流）" maxlength="12"
        class="xy-sf-name" />
      <Button size="small" variant="primary" :disabled="!presetDraft.trim()" @click="confirmSave">保存</Button>
      <Button size="small" @click="saveOpen = false">取消</Button>
    </div>

    <!-- ═══ 展开态：条件 + 排序 ═══ -->
    <div v-if="open" class="xy-sf-body">
      <div class="xy-sf-sec">
        <span class="xy-sf-cap">筛选条件（需同时满足）</span>
        <div v-for="(cond, i) in conditions" :key="i" class="xy-sf-row">
          <TacticalSelect :model-value="condKey(cond)" :options="attrOptions" searchable class="xy-sf-attr"
            @update:model-value="(v) => setCondAttr(i, String(v))" />
          <TacticalSelect :model-value="cond.op" :options="OP_OPTIONS" class="xy-sf-op"
            @update:model-value="(v) => setCondOp(i, String(v) as StatOp)" />
          <TacticalInput v-if="cond.op !== 'has'" :model-value="cond.value" type="number" integer
            placeholder="数值" class="xy-sf-value" @update:model-value="(v) => setCondValue(i, v)" />
          <button type="button" class="xy-sf-del" aria-label="删除该条件" @click="removeCond(i)">×</button>
        </div>
        <button type="button" class="xy-sf-add" :disabled="attrOptions.length === 0" @click="addCond">
          + 添加条件
        </button>
        <span v-if="attrOptions.length === 0" class="xy-sf-hint">当前列表没有可筛选的词条</span>
      </div>

      <div class="xy-sf-sec">
        <span class="xy-sf-cap">排序</span>
        <div v-for="rank in SORT_RANKS" :key="rank" class="xy-sf-row">
          <span class="xy-sf-rank">{{ rank === 0 ? '主' : '次' }}</span>
          <TacticalSelect :model-value="sortKeyOf(rank)" :options="sortOptions" class="xy-sf-sort"
            @update:model-value="(v) => setSort(rank, String(v))" />
          <button type="button" class="xy-sf-dir" :disabled="!sorts[rank]" @click="toggleDir(rank)">
            {{ sorts[rank]?.dir === 'asc' ? '升序 ↑' : '降序 ↓' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import Button from '@/presentation/components/Button.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'
import TacticalSelect from '@/presentation/components/TacticalSelect.vue'
import {
  loadStatPresets,
  saveStatPresets,
  type StatCondition,
  type StatFlavor,
  type StatOp,
  type StatOption,
  type StatSortKey,
} from '../statFilter'

const props = defineProps<{
  /** 候选属性（由父级从当前列表的真实属性集合提取，见 collectStatOptions） */
  options: StatOption[]
  /** 生效中的筛选条件（v-model:conditions） */
  conditions: StatCondition[]
  /** 生效中的排序键（v-model:sorts，下标 0 主键 / 1 次键） */
  sorts: StatSortKey[]
  /**
   * 预设作用域（属性池相同的面板共用一个桶：装备池与行囊同传 'gear'）。
   * 预设按作用域分桶存储，避免装备预设被套到灵宠/坐骑面板后条件恒不成立、列表全空。
   */
  scope: string
}>()

const emit = defineEmits<{
  'update:conditions': [StatCondition[]]
  'update:sorts': [StatSortKey[]]
}>()

/** 排序位：最多主/次两键（再多对刷选没有边际收益） */
const SORT_RANKS = [0, 1] as const

const OP_OPTIONS = [
  { value: 'has', label: '含' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
]

const open = ref(false)

/** 生效条件数（徽标 + 清除按钮的出现依据） */
const activeCount = computed(() => props.conditions.length + props.sorts.length)

/* ── 属性候选 → 下拉项（key = attribute:flavor，attribute 内不含冒号） ── */

const attrOptions = computed(() =>
  props.options.map((opt) => ({
    value: `${opt.attribute}:${opt.flavor}`,
    label: opt.label,
    hint: `×${opt.count}`,
  })),
)

function condKey(cond: StatCondition): string {
  return `${cond.attribute}:${cond.flavor}`
}

/** 解析下拉键；非法键返回 null（父级候选变化导致旧条件失配时容错） */
function parseKey(key: string): { attribute: string; flavor: StatFlavor } | null {
  const at = key.lastIndexOf(':')
  if (at <= 0) return null
  const flavor = key.slice(at + 1)
  if (flavor !== 'flat' && flavor !== 'pct') return null
  return { attribute: key.slice(0, at), flavor }
}

/* ── 条件编辑（整数组替换，保持父级状态为唯一来源） ── */

function emitConditions(next: StatCondition[]): void {
  emit('update:conditions', next)
}

function addCond(): void {
  const first = props.options[0]
  if (!first) return
  emitConditions([...props.conditions, { attribute: first.attribute, flavor: first.flavor, op: 'gte', value: 0 }])
  open.value = true
}

function removeCond(index: number): void {
  emitConditions(props.conditions.filter((_, i) => i !== index))
}

function patchCond(index: number, patch: Partial<StatCondition>): void {
  emitConditions(props.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)))
}

function setCondAttr(index: number, key: string): void {
  const parsed = parseKey(key)
  if (parsed) patchCond(index, parsed)
}

function setCondOp(index: number, op: StatOp): void {
  patchCond(index, { op })
}

/** 数值输入：空值/非法回退 0（0 是合法业务值，不能用 || 兜底） */
function setCondValue(index: number, v: string | number | null): void {
  const num = typeof v === 'number' ? v : Number(v)
  patchCond(index, { value: Number.isFinite(num) ? num : 0 })
}

/* ── 排序编辑 ── */

const sortOptions = computed(() => [
  { value: '', label: '不排序' },
  { value: 'quality', label: '品质' },
  { value: 'name', label: '名称' },
  ...props.options.map((opt) => ({ value: `stat:${opt.attribute}:${opt.flavor}`, label: opt.label })),
])

function sortKeyOf(rank: number): string {
  const key = props.sorts[rank]
  if (!key) return ''
  if (key.kind === 'stat') return `stat:${key.attribute}:${key.flavor}`
  return key.kind
}

/** 写入第 rank 位排序键：空值 = 删除该位及其后的键（保持主键在前） */
function setSort(rank: number, value: string): void {
  let key: StatSortKey | null = null
  if (value === 'quality' || value === 'name') {
    key = { kind: value, dir: 'desc' }
  } else if (value.startsWith('stat:')) {
    const parsed = parseKey(value.slice(5))
    if (parsed) key = { kind: 'stat', ...parsed, dir: 'desc' }
  }
  const next = props.sorts.slice(0, rank)
  if (key) next.push(key)
  emit('update:sorts', next)
}

function toggleDir(rank: number): void {
  const key = props.sorts[rank]
  if (!key) return
  const next = props.sorts.map((k, i): StatSortKey =>
    i === rank ? { ...k, dir: k.dir === 'asc' ? 'desc' : 'asc' } : k,
  )
  emit('update:sorts', next)
}

/* ── 清除 ── */

function clearAll(): void {
  emitConditions([])
  emit('update:sorts', [])
}

/* ── 预设（localStorage 偏好，不进游戏存档；按 scope 分桶） ── */

const presets = ref(loadStatPresets(props.scope))
const presetName = ref('')
const saveOpen = ref(false)
const presetDraft = ref('')

const presetOptions = computed(() => presets.value.map((p) => ({ value: p.name, label: p.name })))

function toggleSaveRow(): void {
  saveOpen.value = !saveOpen.value
  if (saveOpen.value) presetDraft.value = presetName.value
}

/** 套用预设：条件与排序整体替换（预设仅取自本面板作用域，条件必然落在当前候选属性内） */
function applyPreset(name: string): void {
  const preset = presets.value.find((p) => p.name === name)
  if (!preset) return
  presetName.value = name
  emitConditions(preset.conditions.map((c) => ({ ...c })))
  emit('update:sorts', preset.sorts.map((s) => ({ ...s })))
}

function confirmSave(): void {
  const name = presetDraft.value.trim()
  if (!name) return
  const entry = {
    name,
    conditions: props.conditions.map((c) => ({ ...c })),
    sorts: props.sorts.map((s) => ({ ...s })),
  }
  presets.value = [...presets.value.filter((p) => p.name !== name), entry]
  saveStatPresets(props.scope, presets.value)
  presetName.value = name
  saveOpen.value = false
}

function removePreset(): void {
  presets.value = presets.value.filter((p) => p.name !== presetName.value)
  saveStatPresets(props.scope, presets.value)
  presetName.value = ''
}
</script>

<style scoped lang="scss">
.xy-sf {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
}

/* ── 收起态工具行 ── */
.xy-sf-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.xy-sf-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px var(--space-3);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
  color: var(--xy-ink-2);
  font-family: inherit;
  font-size: var(--font-size-md);
  cursor: pointer;

  &:hover,
  &.is-open {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }
}

.xy-sf-badge {
  min-width: 1.2em;
  padding: 0 3px;
  border-radius: 8px;
  background: var(--xy-seal);
  color: var(--xy-paper);
  text-align: center;
  font-size: var(--font-size-md);
}

.xy-sf-textbtn {
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
  color: var(--xy-ink-3);
  font-family: inherit;
  font-size: var(--font-size-md);
  cursor: pointer;

  &:hover {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &--danger:hover {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }
}

.xy-sf-preset {
  width: 8rem;
}

.xy-sf-saverow {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-sf-name {
  flex: 1;
  min-width: 0;
}

/* ── 展开态 ── */
.xy-sf-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px dashed var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
}

.xy-sf-sec {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.xy-sf-cap {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-sf-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.xy-sf-attr {
  flex: 2;
  min-width: 0;
}

.xy-sf-op {
  flex: none;
  width: 5rem;
}

.xy-sf-value {
  flex: 1;
  min-width: 0;
}

.xy-sf-rank {
  flex: none;
  width: 1.5em;
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}

.xy-sf-sort {
  flex: 1;
  min-width: 0;
}

.xy-sf-dir {
  flex: none;
  padding: 2px var(--space-2);
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
  color: var(--xy-ink-2);
  font-family: inherit;
  font-size: var(--font-size-md);
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.xy-sf-del {
  flex: none;
  width: 24px;
  height: 24px;
  border: 1px solid var(--xy-ink-line);
  border-radius: 2px;
  background: var(--xy-paper);
  color: var(--xy-ink-3);
  font-family: inherit;
  cursor: pointer;

  &:hover {
    border-color: var(--color-danger);
    color: var(--color-danger);
  }
}

.xy-sf-add {
  align-self: flex-start;
  padding: 2px var(--space-3);
  border: 1px dashed var(--xy-ink-line);
  border-radius: 2px;
  background: transparent;
  color: var(--xy-ink-2);
  font-family: inherit;
  font-size: var(--font-size-md);
  cursor: pointer;

  &:hover:not(:disabled) {
    border-color: var(--xy-seal);
    color: var(--xy-seal);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.xy-sf-hint {
  font-size: var(--font-size-md);
  color: var(--xy-ink-4);
}
</style>