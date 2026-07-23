<!--
  参与者卡片组件
  显示参与者的属性和状态信息
-->
<template>
  <div class="member-card" ref="cardRef" :class="[cardClasses, cardVisualStateClass]" @click="handleClick">
    <!-- 内部浮动数字列表 -->
    <div class="floating-numbers">
      <div v-for="num in damageNumbers" :key="num.id" class="damage-number"
        :class="[num.type, { critical: num.isCritical }]" :style="{
          left: num.x + 'px',
          top: num.y + 'px',
          animationDuration: num.duration + 'ms',
        }" @animationend="removeDamageNumber(num.id)">
        {{ num.text }}
      </div>
    </div>

    <div class="member-info">
      <!-- 名称和行动标识 -->
      <div class="member-name">
        Lv.{{ participant.level }} {{ participant.name }}
        <div class="member-action" v-if="isActive">
          <span :class="['acting-badge', { 'enemy-acting': isEnemy }]">←操作中</span>
        </div>
      </div>

      <!-- 生命值条 -->
      <div class="member-hp">
        <span class="hp-text">{{ hpText }}</span>
        <div class="hp-bar">
          <div class="hp-fill" :class="[hpColorClass, { 'hp-flash': hpFlash }]" :style="{ width: hpPercent + '%' }">
          </div>
        </div>
      </div>

      <!-- 能量条 -->
      <div class="member-energy">
        <span class="energy-text">{{ energyText }}</span>
        <div class="energy-bar">
          <div class="energy-ticks">
            <div class="tick"></div>
            <div class="tick"></div>
            <div class="tick"></div>
            <div class="tick"></div>
          </div>
          <div class="energy-fill" :class="energyColorClass" :style="{ width: energyPercent + '%' }"></div>
        </div>
      </div>

      <!-- 情境属性标签（选中目标/准备技能时动态显示） -->
      <div v-if="situationalAttrs.length > 0" class="situational-tags">
        <span v-for="tag in situationalAttrs" :key="tag.code" class="situational-tag"
          :class="'tag-' + tag.group">
          {{ tag.label }} +{{ tag.value }}%
        </span>
      </div>

      <!-- Buff 列表：纯文本展示 -->
      <BuffTextBar
        :control-labels="buffDisplay.controlLabels"
        :merged-labels="buffDisplay.mergedLabels"
        :visible-attr-labels="buffDisplay.visibleAttrLabels"
        :collapsed-count="buffDisplay.collapsedCount"
        :expanded="panelVisible"
        @toggle="panelVisible = !panelVisible"
        @hover-attr="handleAttrHover"
        @hover-buff="handleBuffHover"
        @leave="handleBuffLeave"
      />
      <BuffTextPanel
        :visible="panelVisible"
        :participant-name="participant.name"
        :groups="buffDisplay.groups"
        :secondary-groups="buffDisplay.secondaryGroups"
        :merged-labels="buffDisplay.mergedLabels"
        :debug-mode="showDebug"
        @close="panelVisible = false"
      />
      <!-- 属性/Buff 悬停追溯浮层 -->
      <Teleport to="body">
        <transition name="tooltip-fade">
          <div
            v-if="hoveredAttr"
            class="attr-breakdown"
            :style="{ left: hoverPos.x + 'px', top: hoverPos.y + 'px' }"
            @mouseenter="clearHoverTimer"
            @mouseleave="scheduleLeave"
          >
            <div class="breakdown-header">{{ hoveredAttr.attribute }}：{{ formatBreakdownTotal(hoveredAttr) }}</div>
            <div class="breakdown-sources">
              <div
                v-for="(src, i) in hoveredAttr.sources"
                :key="i"
                class="breakdown-source"
                :class="src.percent > 0 ? 'source-buff' : 'source-debuff'"
              >
                <span class="source-name">{{ src.buffName }}</span>
                <span class="source-value">{{ src.percent > 0 ? '+' : '' }}{{ src.percent }}%</span>
                <span class="source-meta">{{ src.remainingTurns > 0 ? `${src.remainingTurns}回合` : '永久' }}</span>
              </div>
            </div>
          </div>
          <div
            v-else-if="hoveredBuff"
            class="attr-breakdown"
            :style="{ left: hoverPos.x + 'px', top: hoverPos.y + 'px' }"
            @mouseenter="clearHoverTimer"
            @mouseleave="scheduleLeave"
          >
            <div class="breakdown-header">【{{ hoveredBuff.name }}】</div>
            <div class="breakdown-body">
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
import { computed, ref, toRef } from 'vue'
import type { BattleEntity } from '@/domain/battle/type/types'
import { ActionResultType } from '@/domain/battle/type/types'
import { useBattleParticipant } from '@/presentation/composables/useBattleParticipant'
import BuffTextBar from '@/presentation/components/BuffTextBar.vue'
import BuffTextPanel from '@/presentation/components/BuffTextPanel.vue'
import { useBuffDisplay } from '@/presentation/composables/useBuffDisplay'
import { useSituationalAttributes } from '@/presentation/composables/useSituationalAttributes'
import type { BuffRawItem, MergedAttributeLine, BuffTextItem } from '@/shared/types/buff-display'
import { container } from '@/infrastructure/di/Container'
import type { BuffSystem } from '@/domain/buff/BuffSystem'
import { useBattleStore } from '@/presentation/stores/battleStore'

