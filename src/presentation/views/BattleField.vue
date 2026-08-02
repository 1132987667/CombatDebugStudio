<template>
  <div class="battle-panel panel-center">
    <div class="battle-top-section">
      <div class="battle-header">
        <div class="turn-info">
          <span class=" battle-header-title">演武台</span>
          <span class="turn-label">当前回合:</span>
          <span class="turn-num">{{ store.currentTurn }}/{{ store.maxTurns }}</span>
          <span class="actor-info">操作方: {{ currentActor?.name || '等待中' }}</span>
        </div>
      </div>

      <div class="battle-field">
        <div class="field-party our-party">
          <div class="party-header">我方 ({{ allyTeam.length }}人)</div>
          <div class="party-members">
            <ParticipantCard v-for="member in allyTeam" :key="member.id" :ref="el => { handleCardRef(member.id, el) }"
              :participant="member" :is-active="isCurrentActor(member.id)"
              :is-selected="store.selectedCharacterId === member.id" :is-enemy="false"
              :target-entity="selectedTarget" :turn-tick="store.currentTurn" @click="selectCharacter(member.id)" />
          </div>
        </div>

        <div class="field-party enemy-party">
          <div class="party-header">敌方 ({{ enemyTeam.length }}人)</div>
          <div class="party-members">
            <ParticipantCard v-for="member in enemyTeam" :key="member.id" :ref="el => { handleCardRef(member.id, el) }"
              :participant="member" :is-active="isCurrentActor(member.id)"
              :is-selected="store.selectedCharacterId === member.id" :is-enemy="true"
              :target-entity="selectedTarget" :turn-tick="store.currentTurn" @click="selectCharacter(member.id)" />
            <div v-if="enemyTeam.length === 0" class="empty-party">(空位)</div>
          </div>
        </div>
      </div>
    </div>

    <BattleLog />

    <!-- 战斗视觉特效层 -->
    <BattleVisualEffects ref="visualEffectsRef" />

    <!-- 回合变化公告 -->
    <div class="round-announce-layer">
      <div v-for="ra in roundAnnounces" :key="ra.id" class="round-announce"
        :style="{ animationDuration: ra.dur + 'ms' }">
        {{ ra.text }}
      </div>
    </div>

    <!-- 战报弹窗 -->
    <BattleSummaryDialog v-model="showSummaryDialog" :summary="lastSummary" />
  </div>
</template>

<script setup lang="ts">
import { ATTRIBUTE_CODE, type AttributeValue } from '@/domain/attribute/types';
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType';
import { ActionResultType, ActionTypes, type BattleEntity } from '@/domain/battle/type/types';
import { container } from '@/infrastructure/di/Container';
import { UIEventBus } from '@/infrastructure/adapters/event/UIEventBus';

const emitter = container.resolve<UIEventBus>('UIEventBus').getEmitter()
import BattleVisualEffects from "@/presentation/components/BattleVisualEffects.vue";
import ParticipantCard from "@/presentation/components/ParticipantCard.vue";
import { useBattleAnimation } from '@/presentation/composables/useBattleAnimation';
import { useBattleStore } from '@/presentation/stores/battleStore';
import BattleLog from "@/presentation/views/BattleLog.vue";
import BattleSummaryDialog from "@/presentation/views/components/BattleSummaryDialog.vue";
import { BATTLE_ANIMATION_TIMING, getActionBudget } from '@/shared/constants/animation-timing';
import type { BattleSummary } from '@/shared/types/battle-summary';
import { getVisualEffect } from '@/shared/utils/visual-effect-mapper';
import { computed, onUnmounted, ref, watch } from "vue";

const store = useBattleStore()

// 战报弹窗状态
const showSummaryDialog = ref(false)
const lastSummary = ref<BattleSummary | null>(null)

// ponytail: 事件总线挂载后监听战报事件
emitter.on(BattleEventCodes.BATTLE_SUMMARY, (summary: BattleSummary) => {
  lastSummary.value = summary
  showSummaryDialog.value = true
})

const props = defineProps<{
  currentActorId: string | null;
}>();

const emit = defineEmits<{
  "select-character": [characterId: string];
}>();

