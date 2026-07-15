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

      <!-- Buff 列表：纯文本展示 -->
      <BuffTextBar
        :control-labels="buffDisplay.controlLabels"
        :merged-labels="buffDisplay.mergedLabels"
        :visible-attr-labels="buffDisplay.visibleAttrLabels"
        :collapsed-count="buffDisplay.collapsedCount"
        :expanded="panelVisible"
        @toggle="panelVisible = !panelVisible"
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { BattleEntity } from '@/domain/battle/type/types'
import { ActionResultType } from '@/domain/battle/type/types'
import { useBattleParticipant } from '@/presentation/composables/useBattleParticipant'
import BuffTextBar from '@/presentation/components/BuffTextBar.vue'
import BuffTextPanel from '@/presentation/components/BuffTextPanel.vue'
import { useBuffDisplay } from '@/presentation/composables/useBuffDisplay'
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
}>()

const emit = defineEmits<{
  click: [participantId: string]
}>()

// 从 store 中获取显示调试信息状态
const battleStore = useBattleStore()
const showDebug = computed(() => battleStore.showDebug)

// 使用 composable 包装参与者
const { participant: reactiveParticipant, stats, isAlive, hpPercent, energyPercent } = useBattleParticipant(props.participant)

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
const buffListItems = computed(() => {
  // ponytail: 读取 statsVersion 建立 Vue 响应式依赖（recalculateAll → proxy._statsVersion++ 时 computed 重算）
  const version = reactiveParticipant.statsVersion
  console.error('版本更新', version, reactiveParticipant)

  const entity = reactiveParticipant
  const result: any[] = []
  const seenIds = new Set<string>()
  console.error(`{entity.name}携带的buff`, buffSystem.getBuffInstances(entity.id))

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
          description: config.description || config.name,
          remainingTurns: instance.remainingTurns,
          currentStacks: instance.currentStacks,
          isDebuff: config.isDebuff === true,
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
        description: s.description || s.name,
        remainingTurns: s.remainingTurns,
        currentStacks: s.currentStacks || 1,
        isDebuff: s.type === 'debuff',
      })
    }
  }

  console.error('buffListItems', result)
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
    const attr = (s as any)[code]
    if (attr && typeof attr.base === 'number') {
      map[cn] = attr.base
    }
  }
  return map
})

// ponytail: 参与者 ID 在生命周期内不变，直接读取
const buffDisplay = useBuffDisplay(buffListItems, props.participant.id, 5, baseAttributes)

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
