<!--
 * 文件: CharacterEditor.vue
 * 功能: 角色编辑对话框
 * 描述: 调试工具 — 左侧分类栏 + 右侧状态列表 + 属性调整 + 重置
 * 版本: 3.1.0
-->

<template>
  <Dialog :model-value="modelValue" @update:model-value="handleModelValueChange" title="角色编辑器" width="45vw"
    height="50vh" :show-mask="false" :mask-closable="false" :esc-closable="false">
    <template #header-actions>
      <TacticalSelect v-model="innerSelectedCharId" size="md" searchable class="char-selector"
        :placeholder="characters.length === 0 ? '暂无参战角色' : '选择角色'" :options="charOptions"
        @change="emitSelectChar" />
    </template>

    <Tabs v-model="activeTab" :tabs="editorTabs" equal-width>
      <template #buffs>
        <div class="ce-tab-content">
          <div class="buff-layout">
            <!-- 左侧：分类栏 -->
            <div class="buff-sidebar">
              <div class="sidebar-title">分类</div>
              <button v-for="cat in sidebarCategories" :key="cat.key" class="sidebar-item"
                :class="{ active: activeCategory === cat.key }" @click="activeCategory = cat.key">
                <span class="sidebar-dot" :class="'dot-' + cat.key"></span>
                <span class="sidebar-label">{{ cat.label }}</span>
                <span class="sidebar-count">{{ cat.count }}</span>
              </button>
            </div>

            <!-- 右侧：状态列表 -->
            <div class="buff-main">
              <div class="ce-section-header">
                <span class="section-title">{{ currentCategoryLabel }}</span>
                <span class="status-count">{{ checkedBuffs.length }}/{{ localStatuses.length }}</span>
              </div>

              <TacticalInput size="md" :model-value="buffSearch" placeholder="搜索状态名称..." aria-label="搜索状态名称"
                @update:model-value="buffSearch = String($event ?? '')" />

              <div class="status-list">
                <div v-for="status in filteredStatuses" :key="status.id" class="ce-status-item"
                  :class="{ active: status.active, disabled: !innerSelectedCharId }">
                  <div class="ce-status-row flex items-center gap-2">
                    <label class="status-label">
                      <input type="checkbox" v-model="status.active" :disabled="!innerSelectedCharId">
                      <span class="ce-status-name" :class="status.polarity">
                        {{ status.name }}
                      </span>
                    </label>
                    <div class="ce-duration-wrap">
                      <TacticalInput type="number" integer size="md" :min="0" :max="99" :model-value="status.duration"
                        :disabled="!innerSelectedCharId" aria-label="状态持续回合数"
                        @update:model-value="(v) => (status.duration = v === null ? null : Number(v))" />
                      <span class="ce-duration-unit">回合</span>
                    </div>
                  </div>
                  <div class="ce-status-desc">{{ status.effect }}</div>
                </div>

                <div v-if="filteredStatuses.length === 0" class="empty-tip">
                  {{ buffSearch ? '无匹配状态' : (innerSelectedCharId ? '该分类暂无状态' : '请先选择角色') }}
                </div>
              </div>

              <div class="ce-section-actions">
                <Button @click="toggleCurrentCategory" :disabled="!innerSelectedCharId"
                  :title="currentCategoryAllChecked ? '取消全选当前分类' : '全选当前分类'">
                  {{ currentCategoryAllChecked ? '取消全选' : '全选本类' }}
                </Button>
                <Button @click="emitApplyBuffs"
                  :disabled="checkedBuffs.length === 0 || !innerSelectedCharId">
                  注入选中 ({{ checkedBuffs.length }})
                </Button>
                <Button @click="clearAllChecks" :disabled="checkedBuffs.length === 0">清空</Button>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #attrs>
        <div class="ce-tab-content">
          <div class="attr-grid">
            <div v-for="attr in attrFields" :key="attr.key" class="attr-row flex items-center gap-2">
              <label class="attr-label">{{ attr.label }}</label>
              <div class="attr-control">
                <NumericStepper v-model.number="attrOverrides[attr.key]" :min="attr.min" :max="attr.max"
                  :steps="attr.steps" :disabled="!innerSelectedCharId" />
              </div>
              <span class="attr-current">当前:{{ getCurrentAttr(attr.key) }}</span>
            </div>
          </div>
          <div class="ce-section-actions">
            <Button @click="emitApplyAttrs" :disabled="!innerSelectedCharId">应用属性</Button>
            <Button @click="resetAttrOverrides">重置到当前值</Button>
          </div>
        </div>

      </template>
      <template #reset>
        <div class="ce-tab-content">
          <p class="reset-desc">对选中的角色执行以下操作：</p>
          <div class="reset-actions">
            <Button block @click="emitReset('buffs')" :disabled="!innerSelectedCharId">清除所有
              Buff</Button>
            <Button block @click="emitReset('hp_energy')"
              :disabled="!innerSelectedCharId">恢复满血满能量</Button>
            <Button block variant="danger" @click="confirmResetAll = true"
              :disabled="!innerSelectedCharId">完全重置</Button>
          </div>
        </div> <!-- /ce-tab-content reset -->
      </template>
    </Tabs>
  </Dialog>

  <!-- 完全重置二次确认 -->
  <ConfirmDialog v-model="confirmResetAll" title="完全重置"
    message="确定要对选中角色执行完全重置吗？将清除所有 Buff 并恢复初始属性。"
    confirm-text="重置" danger @confirm="emitReset('all')" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { TabItem } from '@/presentation/components'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'

