<!--
  参与者卡片组件
  显示参与者的属性和状态信息
-->
<template>
  <div class="member-card" ref="cardRef" :class="[cardClasses, cardVisualStateClass]" role="button" tabindex="0"
    @click="handleClick" @keydown.enter="handleClick" @keydown.space.prevent="handleClick">
    <div class="member-info">
      <!-- 名称和行动标识 -->
      <div class="member-name">
        <template v-if="displayLevel > 0">Lv.{{ displayLevel }} </template>
        <span v-if="affixTags.length > 0" class="member-affixes">【<span v-for="(a, i) in affixTags" :key="a.id"
            class="affix-tag" :class="'affix-q' + a.rarity" @mouseenter="showAffixTooltip(a.affix, $event)"
            @mouseleave="clearAffixTooltip">{{ i > 0 ? '、' : '' }}{{ a.name }}</span>】</span>
        <span class="ml-2" :class="isEnemy ? 'name--enemy' : 'name--ally'">{{ displayName }}</span> {{ hpText }}
        <div class="member-action ml-2" v-if="isActive">
          <span :class="['acting-badge', { 'enemy-acting': isEnemy }]">←操作中</span>
        </div>
      </div>

      <!-- 气血值条 -->
      <div class="member-hp">
        <div class="hp-bar">
          <div class="hp-fill" :class="[hpColorClass, { 'hp-flash': hpFlash }]"
            :style="{ width: hpPercent + '%', transition: `width ${hpTransitionDuration}` }">
            <div class="pulse"></div>
          </div>
          <span class="bar-text">{{ hpText }}</span>
        </div>
      </div>

      <!-- 能量条 -->
      <div class="member-energy">
        <div class="energy-bar">
          <div class="energy-ticks">
            <div class="tick"></div>
            <div class="tick"></div>
            <div class="tick"></div>
          </div>
          <div class="energy-fill" :class="energyColorClass" :style="{ width: energyPercent + '%' }">
            <div class="pulse"></div>
          </div>
          <span class="bar-text">{{ energyText }}</span>
        </div>
      </div>

      <!-- 护盾条（始终渲染，无护盾时填充宽度为 0） -->
      <div class="member-shield">
        <div class="shield-bar">
          <div class="shield-fill" :style="{ width: shieldPercent + '%' }">
            <div class="pulse"></div>
          </div>
          <span class="bar-text">{{ shieldText }}</span>
        </div>
      </div>

      <!-- 情境属性标签（选中目标/准备技能时动态显示） -->
      <div v-if="situationalAttrs.length > 0" class="situational-tags">
        <span v-for="tag in situationalAttrs" :key="tag.code" class="situational-tag" :class="'tag-' + tag.group">
          {{ tag.label }} +{{ tag.value }}%
        </span>
      </div>

      <!-- Buff 列表：纯文本展示 -->
      <BuffTextBar :control-labels="buffDisplay.controlLabels" :merged-labels="buffDisplay.mergedLabels"
        :visible-attr-labels="buffDisplay.visibleAttrLabels" :plain-labels="plainBuffLabels"
        :collapsed-count="buffDisplay.collapsedCount"
        :expanded="panelVisible" @toggle="panelVisible = !panelVisible" @hover-attr="handleAttrHover"
        @hover-buff="handleBuffHover" @leave="handleBuffLeave" />
      <BuffTextPanel :visible="panelVisible" :participant-name="displayName" :groups="buffDisplay.groups"
        :long-duration-items="buffDisplay.longDurationItems" :merged-labels="buffDisplay.mergedLabels"
        :debug-mode="showDebug" @close="panelVisible = false" />
      <!-- 属性/Buff 悬停追溯浮层 -->
      <Teleport to="body">
        <transition name="tooltip-fade">
          <div v-if="hoveredAttr" class="attr-breakdown" :style="{ left: hoverPos.x + 'px', top: hoverPos.y + 'px' }"
            @mouseenter="clearHoverTimer" @mouseleave="scheduleLeave">
            <div class="breakdown-header">{{ hoveredAttr.attribute }}：{{ formatBreakdownTotal(hoveredAttr) }}</div>
            <div class="breakdown-sources">
              <div v-for="(src, i) in hoveredAttr.sources" :key="i" class="breakdown-source"
                :class="src.percent > 0 ? 'source-buff' : 'source-debuff'">
                <span class="source-name">{{ src.buffName }}</span>
                <span class="source-value">{{ src.percent > 0 ? '+' : '' }}{{ src.percent }}%</span>
                <span class="source-meta">{{ src.remainingTurns > 0 ? `${src.remainingTurns}回合` : '永久' }}</span>
              </div>
            </div>
          </div>
          <div v-else-if="hoveredBuff" class="attr-breakdown"
            :style="{ left: hoverPos.x + 'px', top: hoverPos.y + 'px' }" @mouseenter="clearHoverTimer"
            @mouseleave="scheduleLeave">
            <div class="breakdown-header">【{{ hoveredBuff.name }}】</div>
            <div class="breakdown-body flex flex-col gap-1">
              <div v-if="hoveredBuff.description" class="breakdown-desc">{{ hoveredBuff.description }}</div>
              <div class="breakdown-meta">
                <span v-if="hoveredBuff.remainingTurns > 0">{{ hoveredBuff.remainingTurns }}回合</span>
                <span v-else>永久</span>
                <span v-if="hoveredBuff.stacks > 1"> · ×{{ hoveredBuff.stacks }}层</span>
                <span v-if="hoveredBuff.condition === 'active'" class="meta-active"> · 已激活</span>
                <span v-if="hoveredBuff.condition === 'inactive'" class="meta-inactive"> · 未激活</span>
              </div>
              <div v-if="parsedBuffEffects.length > 0" class="breakdown-effects">
                <div v-for="(eff, i) in parsedBuffEffects" :key="i" class="breakdown-effect" :class="eff.className">
                  ● {{ eff.text }}
                </div>
              </div>
            </div>
          </div>
        </transition>
      </Teleport>
      <!-- 词缀悬浮效果（EntityTooltip 渲染 Teleport fragment，悬停保活由组件内部 onTooltipEnter/Leave 负责，
           宿主只经 @hide 清理状态，传 DOM 事件会被 Vue 告警且不生效） -->
      <EntityTooltip :visible="!!hoveredAffix" :data="affixTooltipData" :trigger-rect="affixHoverPos"
        @hide="hoveredAffix = null" />
    </div>
  </div>
