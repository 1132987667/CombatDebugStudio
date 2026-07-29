<!--
 * 文件: CharacterEditor.vue
 * 功能: 角色编辑对话框
 * 描述: 调试工具 — 左侧分类栏 + 右侧状态列表 + 属性调整 + 重置
 * 版本: 3.1.0
-->

<template>
  <Dialog :model-value="modelValue" @update:model-value="handleModelValueChange" title="角色编辑器" width="45vw"
    height="50vh" :show-mask="false" :mask-closable="false">
    <template #header-actions>
      <select v-model="innerSelectedCharId" class="char-selector" @change="emitSelectChar">
        <option value="" disabled>{{ characters.length === 0 ? '暂无参战角色' : '选择角色' }}</option>
        <option v-for="char in characters" :key="char.id" :value="char.id">
          {{ char.name }} ({{ ParticipantSideName[char.side] }})
        </option>
      </select>
    </template>

    <div class="ce-tabs">
      <button class="ce-tab" :class="{ active: activeTab === 'buffs' }" @click="activeTab = 'buffs'">附加状态</button>
      <button class="ce-tab" :class="{ active: activeTab === 'attrs' }" @click="activeTab = 'attrs'">属性调整</button>
      <button class="ce-tab" :class="{ active: activeTab === 'reset' }" @click="activeTab = 'reset'">重置</button>
    </div>

    <!-- ═══ Tab: Buff 注入（双列布局）═══ -->
    <div v-show="activeTab === 'buffs'" class="ce-tab-content">
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

          <input v-model="buffSearch" class="ce-search" placeholder="搜索状态名称..." />

          <div class="status-list">
            <div v-for="status in filteredStatuses" :key="status.id" class="ce-status-item"
              :class="{ active: status.active, disabled: !innerSelectedCharId }">
              <div class="ce-status-row">
                <label class="status-label">
                  <input type="checkbox" v-model="status.active" :disabled="!innerSelectedCharId">
                  <span class="ce-status-name" :class="status.polarity">
                    {{ status.name }}
                  </span>
                </label>
                <div class="ce-duration-wrap">
                  <input type="number" class="ce-duration-input" v-model="status.duration" min="0" max="99"
                    :disabled="!innerSelectedCharId">
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
            <button class="btn-medium" @click="toggleCurrentCategory" :disabled="!innerSelectedCharId"
              :title="currentCategoryAllChecked ? '取消全选当前分类' : '全选当前分类'">
              {{ currentCategoryAllChecked ? '取消全选' : '全选本类' }}
            </button>
            <button class="btn-medium" @click="emitApplyBuffs"
              :disabled="checkedBuffs.length === 0 || !innerSelectedCharId">
              注入选中 ({{ checkedBuffs.length }})
            </button>
            <button class="btn-medium" @click="clearAllChecks" :disabled="checkedBuffs.length === 0">清空</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ Tab: 属性调整 ═══ -->
    <div v-show="activeTab === 'attrs'" class="ce-tab-content">
      <div class="attr-grid">
        <div v-for="attr in attrFields" :key="attr.key" class="attr-row">
          <label class="attr-label">{{ attr.label }}</label>
          <div class="attr-control">
            <NumericStepper v-model.number="attrOverrides[attr.key]" :min="attr.min" :max="attr.max" :steps="attr.steps"
              :disabled="!innerSelectedCharId" />
          </div>
          <span class="attr-current">当前:{{ getCurrentAttr(attr.key) }}</span>
        </div>
      </div>
      <div class="ce-section-actions">
        <button class="btn-medium" @click="emitApplyAttrs" :disabled="!innerSelectedCharId">应用属性</button>
        <button class="btn-medium" @click="resetAttrOverrides">重置到当前值</button>
      </div>
    </div>

    <!-- ═══ Tab: 重置 ═══ -->
    <div v-show="activeTab === 'reset'" class="ce-tab-content">
      <p class="reset-desc">对选中的角色执行以下操作：</p>
      <div class="reset-actions">
        <button class="btn-medium reset-btn" @click="emitReset('buffs')" :disabled="!innerSelectedCharId">清除所有
          Buff</button>
        <button class="btn-medium reset-btn" @click="emitReset('hp_energy')"
          :disabled="!innerSelectedCharId">恢复满血满能量</button>
        <button class="btn-medium reset-btn btn-danger" @click="emitReset('all')"
          :disabled="!innerSelectedCharId">完全重置</button>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import Dialog from '@/presentation/components/Dialog.vue'
