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
              :ref="el => { if (el) participantCardRefs[member.id] = el; else delete participantCardRefs[member.id] }" :participant="member"
              :is-active="isCurrentActor(member.id)" :is-selected="store.selectedCharacterId === member.id"
              :is-enemy="false" :show-debug="false" @click="selectCharacter(member.id)"
              @status-tooltip-show="showStatusTooltip" @status-tooltip-hide="hideStatusTooltip" />
          </div>
        </div>

        <!-- <div class="field-divider">
          <span class="vs-text">VS</span>
        </div> -->

        <div class="field-party enemy-party">
          <div class="party-header">敌方 ({{ filterEnemyTeam.length }}人)</div>
          <div class="party-members">
            <ParticipantCard v-for="member in filterEnemyTeam" :key="member.id"
              :ref="el => { if (el) participantCardRefs[member.id] = el; else delete participantCardRefs[member.id] }" :participant="member"
              :is-active="isCurrentActor(member.id)" :is-selected="store.selectedCharacterId === member.id"
              :is-enemy="true" :show-debug="false" @click="selectCharacter(member.id)"
              @status-tooltip-show="showStatusTooltip" @status-tooltip-hide="hideStatusTooltip" />
            <div v-if="enemyTeam.length === 0" class="empty-party">(空位)</div>
          </div>
        </div>
      </div>
    </div>

    <BattleLog />

    <!-- 状态工具提示 -->
    <div v-if="statusTooltip.visible" class="status-tooltip" :style="{
      left: statusTooltip.x + 'px',
      top: statusTooltip.y + 'px',
      opacity: statusTooltip.opacity
    }">
      <div class="tooltip-header">
        <span class="status-name" :class="statusTooltip.status?.isPositive ? 'positive' : 'negative'">
          {{ statusTooltip.status?.name }}
        </span>
        <span class="status-type">{{ statusTooltip.status?.isPositive ? '增益' : '减益' }}</span>
      </div>
      <div class="tooltip-content">
        <div class="tooltip-row">
          <span class="label">效果描述:</span>
          <span class="value">{{ getStatusDescription(statusTooltip.status) }}</span>
        </div>
        <div class="tooltip-row">
          <span class="label">剩余回合:</span>
          <span class="value">{{ statusTooltip.status?.duration || 0 }}回合</span>
        </div>
        <div class="tooltip-row" v-if="getStatusEffectValue(statusTooltip.status)">
          <span class="label">效果强度:</span>
          <span class="value">{{ getStatusEffectValue(statusTooltip.status) }}</span>
        </div>
        <div class="tooltip-row" v-if="getStatusBuffEffect(statusTooltip.status)">
          <span class="label">增益效果:</span>
          <span class="value">{{ getStatusBuffEffect(statusTooltip.status) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onUnmounted, watch, nextTick } from "vue";
import { raf } from '@/shared/utils/RAF';
import { container } from '@/infrastructure/di/Container';
import { useBattleAnimation } from '@/presentation/composables/useBattleAnimation';
import DamageNumber from "@/presentation/components/DamageNumber.vue";
import SkillEffect from "@/presentation/components/SkillEffect.vue";
import BattleLog from "@/presentation/views/BattleLog.vue";
import ParticipantCard from "@/presentation/components/ParticipantCard.vue";
import { ATTRIBUTE_CODE, type AttributeValue } from '@/domain/attribute/types';
import type { BattleManager } from '@/domain/battle/BattleManager';
import type { BattleEntity, StatusEffect } from '@/domain/battle/types';
import { useBattleStore } from '@/presentation/stores/battleStore'

const store = useBattleStore()
const battleManager = container.resolve<BattleManager>('BattleManager');

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

// 状态工具提示
const statusTooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  opacity: 0,
  status: null as StatusEffect | null
});

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

// ParticipantCard 组件引用映射
const participantCardRefs = ref<Record<string, InstanceType<typeof ParticipantCard>>>({})