</template>

<script lang="ts">
import type { BuffRawItem } from '@/shared/types/buff-display'

/**
 * 纯数据注入（回放/静态场景）：ParticipantCard 在无领域实体与 battleStore 快照时的展示数据契约。
 * 提供 displayData 时优先于 participant 实体与投影快照；缺省字段（level/shield/isAlive）走默认值。
 */
export interface ParticipantDisplayData {
  id: string
  name: string
  level?: number
  maxHp: number
  hp: number
  maxEnergy: number
  energy: number
  shield?: number
  buffs: BuffRawItem[]
  isAlive?: boolean
  /** 战斗倍速（HP 条过渡时长跟随；缺省按 1× 预算） */
  speed?: number
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BattleEntity } from '@/domain/battle/type/types'
import BuffTextBar from '@/presentation/components/BuffTextBar.vue'
import BuffTextPanel from '@/presentation/components/BuffTextPanel.vue'
import EntityTooltip from '@/presentation/components/EntityTooltip.vue'
import type { TooltipData } from '@/application/projection/LogTooltipResolver'
import { useBuffDisplay } from '@/presentation/composables/useBuffDisplay'
import { useSituationalAttributes } from '@/presentation/composables/useSituationalAttributes'
import type { BuffRawItem, MergedAttributeLine, BuffTextItem } from '@/shared/types/buff-display'

import { useBattleStore } from '@/presentation/stores/battleStore'
import { getActionBudget } from '@/shared/constants/animation-timing'
import { getAttrName, ATTRIBUTE_CODE } from '@/domain/attribute/types'
import type { AffixData, AffixLibraryData } from '@/domain/fengshen/types'
import { AFFIX_RARITY_COLORS, affixRarityName } from '@/shared/constants/affix'
import affixLibraryRaw from '@configs/affixes/affixes.json'

