<template>
  <div class="panel-left">
    <!-- 阵容预设选择器 -->
    <div class="preset-selector">
      <label class="preset-label">阵容预设：</label>
      <select v-model="selectedPreset" class="preset-select" @change="applyPreset">
        <option value="">-- 手动配置 --</option>
        <optgroup v-for="group in presetGroups" :key="group.label" :label="group.label">
          <option v-for="p in group.items" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </optgroup>
      </select>
      <span v-if="currentPresetDesc" class="preset-desc">{{ currentPresetDesc }}</span>
    </div>
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
        <button class="btn-medium" @click="moveCharacter(-1)"><span class="icon mr-2">[↑]</span>上调</button>
        <button class="btn-medium" @click="moveCharacter(1)"><span class="icon mr-2">[↓]</span>下调</button>
        <button class="btn-medium btn-remove" @click="removeSelectedCharacter"><span class="icon mr-2">[−]</span>移除</button>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span>角色库</span>
        <div class="expand-collapse-controls">
          <button class="btn-medium" @click="collapseAllScenes" :disabled="!hasExpandedScenes">
            <span class="icon mr-2">[−]</span>一键折叠
          </button>
          <button class="btn-medium" @click="expandAllScenes" :disabled="allScenesExpanded">
            <span class="icon mr-2">[+]</span>一键展开
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
                    <button class="btn-tiny" @click.stop="addEnemyToBattle(enemy, ParticipantSide.ALLY)">我方</button>
                    <button class="btn-tiny" @click.stop="addEnemyToBattle(enemy, ParticipantSide.ENEMY)">敌方</button>
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
import { ParticipantSide } from "@/domain/battle/type/types";
import type { BattleService } from '@/application/facade/BattleFacade';
import { useBattleStore } from '@/presentation/stores';
import { BuffSystem } from '@/domain/buff/BuffSystem';
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager';

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

// 阵容预设
interface Preset {
  id: string
  name: string
  description: string
  ally: string[]
  enemy: string[]
}

const presets: Preset[] = [
  // ═══ 第一组：已有角色基线测试 ═══
  {
    id: 'baseline_fire_vs_gold',
    name: '火护法 vs 金护法',
    description: '基线测试：速度递增 vs 攻击递增的消耗战',
    ally: ['guardian_fire'],
    enemy: ['guardian_gold'],
  },
  {
    id: 'baseline_2v1_boss',
    name: '双护法 vs Boss',
    description: '2v1 多目标选择、Boss 技能释放',
    ally: ['guardian_fire', 'guardian_gold'],
    enemy: ['boss_001'],
  },
  {
    id: 'baseline_multi_boss',
    name: '双护法 vs 双Boss',
    description: '高压多目标战斗稳定性',
    ally: ['guardian_fire', 'guardian_gold'],
    enemy: ['boss_001', 'boss_002'],
  },
  {
    id: 'baseline_full_roster',
    name: '全角色混战',
    description: '所有已有角色参战，验证系统上限',
    ally: ['guardian_fire', 'enemy_003', 'enemy_004'],
    enemy: ['guardian_gold', 'enemy_005', 'boss_003'],
  },

  // ═══ 第二组：基础机制验证（测试角色） ═══
  {
    id: 'test_basic_damage',
    name: '基础伤害',
    description: 'ATK=20 vs DEF=0，验证基础伤害公式',
    ally: ['test_warrior'],
    enemy: ['test_warrior'],
  },
  {
    id: 'test_defense',
    name: '防御减伤',
    description: 'ATK=20 vs DEF=20，验证减法公式和最小伤害阈值',
    ally: ['test_warrior'],
    enemy: ['test_tank'],
  },
  {
    id: 'test_crit_vs_anti_crit',
    name: '暴击 vs 抗暴',
    description: '100%暴击+150%暴伤 vs 100%暴击承伤减免',
    ally: ['test_assassin'],
    enemy: ['test_anti_crit'],
  },

  // ═══ 第三组：被动技能验证 ═══
  {
    id: 'test_dodge_chain',
    name: '闪避连锁',
    description: '80%闪避 → 闪避回血 + 闪避必暴',
    ally: ['test_warrior'],
    enemy: ['test_dodge_master'],
  },
  {
    id: 'test_lifesteal_vs_shield',
    name: '吸血 vs 护盾',
    description: '20%吸血 vs 每回合+10护盾',
    ally: ['test_vampire'],
    enemy: ['test_shield_guard'],
  },
  {
    id: 'test_thorns',
    name: '荆棘反伤',
    description: 'ATK=20 攻击 → 反弹30%伤害，验证递归守卫',
    ally: ['test_warrior'],
    enemy: ['test_thorns'],
  },
  {
    id: 'test_combo_vs_thorns',
    name: '连击 vs 反伤',
    description: '25%额外行动 + 每次攻击触发反弹',
    ally: ['test_combo'],
    enemy: ['test_thorns'],
  },

  // ═══ 第四组：Buff/Debuff 验证 ═══
  {
    id: 'test_control',
    name: '控制链',
    description: '眩晕打击 → 跳过行动 → Buff 过期',
    ally: ['test_controller'],
    enemy: ['test_warrior'],
  },
  {
    id: 'test_dot_poison',
    name: 'DOT 毒伤',
    description: '毒液喷射 → 每回合10%最大气血伤害，最多3层',
    ally: ['test_poisoner'],
    enemy: ['test_tank'],
  },
  {
    id: 'test_buff_stack',
    name: '增益叠加',
    description: '战斗鼓舞(开场+10%) + 鼓舞技能(全队+20%)',
    ally: ['test_bard'],
    enemy: ['test_warrior'],
  },

  // ═══ 第五组：已有角色 + 测试角色混合 ═══
  {
    id: 'mixed_fire_vs_dodge',
    name: '火护法 vs 闪避大师',
    description: '真实角色的连击被动 vs 测试角色的闪避被动',
    ally: ['guardian_fire'],
    enemy: ['test_dodge_master'],
  },
  {
    id: 'mixed_gold_vs_vampire',
    name: '金护法 vs 吸血鬼',
    description: '复仇怒火(越挨打越强) vs 吸血(越打越回血)',
    ally: ['guardian_gold'],
    enemy: ['test_vampire'],
  },
  {
    id: 'mixed_full_battle',
    name: '全面混战',
    description: '3v3 多被动并发、多Buff交互',
    ally: ['guardian_fire', 'test_vampire', 'test_bard'],
    enemy: ['guardian_gold', 'test_dodge_master', 'test_thorns'],
  },
]
const selectedPreset = ref('')

