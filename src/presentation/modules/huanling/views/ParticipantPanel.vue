<template>
  <div class="panel-left">
    <!-- 阵容预设选择器 -->
    <div class="preset-selector">
      <label class="preset-label">阵容预设：</label>
      <TacticalSelect v-model="selectedPreset" class="preset-select-slot" :options="presetOptions"
        @change="applyPreset" />
      <div class="preset-actions">
        <Button size="tiny" @click="showSavePreset = true" title="将当前参战阵容保存为自定义预设">存为预设</Button>
        <Button v-if="selectedCustomPreset" size="tiny" variant="danger" @click="removePreset">删除预设</Button>
      </div>
      <span v-if="currentPresetDesc" class="preset-desc">{{ currentPresetDesc }}</span>
    </div>
    <div class="panel-section">
      <div class="section-header">
        <span>参战管理</span>
        <div class="section-header-actions">
          <Button variant="primary" :disabled="totalTeamCount === 0" title="为所有参战角色随机附加词缀"
            @click="applyRandomAffixesToTeam">
            <span class="icon mr-2">[~]</span>随机词缀
          </Button>
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
              <div v-for="char in allyTeam" :key="char.id" class="character-item bg-dots"
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
              <div v-for="char in enemyTeam" :key="char.id" class="character-item bg-dots"
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
      </div>
      <div class="section-content roster-layout">
        <!-- 左侧：场景列表 -->
        <div class="roster-scenes">
          <div v-if="actors.length" class="scene-item"
            :class="{ active: activeRosterKey === ROSTER_KEY.ACTORS }" role="button" tabindex="0"
            @click="selectActors" @keydown.enter.prevent="selectActors" @keydown.space.prevent="selectActors">
            <span class="scene-item-name">我的角色</span>
            <span class="scene-item-count">{{ actors.length }}人</span>
          </div>
          <div v-for="group in sceneGroups" :key="group.scene.id" class="scene-item"
            :class="{ active: activeRosterKey === group.scene.id }" role="button" tabindex="0"
            @click="selectScene(group.scene.id)" @keydown.enter.prevent="selectScene(group.scene.id)"
            @keydown.space.prevent="selectScene(group.scene.id)">
            <span class="scene-item-name">{{ group.scene.name }}</span>
            <span class="scene-item-level" v-if="group.scene.levelRange">Lv.{{ group.scene.levelRange[0] }}</span>
            <span class="scene-item-count">{{ group.enemies.length }}人</span>
          </div>
          <EmptyState v-if="sceneGroups.length === 0">暂无场景</EmptyState>
        </div>
        <!-- 右侧：对应场景的角色列表 -->
        <div class="roster-characters">
          <div class="character-search">
            <TacticalInput size="md" :model-value="rosterSearch" placeholder="搜索当前场景角色..." aria-label="搜索角色"
              @update:model-value="rosterSearch = String($event ?? '')" />
          </div>
          <div class="roster-char-list">
            <template v-if="activeRosterKey === ROSTER_KEY.ACTORS">
              <div v-for="actor in visibleActors" :key="actor.id" class="character-item bg-dots"
                :class="{ selected: isActorSelected(actor.id) }" role="button" tabindex="0"
                @click="previewActor(actor)" @keydown.enter.prevent="previewActor(actor)"
                @keydown.space.prevent="previewActor(actor)">
                <div class="char-info">
                  <span class="char-name">{{ actor.name }} (Lv.{{ actor.level }})</span>
                </div>
                <div class="char-actions">
                  <Button size="tiny" @click.stop="addActorToBattle(actor)"><span class="icon mr-2">[+]</span>我方</Button>
                </div>
              </div>
              <EmptyState v-if="visibleActors.length === 0">未找到匹配的角色</EmptyState>
            </template>
            <template v-else>
              <div v-for="enemy in visibleEnemies" :key="enemy.id" class="character-item bg-dots"
                :class="{ selected: isRosterCharSelected(enemy.id) }" role="button" tabindex="0"
                @click="previewRosterCharacter(enemy)" @keydown.enter.prevent="previewRosterCharacter(enemy)"
                @keydown.space.prevent="previewRosterCharacter(enemy)">
                <div class="char-info">
                  <span class="char-name">{{ enemy.name }} (Lv.{{ enemy.level }})</span>
                </div>
                <div class="char-actions">
                  <Button size="tiny" @click.stop="addEnemyToBattle(enemy, ParticipantSide.ALLY)"><span class="icon mr-2">[+]</span>我方</Button>
                  <Button size="tiny" @click.stop="addEnemyToBattle(enemy, ParticipantSide.ENEMY)"><span class="icon mr-2">[+]</span>敌方</Button>
                </div>
              </div>
              <EmptyState v-if="visibleEnemies.length === 0">未找到匹配的角色</EmptyState>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 危险操作二次确认 -->
    <ConfirmDialog v-model="confirmClear" title="清空参战角色" message="确定要清空当前所有参战角色吗？"
      confirm-text="清空" danger @confirm="clearParticipants" />
    <ConfirmDialog v-model="confirmRemove" title="移除角色" message="确定要移除当前选中的角色吗？"
      confirm-text="移除" danger @confirm="removeSelectedCharacter" />

    <!-- 将当前阵容存为自定义预设 -->
    <Dialog v-model="showSavePreset" title="存为预设" width="400px">
      <div class="save-preset-form">
        <TacticalInput v-model="presetName" placeholder="预设名称" aria-label="预设名称" />
        <TacticalInput v-model="presetDesc" placeholder="描述（可选）" aria-label="预设描述" />
        <div class="save-preset-actions">
          <Button variant="primary" :disabled="!presetName.trim()" @click="saveCurrentAsPreset">保存</Button>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import { GameDataProcessor } from "@/shared/utils/GameDataProcessor";
