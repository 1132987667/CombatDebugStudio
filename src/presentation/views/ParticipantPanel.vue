<template>
  <div class="panel-left">
    <!-- 阵容预设选择器 -->
    <div class="preset-selector">
      <label class="preset-label">阵容预设：</label>
      <TacticalSelect v-model="selectedPreset" class="preset-select-slot" :options="presetOptions"
        @change="applyPreset" />
      <span v-if="currentPresetDesc" class="preset-desc">{{ currentPresetDesc }}</span>
    </div>
    <div class="panel-section">
      <div class="section-header">
        <span>参战管理</span>
        <div class="expand-collapse-controls">
          <Button @click="confirmClear = true"
            :disabled="allyTeam.length === 0 && enemyTeam.length === 0">
            <span class="icon mr-2">[−]</span>清空
          </Button>
        </div>
      </div>
      <div class="section-content">
        <div class="character-field">
          <div class="character-party our-party">
            <div class="party-header">我方 ({{ allyTeamCount }}人)</div>
            <div class="party-members">
              <div v-for="char in allyTeam" :key="char.id" class="character-item"
                :class="{ selected: selectedCharacterId === char.id, disabled: !char.enabled }"
                role="button" tabindex="0" @click="selectCharacter(char.id)"
                @keydown.enter="onCharKeydown($event, char.id)"
                @keydown.space="onCharKeydown($event, char.id)">
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
                role="button" tabindex="0" @click="selectCharacter(char.id)"
                @keydown.enter="onCharKeydown($event, char.id)"
                @keydown.space="onCharKeydown($event, char.id)">
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
              <EmptyState v-if="enemyTeam.length === 0">(空位)</EmptyState>
            </div>
          </div>
        </div>
      </div>
      <div class="section-actions">
        <Button @click="moveCharacter(-1)"><span class="icon mr-2">[↑]</span>上调</Button>
        <Button @click="moveCharacter(1)"><span class="icon mr-2">[↓]</span>下调</Button>
        <Button variant="danger" @click="confirmRemove = true"><span class="icon mr-2">[−]</span>移除</Button>
      </div>
    </div>

    <div class="panel-section">
      <div class="section-header">
        <span>角色库</span>
        <div class="expand-collapse-controls">
          <Button @click="collapseAllScenes" :disabled="!hasExpandedScenes">
            <span class="icon mr-2">[−]</span>一键折叠
          </Button>
          <Button @click="expandAllScenes" :disabled="allScenesExpanded">
            <span class="icon mr-2">[+]</span>一键展开
          </Button>
        </div>
      </div>
      <div class="section-content">
        <div class="character-search">
          <TacticalInput size="md" :model-value="enemySearch" placeholder="搜索角色库..." aria-label="搜索角色库"
            @update:model-value="enemySearch = String($event ?? '')" />
        </div>
        <div class="scene-enemy-list">
          <div v-if="actors.length" class="scene-group">
            <div class="scene-header" role="button" tabindex="0" @click="actorExpanded = !actorExpanded"
              @keydown.enter.prevent="actorExpanded = !actorExpanded"
              @keydown.space.prevent="actorExpanded = !actorExpanded">
              <span class="expand-icon mr-2">{{ actorExpanded ? '[-]' : '[+]' }}</span>
              <span class="scene-name">我的角色</span>
              <span class="scene-count">{{ actors.length }}人</span>
            </div>
            <div v-if="actorExpanded" class="character-search">
              <TacticalInput size="md" :model-value="actorSearch" placeholder="搜索角色..." aria-label="搜索角色"
                @update:model-value="actorSearch = String($event ?? '')" />
            </div>
            <Transition name="scene-enemies">
              <div class="scene-enemies" v-show="actorExpanded">
                <div v-for="actor in filteredActors" :key="actor.id" class="character-item"
                  :class="{ selected: isActorSelected(actor.id) }" role="button" tabindex="0"
                  @click="previewActor(actor)" @keydown.enter.prevent="previewActor(actor)"
                  @keydown.space.prevent="previewActor(actor)">
                  <div class="char-info">
                    <span class="char-name">{{ actor.name }} (Lv.{{ actor.level }})</span>
                    <span class="char-stats">气血:{{ actor.stats.maxHealth ?? '—' }}</span>
                  </div>
                  <div class="char-actions">
                    <Button size="tiny" @click.stop="addActorToBattle(actor)"><span class="icon mr-2">[+]</span>我方</Button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
          <div v-for="group in groupedEnemies" :key="group.scene.id" class="scene-group">
            <div class="scene-header" role="button" tabindex="0" @click="toggleSceneExpand(group.scene.id)"
              @keydown.enter.prevent="toggleSceneExpand(group.scene.id)"
              @keydown.space.prevent="toggleSceneExpand(group.scene.id)">
              <span class="expand-icon mr-2">{{ isSceneExpanded(group.scene.id) ? '[-]' : '[+]' }}</span>
              <span class="scene-name">{{ group.scene.name }}</span>
              <span class="scene-level">Lv.{{ group.scene.requiredLevel }}+</span>
              <span class="scene-count">{{ group.enemies.length }}人</span>
            </div>
            <Transition name="scene-enemies">
              <div class="scene-enemies" v-show="isSceneExpanded(group.scene.id)">
                <div v-for="enemy in group.enemies" :key="enemy.id" class="character-item"
                  :class="{ selected: isRosterCharSelected(enemy.id) }" role="button" tabindex="0"
                  @click="previewRosterCharacter(enemy)" @keydown.enter.prevent="previewRosterCharacter(enemy)"
                  @keydown.space.prevent="previewRosterCharacter(enemy)">
                  <div class="char-info">
                    <span class="char-name">{{ enemy.name }} (Lv.{{ enemy.level }})</span>
                    <span class="char-stats">气血:{{ enemy.stats.maxHealth }} 攻击:{{ enemy.stats.minAttack
                    }}-{{ enemy.stats.maxAttack }}</span>
                  </div>
                  <div class="char-actions">
                    <Button size="tiny" @click.stop="addEnemyToBattle(enemy, ParticipantSide.ALLY)"><span class="icon mr-2">[+]</span>我方</Button>
                    <Button size="tiny" @click.stop="addEnemyToBattle(enemy, ParticipantSide.ENEMY)"><span class="icon mr-2">[+]</span>敌方</Button>
                  </div>
                </div>
              </div>
            </Transition>
          </div>
          <EmptyState v-if="groupedEnemies.length === 0">未找到匹配的敌人</EmptyState>
        </div>
      </div>
    </div>

    <!-- 危险操作二次确认 -->
    <ConfirmDialog v-model="confirmClear" title="清空参战角色" message="确定要清空当前所有参战角色吗？"
      confirm-text="清空" danger @confirm="clearParticipants" />
    <ConfirmDialog v-model="confirmRemove" title="移除角色" message="确定要移除当前选中的角色吗？"
      confirm-text="移除" danger @confirm="removeSelectedCharacter" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from "vue";
