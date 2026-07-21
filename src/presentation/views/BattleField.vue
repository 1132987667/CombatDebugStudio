<template>
  <div class="battle-panel panel-center">
    <div class="battle-top-section">
      <div class="battle-header">
        <div class="turn-info">
          <span class="turn-label">当前回合:</span>
          <span class="turn-num">{{ store.currentTurn }}/{{ store.maxTurns }}</span>
          <span class="actor-info">操作方: {{ currentActor?.name || '等待中' }} ( 速度:{{ getMemberSpeed(currentActor)
          }})</span>
        </div>
      </div>

      <div class="battle-field">
        <div class="field-party our-party">
          <div class="party-header">我方 ({{ allyTeam.length }}人)</div>
          <div class="party-members">
            <ParticipantCard v-for="member in allyTeam" :key="member.id" :ref="el => { handleCardRef(member.id, el) }"
              :participant="member" :is-active="isCurrentActor(member.id)"
              :is-selected="store.selectedCharacterId === member.id" :is-enemy="false" :show-debug="false"
              :target-entity="selectedTarget"
              @click="selectCharacter(member.id)" />
          </div>
        </div>

        <!-- <div class="field-divider">
          <span class="vs-text">VS</span>
        </div> -->

        <div class="field-party enemy-party">
          <div class="party-header">敌方 ({{ enemyTeam.length }}人)</div>
          <div class="party-members">
            <ParticipantCard v-for="member in enemyTeam" :key="member.id" :ref="el => { handleCardRef(member.id, el) }"
              :participant="member" :is-active="isCurrentActor(member.id)"
              :is-selected="store.selectedCharacterId === member.id" :is-enemy="true" :show-debug="false"
              :target-entity="selectedTarget"
              @click="selectCharacter(member.id)" />
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
import { computed, ref, reactive, onUnmounted, watch } from "vue";
import { useBattleAnimation } from '@/presentation/composables/useBattleAnimation';
import BattleLog from "@/presentation/views/BattleLog.vue";
import ParticipantCard from "@/presentation/components/ParticipantCard.vue";
import BattleVisualEffects from "@/presentation/components/BattleVisualEffects.vue";
import BattleSummaryDialog from "@/presentation/views/components/BattleSummaryDialog.vue"
import type { BattleSummary } from '@/shared/types/battle-summary'
import { eventBus } from '@/main'
import { ATTRIBUTE_CODE, type AttributeValue } from '@/domain/attribute/types';
import { ActionTypes, type BattleEntity, ActionResultType } from '@/domain/battle/type/types';
import { useBattleStore } from '@/presentation/stores/battleStore'
import { getVisualEffect } from '@/shared/utils/visual-effect-mapper'
import { BattleEventCodes } from '@/domain/battle/type/BattleEventType'

const store = useBattleStore()

// 战报弹窗状态
const showSummaryDialog = ref(false)
const lastSummary = ref<BattleSummary | null>(null)

// ponytail: 事件总线挂载后监听战报事件
eventBus.on(BattleEventCodes.BATTLE_SUMMARY, (summary: BattleSummary) => {
  lastSummary.value = summary
  showSummaryDialog.value = true
})

const props = defineProps<{
  currentActorId: string | null;
  turnOrder?: string[];
  damageEffects?: Record<string, { value: number; type: ActionResultType; isCritical: boolean }>;
  skillEffects?: Record<string, { type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate'; name?: string }>;
  battleSpeed?: number;
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
  playDeathAnimation,
  setBattleSpeed,
  stopAllAnimations,
} = useBattleAnimation();

// BattleVisualEffects 组件引用
const visualEffectsRef = ref<InstanceType<typeof BattleVisualEffects> | null>(null)

// ParticipantCard 组件引用映射
const participantCardRefs = ref<Record<string, InstanceType<typeof ParticipantCard>>>({})

// ponytail: 监听 store.battleSpeed 同步 GSAP 动画速度（props.battleSpeed 从未传值）
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
    // ponytail: defineExpose 自动解包 ref，card.cardRef 直接是 HTMLElement
    if (card?.cardRef) {
      vf.registerCard(id, card.cardRef as HTMLElement)
    }
  }
}, { immediate: true })

// ponytail: 防重入 key — 相同的 (source|target|skill) 只处理一次，避免 DAMAGE_ANIMATION 触发时重复播放
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

