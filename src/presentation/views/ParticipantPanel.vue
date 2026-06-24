<template>
  <div class="panel-left">
    <div class="panel-section">
      <div class="section-header">
        <span>参战管理</span>
        <div class="expand-collapse-controls">
          <button class="btn-small" @click="clearParticipants"
            :disabled="allyTeam.length === 0 && enemyTeam.length === 0">
            <span class="icon">−</span>清空
          </button>
        </div>
      </div>
      <div class="section-content">
        <div class="character-field">
          <div class="character-party our-party">
            <div class="party-header">我方 ({{ allyTeamCount }}人)</div>
            <div class="party-members">
              <div v-for="char in allyTeam" :key="char.id" class="character-item"
                :class="{ selected: selectedCharacterId === char.id, disabled: !char.enabled }"
                @click="selectCharacter(char.id)">
                <div class="char-check">
                  <input type="checkbox" :checked="char.enabled"
                    @change="toggleCharacterEnabled(char.id, ($event.target as HTMLInputElement).checked)" @click.stop>
                </div>
                <div class="char-info">
                  <span class="char-name">{{ char.name }}({{ char.level }})</span>
                </div>
                <div class="char-order" v-if="char.enabled">
                  <span class="order-num">{{ getOrderIndex(char.id) }}</span>
                </div>
                <div class="char-status" v-if="char.buffs && char.buffs.length > 0">
                  <span class="first-badge">状态</span>
                </div>
                <!-- <div class="char-status" v-if="char.isFirst">
                  <span class="first-badge">先手</span>
                </div> -->
              </div>
            </div>
          </div>

          <div class="character-party enemy-party">
            <div class="party-header">敌方 ({{ enemyTeamCount }}人)</div>
            <div class="party-members">
              <div v-for="char in enemyTeam" :key="char.id" class="character-item"
                :class="{ selected: selectedCharacterId === char.id, disabled: !char.enabled }"
                @click="selectCharacter(char.id)">
                <div class="char-check">
                  <input type="checkbox" :checked="char.enabled"
                    @change="toggleCharacterEnabled(char.id, ($event.target as HTMLInputElement).checked)" @click.stop>
                </div>
                <div class="char-info">
                  <span class="char-name">{{ char.name }}({{ char.level }})</span>
                </div>
                <div class="char-order" v-if="char.enabled">
                  <span class="order-num">{{ getOrderIndex(char.id) }}</span>
                </div>
                <div class="char-status" v-if="char.buffs && char.buffs.length > 0">
                  <span class="first-badge">状态</span>
                </div>
              </div>
              <div v-if="enemyTeam.length === 0" class="empty-party">(空位)</div>
            </div>
          </div>
        </div>
      </div>
      <div class="section-actions">
        <button class="btn-small" @click="moveCharacter(-1)">[↑]上调</button>
        <button class="btn-small" @click="moveCharacter(1)">[↓]下调</button>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span>角色库</span>
        <div class="expand-collapse-controls">
          <button class="btn-small" @click="collapseAllScenes" :disabled="!hasExpandedScenes">
            <span class="icon">−</span>一键折叠
          </button>
          <button class="btn-small" @click="expandAllScenes" :disabled="allScenesExpanded">
            <span class="icon">+</span>一键展开
          </button>
        </div>
      </div>
      <div class="section-content">
        <div class="character-search">
          <input type="text" v-model="enemySearch" placeholder="搜索角色库..." class="search-input">
        </div>
        <div class="scene-enemy-list">
          <div v-for="group in groupedEnemies" :key="group.scene.id" class="scene-group">
            <div class="scene-header" @click="toggleSceneExpand(group.scene.id)">
              <span class="expand-icon">{{ isSceneExpanded(group.scene.id) ? '-' : '+' }}</span>
              <span class="scene-name">{{ group.scene.name }}</span>
              <span class="scene-level">Lv.{{ group.scene.requiredLevel }}+</span>
              <span class="scene-count">{{ group.enemies.length }}人</span>
            </div>
            <Transition name="scene-enemies">
              <div class="scene-enemies" v-show="isSceneExpanded(group.scene.id)">
                <div v-for="enemy in group.enemies" :key="enemy.id" class="character-item">
                  <div class="char-info">
                    <span class="char-name">{{ enemy.name }} (Lv.{{ enemy.level }})</span>
                    <span class="char-stats">气血:{{ enemy.stats.maxHealth }} 攻击:{{ enemy.stats.minAttack
                    }}-{{ enemy.stats.maxAttack }}</span>
                  </div>
                  <div class="char-actions">
                    <button class="btn-tiny" @click.stop="addEnemyToBattle(enemy, PARTICIPANT_SIDE.ALLY)">我方</button>
                    <button class="btn-tiny" @click.stop="addEnemyToBattle(enemy, PARTICIPANT_SIDE.ENEMY)">敌方</button>
                  </div>
                </div>
              </div>
            </Transition>
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
import { GameDataProcessor } from "@/shared/utils/GameDataProcessor";
import { container } from '@/infrastructure/di/Container';
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene';
import { PARTICIPANT_SIDE, type ParticipantSide, type BattleEntity } from "@/domain/battle/types";
import type { BattleManager } from '@/domain/battle/BattleManager';
import { BattleParticipantImpl } from '@/domain/battle/BattleParticipantImpl';

interface GroupedEnemies {
  scene: SceneData;
  enemies: Enemy[];
}

// 获取 BattleManager
const battleManager = container.resolve<BattleManager>('BattleManager');

