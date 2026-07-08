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
          <div class="hp-fill" :class="[hpColorClass, { 'hp-flash': hpFlash }]" :style="{ width: hpPercent + '%' }"></div>
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

      <!-- Buff 列表（BuffIcon 自带悬停 tooltip） -->
      <BuffList :buffs="buffListItems" />

      <!-- 调试信息（可选） -->
      <div v-if="showDebug" class="debug-info">
        <div class="debug-row">
          <span class="label">ATK:</span>
          <span class="value">{{ stats.attack.value.displayValue }}</span>
          <span v-if="stats.attack.value.breakdown" class="breakdown" @click="toggleBreakdown">🔍</span>
        </div>
        <div v-if="showBreakdown" class="breakdown-details">
          <div v-for="(value, key) in stats.attack.value.breakdown" :key="key" class="breakdown-item">
            <span class="key">{{ formatBreakdownKey(key) }}:</span>
            <span class="value">{{ typeof value === 'number' ? value.toFixed(2) : value }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, type Ref } from 'vue'
import type { BattleEntity } from '@/domain/battle/types'
import { useBattleParticipant } from '@/presentation/composables/useBattleParticipant'
import { useParticipantStats } from '@/presentation/composables/useParticipantStats'
import BuffList from '@/presentation/components/BuffList.vue'

// 浮动数字接口
interface FloatingNumber {
  id: number
  x: number
  y: number
  text: string
  type: 'damage' | 'heal' | 'critical' | 'miss'
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
  /** 显示调试信息 */
  showDebug?: boolean
  /** 卡片引用 ID（用于动画） */
  cardRefId?: string
}>()

const emit = defineEmits<{
  click: [participantId: string]
}>()

// 使用 composable 包装参与者
const { participant: shallowParticipant, stats, isAlive, hpPercent, energyPercent } = useBattleParticipant(props.participant)

// 使用属性访问 composable
const participantStats = useParticipantStats(props.participant)

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
  type: 'damage' | 'heal' | 'critical' | 'miss',
  isCritical: boolean = false,
  x: number = 50,
  y: number = 20
) {
  const id = nextNumberId.value++
  const text = type === 'miss' ? '闪避' : (type === 'heal' ? `+${value}` : `-${value}`)
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
const isDead = computed(() => !isAlive.value)
const cardClasses = computed(() => ({
  'active': props.isActive,
  'dead': isDead.value,
  'selected': props.isSelected,
}))

const hpText = computed(() => {
  const currentHealth = Math.max(0, Math.floor(stats.value.currentHealth.value))
  const maxHealth = Math.max(0, Math.floor(stats.value.maxHealth.value))
  return `${currentHealth}/${maxHealth}`
})

const hpColorClass = computed(() => {
  const hpPct = hpPercent
  if (hpPct <= 25) return 'low'
  if (hpPct <= 50) return 'medium'
  return 'high'
})

const energyText = computed(() => {
  const energy = Math.floor(stats.value.energy.value)
  const maxEnergy = Math.floor(stats.value.maxEnergy.value)
  return `${energy}/${maxEnergy}`
})

const energyColorClass = computed(() => {
  const energyPct = energyPercent.value
  if (energyPct >= 80) return 'full'
  if (energyPct >= 50) return 'medium'
  return 'low'
})

const statusEffects = computed(() => {
  return (props.participant as any).statusEffects || []
})

/** 转换为 BuffList 所需的数据格式 */
const buffListItems = computed(() =>
  statusEffects.value.map((s: any) => ({
    id: s.id,
    buffId: s.id,
    name: s.name,
    description: s.description || s.name,
    remainingTurns: s.remainingTurns,
    currentStacks: s.currentStacks || 1,
    isDebuff: s.type === 'debuff',
  }))
)

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
  font-size: 24px;
  font-weight: bold;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
  animation: float-up v-bind(duration) ease-out forwards;
  white-space: nowrap;
}

.damage-number.damage {
  color: #ef4444;
  /* 红色伤害 */
}

.damage-number.heal {
  color: #22c55e;
  /* 绿色治疗 */
}

.damage-number.critical {
  color: #f97316;
  /* 橙色暴击 */
  font-size: 32px;
  text-shadow: 3px 3px 6px rgba(0, 0, 0, 0.9);
}

.damage-number.miss {
  color: #9ca3af;
  /* 灰色闪避 */
  font-size: 20px;
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
  margin-top: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-size: 11px;
}

.debug-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.debug-row .label {
  color: #9ca3af;
  min-width: 40px;
}

.debug-row .value {
  color: #e5e7eb;
  font-family: 'Courier New', monospace;
}

.debug-row .breakdown {
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.2s;
}

.debug-row .breakdown:hover {
  opacity: 1;
}

.breakdown-details {
  margin-top: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border-left: 2px solid #22d3ee;
}

.breakdown-item {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  font-family: 'Courier New', monospace;
}

.breakdown-item .key {
  color: #9ca3af;
}

.breakdown-item .value {
  color: #22d3ee;
}

/* ============ 卡片视觉状态动画 ============ */

/* 蓄力/施法 */
.member-card.casting {
  transform: translateY(-3px);
  box-shadow: 0 0 30px var(--side-glow, #ff6a5a), 0 6px 24px rgba(0,0,0,0.7);
  animation: cast-pulse 0.6s ease;
}
@keyframes cast-pulse {
  0%, 100% { transform: translateY(-3px) scale(1); }
  50% { transform: translateY(-3px) scale(1.018); }
}

/* 受击 */
.member-card.hurt {
  animation: hurt-shake 0.45s cubic-bezier(.36,.07,.19,.97);
}
.member-card.hurt::after {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(circle at center, rgba(255, 80, 80, 0.55), transparent 70%);
  pointer-events: none;
  animation: hurt-flash 0.45s ease;
}
@keyframes hurt-shake {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-5px, 1px) rotate(-1.5deg); }
  30% { transform: translate(5px, -1px) rotate(1.5deg); }
  45% { transform: translate(-4px, 1px) rotate(-1deg); }
  60% { transform: translate(4px, -1px) rotate(1deg); }
  75% { transform: translate(-2px, 0) rotate(-0.5deg); }
}
@keyframes hurt-flash {
  0% { opacity: 1; }
  100% { opacity: 0; }
}

/* 被治疗 */
.member-card.healed {
  animation: heal-glow 0.8s ease;
}
@keyframes heal-glow {
  0%, 100% { box-shadow: 0 0 0 transparent; }
  50% { box-shadow: 0 0 30px #6affd0, inset 0 0 20px rgba(45, 212, 168, 0.2); }
}

/* 被加护盾 */
.member-card.shielded {
  animation: shield-glow 0.8s ease;
}
@keyframes shield-glow {
  0%, 100% { box-shadow: 0 0 0 transparent; }
  50% { box-shadow: 0 0 30px #8ee0ff, inset 0 0 20px rgba(76, 201, 240, 0.2); }
}

/* HP 条闪光 */
.hp-fill.hp-flash {
  animation: hp-bar-flash 0.8s ease;
}
@keyframes hp-bar-flash {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(2) saturate(1.5); }
}
</style>