import { applyRandomAffixes } from "@/shared/utils/affix";
import { container } from '@/infrastructure/di/Container';
import { GameDataApi } from '@/application/service/GameDataApi';
import type { Enemy } from '@/shared/types/enemy'
import type { SceneData } from '@/shared/types/scene';
import type { ActorData, AffixData, LineupData } from '@/domain/fengshen/types';
import { ParticipantSide } from "@/domain/battle/type/types";
import type { BattleService } from '@/application/facade/BattleFacade';
import { useBattleStore } from '@/presentation/stores';
import { useBattlePresetStore } from '@/presentation/stores/battlePresetStore';
import { useFengshenStore } from '@/presentation/modules/fengshen/stores/fengshenStore';
import { useNotificationStore } from '@/presentation/stores/notificationStore';
import EmptyState from '@/presentation/components/EmptyState.vue'
import Button from '@/presentation/components/Button.vue'
import ConfirmDialog from '@/presentation/components/ConfirmDialog.vue'
import Dialog from '@/presentation/components/Dialog.vue'
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
const notification = useNotificationStore();

// 初始化 GameDataProcessor（敌人/场景经数据源切换反映封神榜最新数据）
const rosterSearch = ref("");
const enemiesData = ref<Enemy[]>([]);
const scenesData = ref<SceneData[]>([]);
enemiesData.value = GameDataProcessor.getEnemiesData();
scenesData.value = GameDataProcessor.getScenesData();

// 封神榜阵容 / 角色（可管理，数据变更自动刷新）
const lineups = ref<LineupData[]>([]);
const actors = ref<ActorData[]>([]);

// 角色库选中项：'actors' 表示"我的角色"，否则为场景 id
const ROSTER_KEY = { ACTORS: '__actors__' } as const;

/** 首个有敌人的场景 id（数据源为空时回退到"我的角色"） */
function firstPopulatedSceneId(): string {
  for (const scene of scenesData.value) {
    const sceneEnemyIds = new Set([
      ...(scene.enemies ?? []).map((e) => e.id),
      ...(scene.guardian?.id ? [scene.guardian.id] : []),
    ]);
    if (enemiesData.value.some((enemy) => sceneEnemyIds.has(enemy.id))) {
      return scene.id;
    }
  }
  return ROSTER_KEY.ACTORS;
}

const activeRosterKey = ref<string>(firstPopulatedSceneId());

function selectActors(): void {
  activeRosterKey.value = ROSTER_KEY.ACTORS;
}

function selectScene(sceneId: string): void {
  activeRosterKey.value = sceneId;
}

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

// 阵容预设（内置调试用例 + 用户自定义，见 battlePresetStore）
const presetStore = useBattlePresetStore()
const selectedPreset = ref('')
// 自定义预设管理对话框
const showSavePreset = ref(false)
const presetName = ref('')
const presetDesc = ref('')

