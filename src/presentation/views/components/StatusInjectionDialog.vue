<!--
 * 文件: StatusInjectionDialog.vue
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 初始状态注入对话框
 * 描述: 调试工具 — 三 Tab：Buff 注入 / 属性改写 / 状态重置
 * 版本: 2.0.0
-->

<template>
  <Dialog :model-value="modelValue" @update:model-value="handleModelValueChange" title="初始状态注入" width="540px"
    :show-mask="false" :mask-closable="false">
    <!-- 角色选择器 —— 标题栏右侧 -->
    <template #header-actions>
      <select v-model="innerSelectedCharId" class="char-selector" @change="emitSelectChar">
        <option value="" disabled>{{ characters.length === 0 ? '暂无参战角色' : '选择角色' }}</option>
        <option v-for="char in characters" :key="char.id" :value="char.id">
          {{ char.name }} ({{ char.side === 'ally' ? '我方' : '敌方' }})
        </option>
      </select>
    </template>

    <!-- Tab 栏 -->
    <div class="si-tabs">
      <button class="si-tab" :class="{ active: activeTab === 'buffs' }" @click="activeTab = 'buffs'">状态注入</button>
      <button class="si-tab" :class="{ active: activeTab === 'attrs' }" @click="activeTab = 'attrs'">属性调整</button>
      <button class="si-tab" :class="{ active: activeTab === 'reset' }" @click="activeTab = 'reset'">重置</button>
    </div>

    <!-- ═══ Tab: Buff 注入 ═══ -->
    <div v-show="activeTab === 'buffs'" class="si-tab-content">
      <div class="si-section-header">
        <span class="section-title">可用状态</span>
        <span class="status-count">{{ checkedBuffs.length }}/{{ localStatuses.length }}</span>
      </div>

      <!-- 搜索过滤 -->
      <input v-model="buffSearch" class="si-search" placeholder="搜索状态名称..." />

      <div class="status-list">
        <div v-for="status in filteredStatuses" :key="status.id" class="si-status-item"
          :class="{ active: status.active, disabled: !innerSelectedCharId }">
          <label class="status-label">
            <input type="checkbox" v-model="status.active" :disabled="!innerSelectedCharId">
            <span class="si-status-name" :class="status.isPositive ? 'positive' : 'negative'">
              {{ status.name }}
            </span>
          </label>
          <input type="number" class="si-duration-input" v-model="status.duration" min="0" max="99"
            title="持续回合数（0=永久）" :disabled="!innerSelectedCharId">
          <span class="si-status-effect">{{ status.effect }}</span>
        </div>

        <div v-if="filteredStatuses.length === 0" class="empty-tip">
          {{ buffSearch ? '无匹配状态' : (innerSelectedCharId ? '暂无可用状态' : '请先选择角色') }}
        </div>
      </div>

      <div class="si-section-actions">
        <button class="btn-medium" @click="emitApplyBuffs" :disabled="checkedBuffs.length === 0 || !innerSelectedCharId">
          应用注入 ({{ checkedBuffs.length }})
        </button>
        <button class="btn-medium" @click="clearAllChecks" :disabled="checkedBuffs.length === 0">
          清空勾选
        </button>
      </div>
    </div>

    <!-- ═══ Tab: 属性调整 ═══ -->
    <div v-show="activeTab === 'attrs'" class="si-tab-content">
      <div class="attr-grid">
        <div v-for="attr in attrFields" :key="attr.key" class="attr-row">
          <label class="attr-label">{{ attr.label }}</label>
          <div class="attr-control">
            <input type="range" class="attr-slider" :min="attr.min" :max="attr.max" :step="attr.step"
              v-model.number="attrOverrides[attr.key]" :disabled="!innerSelectedCharId">
            <input type="number" class="attr-input" :min="attr.min" :max="attr.max"
              v-model.number="attrOverrides[attr.key]" :disabled="!innerSelectedCharId">
          </div>
          <span class="attr-current">当前:{{ getCurrentAttr(attr.key) }}</span>
        </div>
      </div>

      <div class="si-section-actions">
        <button class="btn-medium" @click="emitApplyAttrs" :disabled="!innerSelectedCharId">
          应用属性
        </button>
        <button class="btn-medium" @click="resetAttrOverrides">
          重置到当前值
        </button>
      </div>
    </div>

    <!-- ═══ Tab: 重置 ═══ -->
    <div v-show="activeTab === 'reset'" class="si-tab-content">
      <p class="reset-desc">对选中的角色执行以下操作：</p>
      <div class="reset-actions">
        <button class="btn-medium reset-btn" @click="emitReset('buffs')" :disabled="!innerSelectedCharId">
          清除所有 Buff
        </button>
        <button class="btn-medium reset-btn" @click="emitReset('hp_energy')" :disabled="!innerSelectedCharId">
          恢复满血满能量
        </button>
        <button class="btn-medium reset-btn btn-danger" @click="emitReset('all')" :disabled="!innerSelectedCharId">
          完全重置（Buff + 满状态）
        </button>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import buffsData from '@configs/buffs/buffs.json'