import { GameDataProcessor } from "@/shared/utils/GameDataProcessor";
import { container } from '@/infrastructure/di/Container';
import { GameDataApi } from '@/application/service/GameDataApi';
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene';
import type { ActorData, LineupData } from '@/domain/fengshen/types';
import { ParticipantSide } from "@/domain/battle/type/types";
import type { BattleService } from '@/application/facade/BattleFacade';
import { useBattleStore } from '@/presentation/stores';
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore';
import EmptyState from '@/presentation/components/EmptyState.vue'
import Button from '@/presentation/components/Button.vue'
import ConfirmDialog from '@/presentation/components/ConfirmDialog.vue'
import TacticalSelect, { type TSelectOption } from '@/presentation/components/TacticalSelect.vue'
import TacticalInput from '@/presentation/components/TacticalInput.vue'

interface GroupedEnemies {
  scene: SceneData;
  enemies: Enemy[];
}

// 获取 BattleService
const battleService = container.resolve<BattleService>('BattleService');
const battleStore = useBattleStore();
const gameDataApi = container.resolve<GameDataApi>('GameDataApi');
const fengshenStore = useFengshenStore();

// 初始化 GameDataProcessor（敌人/场景经数据源切换反映封神榜最新数据）
const enemySearch = ref("");
const enemiesData = ref<Enemy[]>([]);
const scenesData = ref<SceneData[]>([]);
enemiesData.value = GameDataProcessor.getEnemiesData();
scenesData.value = GameDataProcessor.getScenesData();
const expandedScenes = reactive<Record<string, boolean>>({});