// 浮动数字接口
interface FloatingNumber {
  id: number
  x: number
  y: number
  text: string
  type: ActionResultType
  isCritical: boolean
  duration: number
}

const props = defineProps<{
  /** 战斗参与者实例 */
  participant: BattleEntity
  /** 是否当前行动者 */
  isActive?: boolean
  /** 是否选中 */
  isSelected?: boolean
  /** 是否敌方 */
  isEnemy?: boolean
  /** 卡片引用 ID（用于动画） */
  cardRefId?: string
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

// 使用 composable 包装参与者
const { participant: reactiveParticipant, stats, isAlive, hpPercent, energyPercent } = useBattleParticipant(toRef(props, 'participant'))

const buffSystem = container.resolve<BuffSystem>('BuffSystem')

// 卡片引用
const cardRef = ref<HTMLElement | null>(null)

// 浮动数字管理
const damageNumbers = ref<FloatingNumber[]>([])
const nextNumberId = ref(0)

/**
 * 添加浮动数字
 * @param value 伤害/治疗值
 * @param type 类型：damage | heal | critical | miss
 * @param isCritical 是否暴击
 * @param x 横坐标（百分比，0-100）
 * @param y 纵坐标（百分比，0-100）
 */
function addDamageNumber(
  value: number,
  type: ActionResultType,
  isCritical: boolean = false,
  x: number = 50,
  y: number = 20
) {
  const id = nextNumberId.value++
  const text = type === ActionResultType.MISS ? '闪避' : (type === ActionResultType.HEAL ? `+${value}` : `-${value}`)
  const duration = isCritical ? 1500 : 1000 // 暴击动画更长

  damageNumbers.value.push({
    id,
    x,
    y,
    text,
    type,
    isCritical,
    duration
  })
}

/**
 * 移除浮动数字（动画结束后调用）
 */
function removeDamageNumber(id: number) {
  const index = damageNumbers.value.findIndex(n => n.id === id)
  if (index !== -1) {
    damageNumbers.value.splice(index, 1)
  }
}

// ============ 卡片视觉状态（casting/hurt/healed/shielded） ============
const cardVisualState = ref<string | null>(null)
const hpFlash = ref(false)

/**
 * 触发卡片视觉状态，自动在动画结束后清除
 */
function triggerVisualState(state: 'casting' | 'hurt' | 'healed' | 'shielded', duration: number = 800) {
  cardVisualState.value = state
  setTimeout(() => {
    if (cardVisualState.value === state) cardVisualState.value = null
  }, duration)
}

/**
 * HP 条闪光（治疗时）
 */
function flashHpBar() {
  hpFlash.value = true
  setTimeout(() => { hpFlash.value = false }, 800)
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
  const data = stats.value
  const currentHealth = Math.max(0, Math.floor(data.currentHealth?.value || 0))
  const maxHealth = Math.max(0, Math.floor(data.maxHealth?.value || 0))
  return `${currentHealth}/${maxHealth}`
})

const hpColorClass = computed(() => {
  const hpPct = hpPercent
  if (hpPct <= 25) return 'low'
  if (hpPct <= 50) return 'medium'
  return 'high'
})

const energyText = computed(() => {
  const data = stats.value
  const energy = Math.floor(data.energy?.value || 0)
  const maxEnergy = Math.floor(data.maxEnergy?.value || 0)
  return `${energy}/${maxEnergy}`
})

const energyColorClass = computed(() => {
  const energyPct = energyPercent
  if (energyPct >= 80) return 'full'
  if (energyPct >= 50) return 'medium'
  return 'low'
})