import { buffsData } from '@/shared/types/buffs-json'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import { classifyBuff } from '@/shared/types/buff-classification'
import { ParticipantSideName } from '@/domain/battle/type/types'
import { StatusCategory, StatusCategoryNames } from '@/shared/types/status-meta'
import { BuffPolarity } from '@/shared/types/buff-classification'
import { container } from '@/infrastructure/di/Container'
import type { BuffScriptRegistry } from '@/domain/buff/BuffScriptRegistry'
// ==================== 类型 ====================

export interface EditorBuffEntry {
  id: string
  name: string
  /** 主分类（facets[0]） */
  primaryFacet: string
  /** 极性 */
  polarity: BuffPolarity
  /** 用户可调的回合数（0=永久；null=编辑中/未设置，注入时转 0） */
  duration: number | null
  effect: string
  active: boolean
}

export interface CharacterOption {
  id: string
  name: string
  side: 'ally' | 'enemy'
}

export interface SidebarCategory {
  key: string
  label: string
  count: number
}

export interface AttrOverrideItem {
  key: string
  label: string
  min: number
  max: number
  steps: number[]
}

// ==================== Props ====================

interface Props {
  modelValue: boolean
  characters: CharacterOption[]
  selectedCharId: string
  currentAttrs: Record<string, number>
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: false,
  characters: () => [],
  selectedCharId: '',
  currentAttrs: () => ({}),
})

// ==================== Emits ====================

interface Emits {
  (e: 'update:modelValue', value: boolean): void
  (e: 'update:selectedCharId', value: string): void
  (e: 'applyBuffs', payload: { charId: string; buffs: { buffId: string; duration: number }[] }): void
  (e: 'applyAttributes', payload: { charId: string; attributes: Record<string, number> }): void
  (e: 'resetCharacter', payload: { charId: string; mode: 'buffs' | 'hp_energy' | 'all' }): void
}

const emit = defineEmits<Emits>()

// ==================== 本地状态 ====================

const activeTab = ref<string>('buffs')
const editorTabs: TabItem[] = [
  { id: 'buffs', label: '附加状态' },
  { id: 'attrs', label: '属性调整' },
  { id: 'reset', label: '重置' },
]
const buffSearch = ref('')
const innerSelectedCharId = ref('')
const charOptions = computed<TSelectOption[]>(() =>
  props.characters.map((c) => ({ value: c.id, label: `${c.name} (${ParticipantSideName[c.side]})` })),
)
const activeCategory = ref<string>('all') // 'all' 或 facet key
const localStatuses = ref<EditorBuffEntry[]>([]) // 本地状态的 Buff 入口

const attrOverrides = ref<Record<string, number>>({
  currentHealth: 0, currentEnergy: 0, attack: 0, defense: 0, speed: 0,
})
const attrDirty = ref(false)
let _skipDirtyMark = false
watch(attrOverrides, () => {
  if (!_skipDirtyMark) attrDirty.value = true
  _skipDirtyMark = false
}, { deep: true })

// ==================== 分类配置 ====================

const SIDEBAR_DEFS: { key: string; label: string; categoryMatch?: StatusCategory }[] = [
  { key: 'all', label: '所有' },
  ...(Object.keys(StatusCategoryNames) as StatusCategory[]).map(key => ({
    key: key as string,
    label: StatusCategoryNames[key],
  })),
]

// ==================== 属性字段 ====================

const attrFields: AttrOverrideItem[] = [
  { key: 'currentHealth', label: '气血', min: 0, max: 99999, steps: [100, 10, 1] },
  { key: 'currentEnergy', label: '能量', min: 0, max: 999, steps: [100, 10, 1] },
  { key: 'attack', label: '攻击', min: 0, max: 99999, steps: [100, 10, 1] },
  { key: 'defense', label: '防御', min: 0, max: 99999, steps: [100, 10, 1] },
  { key: 'speed', label: '速度', min: 0, max: 9999, steps: [100, 10, 1] },
]

// ==================== Methods ====================

