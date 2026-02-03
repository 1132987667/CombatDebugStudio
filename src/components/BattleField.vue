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
              :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: selectedCharacterId === member.id }" 
              @click="selectCharacter(member.id)"
            >
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
              :class="{ active: currentActor?.id === member.id, dead: member.currentHp <= 0, selected: selectedCharacterId === member.id }" 
              @click="selectCharacter(member.id)"
            >
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
import { computed } from "vue";

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
}>();

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
</script>

<style scoped>
.battle-panel {
  flex: 1;
  padding: 15px;
  display: flex;
  flex-direction: column;
}

.battle-top-section {
  margin-bottom: 20px;
}

.battle-header {
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.turn-info {
  display: flex;
  align-items: center;
  gap: 15px;
  font-size: 14px;
}

.turn-label {
  font-weight: bold;
}

.turn-num {
  font-weight: bold;
  color: #2196F3;
}

.actor-info {
  color: #666;
}

.battle-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex: 1;
}

.field-party {
  flex: 1;
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 15px;
}

.our-party {
  border-left: 4px solid #4CAF50;
}

.enemy-party {
  border-left: 4px solid #F44336;
}

.party-header {
  font-weight: bold;
  margin-bottom: 15px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.our-party .party-header {
  color: #4CAF50;
}

.enemy-party .party-header {
  color: #F44336;
}

.party-members {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.member-card {
  background: white;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.member-card:hover {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.member-card.active {
  border-color: #2196F3;
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
}

.member-card.dead {
  opacity: 0.5;
  background: #f5f5f5;
}

.member-card.selected {
  background: #e3f2fd;
  border-color: #2196F3;
}

.member-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member-name {
  font-weight: bold;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.member-action {
  font-size: 12px;
}

.acting-badge {
  background: #FFC107;
  color: #333;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: bold;
}

.enemy-acting {
  background: #F44336;
  color: white;
}

.member-hp {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hp-text {
  font-size: 12px;
  color: #666;
}

.hp-bar {
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.hp-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.hp-fill.high {
  background: #4CAF50;
}

.hp-fill.medium {
  background: #FFC107;
}

.hp-fill.low {
  background: #F44336;
}

.enemy-fill {
  background: #F44336;
}

.member-energy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.energy-text {
  font-size: 12px;
  color: #666;
}

.energy-bar {
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.energy-ticks {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 100%;
  display: flex;
  justify-content: space-between;
  pointer-events: none;
}

.tick {
  width: 1px;
  height: 100%;
  background: rgba(255,255,255,0.5);
}

.energy-fill {
  height: 100%;
  background: #2196F3;
  transition: width 0.3s ease;
}

.member-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.status-tag {
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: bold;
}

.status-tag.positive {
  background: #4CAF50;
  color: white;
}

.status-tag.negative {
  background: #F44336;
  color: white;
}

.no-status {
  color: #999;
  font-style: italic;
  font-size: 11px;
}

.field-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
}

.vs-text {
  font-size: 24px;
  font-weight: bold;
  color: #999;
}

.empty-party {
  text-align: center;
  color: #999;
  padding: 30px;
  font-style: italic;
}
</style>