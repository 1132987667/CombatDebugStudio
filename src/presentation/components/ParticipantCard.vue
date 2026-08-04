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
        Lv.{{ participant.level }} {{ participant.name }} {{ hpText }}
        <div class="member-action" v-if="isActive">
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
        :visible-attr-labels="buffDisplay.visibleAttrLabels" :collapsed-count="buffDisplay.collapsedCount"
        :expanded="panelVisible" @toggle="panelVisible = !panelVisible" @hover-attr="handleAttrHover"
        @hover-buff="handleBuffHover" @leave="handleBuffLeave" />
      <BuffTextPanel :visible="panelVisible" :participant-name="participant.name" :groups="buffDisplay.groups"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BattleEntity } from '@/domain/battle/type/types'
import BuffTextBar from '@/presentation/components/BuffTextBar.vue'
import BuffTextPanel from '@/presentation/components/BuffTextPanel.vue'
import { useBuffDisplay } from '@/presentation/composables/useBuffDisplay'
import { useSituationalAttributes } from '@/presentation/composables/useSituationalAttributes'
import type { BuffRawItem, MergedAttributeLine, BuffTextItem } from '@/shared/types/buff-display'

import { useBattleStore } from '@/presentation/stores/battleStore'
import { getActionBudget } from '@/shared/constants/animation-timing'
import { getAttrName, ATTRIBUTE_CODE } from '@/domain/attribute/types'

const props = defineProps<{
  /** 战斗参与者实例 */
  participant: BattleEntity
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

// 从 store 中获取显示调试信息状态
const battleStore = useBattleStore()
const showDebug = computed(() => battleStore.showDebug)

// 从投影层快照读取核心数值
const snap = computed(() => battleStore.participants.get(props.participant.id))

// 从快照派生 isAlive/hpPercent/energyPercent（回退到从实体直接读取）
const isAlive = computed(() => snap.value?.isAlive ?? props.participant.isAlive())
const hpPercent = computed(() => {
  if (snap.value) return snap.value.healthPercent
  const p = props.participant
  const maxHp = p.maxHealth
  return maxHp > 0 ? (p.currentHealth / maxHp) * 100 : 0
})
const energyPercent = computed(() => {
  if (snap.value) return snap.value.energyPercent
  const p = props.participant
  const maxEnergy = p.maxEnergy
  return maxEnergy > 0 ? (p.currentEnergy / maxEnergy) * 100 : 0
})

/** 气血 条过渡时长 = 50% 预算（匹配命中阶段 50%→100%T） */
const hpTransitionDuration = computed(() => {
  const budget = getActionBudget(battleStore.battleSpeed)
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
  // 优先使用投影层快照数据
  if (snap.value) {
    const cur = Math.max(0, Math.floor(snap.value.currentHealth))
    const max = Math.max(0, Math.floor(snap.value.maxHealth))
    return `${cur}/${max}`
  }
  // 回退到直接从 participant 实体读取
  const data = props.participant
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
  if (snap.value) {
    const curEnergy = Math.floor(snap.value.currentEnergy)
    const maxEnergy = Math.floor(snap.value.maxEnergy)
    return `${curEnergy}/${maxEnergy}`
  }
  const data = props.participant
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

/** 护盾值（来自投影层快照，源头是 BuffSystem.shieldValues） */
const shieldValue = computed(() => snap.value?.shield ?? 0)

/** 护盾占最大气血值的百分比（护盾无天然上限，以 maxHealth 为参照） */
const shieldPercent = computed(() => {
  const maxHp = snap.value?.maxHealth ?? 0
  return maxHp > 0 ? Math.min(100, (shieldValue.value / maxHp) * 100) : 0
})

const shieldText = computed(() => `${Math.floor(shieldValue.value)}`)

const buffListItems = computed((): BuffRawItem[] => snap.value?.buffs ?? [])

// === 纯文本 Buff 显示模式 ===
const panelVisible = ref(false)

const baseAttributes = computed(() => {
  const entity = props.participant
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
const buffDisplay = useBuffDisplay(buffListItems, props.participant.id, 5, baseAttributes)

// 情境属性 — 根据当前选中的目标动态计算激活的情境属性
const situationalAttrs = useSituationalAttributes(
  computed(() => props.participant),
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
  emit('click', props.participant.id)
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

/* ============ 卡片视觉状态动画 ============ */

/* 蓄力/施法 */
.member-card.casting {
  transform: translateY(-3px);
  box-shadow: 0 0 30px var(--color-brand-red), 0 6px 24px rgba(var(--rgb-black), 0.7);
  animation: cast-pulse 0.6s ease;
}

/* 受击 */
.member-card.hurt {
  animation: hurt-shake 0.45s cubic-bezier(.36, .07, .19, .97);
}

.member-card.hurt::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(var(--rgb-danger), var(--alpha-glow)), transparent 70%);
  pointer-events: none;
  animation: hurt-flash 0.45s ease;
}

/* 被治疗 */
.member-card.healed {
  animation: heal-glow 0.8s ease;
}

/* 被加护盾 */
.member-card.shielded {
  animation: shield-glow 0.8s ease;
}

/* 气血 条闪光 */
.hp-fill.hp-flash {
  animation: hp-bar-flash 0.8s ease;
}
</style>
