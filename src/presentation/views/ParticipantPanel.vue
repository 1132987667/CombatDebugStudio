<template>
  <div class="panel-left">
    <div class="panel-section">
      <div class="section-header">
        <span>参战管理</span>
        <div class="expand-collapse-controls">
          <button class="btn-medium" @click="clearParticipants"
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
                <div class="char-status" v-if="char.getBuffInstanceIds().length > 0">
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
                <div class="char-status" v-if="char.getBuffInstanceIds().length > 0">
                  <span class="first-badge">状态</span>
                </div>
              </div>
              <div v-if="enemyTeam.length === 0" class="empty-party">(空位)</div>
            </div>
          </div>
        </div>
      </div>
      <div class="section-actions">
        <button class="btn-medium" @click="moveCharacter(-1)">[↑]上调</button>
        <button class="btn-medium" @click="moveCharacter(1)">[↓]下调</button>
        <button class="btn-medium btn-remove" @click="removeSelectedCharacter">[−]移除</button>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span>角色库</span>
        <div class="expand-collapse-controls">
          <button class="btn-medium" @click="collapseAllScenes" :disabled="!hasExpandedScenes">
            <span class="icon">−</span>一键折叠
          </button>
          <button class="btn-medium" @click="expandAllScenes" :disabled="allScenesExpanded">
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
                <div v-for="enemy in group.enemies" :key="enemy.id" class="character-item"
                  :class="{ selected: isRosterCharSelected(enemy.id) }" @click="previewRosterCharacter(enemy)">
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
import type { BattleService } from '@/application/facade/BattleFacade';
import { useBattleStore } from '@/presentation/stores';

interface GroupedEnemies {
  scene: SceneData;
  enemies: Enemy[];
}

// 获取 BattleService
const battleService = container.resolve<BattleService>('BattleService');
const battleStore = useBattleStore();

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
const allyTeam = computed(() => battleService.getAllyTeam());
const enemyTeam = computed(() => battleService.getEnemyTeam());
// 我方参战人数
const allyTeamCount = computed(() => allyTeam.value.filter(c => c.enabled).length);
// 敌方参战人数
const enemyTeamCount = computed(() => enemyTeam.value.filter(c => c.enabled).length);

const selectedCharacterId = computed(() => battleStore.selectedCharacterId);

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
  battleStore.selectCharacter(charId);
};

const previewRosterCharacter = (enemy: Enemy) => {
  battleStore.previewRosterCharacter(enemy);
};

const isRosterCharSelected = (enemyId: string): boolean => {
  const id = battleStore.selectedCharacterId;
  if (!id || !battleStore.previewEntity) return false;
  // ponytail: previewEntity ID 格式是 [ENEMY]_<enemyId>_<counter>
  return id.startsWith(`[ENEMY]_${enemyId}_`);
};

const addEnemyToBattle = (enemy: Enemy, side: typeof PARTICIPANT_SIDE.ALLY | typeof PARTICIPANT_SIDE.ENEMY = PARTICIPANT_SIDE.ALLY) => {
  const newCharacter = GameDataProcessor.enemyToParticipant(enemy, side)
  battleService.addCharacterToTeam(newCharacter, side)
  // ponytail: 注册免疫标签到 BuffSystem
  if (newCharacter.getImmunities().length > 0) {
    const buffSystem = container.resolve<any>('BuffSystem');
    buffSystem.registerCharacterImmunities(newCharacter.id, newCharacter.getImmunities());
  }
  // ponytail: 注册触发型被动技能到 PassiveSkillManager
  const passiveSkillManager = container.resolve<any>('PassiveSkillManager');
  GameDataProcessor.registerParticipantPassives(newCharacter, passiveSkillManager);
  battleStore.selectCharacter(newCharacter.id)
};

const moveCharacter = (direction: number) => {
  const selectedId = selectedCharacterId.value;
  if (selectedId) {
    battleService.moveCharacter(selectedId, direction);
  }
};

const removeSelectedCharacter = () => {
  const selectedId = selectedCharacterId.value;
  if (selectedId) {
    battleService.removeCharacter(selectedId);
  }
};

const clearParticipants = () => {
  battleService.clearParticipants();
};

const toggleCharacterEnabled = (characterId: string, enabled: boolean) => {
  battleService.setCharacterEnabled(characterId, enabled);
};
</script>

<style scoped>
@use'@/presentation/styles/main.scss';

.expand-collapse-controls {
  display: flex;
  gap: var(--space-2);
}

.expand-collapse-controls .btn-medium:hover:not(:disabled) {
  background: var(--color-border-strong);
  border-color: var(--color-info);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px var(--color-info-bg);
}

.expand-collapse-controls .btn-medium:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.expand-collapse-controls .btn-medium .icon {
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-md);
  line-height: 1;
}

.scene-enemies {
  transition: var(--transition-base);
  overflow: hidden;
}

.scene-enemies-enter-active,
.scene-enemies-leave-active {
  transition: var(--transition-base);
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
  padding: var(--space-2);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-1);
  transition: var(--transition-fast);
  border: 1px solid transparent;
}

.scene-header:hover {
  background: var(--color-bg-primary);
  border-color: var(--color-info);
}

.expand-icon {
  display: inline-block;
  width: 1rem;
  text-align: center;
  font-weight: var(--font-weight-bold);
  transition: transform 0.2s ease;
}

.scene-header:hover .expand-icon {
  transform: scale(1.2);
}

.section-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-2);
}

.btn-remove {
  margin-left: auto;
  color: var(--color-danger) !important;
  border-color: var(--color-brand-red-active) !important;
}

.btn-remove:hover:not(:disabled) {
  background: var(--color-brand-red-active) !important;
  color: var(--color-text-primary) !important;
  border-color: var(--color-danger) !important;
}
</style>