// 封神榜阵容 / 角色（可管理，数据变更自动刷新）
const lineups = ref<LineupData[]>([]);
const actors = ref<ActorData[]>([]);
const actorSearch = ref('');
const actorExpanded = ref(true);

async function loadFengshenData(): Promise<void> {
  try {
    lineups.value = await gameDataApi.listLineups()
    actors.value = await gameDataApi.listByTable<ActorData>('actors', { limit: 1000 })
  } catch {
    lineups.value = []
    actors.value = []
  }
}

onMounted(() => {
  void loadFengshenData()
  // 封神榜写操作后自动刷新（与封神榜模块共享 dataVersion 订阅）
  watch(
    () => fengshenStore.dataVersion,
    () => void loadFengshenData(),
  )
})

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
    enemy: ['boss_007'],
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

/** 预设下拉：封神榜阵容（可管理）+ 内置调试预设（测试用例） */
interface PresetGroupItem {
  id: string
  name: string
  description: string
  source: 'lineup' | 'builtin'
}

const presetGroups = computed(() => {
  const groups: Array<{ label: string; items: PresetGroupItem[] }> = []
  const allyLineups = lineups.value.filter((l) => l.side === 'ally')
  const enemyLineups = lineups.value.filter((l) => l.side === 'enemy')
  if (allyLineups.length) {
    groups.push({
      label: '封神榜阵容 · 我方',
      items: allyLineups.map((l) => ({ id: l.id, name: l.name, description: l.description ?? '封神榜预设阵容', source: 'lineup' as const })),
    })
  }
  if (enemyLineups.length) {
    groups.push({
      label: '封神榜阵容 · 敌方',
      items: enemyLineups.map((l) => ({ id: l.id, name: l.name, description: l.description ?? '封神榜预设阵容', source: 'lineup' as const })),
    })
  }
  groups.push(
    { label: '调试 · 已有角色基线', items: presets.filter(p => p.id.startsWith('baseline_')) },
    { label: '调试 · 基础机制', items: presets.filter(p => ['test_basic_damage', 'test_defense', 'test_crit_vs_anti_crit'].includes(p.id)) },
    { label: '调试 · 被动技能', items: presets.filter(p => ['test_dodge_chain', 'test_lifesteal_vs_shield', 'test_thorns', 'test_combo_vs_thorns'].includes(p.id)) },
    { label: '调试 · Buff/Debuff', items: presets.filter(p => ['test_control', 'test_dot_poison', 'test_buff_stack'].includes(p.id)) },
    { label: '调试 · 混合对抗', items: presets.filter(p => p.id.startsWith('mixed_')) },
  )
  return groups
})

/** 预设下拉选项：手动配置（空值）+ 各分组阵容 */
const presetOptions = computed<TSelectOption[]>(() => [
  { value: '', label: '-- 手动配置 --' },
  ...presetGroups.value.flatMap((g) =>
    g.items.map((p) => ({ value: p.id, label: p.name, group: g.label } as TSelectOption)),
  ),
])

const currentPresetDesc = computed(() => {
  const lineup = lineups.value.find((l) => l.id === selectedPreset.value)
  if (lineup) return lineup.description ?? '封神榜预设阵容'
  return presets.find(p => p.id === selectedPreset.value)?.description ?? ''
})

/** 封神榜阵容 → 参战者（roles 按 seatIndex 排序；roleId 优先角色、其次敌人） */
function applyLineup(lineup: LineupData): void {
  const side = lineup.side === 'ally' ? ParticipantSide.ALLY : ParticipantSide.ENEMY
  const roles = [...lineup.roles].sort((a, b) => a.seatIndex - b.seatIndex)
  for (const role of roles) {
    const actor = actors.value.find((a) => a.id === role.roleId)
    if (actor) {
      const entity = GameDataProcessor.actorToParticipant(actor, side, role.seatIndex)
      battleService.addCharacterToTeam(entity, side)
      continue
    }
    const enemy = GameDataProcessor.findEnemyById(role.roleId)
    if (enemy) {
      const entity = GameDataProcessor.enemyToParticipant(enemy, side, role.seatIndex)
      battleService.addCharacterToTeam(entity, side)
    }
  }
}

