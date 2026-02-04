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
          <div class="party-header">我方 ({{ ourParty.length }}人)</div>
          <div class="party-members">
            <div 
              v-for="member in ourParty" 
              :key="member.id" 
              class="member-card" 
              :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: selectedCharacterId === member.id, hit: member.isHit, casting: member.isCasting }" 
              @click="selectCharacter(member.id)"
            >
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
                  <span class="hp-text">HP: {{ member.currentHp }}/{{ member.maxHp }}</span>
                  <div class="hp-bar">
                    <div class="hp-fill" :class="getHpColorClass(member)" :style="{ width: getHpPercent(member) + '%' }"></div>
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
                    <div class="energy-fill" :style="{ width: ((member.currentEnergy || 0) / 150) * 100 + '%' }">
                    </div>
                  </div>
                </div>
                <div class="member-status">
                  <span 
                    v-for="status in getMemberStatuses(member)" 
                    :key="status.id" 
                    class="status-tag" 
                    :class="status.isPositive ? 'positive' : 'negative'"
                  >
                    {{ status.name }}:{{ status.remainingTurns }}
                  </span>
                  <span v-if="getMemberStatuses(member).length === 0" class="no-status">无</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="field-divider">
          <span class="vs-text">VS</span>
        </div>

        <div class="field-party enemy-party">
          <div class="party-header">敌方 ({{ enemyParty.length }}人)</div>
          <div class="party-members">
            <div 
              v-for="member in enemyParty" 
              :key="member.id" 
              class="member-card" 
              :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: selectedCharacterId === member.id, hit: member.isHit, casting: member.isCasting }" 
              @click="selectCharacter(member.id)"
            >
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
                    <div class="hp-fill enemy-fill" :class="getHpColorClass(member)" :style="{ width: getHpPercent(member) + '%' }"></div>
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
                    <div class="energy-fill enemy-fill" :style="{ width: ((member.currentEnergy || 0) / 150) * 100 + '%' }"></div>
                  </div>
                </div>
                <div class="member-status">
                  <span 
                    v-for="status in getMemberStatuses(member)" 
                    :key="status.id" 
                    class="status-tag" 
                    :class="status.isPositive ? 'positive' : 'negative'"
                  >
                    {{ status.name }}:{{ status.remainingTurns }}
                  </span>
                  <span v-if="getMemberStatuses(member).length === 0" class="no-status">无</span>
                </div>
              </div>
            </div>
            <div v-if="enemyParty.length === 0" class="empty-party">(空位)</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import DamageNumber from "./DamageNumber.vue";
import SkillEffect from "./SkillEffect.vue";

interface BattleCharacter {
  id: string;
  name: string;
  level: number;
  maxHp: number;
  currentHp: number;
  maxMp: number;
  currentMp: number;
  currentEnergy: number;
  maxEnergy: number;
  attack: number;
  defense: number;
  speed: number;
  enabled: boolean;
  isFirst: boolean;
  isHit?: boolean;
  isCasting?: boolean;
  buffs: Array<{
    id: string;
    name: string;
    remainingTurns: number;
    isPositive: boolean;
  }>;
}

const props = defineProps<{
  battleCharacters: BattleCharacter[];
  enemyParty: BattleCharacter[];
  selectedCharacterId: string;
  currentActorId: string | null;
  currentTurn: number;
  maxTurns: number;
}>();

const emit = defineEmits<{
  "select-character": [characterId: string];
  "show-damage": [characterId: string, value: number, type: 'damage' | 'heal' | 'critical' | 'miss', isCritical: boolean];
  "show-skill-effect": [characterId: string, type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate', name?: string];
}>();

const damageNumberRefs = ref<InstanceType<typeof DamageNumber>[]>([]);
const skillEffectRefs = ref<InstanceType<typeof SkillEffect>[]>([]);

const ourParty = computed(() => {
  return props.battleCharacters
    .filter((c) => c.enabled)
    .sort((a, b) => b.speed - a.speed);
});

const currentActor = computed(() => {
  if (!props.currentActorId) return null;
  return (
    props.battleCharacters.find((c) => c.id === props.currentActorId) ||
    props.enemyParty.find((e) => e.id === props.currentActorId) ||
    null
  );
});

const selectCharacter = (charId: string) => {
  emit('select-character', charId);
};

const getHpPercent = (char: BattleCharacter) => {
  return Math.max(0, (char.currentHp / char.maxHp) * 100);
};

const getHpColorClass = (char: BattleCharacter): string => {
  const percent = (char.currentHp / char.maxHp) * 100;
  if (percent <= 25) return 'low';
  if (percent <= 50) return 'medium';
  return 'high';
};

const getMemberStatuses = (char: BattleCharacter) => {
  return char.buffs || [];
};

function showDamage(characterId: string, value: number, type: 'damage' | 'heal' | 'critical' | 'miss', isCritical: boolean = false) {
  emit('show-damage', characterId, value, type, isCritical);
}

function showSkillEffect(characterId: string, type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate', name?: string) {
  emit('show-skill-effect', characterId, type, name);
}

function triggerHitEffect(characterId: string) {
  const character = props.battleCharacters.find(c => c.id === characterId);
  const enemy = props.enemyParty.find(e => e.id === characterId);
  
  if (character) {
    character.isHit = true;
    setTimeout(() => {
      character.isHit = false;
    }, 300);
  }
  
  if (enemy) {
    enemy.isHit = true;
    setTimeout(() => {
      enemy.isHit = false;
    }, 300);
  }
}

function triggerCastingEffect(characterId: string, duration: number = 1000) {
  const character = props.battleCharacters.find(c => c.id === characterId);
  const enemy = props.enemyParty.find(e => e.id === characterId);
  
  if (character) {
    character.isCasting = true;
    setTimeout(() => {
      character.isCasting = false;
    }, duration);
  }
  
  if (enemy) {
    enemy.isCasting = true;
    setTimeout(() => {
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
@import './BattleArena.scss';
</style>