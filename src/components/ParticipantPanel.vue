<template>
  <div class="config-panel panel-left">
    <div class="panel-section">
      <div class="section-header">
        <span>参战角色</span>
      </div>
      <div class="section-content">
        <div class="character-field">
          <div class="character-party our-party">
            <div class="party-header">我方 ({{ battleCharacters.filter(c => c.enabled).length }}人)</div>
            <div class="party-members">
              <div 
                v-for="char in battleCharacters" 
                :key="char.id" 
                class="character-item" 
                :class="{ selected: selectedCharacterId === char.id, disabled: !char.enabled }" 
                @click="selectCharacter(char.id)"
              >
                <div class="char-check">
                  <input type="checkbox" v-model="char.enabled" @click.stop>
                </div>
                <div class="char-info">
                  <span class="char-name">{{ char.name }}</span>
                  <span class="char-stats">HP:{{ char.currentHp }}/{{ char.maxHp }} SPD:{{ char.speed }}</span>
                </div>
                <div class="char-order" v-if="char.enabled">
                  <span class="order-num">{{ getOrderIndex(char.id) }}</span>
                </div>
                <div class="char-status" v-if="char.isFirst">
                  <span class="first-badge">先手</span>
                </div>
              </div>
            </div>
          </div>

          <div class="field-divider">
            <span class="vs-text">VS</span>
          </div>

          <div class="character-party enemy-party">
            <div class="party-header">敌方 ({{ enemyParty.length }}人)</div>
            <div class="party-members">
              <div 
                v-for="char in enemyParty" 
                :key="char.id" 
                class="character-item" 
                :class="{ selected: selectedCharacterId === char.id }" 
                @click="selectCharacter(char.id)"
              >
                <div class="char-check">
                  <input type="checkbox" v-model="char.enabled" @click.stop>
                </div>
                <div class="char-info">
                  <span class="char-name">{{ char.name }}</span>
                  <span class="char-stats">HP:{{ char.currentHp }}/{{ char.maxHp }} SPD:{{ char.speed }}</span>
                </div>
                <div class="char-order" v-if="char.enabled">
                  <span class="order-num">-</span>
                </div>
                <div class="char-status" v-if="char.buffs && char.buffs.length > 0">
                  <span class="first-badge">状态</span>
                </div>
              </div>
              <div v-if="enemyParty.length === 0" class="empty-party">(空位)</div>
            </div>
          </div>
        </div>
      </div>
      <div class="section-actions">
        <button class="btn-small" @click="moveCharacter(-1)">[↑]上调</button>
        <button class="btn-small" @click="moveCharacter(1)">[↓]下调</button>
        <button class="btn-small" @click="addCharacter">[+]添加</button>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span>角色库</span>
      </div>
      <div class="section-content">
        <div class="character-search">
          <input type="text" v-model="enemySearch" placeholder="搜索角色库..." class="search-input">
        </div>
        <div class="scene-enemy-list">
          <div v-for="group in groupedEnemies" :key="group.scene.id" class="scene-group">
            <div class="scene-header" @click="toggleSceneExpand(group.scene.id)">
              <span class="expand-icon">{{ isSceneExpanded(group.scene.id) ? '▼' : '▶' }}</span>
              <span class="scene-name">{{ group.scene.name }}</span>
              <span class="scene-level">Lv.{{ group.scene.requiredLevel }}+</span>
              <span class="scene-count">{{ group.enemies.length }}人</span>
            </div>
            <div class="scene-enemies" v-show="isSceneExpanded(group.scene.id)">
              <div 
                v-for="enemy in group.enemies" 
                :key="enemy.id" 
                class="character-item" 
                @click="addEnemyToBattle(enemy)"
              >
                <div class="char-info">
                  <span class="char-name">{{ enemy.name }}</span>
                  <span class="char-stats">Lv.{{ enemy.level }} HP:{{ enemy.stats.health }} ATK:{{
                    enemy.stats.minAttack }}-{{ enemy.stats.maxAttack }}</span>
                </div>
                <div class="char-actions">
                  <button class="btn-tiny" @click.stop="addEnemyToBattle(enemy, 'our')">我方</button>
                  <button class="btn-tiny" @click.stop="addEnemyToBattle(enemy, 'enemy')">敌方</button>
                </div>
              </div>
            </div>
          </div>
          <div v-if="groupedEnemies.length === 0" class="empty-message">
            未找到匹配的敌人
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import enemiesData from "@configs/enemies/enemies.json";
import scenesData from "@configs/scenes/scenes.json";