const props = defineProps<{
  /** 战斗参与者实例（displayData 注入时可为空） */
  participant?: BattleEntity
  /** 纯数据注入（回放/静态场景）；提供时优先于 participant 与 battleStore 快照 */
  displayData?: ParticipantDisplayData
  /** 是否当前行动者 */
  isActive?: boolean
  /** 是否选中 */
  isSelected?: boolean
  /** 是否敌方 */
  isEnemy?: boolean
  /** 当前选中的目标（情境属性高亮用） */
  targetEntity?: BattleEntity | null
  /** 强制触发重渲染的 tick 值 —— 每回合递增，让 shouldUpdateComponent 检测到 prop 变化 */
  turnTick?: number
}>()

const emit = defineEmits<{
  click: [participantId: string]
}>()

// displayData 注入时无需 battleStore（回放舞台无活战场，纯数据驱动）
const battleStore = props.displayData ? null : useBattleStore()
const showDebug = computed(() => battleStore?.showDebug ?? false)

// 纯数据注入模式（回放/静态）：displayData 提供时优先，跳过实体与 battleStore 快照
const display = computed(() => props.displayData ?? null)
const entityId = computed(() => display.value?.id ?? props.participant?.id ?? '')

// 从投影层快照读取核心数值（displayData 注入时跳过 store 查询）
const snap = computed(() =>
  display.value ? null : props.participant ? (battleStore?.participants.get(props.participant.id) ?? null) : null,
)

const displayLevel = computed(() => display.value?.level ?? props.participant?.level ?? 0)
const displayName = computed(() => display.value?.name ?? props.participant?.name ?? '')

// ============ 词缀展示 ============
// 词缀库索引（id → 词缀）；词缀经 applyAffixToParticipant 以 `affix:${id}` 修饰符注入实体属性
const AFFIX_INDEX = new Map<string, AffixData>()
for (const affix of (affixLibraryRaw as AffixLibraryData).affixes) {
  AFFIX_INDEX.set(affix.id, affix)
}

/** 角色带有的词缀（从实体属性修饰符提取 affix: 前缀 sourceKey，回放纯数据模式无词缀信息）
 * NOTE: modifiers 数组本身非响应式，依赖投影快照 version（词缀注入 → recalcAll → 投影刷新 → version 变化）触发重算 */
const affixTags = computed(() => {
  const entity = props.participant
  if (!entity) return []
  void snap.value?.version
  const ids = new Set<string>()
  for (const code of Object.values(ATTRIBUTE_CODE)) {
    const attrVal = entity.getAttrValue(code)
    for (const mod of attrVal?.modifiers ?? []) {
      if (mod.sourceKey.startsWith('affix:')) ids.add(mod.sourceKey.slice('affix:'.length))
    }
  }
  return [...ids]
    .map((id) => AFFIX_INDEX.get(id))
    .filter((a): a is AffixData => !!a)
    .map((a) => ({ id: a.id, name: a.name, rarity: a.rarity ?? 1, affix: a }))
})

/** 品阶名（1-5 → 凡/精/超/绝/神） */
function affixQuality(rarity: number): string {
  return affixRarityName(rarity)
}

/** 词缀悬浮数据（复用 EntityTooltip 契约） */
const hoveredAffix = ref<AffixData | null>(null)
const affixHoverPos = ref<DOMRect | null>(null)

function showAffixTooltip(a: AffixData, event: MouseEvent): void {
  hoveredAffix.value = a
  affixHoverPos.value = (event.currentTarget as HTMLElement).getBoundingClientRect()
}

/** 鼠标离开词缀 tag 即清除悬浮（tooltip 内保活由 EntityTooltip 内部 onTooltipEnter/Leave 负责，
 *  宿主经 @hide 清除 hoveredAffix —— 与 BattleLog（战斗心经）/PackItemCard 悬浮范式一致，避免 Teleport 下双隐藏通道） */
function clearAffixTooltip(): void {
  hoveredAffix.value = null
  affixHoverPos.value = null
}

/** 词缀悬浮卡片数据（明细 = 各属性修正百分比） */
const affixTooltipData = computed<TooltipData | null>(() => {
  const a = hoveredAffix.value
  if (!a) return null
  const rarity = a.rarity ?? 1
  const color = AFFIX_RARITY_COLORS[Math.max(0, Math.min(4, rarity - 1))]
  return {
    name: a.name,
    description: a.description ?? '',
    badge: `${affixQuality(rarity)}品`,
    nameColor: color,
    badgeColor: color,
    details: a.statModifiers.map((m) => ({
      label: getAttrName(m.attribute),
      value: `${m.percent > 0 ? '+' : ''}${m.percent}%`,
    })),
    source: a.drop_hint ? `掉落倾向：${a.drop_hint}` : undefined,
  }
})