const {
  registerElement,
  unregisterElement,
  playAttackAnimation,
  playHitAnimation,
  playBuffAnimation,
  setBattleSpeed,
  stopAllAnimations,
} = useBattleAnimation();

// BattleVisualEffects 组件引用
const visualEffectsRef = ref<InstanceType<typeof BattleVisualEffects> | null>(null)

// ParticipantCard 组件引用映射
const participantCardRefs = ref<Record<string, InstanceType<typeof ParticipantCard>>>({})

// NOTE: 监听 store.battleSpeed 同步 GSAP 动画速度
watch(() => store.battleSpeed, (newSpeed) => {
  if (newSpeed) {
    setBattleSpeed(newSpeed);
  }
}, { immediate: true });

// ponytail: 注册/注销卡片 DOM 元素，供 GSAP 动画和 BattleVisualEffects 查找
function handleCardRef(characterId: string, el: InstanceType<typeof ParticipantCard> | null) {
  if (el) {
    participantCardRefs.value[characterId] = el
    registerElement(characterId, el.cardRef as HTMLElement | null)
    // ponytail: defineExpose 自动解包 ref，el.cardRef 直接是 HTMLElement
    if (el?.cardRef) {
      visualEffectsRef.value?.registerCard(characterId, el.cardRef as HTMLElement)
    }
  } else {
    delete participantCardRefs.value[characterId]
    unregisterElement(characterId)
    visualEffectsRef.value?.unregisterCard(characterId)
  }
}

// ponytail: 当 visualEffectsRef 可用时，补注册所有已存在的卡片（解决渲染时序竞态）
watch(visualEffectsRef, (vf) => {
  if (!vf) return
  for (const [id, card] of Object.entries(participantCardRefs.value)) {
    if (card?.cardRef) {
      vf.registerCard(id, card.cardRef as HTMLElement)
    }
  }
}, { immediate: true })

let lastSkillKey = ''

/** 回合变化公告列表 */
let roundId = 0
const roundAnnounces = ref<Array<{ id: number; text: string; dur: number }>>([])
const ANNOUNCE_DURATION = 1200
function addRoundAnnounce(text: string) {
  const id = ++roundId
  roundAnnounces.value.push({ id, text, dur: ANNOUNCE_DURATION })
  setTimeout(() => {
    const idx = roundAnnounces.value.findIndex(i => i.id === id)
    if (idx !== -1) roundAnnounces.value.splice(idx, 1)
  }, ANNOUNCE_DURATION)
}

// ponytail: 监听回合变化，触发动画
watch(() => store.currentTurn, (newTurn, oldTurn) => {
  if (oldTurn !== undefined && newTurn > oldTurn) {
    addRoundAnnounce(`第 ${newTurn} 回合`)
  }
})

// ponytail: 固定预算模型 — 动画编排完全由领域层配速驱动，UI 只负责按事件即时显示
watch(store.animationState, (state) => {
  const budget = getActionBudget(store.battleSpeed)
  if (state.skill) {
    const key = `${state.skill.sourceId}|${state.skill.targetId}|${state.skill.skillName}`
    if (key === lastSkillKey) return
    lastSkillKey = key

    const card = participantCardRefs.value[state.skill.sourceId]
    // 蓄力相 = 20%T
    card?.triggerVisualState('casting', budget * BATTLE_ANIMATION_TIMING.PHASES.windup.end)
    const side = getCharacterSide(state.skill.sourceId)
    // GSAP 突进 = 20%T
    playAttackAnimation(state.skill.sourceId, side, budget)
    const isHeal = state.skill.effectType === ActionTypes.HEAL
    const visual = getVisualEffect(state.skill.damageCategory, isHeal)

    // 飞行序列：只飞（技能名+光弹），终点 = 50%T
    visualEffectsRef.value?.playFlightSequence(
      state.skill.sourceId, state.skill.targetId, state.skill.skillName,
      side as 'left' | 'right', visual.impactClass, budget,
    )
  }
  if (state.damage) {
    // NOTE: 领域层已在 50%T 扣血，此处立即显示数字/特效（零延迟）
    const targetCard = participantCardRefs.value[state.damage.targetId]
    if (state.damage.isHeal) {
      targetCard?.triggerVisualState('healed', budget * 0.4)
      targetCard?.flashHpBar(budget)
      visualEffectsRef.value?.showHealAura(state.damage.targetId, budget)
      visualEffectsRef.value?.showHealNum(state.damage.targetId, state.damage.damage, budget)
    } else {
      targetCard?.triggerVisualState('hurt', budget * 0.4)
      visualEffectsRef.value?.showImpact(state.damage.targetId, 'fire', budget)
      visualEffectsRef.value?.showDamageNum(state.damage.targetId, state.damage.damage, state.damage.isCritical, budget)
      if (state.damage.isCritical) {
        visualEffectsRef.value?.showScreenShake()
      }
    }
  }
  if (state.miss) {
    showMiss(state.miss.targetId)
  }
  if (state.buff) {
    // NOTE: 被动特效时长钳制在 50%T 内，保证不侵入下一行动
    const buffDuration = budget * BATTLE_ANIMATION_TIMING.PHASES.settle.start
    showBuffEffect(state.buff.targetId, state.buff.isPositive)
    if (state.buff.isPositive) {
      participantCardRefs.value[state.buff.targetId]?.triggerVisualState('shielded', buffDuration)
    }
  }
}, { deep: true })