interface BattleCharacter {
  originalId?: string;
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

interface EnemyData {
  id: string;
  name: string;
  level: number;
  stats: {
    health: number;
    minAttack: number;
    maxAttack: number;
    defense: number;
    speed: number;
  };
  drops: Array<{
    itemId: string;
    quantity: number;
    chance: number;
  }>;
  skills: {
    small?: string;
    passive?: string;
    ultimate?: string;
  };
}

interface SceneData {
  id: string;
  name: string;
  background: string;
  difficulties: {
    easy: { enemyIds: string[] };
    normal: { enemyIds: string[] };
    hard: { enemyIds: string[] };
  };
  requiredLevel: number;
  rewards: {
    exp: number;
    gold: number;
  };
}

interface GroupedEnemies {
  scene: SceneData;
  enemies: EnemyData[];
}

const props = defineProps<{
  battleCharacters: BattleCharacter[];
  enemyParty: BattleCharacter[];
  selectedCharacterId: string;
}>();

const emit = defineEmits<{
  "select-character": [characterId: string];
  "add-character": [];
  "move-character": [direction: number];
  "add-enemy": [enemy: EnemyData, side: string];
}>();

const enemySearch = ref("");
const scenes = ref<SceneData[]>(scenesData as SceneData[]);
const expandedScenes = reactive<Record<string, boolean>>({});

scenes.value.forEach((s) => (expandedScenes[s.id] = true));

const ourParty = computed(() => {
  return props.battleCharacters
    .filter((c) => c.enabled)
    .sort((a, b) => b.speed - a.speed);
});

const filteredEnemies = computed(() => {
  let filtered = [...(enemiesData as EnemyData[])];
  if (enemySearch.value) {
    const keyword = enemySearch.value.toLowerCase();
    filtered = filtered.filter((enemy) =>
      enemy.name.toLowerCase().includes(keyword)
    );
  }
  return filtered;
});

const groupedEnemies = computed<GroupedEnemies[]>(() => {
  const allScenes = scenes.value;
  const allEnemies = filteredEnemies.value;

  return allScenes
    .map((scene) => {
      const sceneEnemyIds = new Set([
        ...scene.difficulties.easy.enemyIds,
        ...scene.difficulties.normal.enemyIds,
        ...scene.difficulties.hard.enemyIds,
      ]);

      const sceneEnemies = allEnemies.filter((enemy) =>
        sceneEnemyIds.has(enemy.id)
      );

      return {
        scene,
        enemies: sceneEnemies,
      };
    })
    .filter((group) => group.enemies.length > 0);
});

const getOrderIndex = (charId: string) => {
  const index = ourParty.value.findIndex((c) => c.id === charId);
  return index >= 0 ? index + 1 : 0;
};

const selectCharacter = (charId: string) => {
  emit('select-character', charId);
};

const addEnemyToBattle = (enemy: EnemyData, side: "our" | "enemy" = "our") => {
  emit('add-enemy', enemy, side);
};

const moveCharacter = (direction: number) => {
  emit('move-character', direction);
};

const addCharacter = () => {
  emit('add-character');
};

const toggleSceneExpand = (sceneId: string) => {
  expandedScenes[sceneId] = !expandedScenes[sceneId];
};

const isSceneExpanded = (sceneId: string): boolean => {
  return expandedScenes[sceneId] === true;
};
</script>

<style scoped>
.config-panel {
  width: 300px;
  padding: 15px;
  background: #f5f5f5;
  border-right: 1px solid #ddd;
  overflow-y: auto;
  max-height: calc(100vh - 120px);
}

.panel-section {
  margin-bottom: 20px;
  background: white;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.section-header {
  padding: 10px 15px;
  background: #f0f0f0;
  border-bottom: 1px solid #ddd;
  border-radius: 6px 6px 0 0;
  font-weight: bold;
}

.section-content {
  padding: 15px;
}

.character-field {
  margin-bottom: 15px;
}

.character-party {
  margin-bottom: 15px;
}

.party-header {
  font-weight: bold;
  margin-bottom: 10px;
  padding-bottom: 5px;
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
  gap: 8px;
}

.character-item {
  display: flex;
  align-items: center;
  padding: 8px;
  background: #f9f9f9;
  border: 1px solid #eee;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.character-item:hover {
  background: #f0f0f0;
  border-color: #ddd;
}

.character-item.selected {
  background: #e3f2fd;
  border-color: #2196F3;
}

.character-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.char-check {
  margin-right: 10px;
}

.char-info {
  flex: 1;
}

.char-name {
  display: block;
  font-weight: bold;
  margin-bottom: 2px;
}

.char-stats {
  font-size: 11px;
  color: #666;
}

.char-order {
  margin-left: 10px;
  font-size: 12px;
  color: #888;
}

.char-status {
  margin-left: 10px;
}

.first-badge {
  background: #FFC107;
  color: #333;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: bold;
}

.field-divider {
  text-align: center;
  margin: 15px 0;
  position: relative;
}

.field-divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: #ddd;
  z-index: 1;
}

.vs-text {
  position: relative;
  background: white;
  padding: 0 10px;
  z-index: 2;
  font-weight: bold;
  color: #666;
}

.empty-party {
  text-align: center;
  color: #999;
  padding: 10px;
  font-style: italic;
}

.section-actions {
  display: flex;
  gap: 10px;
  padding: 10px 15px;
  border-top: 1px solid #ddd;
  background: #f9f9f9;
  border-radius: 0 0 6px 6px;
}

.btn-small {
  padding: 5px 10px;
  font-size: 12px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 3px;
  cursor: pointer;
}

.btn-small:hover {
  background: #e0e0e0;
}

.character-search {
  margin-bottom: 15px;
}

.search-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
}

.scene-enemy-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scene-group {
  border: 1px solid #eee;
  border-radius: 4px;
  overflow: hidden;
}

.scene-header {
  padding: 10px;
  background: #f5f5f5;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.scene-header:hover {
  background: #f0f0f0;
}

.expand-icon {
  font-size: 10px;
  color: #666;
}

.scene-name {
  font-weight: bold;
  flex: 1;
}

.scene-level {
  color: #888;
}

.scene-count {
  color: #888;
  font-size: 11px;
}

.scene-enemies {
  padding: 10px;
  background: white;
  border-top: 1px solid #eee;
}

.scene-enemies .character-item {
  margin-bottom: 8px;
}

.char-actions {
  display: flex;
  gap: 5px;
}

.btn-tiny {
  padding: 2px 6px;
  font-size: 10px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 2px;
  cursor: pointer;
}

.btn-tiny:hover {
  background: #e0e0e0;
}

.empty-message {
  text-align: center;
  color: #999;
  padding: 20px;
  font-style: italic;
}
</style>