/** 转换为纯文本 Buff 展示数据 — 合并 BuffSystem 实例 + InterventionManager 手动状态 */
const buffListItems = computed((): BuffRawItem[] => {
  // ponytail: 读取 participantRef.value 建立 Vue 响应式依赖（syncTeams 更新包裹时重算）
  void reactiveParticipant.value?.statsVersion

  const entity = reactiveParticipant.value
  const result: BuffRawItem[] = []
  const seenIds = new Set<string>()


  // 源1: BuffSystem 管理的 buff（被动/技能/脚本添加）
  if (typeof entity.getBuffInstanceIds === 'function') {
    const instanceIds = entity.getBuffInstanceIds()
    for (const id of instanceIds) {
      const instance = buffSystem.getBuffInstanceById(id)
      if (!instance) continue
      const config = instance.context.config
      if (config) {
        seenIds.add(id)
        // ponytail: 同时记录 config.id（buffId），用于源2的去重比较
        // 源2的条目使用效果ID（如 "burn"）而非实例ID（如 "char1_burn_0_5"）
        seenIds.add(config.id)
        result.push({
          id,
          buffId: config.id,
          name: config.name,
          description: config.description ?? '',
          remainingTurns: instance.remainingTurns,
          currentStacks: instance.currentStacks,
          isDebuff: config.isDebuff === true,
          attributes: config.attributes,
          effectLines: instance.effectLines ?? [],
          conditionState: instance.conditionState,
        })
      }
    }
  }

  // 源2: InterventionManager 维护的手动状态（兼容层 — 干预系统/回放系统依赖此字段）
  const manualEffects = entity.statusEffects ?? []
  for (const s of manualEffects) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id)
      result.push({
        id: s.id,
        buffId: s.id,
        name: s.name,
        description: '',
        remainingTurns: s.remainingTurns,
        currentStacks: 1,
        isDebuff: s.type === 'debuff',
        effectLines: [],
        conditionState: undefined,
      })
    }
  }

  return result
})

// === 纯文本 Buff 显示模式 ===
const panelVisible = ref(false)

// 从 stats 提取基础属性值（key=中文属性名）
const ATTRIBUTE_CODE_TO_CN: Record<string, string> = {
  attack: '攻击',
  defense: '防御',
  speed: '速度',
  critRate: '暴击',
  critDamage: '暴伤',
  damageReduction: '伤害减免',
  healing: '受疗',
  hitRate: '命中',
  dodgeRate: '闪避',
}
const baseAttributes = computed(() => {
  const s = stats.value
  const map: Record<string, number> = {}
  for (const [code, cn] of Object.entries(ATTRIBUTE_CODE_TO_CN)) {
    const attr = (s as unknown as Record<string, { base: number } | undefined>)[code]
    if (attr && typeof attr.base === 'number') {
      map[cn] = attr.base
    }
  }
  return map
})

// ponytail: 参与者 ID 在生命周期内不变，直接读取
const buffDisplay = useBuffDisplay(buffListItems, props.participant.id, 5, baseAttributes)

