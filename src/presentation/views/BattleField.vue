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
          <div class="party-header">我方 ({{ filterAllyTeam.length }}人)</div>
          <div class="party-members">
            <ParticipantCard v-for="member in filterAllyTeam" :key="member.id"
              :ref="el => { handleCardRef(member.id, el) }" :participant="member"
              :is-active="isCurrentActor(member.id)" :is-selected="store.selectedCharacterId === member.id"
              :is-enemy="false" :show-debug="false" @click="selectCharacter(member.id)" />
          </div>
        </div>

        <!-- <div class="field-divider">
          <span class="vs-text">VS</span>
        </div> -->

        <div class="field-party enemy-party">
          <div class="party-header">敌方 ({{ filterEnemyTeam.length }}人)</div>
          <div class="party-members">
            <ParticipantCard v-for="member in filterEnemyTeam" :key="member.id"
              :ref="el => { handleCardRef(member.id, el) }" :participant="member"
              :is-active="isCurrentActor(member.id)" :is-selected="store.selectedCharacterId === member.id"
              :is-enemy="true" :show-debug="false" @click="selectCharacter(member.id)" />
            <div v-if="enemyTeam.length === 0" class="empty-party">(空位)</div>
          </div>
        </div>
      </div>
    </div>

    <BattleLog />

    <!-- 战斗视觉特效层 -->
    <BattleVisualEffects ref="visualEffectsRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onUnmounted, watch } from "vue";
import { useBattleAnimation } from '@/presentation/composables/useBattleAnimation';
import BattleLog from "@/presentation/views/BattleLog.vue";
import ParticipantCard from "@/presentation/components/ParticipantCard.vue";
import BattleVisualEffects from "@/presentation/components/BattleVisualEffects.vue";
import { ATTRIBUTE_CODE, type AttributeValue } from '@/domain/attribute/types';
import { ActionTypes, type BattleEntity } from '@/domain/battle/types';
import { useBattleStore } from '@/presentation/stores/battleStore'

const store = useBattleStore()

const props = defineProps<{
  currentActorId: string | null;
  turnOrder?: string[];
  damageEffects?: Record<string, { value: number; type: 'damage' | 'heal' | 'critical' | 'miss'; isCritical: boolean }>;
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
    const damageType = state.skill.effectType === ActionTypes.HEAL ? 'heal'
      : state.skill.damageType === 'elemental_damage' ? 'frost'
      : 'fire'

    if (state.skill.effectType === ActionTypes.HEAL) {
      visualEffectsRef.value?.playHealSequence(
        state.skill.sourceId,
        state.skill.targetId,
        state.skill.skillName,
        0, side as 'left' | 'right',
      )
      // ponytail: 配合 playHealSequence 内部 1100ms 定时
      setTimeout(() => {
        participantCardRefs.value[state.skill.targetId]?.triggerVisualState('healed', 800)
        participantCardRefs.value[state.skill.targetId]?.flashHpBar()
      }, 1100)
    } else {
      visualEffectsRef.value?.playAttackSequence(
        state.skill.sourceId,
        state.skill.targetId,
        state.skill.skillName,
        0, false,
        side as 'left' | 'right',
        damageType,
      )
      // ponytail: 配合 playAttackSequence 内部 1100ms 定时
      const isCrit = state.skill.effectType === 'critical'
      if (isCrit) {
        setTimeout(() => visualEffectsRef.value?.showScreenShake(), 1100)
      }
      setTimeout(() => {
        participantCardRefs.value[state.skill.targetId]?.triggerVisualState('hurt', 450)
      }, 1100)
    }
  }
  if (state.damage) {
    if (state.damage.isHeal) {
      if (state.skill) {
        // ponytail: playHealSequence 已处理了光环，此处只显示治疗数字
        const targetCard = participantCardRefs.value[state.damage.targetId]
        targetCard?.triggerVisualState('healed', 800)
        targetCard?.flashHpBar()
        visualEffectsRef.value?.showHealNum(state.damage.targetId, state.damage.damage)
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
        // ponytail: playAttackSequence 已在 1100ms 处理了 impact，此处只显示伤害数字
        const targetCard = participantCardRefs.value[state.damage.targetId]
        targetCard?.triggerVisualState('hurt', 450)
        visualEffectsRef.value?.showDamageNum(state.damage.targetId, state.damage.damage, state.damage.isCritical)
        if (state.damage.isCritical) {
          visualEffectsRef.value?.showScreenShake()
        }
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
const allyTeam = computed(() => store.allyTeam)
const enemyTeam = computed(() => store.enemyTeam)

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

// 根据回合顺序排序角色列表
const filterAllyTeam = computed(() => {
  return allyTeam.value;

});

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
const filterEnemyTeam = computed(() => {
  return enemyTeam.value;
});

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
function showDamage(characterId: string, value: number, type: 'damage' | 'heal' | 'critical' | 'miss', isCritical: boolean = false) {
  // 调用 ParticipantCard 组件的 addDamageNumber 方法
  const cardRef = participantCardRefs.value[characterId]
  if (cardRef && typeof cardRef.addDamageNumber === 'function') {
    cardRef.addDamageNumber(value, type, isCritical)
  }

  playHitAnimation(characterId, {
    damage: value,
    damageType: type,
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
    cardRef.addDamageNumber(0, 'miss', false)
  }

  playHitAnimation(characterId, {
    damageType: 'miss',
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
    damageType: 'damage',
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
  damageType: 'damage' | 'heal' | 'critical' | 'miss' = 'damage',
  isCritical?: boolean
): Promise<void> {
  return new Promise(async (resolve) => {
    const attackerSide = getCharacterSide(attackerId)

    await playAttackAnimation(attackerId, attackerSide, skillName)

    await playHitAnimation(targetId, {
      damage,
      damageType,
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
</style>