/** 预设下拉：封神榜阵容（可管理）+ 内置调试预设（测试用例） */
interface PresetGroupItem {
  id: string
  name: string
  description: string
  source: 'lineup' | 'builtin'
}

const presetGroups = computed(() => {
  const groups: Array<{ label: string; items: PresetGroupItem[] }> = []
  if (lineups.value.length) {
    groups.push({
      label: '封神榜阵容',
      items: lineups.value.map((l) => ({ id: l.id, name: l.name, description: l.description ?? '封神榜预设阵容', source: 'lineup' as const })),
    })
  }
  const builtin = presetStore.allPresets.filter(p => !p.custom)
  groups.push(
    { label: '调试 · 已有角色基线', items: builtin.filter(p => p.id.startsWith('baseline_')) },
    { label: '调试 · 基础机制', items: builtin.filter(p => ['test_basic_damage', 'test_defense', 'test_crit_vs_anti_crit'].includes(p.id)) },
    { label: '调试 · 被动技能', items: builtin.filter(p => ['test_dodge_chain', 'test_lifesteal_vs_shield', 'test_thorns', 'test_combo_vs_thorns'].includes(p.id)) },
    { label: '调试 · Buff/Debuff', items: builtin.filter(p => ['test_control', 'test_dot_poison', 'test_buff_stack'].includes(p.id)) },
    { label: '调试 · 混合对抗', items: builtin.filter(p => p.id.startsWith('mixed_')) },
  )
  if (presetStore.customPresets.length) {
    groups.push({
      label: '我的预设',
      items: presetStore.customPresets.map((p) => ({ id: p.id, name: p.name, description: p.description, source: 'builtin' as const })),
    })
  }
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
  return presetStore.allPresets.find(p => p.id === selectedPreset.value)?.description ?? ''
})

/** 当前选中的预设是否用户自定义（用于显示"删除预设"） */
const selectedCustomPreset = computed(() => {
  return presetStore.customPresets.find(p => p.id === selectedPreset.value) ?? null
})

/** 将当前参战阵容保存为自定义预设 */
const saveCurrentAsPreset = () => {
  const allyIds = allyTeam.value.filter(c => c.enabled).map(c => c.id)
  const enemyIds = enemyTeam.value.filter(c => c.enabled).map(c => c.id)
  const preset = presetStore.addPreset(presetName.value, presetDesc.value, allyIds, enemyIds)
  if (preset) {
    notification.notify('成功', `预设「${preset.name}」已保存`, 'success')
    selectedPreset.value = preset.id
    applyPreset()
    presetName.value = ''
    presetDesc.value = ''
  } else {
    notification.notify('提示', '保存失败：请确认已填名称且双方各有至少一个参战角色', 'warning')
  }
  showSavePreset.value = false
}

/** 删除选中的自定义预设 */
const removePreset = () => {
  const id = selectedPreset.value
  if (!id) return
  presetStore.deletePreset(id)
  selectedPreset.value = ''
  notification.notify('成功', '预设已删除', 'success')
}

