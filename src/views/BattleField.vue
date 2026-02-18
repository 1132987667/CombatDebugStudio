<template>
  <div class="battle-panel panel-center">
    <div class="battle-top-section">
      <div class="battle-header">
        <div class="turn-info">
          <span class="turn-label">当前回合:</span>
          <span class="turn-num">{{ characterStore.currentTurn }}/{{ characterStore.maxTurns }}</span>
          <span class="actor-info">操作方: {{ currentActor?.name || '等待中' }} (SPD:{{ getMemberSpeed(currentActor) }})</span>
        </div>
      </div>

      <div class="battle-field">
        <div class="field-party our-party">
          <div class="party-header">我方 ({{ filterAllyTeam.length }}人)</div>
          <div class="party-members">
            <div v-for="member in filterAllyTeam" :key="member.id" class="member-card"
            :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: characterStore.selectedCharacterId === member.id, hit: characterEffects.animation[member.id]?.isHit, casting: characterEffects.animation[member.id]?.isCasting, buffed: characterEffects.animation[member.id]?.isBuffed }"
            @click="selectCharacter(member.id)">
              <DamageNumber :position="{ x: 50, y: 20 }" :damage="getCharacterDamage(member.id)" :type="getCharacterDamageType(member.id)" :is-critical="getCharacterIsCritical(member.id)" />
              <SkillEffect :position="{ x: 50, y: 50 }" :effect-type="getCharacterSkillEffect(member.id)" :skill-name="getCharacterSkillName(member.id)" />
              <div class="member-info">
                <div class="member-name">
                  Lv.{{ member.level }} {{ member.name }}
                  <div class="member-action" v-if="currentActor?.id === member.id">
                    <span class="acting-badge">←操作中</span>
                  </div>
                </div>
                <div class="member-hp">
                  <span class="hp-text">{{ getMemberHp(member) }}</span>
                  <div class="hp-bar">
                    <div class="hp-fill" :class="getHpColorClass(member)"
                      :style="{ width: getHpPercent(member) + '%' }"></div>
                  </div>
                </div>
                <div class="member-energy">
                  <span class="energy-text">{{ member.currentEnergy || 0 }}/150</span>
                  <div class="energy-bar">
                    <div class="energy-ticks">
                      <div class="tick"></div>
                      <div class="tick"></div>
                      <div class="tick"></div>
                      <div class="tick"></div>
                    </div>
                    <div class="energy-fill" :style="{ width: ((member.currentEnergy || 0) / 150) * 100 + '%' }">
                    </div>
                  </div>
                </div>
                <!-- 角色状态标签列表 -->
                <div class="member-status">
                  <span v-for="status in getMemberStatuses(member)" :key="status.id" class="status-tag"
                    :class="status.isPositive ? 'positive' : 'negative'" @mouseenter="showStatusTooltip($event, status)"
                    @mouseleave="hideStatusTooltip">
                    {{ status.name }}:{{ status.duration }}
                  </span>
                  <span v-if="getMemberStatuses(member).length === 0" class="no-status">无</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- <div class="field-divider">
          <span class="vs-text">VS</span>
        </div> -->

        <div class="field-party enemy-party">
          <div class="party-header">敌方 ({{ filterEnemyTeam.length }}人)</div>
          <div class="party-members">
            <div v-for="member in filterEnemyTeam" :key="member.id" class="member-card"
              :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: characterStore.selectedCharacterId === member.id, hit: characterEffects.animation[member.id]?.isHit, casting: characterEffects.animation[member.id]?.isCasting, buffed: characterEffects.animation[member.id]?.isBuffed }"
              @click="selectCharacter(member.id)">
              <DamageNumber :position="{ x: 50, y: 20 }" :damage="getCharacterDamage(member.id)" :type="getCharacterDamageType(member.id)" :is-critical="getCharacterIsCritical(member.id)" />
              <SkillEffect :position="{ x: 50, y: 50 }" :effect-type="getCharacterSkillEffect(member.id)" :skill-name="getCharacterSkillName(member.id)" />
              <div class="member-info">
                <div class="member-name">
                  Lv.{{ member.level }} {{ member.name }}
                  <div class="member-action" v-if="currentActor?.id === member.id">
                    <span class="acting-badge enemy-acting">←操作中</span>
                  </div>
                </div>
                <div class="member-hp">
                  <span class="hp-text">HP: {{ getMemberHp(member) }}</span>
                  <div class="hp-bar">
                    <div class="hp-fill enemy-fill" :class="getHpColorClass(member)"
                      :style="{ width: getHpPercent(member) + '%' }"></div>
                  </div>
                </div>
                <div class="member-energy">
                  <span class="energy-text">能量: {{ member.currentEnergy || 0 }}/150</span>
                  <div class="energy-bar">
                    <div class="energy-ticks">
                      <div class="tick"></div>
                      <div class="tick"></div>
                      <div class="tick"></div>
                      <div class="tick"></div>
                    </div>
                    <div class="energy-fill enemy-fill"
                      :style="{ width: ((member.currentEnergy || 0) / 150) * 100 + '%' }"></div>
                  </div>
                </div>
                <div class="member-status">
                  <span v-for="status in getMemberStatuses(member)" :key="status.id" class="status-tag"
                    :class="status.isPositive ? 'positive' : 'negative'" @mouseenter="showStatusTooltip($event, status)"
                    @mouseleave="hideStatusTooltip">
                    {{ status.name }}:{{ status.duration }}
                  </span>
                  <span v-if="getMemberStatuses(member).length === 0" class="no-status">无</span>
                </div>
              </div>
            </div>
            <div v-if="characterStore.enemyTeam.size === 0" class="empty-party">(空位)</div>
          </div>
        </div>
      </div>
    </div>

    <BattleLog :logs="logStore.battleLogs" />

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
import { computed, ref, onMounted, onUnmounted } from "vue";
import { raf } from '@/utils/RAF';
import { GameDataProcessor } from '@/utils/GameDataProcessor';
import { useCharacterList } from '@/composables/useCharacterList';
import { useCharacterStore, useLogStore } from "@/stores";
import { eventBus } from "@/main";
import { BattleSystemEvent } from "@/types/battle";
import DamageNumber from "@/components/DamageNumber.vue";
import SkillEffect from "@/components/SkillEffect.vue";
import BattleLog from "@/views/BattleLog.vue";