/** 效果摘要由 BuffConfigResolver 解析时生成（effectSummary），UI 只读取 */
function buildStatusesFromBuffs() {
  const buffList = Array.isArray(buffsData) ? buffsData : []
  const registry = container.resolve<BuffScriptRegistry>('BuffScriptRegistry')
  return buffList.map((buff: BuffJsonEntry) => {
    const classification = classifyBuff(buff)
    const primaryFacet = classification.facets.length > 0 ? classification.facets[0] : 'other'
    return {
      id: buff.id,
      name: buff.name,
      primaryFacet,
      polarity: classification.polarity,
      duration: buff.duration !== undefined && buff.duration > 0 ? buff.duration : 0,
      effect: buff.description || registry.getResolvedBuffConfig(buff.id)?.effectSummary || buff.name,
      active: false,
    }
  })
}

function getCurrentAttr(key: string): number {
  return props.currentAttrs[key] ?? 0
}

function resetAttrOverrides() {
  _skipDirtyMark = true
  for (const field of attrFields) {
    attrOverrides.value[field.key] = getCurrentAttr(field.key)
  }
  attrDirty.value = false
}

function clearAllChecks() {
  localStatuses.value.forEach(s => { s.active = false })
}

function toggleCurrentCategory() {
  const items = filteredStatuses.value
  const allChecked = items.every(i => i.active)
  for (const item of items) {
    item.active = !allChecked
  }
}

const handleModelValueChange = (value: boolean) => emit('update:modelValue', value)
const emitSelectChar = () => emit('update:selectedCharId', innerSelectedCharId.value)

function emitApplyBuffs() {
  const checked = localStatuses.value.filter(s => s.active)
  if (checked.length === 0 || !innerSelectedCharId.value) return
  emit('applyBuffs', {
    charId: innerSelectedCharId.value,
    buffs: checked.map(s => ({ buffId: s.id, duration: s.duration ?? 0 })),
  })
  clearAllChecks()
}

function emitApplyAttrs() {
  if (!innerSelectedCharId.value) return
  const changed: Record<string, number> = {}
  for (const field of attrFields) {
    const val = attrOverrides.value[field.key]
    if (val !== getCurrentAttr(field.key)) changed[field.key] = val
  }
  if (Object.keys(changed).length === 0) return
  emit('applyAttributes', { charId: innerSelectedCharId.value, attributes: changed })
  _skipDirtyMark = true
  attrDirty.value = false
}

// 完全重置二次确认
const confirmResetAll = ref(false)

function emitReset(mode: 'buffs' | 'hp_energy' | 'all') {
  if (!innerSelectedCharId.value) return
  emit('resetCharacter', { charId: innerSelectedCharId.value, mode })
}

// ==================== Computed ====================

const checkedBuffs = computed(() => localStatuses.value.filter(s => s.active))

/** 当前选中的分类定义 */
const currentCategoryDef = computed(() =>
  SIDEBAR_DEFS.find(d => d.key === activeCategory.value) ?? SIDEBAR_DEFS[0]
)

const currentCategoryLabel = computed(() => currentCategoryDef.value.label)

const currentCategoryAllChecked = computed(() => {
  const items = filteredStatuses.value
  return items.length > 0 && items.every(i => i.active)
})

/** 侧边栏：各分类计数 */
const sidebarCategories = computed<SidebarCategory[]>(() => {
  return SIDEBAR_DEFS.map(def => {
    let count: number
    if (def.key === 'all') {
      count = localStatuses.value.length
    } else if (def.key === 'other') {
      // 无匹配任何已知分类的 buff
      count = localStatuses.value.filter(s =>
        !SIDEBAR_DEFS.some(d => d.categoryMatch && d.categoryMatch === s.primaryFacet)
      ).length
    } else {
      count = localStatuses.value.filter(s => s.primaryFacet === def.categoryMatch).length
    }
    return { key: def.key, label: def.label, count }
  })
})

/** 过滤后的状态列表（按当前分类 + 搜索词） */
const filteredStatuses = computed(() => {
  let items = localStatuses.value
  // 分类过滤
  if (activeCategory.value !== 'all') {
    const def = SIDEBAR_DEFS.find(d => d.key === activeCategory.value)
    if (def?.categoryMatch) {
      items = items.filter(s => s.primaryFacet === def.categoryMatch)
    } else if (def?.key === 'other') {
      items = items.filter(s =>
        !SIDEBAR_DEFS.some(d => d.categoryMatch && d.categoryMatch === s.primaryFacet)
      )
    }
  }
  // 搜索过滤
  if (buffSearch.value) {
    const q = buffSearch.value.toLowerCase()
    items = items.filter(s => s.name.toLowerCase().includes(q) || s.effect.toLowerCase().includes(q))
  }
  return items
})