// ==================== 类型 ====================

export interface InjectableStatus {
  id: string
  name: string
  /** 用户可调的自定义回合数（0=永久） */
  duration: number
  effect: string
  active: boolean
  isPositive: boolean
}

export interface CharacterOption {
  id: string
  name: string
  side: 'ally' | 'enemy'
}

export interface AttrOverrideItem {
  key: string
  label: string
  min: number
  max: number
  step: number
}

// ==================== Props ====================

interface Props {
  modelValue: boolean
  /** 所有可选的参战角色 */
  characters: CharacterOption[]
  /** 外部选中的角色 ID（从战场点击同步过来） */
  selectedCharId: string
  /** 当前选中角色的各项属性值（用于属性调整 Tab 的 "当前值" 显示） */
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
  /** 选中角色变更 */
  (e: 'update:selectedCharId', value: string): void
  /** 应用 Buff 注入 */
  (e: 'applyBuffs', payload: { charId: string; buffs: { buffId: string; duration: number }[] }): void
  /** 应用属性改写 */
  (e: 'applyAttributes', payload: { charId: string; attributes: Record<string, number> }): void
  /** 重置角色 */
  (e: 'resetCharacter', payload: { charId: string; mode: 'buffs' | 'hp_energy' | 'all' }): void
}

const emit = defineEmits<Emits>()

// ==================== 本地状态 ====================

const activeTab = ref<'buffs' | 'attrs' | 'reset'>('buffs')
const buffSearch = ref('')
const innerSelectedCharId = ref('')

/** Buff 列表（从 JSON 加载） */
const localStatuses = ref<InjectableStatus[]>([])

/** 属性改写值 — 初始为当前值，用户可调 */
const attrOverrides = ref<Record<string, number>>({
  currentHealth: 0,
  currentEnergy: 0,
  minAttack: 0,
  defense: 0,
  speed: 0,
})

/** 用户是否已手动编辑过属性值。为 true 时 currentAttrs 变化不再覆盖用户编辑 */
const attrDirty = ref(false)

/** 内部标志：执行 resetAttrOverrides/apply 时跳过脏标记 */
let _skipDirtyMark = false

watch(attrOverrides, () => {
  if (!_skipDirtyMark) {
    attrDirty.value = true
  }
  _skipDirtyMark = false
}, { deep: true })

// ==================== 属性字段定义 ====================

const attrFields: AttrOverrideItem[] = [
  { key: 'currentHealth', label: '气血', min: 0, max: 99999, step: 1 },
  { key: 'currentEnergy', label: '能量', min: 0, max: 999, step: 1 },
  { key: 'minAttack', label: '攻击', min: 0, max: 99999, step: 1 },
  { key: 'defense', label: '防御', min: 0, max: 99999, step: 1 },
  { key: 'speed', label: '速度', min: 0, max: 9999, step: 1 },
]

// ==================== Methods ====================

function buildStatusesFromBuffs() {
  const buffList = Array.isArray(buffsData) ? buffsData : []
  return buffList.map((buff: any) => ({
    id: buff.id,
    name: buff.name,
    duration: buff.duration !== undefined && buff.duration > 0 ? buff.duration : 0,
    effect: buff.description || buildEffectSummary(buff),
    active: false,
    isPositive: !buff.isDebuff && !(Array.isArray(buff.tags) && buff.tags.includes('debuff')),
  }))
}