const applyPreset = () => {
  const id = selectedPreset.value
  if (!id) return

  // 先停止可能正在进行的战斗
  if (battleStore.isBattleActive) {
    battleStore.endBattle(ParticipantSide.ALLY)
  }
  battleStore.resetBattle()
  battleService.clearParticipants()

  const lineup = lineups.value.find((l) => l.id === id)
  if (lineup) {
    applyLineup(lineup)
    battleStore.syncTeams()
    const first = battleService.getAllyTeam()[0] ?? battleService.getEnemyTeam()[0]
    if (first) battleStore.selectCharacter(first.id)
    return
  }

  const preset = presets.find(p => p.id === id)
  if (!preset) return

  // 构建我方
  preset.ally.forEach((pid, index) => {
    const enemyData = GameDataProcessor.findEnemyById(pid)
    if (!enemyData) {
      console.warn(`预设角色未找到: ${pid}`)
      return
    }
    const entity = GameDataProcessor.enemyToParticipant(enemyData, ParticipantSide.ALLY, index)
    battleService.addCharacterToTeam(entity, ParticipantSide.ALLY)
  })

  // 构建敌方
  preset.enemy.forEach((pid, index) => {
    const enemyData = GameDataProcessor.findEnemyById(pid)
    if (!enemyData) {
      console.warn(`预设角色未找到: ${pid}`)
      return
    }
    const entity = GameDataProcessor.enemyToParticipant(enemyData, ParticipantSide.ENEMY, index)
    battleService.addCharacterToTeam(entity, ParticipantSide.ENEMY)
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
        ...(scene.difficulties.easy.enemyIds ?? []),
        ...(scene.difficulties.normal.enemyIds ?? []),
        ...(scene.difficulties.hard.enemyIds ?? []),
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
  battleStore.selectCharacter(newCharacter.id)
};

// ── 封神榜角色（actors 表）：搜索 / 预览 / 加入我方 ──
const filteredActors = computed(() => {
  if (!actorSearch.value) return actors.value
  const kw = actorSearch.value.toLowerCase()
  return actors.value.filter((a) => a.name.toLowerCase().includes(kw))
});

const isActorSelected = (actorId: string): boolean => {
  const id = battleStore.selectedCharacterId
  if (!id || !battleStore.previewEntity) return false
  return id.startsWith(`[ALLY]_${actorId}_`)
};

const previewActor = (actor: ActorData): void => {
  // actors 复用 previewEntity 通道（转 Enemy 形状供预览面板展示）
  battleStore.previewRosterCharacter({
    id: actor.id,
    name: actor.name,
    level: actor.level,
    stats: actor.stats as Enemy['stats'],
    drops: [],
    skills: {},
  })
};

const addActorToBattle = (actor: ActorData): void => {
  const entity = GameDataProcessor.actorToParticipant(actor, ParticipantSide.ALLY)
  battleService.addCharacterToTeam(entity, ParticipantSide.ALLY)
  battleStore.selectCharacter(entity.id)
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

/** 角色项键盘操作：Enter/Space 选中；焦点在嵌套控件（启用 checkbox）时不拦截，避免吞掉 Space 切换 */
const onCharKeydown = (e: KeyboardEvent, charId: string) => {
  if (e.target !== e.currentTarget) return
  e.preventDefault()
  selectCharacter(charId)
};

// 危险操作二次确认状态
const confirmRemove = ref(false);
const confirmClear = ref(false);

const clearParticipants = () => {
  battleService.clearParticipants();
};

const toggleCharacterEnabled = (characterId: string, enabled: boolean) => {
  battleService.setCharacterEnabled(characterId, enabled);
};
</script>

<style scoped>
.expand-collapse-controls {
  display: flex;
  gap: var(--space-2);
}

.expand-collapse-controls .icon {
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

.preset-select-slot {
  flex: 1;
  min-width: 140px;
}

.preset-desc {
  width: 100%;
  color: var(--color-text-tertiary);
  padding-top: var(--space-1);
}
</style>