// 初始化 GameDataProcessor
const enemySearch = ref("");
const enemiesData = ref<Enemy[]>([]);
const scenesData = ref<SceneData[]>([]);
enemiesData.value = GameDataProcessor.getEnemiesData();
scenesData.value = GameDataProcessor.getScenesData();
const expandedScenes = reactive<Record<string, boolean>>({});

// 默认展开所有场景
scenesData.value.forEach((s) => (expandedScenes[s.id] = true));

// 响应式获取队伍数据
const allyTeam = computed(() => battleManager.getAllyTeam());
const enemyTeam = computed(() => battleManager.getEnemyTeam());
// 我方参战人数
const allyTeamCount = computed(() => allyTeam.value.filter(c => c.enabled).length);
// 敌方参战人数
const enemyTeamCount = computed(() => enemyTeam.value.filter(c => c.enabled).length);

const selectedCharacterId = computed(() => battleManager.getSelectedCharacterId());

const toggleSceneExpand = (sceneId: string) => {
  expandedScenes[sceneId] = !expandedScenes[sceneId];
};

const isSceneExpanded = (sceneId: string): boolean => {
  return expandedScenes[sceneId] === true;
};

// 一键展开所有场景
const expandAllScenes = () => {
  scenesData.value.forEach((scene) => {
    expandedScenes[scene.id] = true;
  });
};

// 一键折叠所有场景
const collapseAllScenes = () => {
  scenesData.value.forEach((scene) => {
    expandedScenes[scene.id] = false;
  });
};

// 检查是否有展开的场景
const hasExpandedScenes = computed(() => {
  return scenesData.value.some((scene) => expandedScenes[scene.id]);
});

// 检查是否所有场景都已展开
const allScenesExpanded = computed(() => {
  return scenesData.value.every((scene) => expandedScenes[scene.id]);
});

const filteredEnemies = computed(() => {
  let filtered = [...enemiesData.value];
  if (enemySearch.value) {
    const keyword = enemySearch.value.toLowerCase();
    filtered = filtered.filter((enemy) =>
      enemy.name.toLowerCase().includes(keyword)
    );
  }
  return filtered;
});

const groupedEnemies = computed<GroupedEnemies[]>(() => {
  const allScenes = scenesData.value;
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
  const ordered = [
    ...allyTeam.value,
    ...enemyTeam.value,
  ].filter((char) => char.enabled)

  const index = ordered.findIndex((char) => char.id === charId)
  return index >= 0 ? index + 1 : 0
};

const selectCharacter = (charId: string) => {
  battleManager.selectCharacter(charId);
};

const addEnemyToBattle = (enemy: Enemy, side: typeof PARTICIPANT_SIDE.ALLY | typeof PARTICIPANT_SIDE.ENEMY = PARTICIPANT_SIDE.ALLY) => {
  const newCharacter = GameDataProcessor.enemyToParticipant(enemy, side)
  battleManager.addCharacterToTeam(newCharacter, side)
  battleManager.selectCharacter(newCharacter.id)
};

const moveCharacter = (direction: number) => {
  const selectedId = selectedCharacterId.value;
  if (selectedId) {
    battleManager.moveCharacter(selectedId, direction);
  }
};

const clearParticipants = () => {
  battleManager.clearParticipants();
};

const toggleCharacterEnabled = (characterId: string, enabled: boolean) => {
  battleManager.setCharacterEnabled(characterId, enabled);
};
</script>

<style scoped>
@use'@/presentation/styles/main.scss';

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #0f3460;
}

.expand-collapse-controls {
  display: flex;
  gap: 0.5rem;
}

.expand-collapse-controls .btn-small {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  background: #0f3460;
  color: #4fc3f7;
  border: 1px solid #1a4a7a;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: 1;
}

.expand-collapse-controls .btn-small:hover:not(:disabled) {
  background: #1a4a7a;
  border-color: #4fc3f7;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(79, 195, 247, 0.2);
}

.expand-collapse-controls .btn-small:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.expand-collapse-controls .btn-small .icon {
  font-weight: bold;
  font-size: 0.9rem;
  line-height: 1;
}

.scene-enemies {
  transition: all 0.3s ease-in-out;
  overflow: hidden;
}

.scene-enemies-enter-active,
.scene-enemies-leave-active {
  transition: all 0.3s ease;
}

.scene-enemies-enter-from,
.scene-enemies-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-10px);
}

.scene-enemies-enter-to,
.scene-enemies-leave-from {
  max-height: 500px;
  opacity: 1;
  transform: translateY(0);
}

.scene-header {
  cursor: pointer;
  padding: 0.5rem;
  background: #0f0f1a;
  border-radius: 3px;
  margin-bottom: 0.25rem;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.scene-header:hover {
  background: #1a1a2e;
  border-color: #4fc3f7;
}

.expand-icon {
  display: inline-block;
  width: 1rem;
  text-align: center;
  font-weight: bold;
  transition: transform 0.2s ease;
}

.scene-header:hover .expand-icon {
  transform: scale(1.2);
}

/* 响应式设计 */
@media (max-width: 1200px) {
  .expand-collapse-controls {
    flex-direction: column;
    gap: 0.25rem;
  }

  .expand-collapse-controls .btn-small {
    font-size: 0.7rem;
    padding: 0.2rem 0.4rem;
  }
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .expand-collapse-controls {
    flex-direction: row;
    width: 100%;
    justify-content: flex-end;
  }

  .expand-collapse-controls .btn-small {
    flex: 1;
    justify-content: center;
  }
}
</style>