// 从快照派生 isAlive/hpPercent/energyPercent（回退到从实体直接读取）
const isAlive = computed(() => {
  if (display.value) return display.value.isAlive ?? display.value.hp > 0
  return snap.value?.isAlive ?? props.participant?.isAlive() ?? true
})
const hpPercent = computed(() => {
  if (display.value) return display.value.maxHp > 0 ? (display.value.hp / display.value.maxHp) * 100 : 0
  if (snap.value) return snap.value.healthPercent
  const p = props.participant
  if (!p) return 0
  const maxHp = p.maxHealth
  return maxHp > 0 ? (p.currentHealth / maxHp) * 100 : 0
})
const energyPercent = computed(() => {
  if (display.value) return display.value.maxEnergy > 0 ? (display.value.energy / display.value.maxEnergy) * 100 : 0
  if (snap.value) return snap.value.energyPercent
  const p = props.participant
  if (!p) return 0
  const maxEnergy = p.maxEnergy
  return maxEnergy > 0 ? (p.currentEnergy / maxEnergy) * 100 : 0
})

/** 气血 条过渡时长 = 50% 预算（匹配命中阶段 50%→100%T）；displayData 带 speed 时跟随回放倍速 */
const hpTransitionDuration = computed(() => {
  const budget = getActionBudget(display.value?.speed ?? battleStore?.battleSpeed ?? 1)
  return `${budget * 0.5}ms`
})

// 卡片引用
const cardRef = ref<HTMLElement | null>(null)

// ============ 卡片视觉状态（正在施放技能（吟唱/前摇）、受到伤害、被治疗、获得护盾） ============
type CardVisualState = 'casting' | 'hurt' | 'healed' | 'shielded'
const cardVisualState = ref<CardVisualState | null>(null)
const hpFlash = ref(false)

/**
 * 触发卡片视觉状态，自动在动画结束后清除
 */
function triggerVisualState(state: CardVisualState, duration: number = 800) {
  cardVisualState.value = state
  setTimeout(() => {
    if (cardVisualState.value === state) cardVisualState.value = null
  }, duration)
}

/**
 * 气血 条闪光（治疗时）
 */
function flashHpBar(budget?: number) {
  hpFlash.value = true
  // NOTE: HP条闪光时长 = 命中阶段 50%T（与 气血 过渡时长一致）
  const flashDuration = budget ? budget * 0.5 : 800
  setTimeout(() => { hpFlash.value = false }, flashDuration)
}

const cardVisualStateClass = computed(() => {
  if (!cardVisualState.value) return {}
  return { [cardVisualState.value]: true }
})

// 计算属性
const isDead = computed(() => !isAlive)
const cardClasses = computed(() => ({
  'active': props.isActive,
  'dead': isDead.value,
  'selected': props.isSelected,
}))

const hpText = computed(() => {
  // 纯数据注入优先
  if (display.value) {
    const cur = Math.max(0, Math.floor(display.value.hp))
    const max = Math.max(0, Math.floor(display.value.maxHp))
    return `${cur}/${max}`
  }
  // 优先使用投影层快照数据
  if (snap.value) {
    const cur = Math.max(0, Math.floor(snap.value.currentHealth))
    const max = Math.max(0, Math.floor(snap.value.maxHealth))
    return `${cur}/${max}`
  }
  // 回退到直接从 participant 实体读取
  const data = props.participant
  if (!data) return `0/0`
  const currentHealth = Math.max(0, Math.floor(data.currentHealth || 0))
  const maxHealth = Math.max(0, Math.floor(data.maxHealth || 0))
  return `${currentHealth}/${maxHealth}`
})

const hpColorClass = computed(() => {
  const hpPct = hpPercent.value
  if (hpPct <= 25) return 'low'
  if (hpPct <= 50) return 'medium'
  return 'high'
})