import NumericStepper from '@/presentation/components/NumericStepper.vue'
import { buffsData } from '@/shared/types/buffs-json'
import type { BuffJsonEntry } from '@/shared/types/buffs-json'
import { classifyBuff, type BuffCategory } from '@/shared/types/buff-classification'
import { getAttrName } from '@/domain/attribute/types'
import { ParticipantSideName } from '@/domain/battle/type/types'

// ==================== 类型 ====================

export interface EditorBuffEntry {
  id: string
  name: string
  /** 主分类（facets[0]） */
  primaryFacet: string
  /** 极性 */
  polarity: string
  /** 用户可调的回合数（0=永久） */
  duration: number
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

const activeTab = ref<'buffs' | 'attrs' | 'reset'>('buffs')
const buffSearch = ref('')
const innerSelectedCharId = ref('')
const activeCategory = ref<string>('all') // 'all' 或 facet key
const localStatuses = ref<EditorBuffEntry[]>([]) // 本地状态的 Buff 入口

const attrOverrides = ref<Record<string, number>>({
  currentHealth: 0, currentEnergy: 0, minAttack: 0, defense: 0, speed: 0,
})
const attrDirty = ref(false)
let _skipDirtyMark = false
watch(attrOverrides, () => {
  if (!_skipDirtyMark) attrDirty.value = true
  _skipDirtyMark = false
}, { deep: true })

// ==================== 分类配置 ====================

const SIDEBAR_DEFS: { key: string; label: string; categoryMatch?: BuffCategory }[] = [
  { key: 'all', label: '全部' },
  { key: 'modifier', label: '属性修正', categoryMatch: 'modifier' as BuffCategory },
  { key: 'trigger', label: '触发', categoryMatch: 'trigger' as BuffCategory },
  { key: 'aura', label: '光环', categoryMatch: 'aura' as BuffCategory },
  { key: 'shield', label: '护盾', categoryMatch: 'shield' as BuffCategory },
  { key: 'control', label: '控制', categoryMatch: 'control' as BuffCategory },
  { key: 'dot', label: '持续伤害', categoryMatch: 'dot' as BuffCategory },
  { key: 'immunity', label: '免疫', categoryMatch: 'immunity' as BuffCategory },
  { key: 'other', label: '其他', categoryMatch: undefined },
]

// ==================== 属性字段 ====================

const attrFields: AttrOverrideItem[] = [
  { key: 'currentHealth', label: '气血', min: 0, max: 99999, steps: [100, 10, 1] },
  { key: 'currentEnergy', label: '能量', min: 0, max: 999, steps: [100, 10, 1] },
  { key: 'minAttack', label: '攻击', min: 0, max: 99999, steps: [100, 10, 1] },
  { key: 'defense', label: '防御', min: 0, max: 99999, steps: [100, 10, 1] },
  { key: 'speed', label: '速度', min: 0, max: 9999, steps: [100, 10, 1] },
]

// ==================== 属性名 → 中文（兜底：getAttrName 不认识的 ad-hoc 键） ====================

const ATTR_ALIAS: Record<string, string> = {
  dmgReduction: '伤害减免',
  HIT_RATE: '命中率',
  critDamageTaken: '暴击承伤',
  poisonResist: '毒抗',
  demonDamage: '对妖伤害',
  fireDamage: '火攻',
  fireDamageTaken: '火伤减免',
  waterDamageTaken: '水伤减免',
  slowImmune: '减速免疫',
  stunResist: '眩晕抵抗',
  knockbackResist: '击退抵抗',
  bleedResist: '流血抵抗',
  burnImmune: '灼烧免疫',
  burnDuration: '灼烧延长',
  skillCooldown: '技能冷却',
  webSuccessRate: '蛛网成功率',
  healEffect: '治疗效果',
  energyCost: '能量消耗',
}

/** 格式化属性修正为可读文本 */
function formatAttributes(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([key, val]) => {
      const cn = getAttrName(key as never) || ATTR_ALIAS[key] || key
      // 数值格式化：+1.0 → +1, +20% → +20%, -10 → -10
      const num = parseFloat(val)
      if (val.endsWith('%')) return `${cn}${val}`
      if (Math.abs(num) >= 1) return `${cn}+${Math.round(num)}`
      if (num > 0) return `${cn}+${Math.round(num * 100)}%`
      return `${cn}${val}`
    })
    .join('，')
}