const presetGroups = computed(() => [
  { label: '已有角色基线', items: presets.filter(p => p.id.startsWith('baseline_')) },
  { label: '基础机制', items: presets.filter(p => ['test_basic_damage', 'test_defense', 'test_crit_vs_anti_crit'].includes(p.id)) },
  { label: '被动技能', items: presets.filter(p => ['test_dodge_chain', 'test_lifesteal_vs_shield', 'test_thorns', 'test_combo_vs_thorns'].includes(p.id)) },
  { label: 'Buff/Debuff', items: presets.filter(p => ['test_control', 'test_dot_poison', 'test_buff_stack'].includes(p.id)) },
  { label: '混合对抗', items: presets.filter(p => p.id.startsWith('mixed_')) },
])

const currentPresetDesc = computed(() => {
  const p = presets.find(p => p.id === selectedPreset.value)
  return p?.description ?? ''
})

const applyPreset = () => {
  const preset = presets.find(p => p.id === selectedPreset.value)
  if (!preset) return

  // 先停止可能正在进行的战斗
  if (battleStore.isBattleActive) {
    battleStore.endBattle(ParticipantSide.ALLY)
  }
  battleStore.resetBattle()
  battleService.clearParticipants()

  const buffSystem = container.resolve<BuffSystem>('BuffSystem')
  const passiveSkillManager = container.resolve<PassiveSkillManager>('PassiveSkillManager')

  // 构建我方
  preset.ally.forEach((id, index) => {
    const enemyData = GameDataProcessor.findEnemyById(id)
    if (!enemyData) {
      console.warn(`预设角色未找到: ${id}`)
      return
    }
    const entity = GameDataProcessor.enemyToParticipant(enemyData, ParticipantSide.ALLY, index)
    battleService.addCharacterToTeam(entity, ParticipantSide.ALLY)
    if (entity.getImmunities().length > 0) {
      buffSystem.registerCharacterImmunities(entity.id, entity.getImmunities())
    }
    GameDataProcessor.registerParticipantPassives(entity, passiveSkillManager)
  })

  // 构建敌方
  preset.enemy.forEach((id, index) => {
    const enemyData = GameDataProcessor.findEnemyById(id)
    if (!enemyData) {
      console.warn(`预设角色未找到: ${id}`)
      return
    }
    const entity = GameDataProcessor.enemyToParticipant(enemyData, ParticipantSide.ENEMY, index)
    battleService.addCharacterToTeam(entity, ParticipantSide.ENEMY)
    if (entity.getImmunities().length > 0) {
      buffSystem.registerCharacterImmunities(entity.id, entity.getImmunities())
    }
    GameDataProcessor.registerParticipantPassives(entity, passiveSkillManager)
  })

  battleStore.syncTeams()
  const firstAlly = battleService.getAllyTeam()[0]
  if (firstAlly) battleStore.selectCharacter(firstAlly.id)
}

// 响应式获取队伍数据
const allyTeam = computed(() => battleStore.fullAllyTeam);
const enemyTeam = computed(() => battleStore.fullEnemyTeam);
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

const addEnemyToBattle = (enemy: Enemy, side: typeof ParticipantSide.ALLY | typeof ParticipantSide.ENEMY = ParticipantSide.ALLY) => {
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
  background: var(--color-border-tertiary);
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

.expand-icon {
  display: inline-block;
  width: 1rem;
  text-align: center;
  font-weight: var(--font-weight-bold);
  transition: transform 0.2s ease;
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

.preset-selector {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-tertiary);
  border-bottom: 2px solid var(--color-border-default);
  flex-wrap: wrap;
}

.preset-label {
  color: var(--color-text-secondary);
  white-space: nowrap;
  font-weight: var(--font-weight-medium);
}

.preset-select {
  flex: 1;
  min-width: 140px;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
}

.preset-select:focus {
  outline: none;
  border-color: var(--color-info);
}

.preset-desc {
  width: 100%;
  color: var(--color-text-tertiary);
  padding-top: var(--space-1);
}
</style>