const energyText = computed(() => {
  if (display.value) {
    const curEnergy = Math.floor(display.value.energy)
    const maxEnergy = Math.floor(display.value.maxEnergy)
    return `${curEnergy}/${maxEnergy}`
  }
  if (snap.value) {
    const curEnergy = Math.floor(snap.value.currentEnergy)
    const maxEnergy = Math.floor(snap.value.maxEnergy)
    return `${curEnergy}/${maxEnergy}`
  }
  const data = props.participant
  if (!data) return `0/0`
  const energy = Math.floor(data.currentEnergy || 0)
  const maxEnergy = Math.floor(data.maxEnergy || 0)
  return `${energy}/${maxEnergy}`
})

const energyColorClass = computed(() => {
  const energyPct = energyPercent.value
  if (energyPct >= 80) return 'full'
  if (energyPct >= 50) return 'medium'
  return 'low'
})

/** 护盾值（displayData 注入优先，其次投影层快照，源头是 BuffSystem.shieldValues） */
const shieldValue = computed(() => (display.value ? (display.value.shield ?? 0) : snap.value?.shield ?? 0))

/** 护盾占最大气血值的百分比（护盾无天然上限，以 maxHealth 为参照） */
const shieldPercent = computed(() => {
  const maxHp = display.value ? display.value.maxHp : (snap.value?.maxHealth ?? 0)
  return maxHp > 0 ? Math.min(100, (shieldValue.value / maxHp) * 100) : 0
})

const shieldText = computed(() => `${Math.floor(shieldValue.value)}`)

const buffListItems = computed((): BuffRawItem[] => (display.value ? display.value.buffs : (snap.value?.buffs ?? [])))

// === 纯文本 Buff 显示模式 ===
const panelVisible = ref(false)

const baseAttributes = computed(() => {
  const entity = props.participant
  if (!entity) return {}
  const map: Record<string, number> = {}
  for (const code of Object.values(ATTRIBUTE_CODE)) {
    const attrValue = entity.getAttrVal(code)
    if (attrValue && typeof attrValue.base === 'number') {
      map[getAttrName(code)] = attrValue.base
    }
  }
  return map
})

// ponytail: 参与者 ID 在气血周期内不变，直接读取
const buffDisplay = useBuffDisplay(buffListItems, entityId.value, 5, baseAttributes)

/** 无属性修饰且非控制的普通 Buff：纯名字标签（回放存档仅 name/stacks/turns，仍须在卡片上可见） */
const plainBuffLabels = computed<BuffTextItem[]>(() =>
  buffDisplay.value.items.filter((i) => !i.controlType && i.modifiers.length === 0),
)

// 情境属性 — 根据当前选中的目标动态计算激活的情境属性
const situationalAttrs = useSituationalAttributes(
  computed(() => props.participant ?? null),
  computed(() => props.targetEntity ?? null),
  ref(null), // ponytail: skill 上下文暂未接入，未来从技能选中状态传递
  computed(() => snap.value?.version ?? 0), // 版本戳变化时重新求值
)


// === 属性/Buff 悬停追溯 ===
const hoveredAttr = ref<MergedAttributeLine | null>(null)
const hoveredBuff = ref<BuffTextItem | null>(null)
const hoverPos = ref({ x: 0, y: 0 })
let leaveTimer: ReturnType<typeof setTimeout> | null = null

function clearHoverTimer() {
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null }
}

function scheduleLeave() {
  clearHoverTimer()
  leaveTimer = setTimeout(() => {
    hoveredAttr.value = null
    hoveredBuff.value = null
  }, 150)
}

function handleAttrHover(attr: MergedAttributeLine, event: MouseEvent) {
  clearHoverTimer()
  hoveredAttr.value = attr
  hoveredBuff.value = null
  hoverPos.value = { x: event.clientX + 12, y: event.clientY - 8 }
}

function handleBuffHover(item: BuffTextItem, event: MouseEvent) {
  clearHoverTimer()
  hoveredBuff.value = item
  hoveredAttr.value = null
  hoverPos.value = { x: event.clientX + 12, y: event.clientY - 8 }
}

function handleBuffLeave() {
  scheduleLeave()
}

function formatBreakdownTotal(attr: MergedAttributeLine): string {
  const prefix = attr.totalPercent > 0 ? '+' : ''
  return `${prefix}${attr.totalPercent}%`
}

