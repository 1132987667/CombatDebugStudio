<template>
  <div class="battle-panel panel-center">
    <div class="battle-top-section">
      <div class="battle-header">
        <div class="turn-info">
          <span class="turn-label">当前回合:</span>
          <span class="turn-num">{{ currentTurn }}/{{ maxTurns }}</span>
          <span class="actor-info">操作方: {{ currentActor?.name || '等待中' }} (SPD:{{ currentActor?.speed || 0
          }})</span>
        </div>
      </div>

      <div class="battle-field">
        <div class="field-party our-party">
          <div class="party-header">我方 ({{ filterAllyTeam.length }}人)</div>
          <div class="party-members">
            <div v-for="member in filterAllyTeam" :key="member.id" class="member-card"
              :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: selectedCharacterId === member.id, hit: member.isHit, casting: member.isCasting }"
              @click="selectCharacter(member.id)">
              <DamageNumber ref="damageNumberRefs" :position="{ x: 50, y: 20 }" />
              <SkillEffect ref="skillEffectRefs" :position="{ x: 50, y: 50 }" />
              <div class="member-info">
                <div class="member-name">
                  Lv.{{ member.level }} {{ member.name }}
                  <div class="member-action" v-if="currentActor?.id === member.id">
                    <span class="acting-badge">←操作中</span>
                  </div>
                </div>
                <div class="member-hp">
                  <span class="hp-text">{{ member.currentHp }}/{{ member.maxHp }}</span>
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
                    {{ status.name }}:{{ status.remainingTurns }}
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
              :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: selectedCharacterId === member.id, hit: member.isHit, casting: member.isCasting }"
              @click="selectCharacter(member.id)">
              <DamageNumber ref="damageNumberRefs" :position="{ x: 50, y: 20 }" />
              <SkillEffect ref="skillEffectRefs" :position="{ x: 50, y: 50 }" />
              <div class="member-info">
                <div class="member-name">
                  Lv.{{ member.level }} {{ member.name }}
                  <div class="member-action" v-if="currentActor?.id === member.id">
                    <span class="acting-badge enemy-acting">←操作中</span>
                  </div>
                </div>
                <div class="member-hp">
                  <span class="hp-text">HP: {{ member.currentHp }}/{{ member.maxHp }}</span>
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
                    {{ status.name }}:{{ status.remainingTurns }}
                  </span>
                  <span v-if="getMemberStatuses(member).length === 0" class="no-status">无</span>
                </div>
              </div>
            </div>
            <div v-if="enemyTeam.length === 0" class="empty-party">(空位)</div>
          </div>
        </div>
      </div>
    </div>

    <BattleLog :logs="props.battleLogs" />

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
          <span class="value">{{ statusTooltip.status?.remainingTurns || 0 }}回合</span>
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
import { computed, ref } from "vue";
import { raf } from '@/utils/RAF';
import DamageNumber from "@/components/DamageNumber.vue";
import SkillEffect from "@/components/SkillEffect.vue";
import BattleLog from "@/views/BattleLog.vue";
import type { BattleLogEntry } from '@/types/battle-log';

const props = defineProps<{
  allyTeam: any[];
  enemyTeam: any[];
  selectedCharacterId: string | null;
  currentActorId: string | null;
  currentTurn: number;
  maxTurns: number;
  battleLogs: BattleLogEntry[];
}>();

const emit = defineEmits<{
  "select-character": [characterId: string];
  "show-damage": [characterId: string, value: number, type: 'damage' | 'heal' | 'critical' | 'miss', isCritical: boolean];
  "show-skill-effect": [characterId: string, type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate', name?: string];
}>();

const damageNumberRefs = ref<InstanceType<typeof DamageNumber>[]>([]);
const skillEffectRefs = ref<InstanceType<typeof SkillEffect>[]>([]);

const filterAllyTeam = computed(() => {
  return props.allyTeam
    .filter((c) => c.enabled)
    .sort((a, b) => b.speed - a.speed);
});
const filterEnemyTeam = computed(() => {
  return props.enemyTeam
    .filter((c) => c.enabled)
    .sort((a, b) => b.speed - a.speed);
});

const currentActor = computed(() => {
  if (!props.currentActorId) return null;
  return (
    props.allyTeam.find((c) => c.id === props.currentActorId) ||
    props.enemyTeam.find((e) => e.id === props.currentActorId) ||
    null
  );
});

const selectCharacter = (charId: string) => {
  emit('select-character', charId);
};

const getHpPercent = (char: any) => {
  return Math.max(0, (char.currentHp / char.maxHp) * 100);
};

const getHpColorClass = (char: any): string => {
  const percent = (char.currentHp / char.maxHp) * 100;
  if (percent <= 25) return 'low';
  if (percent <= 50) return 'medium';
  return 'high';
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
    raf.setTimeout(() => {
      statusTooltip.value.opacity = 1;
    }, 10);
  }, 300);
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

function showDamage(characterId: string, value: number, type: 'damage' | 'heal' | 'critical' | 'miss', isCritical: boolean = false) {
  emit('show-damage', characterId, value, type, isCritical);
}

function showSkillEffect(characterId: string, type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate', name?: string) {
  emit('show-skill-effect', characterId, type, name);
}

function triggerHitEffect(characterId: string) {
  const character = props.allyTeam.find(c => c.id === characterId);
  const enemy = props.enemyTeam.find(e => e.id === characterId);

  if (character) {
    character.isHit = true;
    raf.setTimeout(() => {
      character.isHit = false;
    }, 300);
  }

  if (enemy) {
    enemy.isHit = true;
    raf.setTimeout(() => {
      enemy.isHit = false;
    }, 300);
  }
}

function triggerCastingEffect(characterId: string, duration: number = 1000) {
  const character = props.allyTeam.find(c => c.id === characterId);
  const enemy = props.enemyTeam.find(e => e.id === characterId);

  if (character) {
    character.isCasting = true;
    raf.setTimeout(() => {
      character.isCasting = false;
    }, duration);
  }

  if (enemy) {
    enemy.isCasting = true;
    raf.setTimeout(() => {
      enemy.isCasting = false;
    }, duration);
  }
}

defineExpose({
  showDamage,
  showSkillEffect,
  triggerHitEffect,
  triggerCastingEffect
});
</script>

<style scoped lang="scss">
@use'@/styles/main.scss';
</style>