watch(() => props.battleSpeed, (newSpeed) => {
  if (newSpeed) {
    setBattleSpeed(newSpeed);
  }
}, { immediate: true });

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
let tooltipTimeout: symbol | null = null;
// 跟踪所有定时器，用于组件卸载时清理
const timeouts = ref<symbol[]>([]);

// 显示状态工具提示
const showStatusTooltip = (event: MouseEvent, status: StatusEffect) => {
  if (tooltipTimeout) {
    raf.clear(tooltipTimeout);
  }

  tooltipTimeout = raf.setTimeout(() => {
    statusTooltip.value = {
      visible: true,
      x: event.clientX + 10,
      y: event.clientY + 10,
      opacity: 0,
      status: status
    };

    // 添加淡入动画
    const fadeInTimeout = raf.setTimeout(() => {
      statusTooltip.value.opacity = 1;
    }, 10);
    timeouts.value.push(fadeInTimeout);
  }, 300);
  timeouts.value.push(tooltipTimeout);
};

// 隐藏状态工具提示
const hideStatusTooltip = () => {
  if (tooltipTimeout) {
    raf.clear(tooltipTimeout);
    tooltipTimeout = null;
  }

  statusTooltip.value.visible = false;
  statusTooltip.value.opacity = 0;
};

// 获取状态描述
const getStatusDescription = (status: StatusEffect) => {
  if (!status) return '';

  const descriptions: { [key: string]: string } = {
    '攻击提升': '提升角色的物理攻击力',
    '防御提升': '提升角色的物理防御力',
    '速度提升': '提升角色的行动速度',
    '暴击提升': '提升角色的暴击几率',
    '攻击降低': '降低目标的物理攻击力',
    '防御降低': '降低目标的物理防御力',
    '速度降低': '降低目标的行动速度',
    '中毒': '每回合造成持续伤害',
    '流血': '每回合造成持续伤害',
    '灼烧': '每回合造成持续伤害',
    '冰冻': '使目标无法行动',
    '眩晕': '使目标无法行动',
    '沉默': '使目标无法使用技能',
    '护盾': '为角色提供伤害吸收护盾',
    '治疗': '每回合恢复生命值'
  };

  return descriptions[status.name] || `${status.name}效果，影响角色的战斗属性`;
};

// 获取状态效果数值
const getStatusEffectValue = (status: StatusEffect) => {
  if (!status) return '';

  const effectValues: { [key: string]: string } = {
    '攻击提升': '攻击力 +20%',
    '防御提升': '防御力 +20%',
    '速度提升': '速度 +15%',
    '暴击提升': '暴击率 +10%',
    '攻击降低': '攻击力 -20%',
    '防御降低': '防御力 -20%',
    '速度降低': '速度 -15%',
    '中毒': '每回合损失 5% 最大生命值',
    '流血': '每回合损失 3% 最大生命值',
    '灼烧': '每回合损失 4% 最大生命值',
    '护盾': '吸收相当于最大生命值 20% 的伤害',
    '治疗': '每回合恢复 5% 最大生命值'
  };

  return effectValues[status.name] || '';
};

// 获取状态增益效果
const getStatusBuffEffect = (status: StatusEffect) => {
  if (!status) return '';

  const buffEffects: { [key: string]: string } = {
    '攻击提升': '提高角色的输出能力',
    '防御提升': '提高角色的生存能力',
    '速度提升': '提高角色的行动优先级',
    '暴击提升': '提高角色的爆发伤害',
    '护盾': '提供额外的伤害吸收',
    '治疗': '持续恢复生命值'
  };

  return buffEffects[status.name] || '';
};

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
  characterEffects.value.skill[characterId] = { type, name }

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
  if (tooltipTimeout) {
    raf.clear(tooltipTimeout)
  }

  timeouts.value.forEach((timeoutId) => {
    raf.clear(timeoutId)
  })

  cleanupAnimations()
  participantCardRefs.value = {}
})
</script>

<style scoped lang="scss">
@use'@/presentation/styles/main.scss';
</style>