/** 悬停 buff 浮层的效果行：修饰符 → 显示文本 */
const parsedBuffEffects = computed(() => {
  const b = hoveredBuff.value
  if (!b) return []
  const lines: Array<{ text: string; className: string }> = []
  for (const mod of b.modifiers) {
    const arrow = mod.value > 0 ? '↑' : '↓'
    const suffix = mod.isFlat ? '' : '%'
    lines.push({
      text: `${mod.attribute}${arrow}${Math.abs(mod.value)}${suffix}`,
      className: mod.value > 0 ? 'effect--buff' : 'effect--debuff',
    })
  }
  for (const el of b.effectLines) {
    lines.push({ text: el.text, className: `effect--${el.kind}` })
  }
  return lines
})

// 调试信息
const showBreakdown = ref(false)

// 事件处理
const handleClick = () => {
  if (entityId.value) emit('click', entityId.value)
}

// 暴露卡片引用给父组件（用于动画）
defineExpose({
  cardRef,
  triggerVisualState,
  flashHpBar,
})

</script>

<style scoped>
/* 情境属性标签行 */
.situational-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 2px 8px;
  margin: 2px 0;
}

.situational-tag {
  font-size: 0.75em;
  padding: 1px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.situational-tag.tag-offense {
  background: rgba(var(--rgb-live), var(--alpha-wash));
  color: var(--color-live);
  border: 1px solid rgba(var(--rgb-live), var(--alpha-border));
}

.situational-tag.tag-elemental {
  background: rgba(var(--rgb-energy), var(--alpha-tint));
  color: var(--color-energy-deep);
  border: 1px solid rgba(var(--rgb-energy), var(--alpha-border));
}

.situational-tag.tag-control {
  background: rgba(var(--rgb-debuff), var(--alpha-wash));
  color: var(--color-debuff);
  border: 1px solid rgba(var(--rgb-debuff), var(--alpha-border));
}

/* 复用原有 member-card 样式 */
.debug-info {
  margin-top: var(--space-2);
  padding: var(--space-2);
  background: rgba(var(--rgb-black), var(--alpha-border));
  border-radius: var(--radius-sm);
}

.debug-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.debug-row .label {
  color: var(--color-text-tertiary);
  min-width: 40px;
}

.debug-row .value {
  color: var(--color-text-secondary);
  font-family: 'Courier New', monospace;
}

.debug-row .breakdown {
  cursor: pointer;
  opacity: 0.6;
  transition: opacity var(--transition-fast);
}

.debug-row .breakdown:hover {
  opacity: 1;
}

.breakdown-details {
  margin-top: var(--space-2);
  padding: var(--space-2);
  background: rgba(var(--rgb-black), var(--alpha-wash-strong));
  border-radius: 4px;
  border-left: 2px solid var(--color-energy);
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  padding: var(--space-1) 0;
  font-family: 'Courier New', monospace;
}

.breakdown-item .key {
  color: var(--color-text-tertiary);
}

.breakdown-item .value {
  color: var(--color-energy);
}

/* ============ 属性悬停追溯浮层 ============ */
.attr-breakdown {
  position: fixed;
  z-index: var(--z-tooltip, 1000);
  min-width: 220px;
  background: var(--color-overlay-panel);
  border: 1px solid var(--border-common-color-dark);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  box-shadow: 0 8px 24px rgba(var(--rgb-black), var(--alpha-glow));
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.breakdown-header {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-bold);
  padding-bottom: var(--space-1);
  margin-bottom: var(--space-1);
  border-bottom: 1px solid var(--border-common-color-dark);
  white-space: nowrap;
}


.breakdown-desc {
  color: var(--color-text-tertiary);
}

.breakdown-meta {
  color: var(--color-text-disabled);
}

.breakdown-effects {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-1);
}

.breakdown-effect {
  padding-left: var(--space-1);
}

.breakdown-sources {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.breakdown-source {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}

.source-buff .source-value {
  color: var(--color-energy);
  font-weight: var(--font-weight-bold);
}

.source-debuff .source-value {
  color: var(--color-danger);
}

.source-name {
  color: var(--color-text-tertiary);
  flex: 1;
}

.source-meta {
  color: var(--color-text-disabled);
}

</style>