// ==================== Methods ====================

function buildStatusesFromBuffs() {
  const buffList = Array.isArray(buffsData) ? buffsData : []
  return buffList.map((buff: BuffJsonEntry) => {
    const classification = classifyBuff(buff)
    const primaryFacet = classification.facets.length > 0 ? classification.facets[0] : 'other'
    return {
      id: buff.id,
      name: buff.name,
      primaryFacet,
      polarity: classification.polarity,
      duration: buff.duration !== undefined && buff.duration > 0 ? buff.duration : 0,
      effect: buff.description || buildEffectSummary(buff),
      active: false,
    }
  })
}

function buildEffectSummary(buff: BuffJsonEntry): string {
  const parts: string[] = []
  if (buff.attributes) {
    parts.push(formatAttributes(buff.attributes))
  }
  if (buff.aura) {
    const scope = buff.aura.targetSelector === 'allies' ? '全体友方' : buff.aura.targetSelector === 'enemies' ? '全体敌方' : '自身'
    parts.push(`光环·${scope}`)
  }
  if (buff.immunities?.length) {
    parts.push(`免疫:${buff.immunities.join('，')}`)
  }
  if (buff.controlType) {
    const ctrlNames: Record<string, string> = { stun: '眩晕', silence: '沉默', freeze: '冰冻', sleep: '睡眠', bind: '束缚' }
    parts.push(`控制:${ctrlNames[buff.controlType] || buff.controlType}`)
  }
  if (buff.triggers?.length) {
    const triggerNames: Record<string, string> = {
      apply_poison: '附加中毒', deal_dot_damage: '持续伤害',
      heal_percent_max_hp: '按比例回血', heal_lowest_hp_ally: '治疗最低友方',
      heal_all_allies: '全体回血', apply_shield: '附加护盾',
      reflect_damage: '反弹伤害', reflect_fire_damage: '反弹火伤',
      apply_debuff_to_attacker: '攻击者减益', cleanse_random_debuff: '净化减益',
      summon_unit: '召唤单位', apply_silence_to_attacker: '沉默攻击者',
    }
    const t = triggerNames[buff.triggers[0].scriptId]
    parts.push(`触发:${t || buff.triggers[0].scriptId}${buff.triggers.length > 1 ? `等${buff.triggers.length}个` : ''}`)
  }
  return parts.join(' | ')
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
    buffs: checked.map(s => ({ buffId: s.id, duration: s.duration })),
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
/* ═══ Tab 栏 ═══ */
.ce-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border-default);
  margin-bottom: var(--space-3);
}

.ce-tab {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  text-align: center;
}

.ce-tab:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-hover);
}

.ce-tab.active {
  color: var(--color-info);
  border-bottom-color: var(--color-info);
}

.ce-tab-content {
  min-height: 280px;
}

/* ═══ 角色选择器 ═══ */
.char-selector {
  flex: 1;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border-default);
  color: var(--color-text-primary);
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
  max-width: 160px;
}

.char-selector:focus {
  outline: none;
  border-color: var(--color-info);
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
  background: var(--color-bg-hover);
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

.ce-search {
  width: 100%;
  padding: var(--space-2) var(--space-2);
  margin-bottom: var(--space-2);
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  box-sizing: border-box;
}

.ce-search:focus {
  outline: none;
  border-color: var(--color-info);
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

.ce-status-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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

.ce-duration-input {
  width: 36px;
  padding: 1px 2px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  text-align: center;
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

.attr-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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

.reset-btn {
  width: 100%;
  text-align: center;
}
</style>