// 响应式获取队伍数据
const allyTeam = computed(() => store.allyTeam)
const enemyTeam = computed(() => store.enemyTeam)

/** 当前选中的目标实体（用于情境属性高亮） */
const selectedTarget = computed(() => {
  const id = store.selectedCharacterId
  if (!id) return null
  return [...allyTeam.value, ...enemyTeam.value].find(p => p.id === id) ?? null
})

// 辅助函数：转换为数字（兼容 AttributeValue 和 number）
function toNumber(value: number | AttributeValue | undefined): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'value' in value) {
    return value.value ?? 0;
  }
  return 0;
}

function isCurrentActor(memberId: string): boolean {
  return currentActor.value?.id === memberId || props.currentActorId === memberId;
}

const currentActor = computed(() => {
  if (!props.currentActorId) return null;
  const allParticipants = [...allyTeam.value, ...enemyTeam.value];
  return allParticipants.find((p) => p.id === props.currentActorId) || null;
});

const selectCharacter = (charId: string) => {
  store.selectCharacter(charId);
  emit('select-character', charId);
};

// 状态工具提示相关逻辑

function getCharacterSide(characterId: string): 'left' | 'right' {
  const isAlly = allyTeam.value.some((c) => c.id === characterId)
  return isAlly ? 'left' : 'right'
}

/**
 * 显示闪避
 */
function showMiss(characterId: string) {
  const budget = getActionBudget(store.battleSpeed)
  visualEffectsRef.value?.showMissText(characterId, budget)
  playHitAnimation(characterId, {
    hitEffect: ActionResultType.MISS,
  })
}

function showBuffEffect(characterId: string, isPositive: boolean) {
  playBuffAnimation(characterId, isPositive)
}

/**
 * 清理动画效果
 */
function cleanupAnimations() {
  stopAllAnimations()
}

defineExpose({
  showMiss,
  showBuffEffect,
  cleanupAnimations,
  playAttackAnimation,
  playHitAnimation,
  playBuffAnimation,
})

onUnmounted(() => {
  cleanupAnimations()
  participantCardRefs.value = {}
})
</script>

<style scoped lang="scss">
.round-announce-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1200;
  display: flex;
  justify-content: center;
  align-items: center;
}

.round-announce {
  position: absolute;
  top: 45%;
  font-family: 'Cinzel', 'Noto Serif SC', serif;
  font-size: 48px;
  font-weight: 900;
  color: var(--color-round-announce);
  text-shadow:
    0 0 20px rgba(var(--rgb-round-announce), 0.8),
    0 0 40px rgba(var(--rgb-round-announce), 0.4),
    0 4px 8px rgba(var(--rgb-black), 0.95);
  animation: round-rise ease-out forwards;
  white-space: nowrap;
}

@keyframes round-rise {
  0% {
    transform: translate(-50%, -50%) scale(0.6);
    opacity: 0;
  }

  15% {
    transform: translate(-50%, -50%) scale(1.2);
    opacity: 1;
  }

  30% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }

  100% {
    transform: translate(-50%, -150%) scale(0.9);
    opacity: 0;
  }
}
</style>