/** 封神榜阵容 → 参战者（roles 按 seatIndex 排序；角色归我方、敌人归敌方） */
function applyLineup(lineup: LineupData): void {
  const roles = [...lineup.roles].sort((a, b) => a.seatIndex - b.seatIndex)
  for (const role of roles) {
    const actor = actors.value.find((a) => a.id === role.roleId)
    if (actor) {
      const entity = GameDataProcessor.actorToParticipant(actor, ParticipantSide.ALLY, role.seatIndex)
      battleService.addCharacterToTeam(entity, ParticipantSide.ALLY)
      continue
    }
    const enemy = GameDataProcessor.findEnemyById(role.roleId)
    if (enemy) {
      const entity = GameDataProcessor.enemyToParticipant(enemy, ParticipantSide.ENEMY, role.seatIndex)
      battleService.addCharacterToTeam(entity, ParticipantSide.ENEMY)
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

  const preset = presetStore.allPresets.find(p => p.id === id)
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

// 场景 → 敌人分组（左侧场景列表 + 右侧角色列表的数据源）
const sceneGroups = computed<GroupedEnemies[]>(() => {
  const allScenes = scenesData.value;
  const allEnemies = enemiesData.value;
  return allScenes
    .map((scene) => {
      const sceneEnemyIds = new Set([
        ...(scene.enemies ?? []).map((e) => e.id),
        ...(scene.guardian?.id ? [scene.guardian.id] : []),
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

// 右侧角色列表：当前选中场景的敌人（未选中场景时为空）
const currentSceneEnemies = computed<Enemy[]>(() => {
  if (activeRosterKey.value === ROSTER_KEY.ACTORS) return []
  const group = sceneGroups.value.find((g) => g.scene.id === activeRosterKey.value)
  return group?.enemies ?? []
});

// 右侧角色列表：搜索词过滤后（我的角色 / 场景敌人二选一）
const visibleActors = computed(() => {
  const base = actors.value
  if (!rosterSearch.value) return base
  const kw = rosterSearch.value.toLowerCase()
  return base.filter((a) => a.name.toLowerCase().includes(kw))
});

const visibleEnemies = computed(() => {
  const base = currentSceneEnemies.value
  if (!rosterSearch.value) return base
  const kw = rosterSearch.value.toLowerCase()
  return base.filter((e) => e.name.toLowerCase().includes(kw))
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

// ── 封神榜角色（actors 表）：预览 / 加入我方 ──
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

/** 参战总人数（我方+敌方，含未启用的占位） */
const totalTeamCount = computed(
  () => allyTeam.value.length + enemyTeam.value.length,
);

/**
 * 随机词缀：为所有参战角色随机附加 1-3 个词缀（封神榜 affixes 表）。
 * 词缀属性修正以 PERCENTAGE 修饰符注入，属性拆解可见「词缀·xxx」来源。
 */
const applyRandomAffixesToTeam = async () => {
  const all = [...allyTeam.value, ...enemyTeam.value];
  if (all.length === 0) return;
  try {
    const affixes = await gameDataApi.listByTable<AffixData>('affixes', {
      limit: 1000,
    });
    if (affixes.length === 0) {
      notification.notify('提示', '词缀库为空，请先在封神榜配置词缀', 'warning');
      return;
    }
    const applied = applyRandomAffixes(all, affixes);
    let count = 0;
    for (const ids of applied.values()) count += ids.length;
    notification.notify('成功', `已为 ${applied.size} 个参战角色随机附加 ${count} 个词缀`, 'success');
  } catch (e) {
    notification.notify('错误', `随机词缀失败: ${(e as Error).message}`, 'error');
  }
};

const toggleCharacterEnabled = (characterId: string, enabled: boolean) => {
  battleService.setCharacterEnabled(characterId, enabled);
};
</script>

<style scoped>
/* ── 角色库：左右布局（左场景列表 / 右角色列表） ── */
.roster-layout {
  display: flex;
  gap: var(--space-2);
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding-right: 0;
}

.panel-section > .section-content.roster-layout {
  overflow: hidden;
}

.roster-scenes {
  flex: 0 0 40%;
  min-width: 0;
  overflow-y: auto;
  padding-right: var(--space-1);
}

.roster-scenes > .scene-item:not(:last-child) {
  margin-bottom: var(--space-2);
}

.scene-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  cursor: pointer;
  user-select: none;
  transition: background-color var(--transition-fast), border-color var(--transition-fast);
}

.scene-item:hover {
  border-color: var(--color-bg-tertiary-hover);
}

.scene-item.active {
  background: var(--color-bg-tertiary-active);
  border-color: var(--color-info);
}

.scene-item-name {
  font-weight: var(--font-weight-bold);
  color: var(--color-brand-red);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-item-level {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.scene-item-count {
  color: var(--color-text-tertiary);
  margin-left: auto;
  font-size: var(--font-size-sm);
  white-space: nowrap;
}

.roster-characters {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.roster-char-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: var(--space-1);
}

.roster-char-list > .character-item:not(:last-child) {
  margin-bottom: var(--space-2);
}

/* 角色库列表项：纵向布局，按钮放在名称下一行 */
.roster-char-list .character-item {
  flex-direction: column;
  align-items: stretch;
}

.roster-char-list .char-actions {
  margin-left: 0;
  margin-top: var(--space-2);
  flex-wrap: wrap;
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

/* 参战管理头部右侧按钮组（随机词缀 + 清空） */
.section-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
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

.preset-actions {
  display: flex;
  gap: var(--space-1);
  margin-left: auto;
}

.save-preset-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.save-preset-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