// ponytail: 监听 store 层动画状态变化，编排完整视觉效果 — 直接 watch reactive 对象而非 getter 函数以保证深层变更可追踪
watch(store.animationState, (state) => {
  if (state.skill) {
    const key = `${state.skill.sourceId}|${state.skill.targetId}|${state.skill.skillName}`
    if (key === lastSkillKey) return  // DAMAGE_ANIMATION 触发时 skill 还没清，跳过重复
    lastSkillKey = key

    // 技能释放序列: 攻击者蓄力 + 技能名飞行 + 突进 + 光弹 + 命中效果
    const card = participantCardRefs.value[state.skill.sourceId]
    card?.triggerVisualState('casting', 600)
    const side = getCharacterSide(state.skill.sourceId)
    // ponytail: GSAP 前移再回位，配合 casting CSS 动画叠加效果
    playAttackAnimation(state.skill.sourceId, side)
    const isHeal = state.skill.effectType === ActionTypes.HEAL
    const visual = getVisualEffect(state.skill.damageCategory, isHeal)
    const hitEffect = visual.impactClass

    if (state.skill.effectType === ActionTypes.HEAL) {
      visualEffectsRef.value?.playHealSequence(
        state.skill.sourceId,
        state.skill.targetId,
        state.skill.skillName,
        0, side as 'left' | 'right',
      )
    } else {
      visualEffectsRef.value?.playAttackSequence(
        state.skill.sourceId,
        state.skill.targetId,
        state.skill.skillName,
        0, false,
        side as 'left' | 'right',
        hitEffect,
      )
    }
  }
  if (state.damage) {
    if (state.damage.isHeal) {
      if (state.skill) {
        // ponytail: 延迟 1100ms 匹配 playHealSequence 内部动画时序
        const healData = state.damage  // ponytail: 在 closure 外捕获，避免 setAnimationState 清空后为 null
        setTimeout(() => {
          if (!healData) return
          const tc = participantCardRefs.value[healData.targetId]
          tc?.triggerVisualState('healed', 800)
          tc?.flashHpBar()
          visualEffectsRef.value?.showHealAura(healData.targetId)
          visualEffectsRef.value?.showHealNum(healData.targetId, healData.damage)
        }, 1100)
        return
      }
      // 独立治疗（无 skill 事件）
      const targetCard = participantCardRefs.value[state.damage.targetId]
      targetCard?.triggerVisualState('healed', 800)
      targetCard?.flashHpBar()
      visualEffectsRef.value?.showHealAura(state.damage.targetId)
      visualEffectsRef.value?.showHealNum(state.damage.targetId, state.damage.damage)
    } else {
      if (state.skill) {
        // ponytail: 延迟 1100ms 匹配 playAttackSequence 内部动画时序（技能名飞行→光弹→命中爆炸）
        const dmgData = state.damage  // ponytail: 在 closure 外捕获，避免 setAnimationState 清空后为 null
        setTimeout(() => {
          if (!dmgData) return
          const tc = participantCardRefs.value[dmgData.targetId]
          tc?.triggerVisualState('hurt', 450)
          visualEffectsRef.value?.showDamageNum(dmgData.targetId, dmgData.damage, dmgData.isCritical)
          if (dmgData.isCritical) {
            visualEffectsRef.value?.showScreenShake()
          }
        }, 1100)
        return
      }
      // 独立伤害（调试面板、被动触发等）
      const targetCard = participantCardRefs.value[state.damage.targetId]
      targetCard?.triggerVisualState('hurt', 450)
      visualEffectsRef.value?.showImpact(state.damage.targetId, 'fire')
      visualEffectsRef.value?.showDamageNum(state.damage.targetId, state.damage.damage, state.damage.isCritical)
      if (state.damage.isCritical) {
        visualEffectsRef.value?.showScreenShake()
      }
    }
  }
  if (state.miss) {
    showMiss(state.miss.targetId)
  }
  if (state.buff) {
    showBuffEffect(state.buff.targetId, state.buff.buffName, state.buff.isPositive)
    if (state.buff.isPositive) {
      participantCardRefs.value[state.buff.targetId]?.triggerVisualState('shielded', 800)
    }
  }
}, { deep: true })

// 响应式获取队伍数据
const allyTeam = computed(() => store.getEnabledAllyTeam())
const enemyTeam = computed(() => store.getEnabledEnemyTeam())

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

/**
 * 获取参与者速度
 * 直接使用 BattleEntity 的 getAttributeValue 方法
 */
