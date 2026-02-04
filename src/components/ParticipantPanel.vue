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
              <div v-for="char in battleCharacters" :key="char.id" class="character-item" :class="{ selected: selectedCharacterId === char.id, disabled: !char.enabled }" @click="selectCharacter(char.id)">
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
              <div v-for="char in enemyParty" :key="char.id" class="character-item" :class="{ selected: selectedCharacterId === char.id }" @click="selectCharacter(char.id)">
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
              <div v-for="enemy in group.enemies" :key="enemy.id" class="character-item" @click="addEnemyToBattle(enemy)">
                <div class="char-info">
                  <span class="char-name">{{ enemy.name }}</span>
                  <span class="char-stats">Lv.{{ enemy.level }} HP:{{ enemy.stats.health }} ATK:{{ enemy.stats.minAttack }}-{{ enemy.stats.maxAttack }}</span>
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
import { computed, reactive, ref } from "vue";
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

interface Props {
  battleCharacters: BattleCharacter[];
  enemyParty: BattleCharacter[];
  selectedCharacterId: string;
}

interface Emits {
  (e: 'update:selectedCharacterId', id: string): void;
  (e: 'addEnemy', enemy: EnemyData, side: 'our' | 'enemy'): void;
  (e: 'addCharacter'): void;
  (e: 'moveCharacter', direction: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const enemySearch = ref("");
const enemies = ref<EnemyData[]>(enemiesData as EnemyData[]);
const scenes = ref<SceneData[]>(scenesData as SceneData[]);
const expandedScenes = reactive<Record<string, boolean>>({});

// 默认展开所有场景
scenes.value.forEach((s) => (expandedScenes[s.id] = true));

const toggleSceneExpand = (sceneId: string) => {
  expandedScenes[sceneId] = !expandedScenes[sceneId];
};

const isSceneExpanded = (sceneId: string): boolean => {
  return expandedScenes[sceneId] === true;
};

const filteredEnemies = computed(() => {
  let filtered = [...enemies.value];
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

const ourParty = computed(() => {
  return props.battleCharacters
    .filter((c) => c.enabled)
    .sort((a, b) => b.speed - a.speed);
});

const getOrderIndex = (charId: string) => {
  const index = ourParty.value.findIndex((c) => c.id === charId);
  return index >= 0 ? index + 1 : 0;
};

const selectCharacter = (charId: string) => {
  emit('update:selectedCharacterId', charId);
};

const addEnemyToBattle = (enemy: EnemyData, side: 'our' | 'enemy' = 'our') => {
  emit('addEnemy', enemy, side);
};

const addCharacter = () => {
  emit('addCharacter');
};

const moveCharacter = (direction: number) => {
  emit('moveCharacter', direction);
};
</script>

<style scoped>
.config-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.panel-section {
  background: var(--panel-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.section-header {
  padding: 0.75rem;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  font-weight: bold;
  color: var(--text-primary);
}

.section-content {
  padding: 0.75rem;
  max-height: 300px;
  overflow-y: auto;
}

.character-field {
  display: flex;
  gap: 1rem;
}

.character-party {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.party-header {
  padding: 0.5rem;
  background: var(--subheader-bg);
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: bold;
  text-align: center;
  margin-bottom: 0.5rem;
}

.our-party .party-header {
  background: var(--our-party-bg);
  color: var(--our-party-color);
}

.enemy-party .party-header {
  background: var(--enemy-party-bg);
  color: var(--enemy-party-color);
}

.party-members {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.character-item {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--character-bg);
}

.character-item:hover {
  background: var(--character-hover-bg);
}

.character-item.selected {
  border-color: var(--accent-color);
  background: var(--character-selected-bg);
}

.character-item.disabled {
  opacity: 0.5;
  background: var(--character-disabled-bg);
}

.char-check {
  margin-right: 0.5rem;
}

.char-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.char-name {
  font-weight: bold;
  font-size: 0.9rem;
}

.char-stats {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.char-order {
  margin-left: 0.5rem;
  background: var(--order-bg);
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: bold;
}

.char-status {
  margin-left: 0.5rem;
}

.first-badge {
  background: var(--accent-color);
  color: white;
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.7rem;
}

.field-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 1rem;
}

.vs-text {
  background: var(--vs-bg);
  color: var(--vs-color);
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-weight: bold;
  font-size: 1.2rem;
}

.empty-party {
  text-align: center;
  color: var(--text-muted);
  font-style: italic;
  padding: 1rem;
}

.section-actions {
  padding: 0.75rem;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.character-search {
  margin-bottom: 0.75rem;
}

.search-input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text-primary);
}

.scene-group {
  margin-bottom: 0.75rem;
}

.scene-header {
  display: flex;
  align-items: center;
  padding: 0.5rem;
  background: var(--scene-header-bg);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.scene-header:hover {
  background: var(--scene-header-hover-bg);
}

.expand-icon {
  margin-right: 0.5rem;
  font-size: 0.8rem;
  width: 12px;
  text-align: center;
}

.scene-name {
  flex: 1;
  font-weight: bold;
}

.scene-level {
  margin-right: 0.5rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.scene-count {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.scene-enemies {
  margin-top: 0.5rem;
  padding-left: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.char-actions {
  display: flex;
  gap: 0.25rem;
}

.btn-tiny {
  padding: 0.1rem 0.3rem;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--button-bg);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.7rem;
}

.btn-tiny:hover {
  background: var(--button-hover-bg);
}

.btn-small {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--button-bg);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.8rem;
}

.btn-small:hover {
  background: var(--button-hover-bg);
}

.empty-message {
  text-align: center;
  color: var(--text-muted);
  font-style: italic;
  padding: 2rem;
}
</style>