function buildEffectSummary(buff: any): string {
  const parts: string[] = []
  if (buff.attributes) {
    for (const [key, val] of Object.entries(buff.attributes)) {
      parts.push(`${key}:${val}`)
    }
  }
  if (buff.aura) parts.push(`光环:${buff.aura.targetSelector}`)
  if (buff.triggers?.length) parts.push(`触发:${buff.triggers.length}个效果`)
  if (buff.immunities?.length) parts.push(`免疫:${buff.immunities.join(',')}`)
  if (buff.shield) parts.push('护盾')
  if (buff.controlType) parts.push(`控制:${buff.controlType}`)
  return parts.length > 0 ? parts.join('; ') : '—'
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

const handleModelValueChange = (value: boolean) => {
  emit('update:modelValue', value)
}

const emitSelectChar = () => {
  emit('update:selectedCharId', innerSelectedCharId.value)
}

function emitApplyBuffs() {
  const checked = localStatuses.value.filter(s => s.active)
  if (checked.length === 0 || !innerSelectedCharId.value) return
  emit('applyBuffs', {
    charId: innerSelectedCharId.value,
    buffs: checked.map(s => ({ buffId: s.id, duration: s.duration })),
  })
  // 注入后清空勾选
  clearAllChecks()
}

function emitApplyAttrs() {
  if (!innerSelectedCharId.value) return
  const changed: Record<string, number> = {}
  for (const field of attrFields) {
    const val = attrOverrides.value[field.key]
    if (val !== getCurrentAttr(field.key)) {
      changed[field.key] = val
    }
  }
  if (Object.keys(changed).length === 0) return
  emit('applyAttributes', { charId: innerSelectedCharId.value, attributes: changed })
  _skipDirtyMark = true
  attrDirty.value = false
}

function emitReset(mode: 'buffs' | 'hp_energy' | 'all') {
  if (!innerSelectedCharId.value) return
  emit('resetCharacter', { charId: innerSelectedCharId.value, mode })
}

// ==================== Computed ====================

const checkedBuffs = computed(() => localStatuses.value.filter(s => s.active))

const filteredStatuses = computed(() => {
  if (!buffSearch.value) return localStatuses.value
  const q = buffSearch.value.toLowerCase()
  return localStatuses.value.filter(s => s.name.toLowerCase().includes(q))
})

// ==================== Watchers ====================

/** 同步外部 selectedCharId → 内部 selector */
watch(() => props.selectedCharId, (id) => {
  if (id) innerSelectedCharId.value = id
}, { immediate: true })

/** 外部选中角色变化时，如果用户未手动编辑则刷新属性改写值 */
watch(() => props.currentAttrs, (attrs) => {
  if (attrDirty.value) return // 用户已手动编辑，不覆盖
  if (attrs && Object.keys(attrs).length > 0) {
    _skipDirtyMark = true
    for (const field of attrFields) {
      attrOverrides.value[field.key] = attrs[field.key] ?? 0
    }
  }
}, { deep: true, immediate: true })

/** 切换角色时重置脏标志 */
watch(innerSelectedCharId, () => {
  attrDirty.value = false
})

/** 弹窗打开时初始化 Buff 列表 */
watch(() => props.modelValue, (visible) => {
  if (visible && localStatuses.value.length === 0) {
    localStatuses.value = buildStatusesFromBuffs()
  }
})
</script>

<style scoped>
/* ═══ Tab 栏 ═══ */
.si-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border-default);
  margin-bottom: var(--space-3);
}
.si-tab {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  font-size: var(--font-size-sm);
  transition: all var(--transition-fast);
  text-align: center;
}
.si-tab:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}
.si-tab.active {
  color: var(--color-info);
  border-bottom-color: var(--color-info);
}
.si-tab-content {
  min-height: 280px;
}

/* ═══ 角色选择器 — 与系统 scene-select 风格一致 ═══ */
.char-selector {
  flex: 1;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  cursor: pointer;
  max-width: 160px;
}
.char-selector:focus {
  outline: none;
  border-color: var(--color-info);
}

/* ═══ 通用头部 ═══ */
.si-section-header {
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
  padding: 2px 8px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-default);
  font-size: var(--font-size-xs);
}

/* ═══ 搜索框 ═══ */
.si-search {
  width: 100%;
  padding: var(--space-1) var(--space-2);
  margin-bottom: var(--space-2);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
}
.si-search:focus {
  outline: none;
  border-color: var(--color-info);
}

/* ═══ Buff 列表 ═══ */
.status-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  padding: var(--space-2);
}
.si-status-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-1);
  transition: all 0.2s;
}
.si-status-item:last-child { margin-bottom: 0; }
.si-status-item:hover { background: var(--color-bg-primary); }
.si-status-item.active { background: var(--color-bg-tertiary); border-left: 3px solid var(--color-info); }
.si-status-item.disabled { opacity: 0.5; }
.status-label {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  cursor: pointer;
  flex-shrink: 0;
  min-width: 0;
}
.status-label input[type="checkbox"] {
  width: 14px; height: 14px;
  cursor: pointer;
  accent-color: var(--color-info);
}
.si-status-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}
.si-status-name.positive { color: var(--color-success); }
.si-status-name.negative { color: var(--color-danger); }
.si-duration-input {
  width: 50px;
  padding: 1px 4px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  text-align: center;
  flex-shrink: 0;
}
.si-status-effect {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.empty-tip {
  padding: var(--space-6) var(--space-4);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

/* ═══ 按钮栏 ═══ */
.si-section-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  padding-top: var(--space-3);
  margin-top: var(--space-3);
  border-top: 1px solid var(--color-border-default);
}

/* ═══ 属性调整 ═══ */
.attr-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.attr-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.attr-label {
  width: 48px;
  font-size: var(--font-size-sm);
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
.attr-slider {
  flex: 1;
  height: 6px;
  accent-color: var(--color-info);
  cursor: pointer;
}
.attr-input {
  width: 80px;
  padding: 2px 6px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  text-align: right;
}
.attr-current {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  white-space: nowrap;
  width: 90px;
  flex-shrink: 0;
}

/* ═══ 重置 Tab ═══ */
.reset-desc {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  margin-bottom: var(--space-4);
}
.reset-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.reset-btn {
  width: 100%;
  text-align: center;
}
</style>