// ==================== Watchers ====================

watch(() => props.selectedCharId, (id) => {
  if (id) innerSelectedCharId.value = id
}, { immediate: true })

watch(() => props.currentAttrs, (attrs) => {
  if (attrDirty.value) return
  if (attrs && Object.keys(attrs).length > 0) {
    _skipDirtyMark = true
    for (const field of attrFields) {
      attrOverrides.value[field.key] = attrs[field.key] ?? 0
    }
  }
}, { deep: true, immediate: true })

watch(innerSelectedCharId, () => { attrDirty.value = false })

watch(() => props.modelValue, (visible) => {
  if (visible && localStatuses.value.length === 0) {
    localStatuses.value = buildStatusesFromBuffs()
  }
})
</script>

<style scoped>
/* ═══ 角色选择器 ═══ */
.char-selector {
  flex: 1;
  max-width: 160px;
}

/* ═══ 双列布局 ═══ */
.buff-layout {
  display: flex;
  gap: var(--space-3);
  min-height: 320px;
}

/* ═══ 左侧分类栏 ═══ */
.buff-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border-default);
  padding-right: var(--space-2);
}

.sidebar-title {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-tertiary);
  padding: var(--space-2) var(--space-2);
  margin-bottom: var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  text-align: left;
  margin-bottom: var(--space-2);
}

.sidebar-item:hover {
  background: var(--color-bg-hover-accent);
  color: var(--color-text-primary);
}

.sidebar-item.active {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}

.sidebar-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-all {
  background: var(--color-text-tertiary);
}

.dot-modifier {
  background: var(--cat-modifier);
}

.dot-trigger {
  background: var(--cat-trigger);
}

.dot-aura {
  background: var(--cat-aura);
}

.dot-shield {
  background: var(--cat-shield);
}

.dot-control {
  background: var(--cat-control);
}

.dot-dot {
  background: var(--cat-dot);
}

.dot-immunity {
  background: var(--cat-immunity);
}

.dot-other {
  background: var(--cat-other);
}

.sidebar-label {
  flex: 1;
}

.sidebar-count {
  color: var(--color-text-tertiary);
  background: var(--color-bg-primary);
  padding: 0 6px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  min-width: 20px;
  text-align: center;
}

/* ═══ 右侧主区域 ═══ */
.buff-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ce-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2);
}

.section-title {
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.status-count {
  color: var(--color-text-secondary);
  background: var(--color-bg-primary);
  padding: 1px 6px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
}

/* ═══ 状态列表 ═══ */
.status-list {
  flex: 1;
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--space-2);
}

.ce-status-item {
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-2);
}

.ce-status-item:last-child {
  margin-bottom: 0;
}

.ce-status-item:hover {
  background: var(--color-bg-primary);
}

.ce-status-item.active {
  background: var(--color-bg-tertiary);
  border-left: 3px solid var(--color-info);
}

.ce-status-item.disabled {
  opacity: 0.5;
}

.status-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  flex-shrink: 0;
  min-width: 0;
}

.status-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--color-info);
  flex-shrink: 0;
}

.ce-status-name {
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.ce-status-name.positive {
  color: var(--color-success);
}

.ce-status-name.negative {
  color: var(--color-danger);
}

.ce-status-name.neutral {
  color: var(--color-text-secondary);
}

/* ═══ 持续时间 ═══ */
.ce-duration-wrap {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  margin-left: auto;
}

/* TacticalInput 根默认 width:100%，在状态行内给固定宽度紧凑显示 */
.ce-duration-wrap .t-input {
  flex: 0 0 56px;
}

/* 搜索框与状态列表间距（原 .ce-search margin-bottom） */
.buff-main > .t-input {
  margin-bottom: var(--space-2);
}

.ce-duration-unit {
  color: var(--color-text-tertiary);
}

/* ═══ Buff 描述（第二行）═══ */
.ce-status-desc {
  color: var(--color-text-tertiary);
  line-height: 1.4;
  margin: 2px 0 0 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ═══ 效果文本 ═══ */
.ce-status-effect {
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.empty-tip {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-text-tertiary);
}

/* ═══ 按钮栏 ═══ */
.ce-section-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  padding-top: var(--space-2);
  margin-top: var(--space-2);
  border-top: 1px solid var(--color-border-default);
}

/* ═══ 属性调整 ═══ */
.attr-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.attr-label {
  width: 48px;
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  flex-shrink: 0;
}

.attr-control {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 1;
}

.attr-current {
  color: var(--color-text-tertiary);
  white-space: nowrap;
  width: 90px;
  flex-shrink: 0;
}

/* ═══ 重置 ═══ */
.reset-desc {
  color: var(--color-text-secondary);
  margin-bottom: var(--space-4);
}

.reset-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
</style>