// 情境属性 — 根据当前选中的目标动态计算激活的情境属性
const situationalAttrs = useSituationalAttributes(
  computed(() => props.participant),
  computed(() => props.targetEntity ?? null),
  ref(null), // ponytail: skill 上下文暂未接入，未来从技能选中状态传递
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
    lines.push({
      text: `${mod.attribute}${arrow}${Math.abs(mod.value)}%`,
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

const toggleBreakdown = () => {
  showBreakdown.value = !showBreakdown.value
}

const formatBreakdownKey = (key: string) => {
  const keyMap: Record<string, string> = {
    base: '基础数值',
    additive: '基础数值(固定)',
    percentMultiplier: '属性加成',
    independentMultiplier: '独立乘区',
    finalMultiplier: '最终乘区',
  }
  return keyMap[key] || key
}

// 事件处理
const handleClick = () => {
  emit('click', props.participant.id)
}

// 暴露卡片引用给父组件（用于动画）
defineExpose({
  cardRef,
  participantId: props.participant.id,
  addDamageNumber,
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
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
  border: 1px solid rgba(249, 115, 22, 0.3);
}
.situational-tag.tag-elemental {
  background: rgba(34, 211, 238, 0.15);
  color: #22d3ee;
  border: 1px solid rgba(34, 211, 238, 0.25);
}
.situational-tag.tag-control {
  background: rgba(168, 85, 247, 0.15);
  color: #a855f7;
  border: 1px solid rgba(168, 85, 247, 0.25);
}

/* 浮动数字容器 */
.floating-numbers {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 10;
}

/* 浮动数字样式 */
.damage-number {
  position: absolute;
  font-size: var(--font-size-xxxl);
  font-weight: var(--font-weight-bold);
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  animation-name: float-up;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
  /* ponytail: duration 通过内联 style 的 animationDuration 设置，避免 v-bind(duration) 依赖不存在变量 */
  white-space: nowrap;
}

.damage-number.damage {
  color: var(--color-danger);
  /* 红色伤害 */
}

.damage-number.heal {
  color: var(--color-success);
  /* 绿色治疗 */
}

.damage-number.critical {
  color: var(--color-warning);
  /* 橙色暴击 */
  font-size: 32px;
  text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.9);
}

.damage-number.miss {
  color: var(--color-text-tertiary);
  /* 灰色闪避 */
  font-size: var(--font-size-xxl);
}

/* 浮动动画 */
@keyframes float-up {
  0% {
    opacity: 0;
    transform: translateY(0) scale(0.8);
  }

  20% {
    opacity: 1;
    transform: translateY(-10px) scale(1.2);
  }

  100% {
    opacity: 0;
    transform: translateY(-60px) scale(1);
  }
}

/* 复用原有 member-card 样式 */
.debug-info {
  margin-top: var(--space-2);
  padding: var(--space-2);
  background: rgba(0, 0, 0, 0.3);
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
  background: rgba(0, 0, 0, 0.2);
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
  background: rgba(15, 23, 42, 0.97);
  border: 1px solid rgba(96, 165, 250, 0.3);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}

.breakdown-header {
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-sm);
  padding-bottom: var(--space-1);
  margin-bottom: var(--space-1);
  border-bottom: 1px solid rgba(96, 165, 250, 0.15);
  white-space: nowrap;
}

.breakdown-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.breakdown-desc {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.breakdown-meta {
  color: var(--color-text-disabled);
  font-size: var(--font-size-xs);
}

.breakdown-effects {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: var(--space-1);
}

.breakdown-effect {
  font-size: var(--font-size-xs);
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
  font-size: var(--font-size-xs);
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
  font-size: var(--font-size-xs);
}

/* 追溯浮层过渡 */
.tooltip-fade-enter-active {
  transition: opacity 0.15s ease-out, transform 0.15s ease-out;
}
.tooltip-fade-leave-active {
  transition: opacity 0.1s ease-in;
}
.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ============ 卡片视觉状态动画 ============ */

/* 蓄力/施法 */
.member-card.casting {
  transform: translateY(-3px);
  box-shadow: 0 0 30px var(--color-brand-red), 0 6px 24px rgba(0, 0, 0, 0.7);
  animation: cast-pulse 0.6s ease;
}

@keyframes cast-pulse {

  0%,
  100% {
    transform: translateY(-3px) scale(1);
  }

  50% {
    transform: translateY(-3px) scale(1.018);
  }
}

/* 受击 */
.member-card.hurt {
  animation: hurt-shake 0.45s cubic-bezier(.36, .07, .19, .97);
}

.member-card.hurt::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, rgba(255, 80, 80, 0.55), transparent 70%);
  pointer-events: none;
  animation: hurt-flash 0.45s ease;
}

@keyframes hurt-shake {

  0%,
  100% {
    transform: translate(0, 0);
  }

  15% {
    transform: translate(-5px, 1px) rotate(-1.5deg);
  }

  30% {
    transform: translate(5px, -1px) rotate(1.5deg);
  }

  45% {
    transform: translate(-4px, 1px) rotate(-1deg);
  }

  60% {
    transform: translate(4px, -1px) rotate(1deg);
  }

  75% {
    transform: translate(-2px, 0) rotate(-0.5deg);
  }
}

@keyframes hurt-flash {
  0% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

/* 被治疗 */
.member-card.healed {
  animation: heal-glow 0.8s ease;
}

@keyframes heal-glow {

  0%,
  100% {
    box-shadow: 0 0 0 transparent;
  }

  50% {
    box-shadow: 0 0 30px var(--color-heal), inset 0 0 20px rgba(45, 212, 168, 0.2);
  }
}

/* 被加护盾 */
.member-card.shielded {
  animation: shield-glow 0.8s ease;
}

@keyframes shield-glow {

  0%,
  100% {
    box-shadow: 0 0 0 transparent;
  }

  50% {
    box-shadow: 0 0 30px var(--color-energy), inset 0 0 20px rgba(76, 201, 240, 0.2);
  }
}

/* HP 条闪光 */
.hp-fill.hp-flash {
  animation: hp-bar-flash 0.8s ease;
}

@keyframes hp-bar-flash {

  0%,
  100% {
    filter: brightness(1);
  }

  50% {
    filter: brightness(2) saturate(1.5);
  }
}
</style>