// 使用Pinia stores
const characterStore = useCharacterStore();
const logStore = useLogStore();

const props = defineProps<{
  currentActorId: string | null;
  turnOrder?: string[];
  damageEffects?: Record<string, { value: number; type: 'damage' | 'heal' | 'critical' | 'miss'; isCritical: boolean }>;
  skillEffects?: Record<string, { type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate'; name?: string }>;
}>();

const emit = defineEmits<{
  "select-character": [characterId: string];
}>();

// 角色效果状态
const characterEffects = ref<{
  damage: Record<string, { value: number; type: 'damage' | 'heal' | 'critical' | 'miss'; isCritical: boolean }>;
  skill: Record<string, { type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate'; name?: string }>;
  animation: Record<string, { isHit: boolean; isCasting: boolean; isBuffed: boolean }>;
}>({
  damage: {},
  skill: {},
  animation: {}
});

// 使用角色列表管理组合式函数
const { 
  filterAndSortAllyTeam, 
  filterAndSortEnemyTeam, 
  getHpPercent, 
  getHpColorClass, 
  getMemberHp, 
  getMemberSpeed 
} = useCharacterList();

// 根据回合顺序排序角色列表
const filterAllyTeam = computed(() => {
  const enabledAllies = Array.from(characterStore.allyTeam.values()).filter((c) => c.enabled);
  if (props.turnOrder) {
    // 如果有回合顺序，按照回合顺序排序
    return enabledAllies.sort((a, b) => {
      const indexA = props.turnOrder!.indexOf(a.id);
      const indexB = props.turnOrder!.indexOf(b.id);
      // 不在回合顺序中的角色放在最后
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  } else {
    // 否则按速度排序
    return enabledAllies.sort((a, b) => getMemberSpeed(b) - getMemberSpeed(a));
  }
});

const filterEnemyTeam = computed(() => {
  const enabledEnemies = Array.from(characterStore.enemyTeam.values()).filter((c) => c.enabled);
  if (props.turnOrder) {
    // 如果有回合顺序，按照回合顺序排序
    return enabledEnemies.sort((a, b) => {
      const indexA = props.turnOrder!.indexOf(a.id);
      const indexB = props.turnOrder!.indexOf(b.id);
      // 不在回合顺序中的角色放在最后
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  } else {
    // 否则按速度排序
    return enabledEnemies.sort((a, b) => getMemberSpeed(b) - getMemberSpeed(a));
  }
});

const currentActor = computed(() => {
  if (!props.currentActorId) return null;
  return (
    characterStore.allyTeam.get(props.currentActorId) ||
    characterStore.enemyTeam.get(props.currentActorId) ||
    null
  );
});

const selectCharacter = (charId: string) => {
  characterStore.selectCharacter(charId);
  emit('select-character', charId);
};

// 状态工具提示相关逻辑
const statusTooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  opacity: 0,
  status: null as any
});

let tooltipTimeout: symbol | null = null;
// 跟踪所有定时器，用于组件卸载时清理
const timeouts = ref<symbol[]>([]);

// 显示状态工具提示
const showStatusTooltip = (event: MouseEvent, status: any) => {
  if (tooltipTimeout) {
    raf.clearTimeout(tooltipTimeout);
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
    raf.clearTimeout(tooltipTimeout);
    tooltipTimeout = null;
  }

  statusTooltip.value.visible = false;
  statusTooltip.value.opacity = 0;
};

// 获取状态描述
const getStatusDescription = (status: any) => {
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
const getStatusEffectValue = (status: any) => {
  if (!status) return '';

  const effectValues: { [key: string]: string } = {
    '攻击提升': '攻击力+20%',
    '防御提升': '防御力+20%',
    '速度提升': '速度+15%',
    '暴击提升': '暴击率+10%',
    '攻击降低': '攻击力-20%',
    '防御降低': '防御力-20%',
    '速度降低': '速度-15%',
    '中毒': '每回合损失5%最大生命值',
    '流血': '每回合损失3%最大生命值',
    '灼烧': '每回合损失4%最大生命值',
    '护盾': '吸收相当于最大生命值20%的伤害',
    '治疗': '每回合恢复5%最大生命值'
  };

  return effectValues[status.name] || '';
};

// 获取状态增益效果
const getStatusBuffEffect = (status: any) => {
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

const getMemberStatuses = (char: any) => {
  return char.buffs || [];
};

// 获取角色伤害信息
function getCharacterDamage(characterId: string): number {
  return props.damageEffects?.[characterId]?.value || characterEffects.value.damage[characterId]?.value || 0;
}

// 获取角色伤害类型
function getCharacterDamageType(characterId: string): 'damage' | 'heal' | 'critical' | 'miss' {
  return props.damageEffects?.[characterId]?.type || characterEffects.value.damage[characterId]?.type || 'damage';
}

// 获取角色是否暴击
function getCharacterIsCritical(characterId: string): boolean {
  return props.damageEffects?.[characterId]?.isCritical || characterEffects.value.damage[characterId]?.isCritical || false;
}

// 获取角色技能效果类型
function getCharacterSkillEffect(characterId: string): 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate' | null {
  return props.skillEffects?.[characterId]?.type || characterEffects.value.skill[characterId]?.type || null;
}

// 获取角色技能名称
function getCharacterSkillName(characterId: string): string | undefined {
  return props.skillEffects?.[characterId]?.name || characterEffects.value.skill[characterId]?.name;
}

// 显示伤害效果
function showDamage(characterId: string, value: number, type: 'damage' | 'heal' | 'critical' | 'miss', isCritical: boolean = false) {
  characterEffects.value.damage[characterId] = { value, type, isCritical };
  
  // 触发 hit 效果
  triggerHitEffect(characterId);
  
  // 3秒后清除效果
  const timeoutId = raf.setTimeout(() => {
    delete characterEffects.value.damage[characterId];
  }, 3000);
  timeouts.value.push(timeoutId);
}

// 显示Miss效果
function showMiss(characterId: string) {
  characterEffects.value.damage[characterId] = { value: 0, type: 'miss', isCritical: false };
  
  // 3秒后清除效果
  const timeoutId = raf.setTimeout(() => {
    delete characterEffects.value.damage[characterId];
  }, 3000);
  timeouts.value.push(timeoutId);
}

// 显示技能效果
function showSkillEffect(characterId: string, type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate', name?: string) {
  characterEffects.value.skill[characterId] = { type, name };
  
  // 触发施法效果
  triggerCastingEffect(characterId);
  
  // 3秒后清除效果
  const timeoutId = raf.setTimeout(() => {
    delete characterEffects.value.skill[characterId];
  }, 3000);
  timeouts.value.push(timeoutId);
}

// 显示Buff效果
function showBuffEffect(characterId: string, _buffName: string, _isPositive: boolean) {
  // 触发Buff效果动画
  triggerBuffEffect(characterId);
}

// 触发Hit效果
function triggerHitEffect(characterId: string) {
  // 初始化角色动画状态
  if (!characterEffects.value.animation[characterId]) {
    characterEffects.value.animation[characterId] = { isHit: false, isCasting: false, isBuffed: false };
  }
  
  // 触发hit效果
  characterEffects.value.animation[characterId].isHit = true;
  const timeoutId = raf.setTimeout(() => {
    if (characterEffects.value.animation[characterId]) {
      characterEffects.value.animation[characterId].isHit = false;
    }
  }, 300);
  timeouts.value.push(timeoutId);
}

// 触发施法效果
function triggerCastingEffect(characterId: string, duration: number = 1000) {
  // 初始化角色动画状态
  if (!characterEffects.value.animation[characterId]) {
    characterEffects.value.animation[characterId] = { isHit: false, isCasting: false, isBuffed: false };
  }
  
  // 触发casting效果
  characterEffects.value.animation[characterId].isCasting = true;
  const timeoutId = raf.setTimeout(() => {
    if (characterEffects.value.animation[characterId]) {
      characterEffects.value.animation[characterId].isCasting = false;
    }
  }, duration);
  timeouts.value.push(timeoutId);
}

// 触发Buff效果
function triggerBuffEffect(characterId: string) {
  // 初始化角色动画状态
  if (!characterEffects.value.animation[characterId]) {
    characterEffects.value.animation[characterId] = { isHit: false, isCasting: false, isBuffed: false };
  }
  
  // 触发buffed效果
  characterEffects.value.animation[characterId].isBuffed = true;
  const timeoutId = raf.setTimeout(() => {
    if (characterEffects.value.animation[characterId]) {
      characterEffects.value.animation[characterId].isBuffed = false;
    }
  }, 500);
  timeouts.value.push(timeoutId);
}

// 清理所有动画效果
function cleanupAnimations() {
  // 清理所有伤害效果
  characterEffects.value.damage = {};
  // 清理所有技能效果
  characterEffects.value.skill = {};
  // 清理所有动画状态
  characterEffects.value.animation = {};
  // 清理工具提示
  hideStatusTooltip();
}

// 暴露方法供父组件调用
defineExpose({
  showDamage,
  showMiss,
  showSkillEffect,
  showBuffEffect,
  triggerHitEffect,
  triggerCastingEffect,
  triggerBuffEffect,
  cleanupAnimations
});

// 组件挂载时订阅事件总线
onMounted(() => {
  // 订阅伤害动画事件
  eventBus.on(BattleSystemEvent.DAMAGE_ANIMATION, (data: { targetId: string; damage: number; damageType: string; isCritical: boolean; isHeal: boolean }) => {
    if (data && data.targetId) {
      showDamage(data.targetId, data.damage, data.isHeal ? 'heal' : data.isCritical ? 'critical' : 'damage', data.isCritical);
    }
  });

  // 订阅闪避动画事件
  eventBus.on(BattleSystemEvent.MISS_ANIMATION, (data: { targetId: string }) => {
    if (data && data.targetId) {
      showMiss(data.targetId);
    }
  });

  // 订阅Buff效果事件
  eventBus.on(BattleSystemEvent.BUFF_EFFECT, (data: { targetId: string; buffName: string; isPositive: boolean }) => {
    if (data && data.targetId) {
      showBuffEffect(data.targetId, data.buffName, data.isPositive);
    }
  });

  // 订阅技能效果事件
  eventBus.on(BattleSystemEvent.SKILL_EFFECT, (data: { sourceId: string; targetId: string; skillName: string; effectType: string; damageType: string }) => {
    if (data && data.targetId) {
      showSkillEffect(data.targetId, data.effectType as any, data.skillName);
    }
  });
});

// 组件卸载时清理所有定时器和事件订阅
onUnmounted(() => {
  // 清理事件总线订阅
  eventBus.off(BattleSystemEvent.DAMAGE_ANIMATION);
  eventBus.off(BattleSystemEvent.MISS_ANIMATION);
  eventBus.off(BattleSystemEvent.BUFF_EFFECT);
  eventBus.off(BattleSystemEvent.SKILL_EFFECT);

  // 清理工具提示定时器
  if (tooltipTimeout) {
    raf.clearTimeout(tooltipTimeout);
  }
  
  // 清理所有其他定时器
  timeouts.value.forEach(timeoutId => {
    raf.clearTimeout(timeoutId);
  });
  
  // 清理所有动画效果
  cleanupAnimations();
});
</script>

<style scoped lang="scss">
@use'@/styles/main.scss';

.member-card.buffed {
  animation: buffGlow 0.5s ease-out;
}

@keyframes buffGlow {
  0% {
    box-shadow: 0 0 0 rgba(100, 200, 255, 0);
    filter: brightness(1);
  }
  50% {
    box-shadow: 0 0 20px rgba(100, 200, 255, 0.8);
    filter: brightness(1.2);
  }
  100% {
    box-shadow: 0 0 0 rgba(100, 200, 255, 0);
    filter: brightness(1);
  }
}

.member-card.buffed .member-status {
  animation: statusPulse 0.5s ease-out;
}

@keyframes statusPulse {
  0% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
  }
}

/* Hit效果动画 */
.member-card.hit {
  animation: hitEffect 0.3s ease-out;
}

@keyframes hitEffect {
  0% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
    filter: brightness(0.8);
  }
  75% {
    transform: translateX(5px);
  }
  100% {
    transform: translateX(0);
    filter: brightness(1);
  }
}

/* 施法效果动画 */
.member-card.casting {
  animation: castingEffect 1s ease-out;
}

@keyframes castingEffect {
  0% {
    box-shadow: 0 0 0 rgba(200, 150, 255, 0);
    filter: brightness(1);
  }
  50% {
    box-shadow: 0 0 15px rgba(200, 150, 255, 0.6);
    filter: brightness(1.1);
  }
  100% {
    box-shadow: 0 0 0 rgba(200, 150, 255, 0);
    filter: brightness(1);
  }
}

/* 确保动画只播放一次 */
.member-card.hit, .member-card.casting, .member-card.buffed {
  animation-iteration-count: 1;
}
</style>