function getMemberSpeed(member: BattleEntity | null): number {
  if (!member) return 0;
  const spdValue = member.getAttributeValue(ATTRIBUTE_CODE.speed)
  return toNumber(spdValue?.value)
}

function isCurrentActor(memberId: string): boolean {
  return currentActor.value?.id === memberId || props.currentActorId === memberId;
}

// const aliveEnemies = enemyTeam.value.filter((c) => c.isAlive());
//   if (props.turnOrder) {
//     // 如果有回合顺序，按照回合顺序排序
//     return aliveEnemies.sort((a, b) => {
//       const indexA = props.turnOrder!.indexOf(a.id);
//       const indexB = props.turnOrder!.indexOf(b.id);
//       // 不在回合顺序中的角色放在最后
//       if (indexA === -1) return 1;
//       if (indexB === -1) return -1;
//       return indexA - indexB;
//     });
//   } else {
//     // 否则按速度排序
//     return aliveEnemies.sort((a, b) => getMemberSpeed(b) - getMemberSpeed(a));
//   }

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
// ponytail: 已迁移到 BuffIcon 自带 tooltip，移除父级 tooltip 系统

function getCharacterSide(characterId: string): 'left' | 'right' {
  const isAlly = allyTeam.value.some((c) => c.id === characterId)
  return isAlly ? 'left' : 'right'
}

/**
 * 显示伤害数字
 * 通过 ParticipantCard 组件的 addDamageNumber 方法调用
 */
function showDamage(characterId: string, value: number, type: ActionResultType, isCritical: boolean = false) {
  // 调用 ParticipantCard 组件的 addDamageNumber 方法
  const cardRef = participantCardRefs.value[characterId]
  if (cardRef && typeof cardRef.addDamageNumber === 'function') {
    cardRef.addDamageNumber(value, type, isCritical)
  }

  playHitAnimation(characterId, {
    damage: value,
    hitEffect: type,
    isCritical,
  })
}

/**
 * 显示闪避
 */
function showMiss(characterId: string) {
  // 调用 ParticipantCard 组件的 addDamageNumber 方法
  const cardRef = participantCardRefs.value[characterId]
  if (cardRef && typeof cardRef.addDamageNumber === 'function') {
    cardRef.addDamageNumber(0, ActionResultType.MISS, false)
  }

  playHitAnimation(characterId, {
    hitEffect: ActionResultType.MISS,
  })
}

async function showSkillEffect(characterId: string, type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate', name?: string) {
  const side = getCharacterSide(characterId)
  await playAttackAnimation(characterId, side, name)
}

function showBuffEffect(characterId: string, _buffName: string, isPositive: boolean) {
  playBuffAnimation(characterId, isPositive)
}

function triggerHitEffect(characterId: string) {
  playHitAnimation(characterId, {
    hitEffect: ActionResultType.DAMAGE,
  })
}

function triggerCastingEffect(characterId: string, _duration: number = 1000) {
  const side = getCharacterSide(characterId)
  playAttackAnimation(characterId, side)
}

function triggerBuffEffect(characterId: string) {
  playBuffAnimation(characterId, true)
}

/**
 * 清理动画效果
 */
function cleanupAnimations() {
  hideStatusTooltip()
  stopAllAnimations()
}

function playAttackSequence(
  attackerId: string,
  targetId: string,
  skillName?: string,
  damage?: number,
  hitEffect: ActionResultType = ActionResultType.DAMAGE,
  isCritical?: boolean
): Promise<void> {
  return new Promise(async (resolve) => {
    const attackerSide = getCharacterSide(attackerId)

    await playAttackAnimation(attackerId, attackerSide, skillName)

    await playHitAnimation(targetId, {
      damage,
      hitEffect,
      isCritical,
      skillName,
    })

    resolve()
  })
}

defineExpose({
  showDamage,
  showMiss,
  showSkillEffect,
  showBuffEffect,
  triggerHitEffect,
  triggerCastingEffect,
  triggerBuffEffect,
  cleanupAnimations,
  playAttackSequence,
  playAttackAnimation,
  playHitAnimation,
  playBuffAnimation,
  playDeathAnimation,
})

onUnmounted(() => {
  cleanupAnimations()
  participantCardRefs.value = {}
})
</script>

<style scoped lang="scss">
@use'@/presentation/styles/main.scss';

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
  color: #ffd478;
  text-shadow:
    0 0 20px rgba(255, 212, 120, 0.8),
    0 0 40px rgba(255, 212, 120, 0.4),
    0 4px 8px rgba(0, 0, 0, 0.95);
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
