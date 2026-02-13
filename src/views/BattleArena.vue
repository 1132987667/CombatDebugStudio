<template>
  <div class="battle-test-tool">
    <div class="tool-header">
      <h1>回合制战斗系统测试工具 v1.0</h1>
      <div class="header-actions">
        <button class="header-btn" @click="showRulesDialog = true">战斗规则</button>
        <button class="header-btn" @click="showSceneDialog = true">场景管理</button>
        <button class="header-btn" @click="showStatusDialog = true">初始状态注入</button>
      </div>
    </div>

    <div class="main-layout">
      <!-- 左侧：参战角色配置 -->
      <ParticipantPanel :allyTeam="allyTeam" :enemyTeam="enemyTeam" :selected-character-id="selectedCharacterId"
        :battle-system="battleSystem" @update:selected-character-id="selectCharacter" @add-enemy="addEnemyToBattle"
        @move-character="moveCharacter" @clear-participants="clearParticipants" />

      <!-- 中间：战斗战场和日志 -->
      <BattleField ref="battleFieldRef" :allyTeam="allyTeam" :enemyTeam="enemyTeam" :current-turn="currentTurn"
        :max-turns="maxTurns" :current-actor-id="currentActorId" :selected-character-id="selectedCharacterId"
        :battle-logs="battleLogs" :battle-system="battleSystem" @select-character="selectCharacter"
        @show-damage="handleShowDamage" @show-skill-effect="handleShowSkillEffect" />

      <!-- 右侧：调试面板 -->
      <div class="right-panel">
        <DebugPanel :allyTeam="allyTeam" :enemyTeam="enemyTeam" :selected-character-id="selectedCharacterId"
          :last-export-time="lastExportTime" :battle-system="battleSystem" @end-turn="endTurn"
          @execute-skill="executeSkill" @add-status="addStatus" @adjust-stats="adjustStats"
          @clear-statuses="clearStatuses" @export-state="exportState" @import-state="importState"
          @view-export="viewExport" @reload-export="reloadExport" @locate-exception="locateException" />

        <BattleReplay :battle-manager="battleSystem" :battle-system="battleSystem" @replay-event="handleReplayEvent"
          @replay-start="handleReplayStart" @replay-end="handleReplayEnd" @replay-pause="handleReplayPause" />
      </div>
    </div>

    <!-- 对话框组件 -->
    <BattleRulesDialog v-model="showRulesDialog" :rules="rules" :speed="battleSpeed" @update:rules="updateRules"
      @update:speed="updateSpeed" @rule-change="handleRuleChange" />

    <SceneManagementDialog v-model="showSceneDialog" :scene-name="sceneName" :selected-scene="selectedScene"
      :saved-scenes="savedScenes" @update:scene-name="val => sceneName = val"
      @update:selected-scene="val => selectedScene = val" @save="handleSaveScene" @load="handleLoadScene"
      @delete="handleDeleteScene" />

    <StatusInjectionDialog v-model="showStatusDialog" :selected-char-name="getSelectedCharName()"
      :injectable-statuses="injectableStatuses" @update:injectable-statuses="val => updateStatuses(val)"
      @add="handleAddStatus" @clear="handleClearStatuses" />

    <!-- 底部控制栏 -->
    <ControlBar :is-battle-active="isBattleActive" :is-auto-playing="isAutoPlaying" :is-paused="isPaused"
      @start-battle="startBattle" @end-battle="endBattle" @reset-battle="resetBattle" @step-back="stepBack"
      @toggle-pause="togglePause" @single-step="singleStep" @toggle-auto-play="toggleAutoPlay"
      @battle-speed-change="handleBattleSpeedChange" />

    <!-- 快捷键提示面板 -->
    <!-- <KeybindHintPanel ref="keybindHintPanelRef" /> -->

    <!-- 新手引导 -->
    <!-- <NewbieGuide /> -->

    <!-- 通知组件 -->
    <Notification ref="notification" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch } from "vue";
import { GameDataProcessor } from "@/utils/GameDataProcessor";
import ParticipantPanel from "./ParticipantPanel.vue";
import BattleField from "./BattleField.vue";
import DebugPanel from "./DebugPanel.vue";
import ControlBar from "./ControlBar.vue";
import BattleReplay from "./BattleReplay.vue";
import KeybindHintPanel from "./KeybindHintPanel.vue";
import NewbieGuide from "./NewbieGuide.vue";
import Notification from "@/components/Notification.vue";
import BattleRulesDialog from "./components/BattleRulesDialog.vue";
import SceneManagementDialog from "./components/SceneManagementDialog.vue";
import StatusInjectionDialog from "./components/StatusInjectionDialog.vue";
import { keybindManager } from "@/core/input/KeybindManager";
import { BattleSystemFactory } from "@/core/battle/BattleSystemFactory";
import type { IBattleSystem } from "@/core/battle/interfaces";
import { BattleLogManager, BattleLogFormatter } from '@/utils/logging';
import type { ParticipantManager } from "@/core/battle/ParticipantManager";
import type { UIBattleCharacter, Enemy, SceneData } from "@/types";
import type {
  BattleState,
  BattleParticipant,
  BattleAction as BattleSystemAction,
  ParticipantSide,
  BattleStatus,
} from "@/types/battle";
import type { BattleLogEntry } from '@/types/battle-log';
import { PARTICIPANT_SIDE, BATTLE_STATUS } from "@/types/battle";

// 通知组件引用
const notification = ref<InstanceType<typeof Notification> | null>(null);

interface InjectableStatus {
  id: string;
  name: string;
  duration: number;
  effect: string;
  active: boolean;
  isPositive: boolean;
}

/**
 * 当前回合数（可手动重置）
 */
const currentTurn = ref(1);

/**
 * 最大回合数（默认值）
 */
const maxTurns = ref(999);
/**
 * 是否处于战斗暂停状态（界面可控制状态）
 */
const isPaused = ref(false);

const battleId = ref<string | null>(null);
/**
 * 是否自动播放（界面可控制状态）
 */
const isAutoPlaying = ref(false);
/**
 * 战斗状态（界面显示用）
 */
const battleStatus = ref<BattleStatus>(BATTLE_STATUS.CREATED);
/**
 * 战斗是否正在进行（可手动控制）
 */
const isBattleActive = ref(false);

const battleSpeed = ref(1);
const selectedScene = ref("");
const sceneName = ref("");
const currentActorId = ref<string | null>(null);


const lastExportTime = ref<string | null>(null);


const showRulesDialog = ref(false);
const showSceneDialog = ref(false);
const showStatusDialog = ref(false);
const battleFieldRef = ref<InstanceType<typeof BattleField> | null>(null);
const keybindHintPanelRef = ref<InstanceType<typeof KeybindHintPanel> | null>(null);

// Battle System - 使用工厂模式创建实例

BattleSystemFactory.initialize();
const battleSystem: IBattleSystem = BattleSystemFactory.createBattleSystem();

// 事件监听器引用，用于清理
let battleLogHandler: ((data: any) => void) | null = null
let battleStateUpdateHandler: ((data: any) => void) | null = null
let damageAnimationHandler: ((data: any) => void) | null = null
let skillEffectHandler: ((data: any) => void) | null = null

// 初始化战斗系统事件监听
const initBattleSystemListeners = () => {
  const battleSystemAny = battleSystem as any
  if (battleSystemAny && typeof battleSystemAny.on === 'function') {
    battleLogHandler = (data: { battleId: string; log: any }) => {
      const { log } = data
      logManager.addLog(
        log.turn,
        log.source,
        log.action,
        log.target,
        log.result || '',
        log.level,
        log.htmlResult
      )
    }
    battleSystemAny.on('battleLog', battleLogHandler)

    battleStateUpdateHandler = (data: { battleId: string; participants: any[]; turnOrder: string[]; currentTurn: number; currentRound: number }) => {
      let hasUpdates = false
      const { participants, currentRound: newRound } = data
      participants.forEach((p: any) => {
        const character = allyTeam.value.find(c => c.id === p.id)
        const enemy = enemyTeam.value.find(e => e.id === p.id)
        if (character) {
          character.currentHp = p.currentHp
          character.maxHp = p.maxHp
          character.currentEnergy = p.currentEnergy
          if (p.buffs) {
            character.buffs = p.buffs
          }
          hasUpdates = true
        } else if (enemy) {
          enemy.currentHp = p.currentHp
          enemy.maxHp = p.maxHp
          enemy.currentEnergy = p.currentEnergy
          if (p.buffs) {
            enemy.buffs = p.buffs
          }
          hasUpdates = true
        }
      })
      if (hasUpdates) {
        allyTeam.value = [...allyTeam.value]
        enemyTeam.value = [...enemyTeam.value]
      }
      if (newRound && newRound !== currentTurn.value) {
        currentTurn.value = newRound
      }
    }
    battleSystemAny.on('battleStateUpdate', battleStateUpdateHandler)

    damageAnimationHandler = (data: { targetId: string; damage: number; damageType: string; isCritical: boolean; isHeal: boolean }) => {
      if (battleFieldRef.value) {
        const targetCharacter = allyTeam.value.find(c => c.id === data.targetId) ||
          enemyTeam.value.find(e => e.id === data.targetId)
        if (targetCharacter) {
          battleFieldRef.value.showDamage(
            targetCharacter.id,
            data.damage,
            data.isHeal ? 'heal' : 'damage',
            data.isCritical
          )
        }
      }
    }
    battleSystemAny.on('damageAnimation', damageAnimationHandler)

    skillEffectHandler = (data: { sourceId: string; targetId: string; skillName: string; effectType: string; damageType: string }) => {
      if (battleFieldRef.value) {
        battleFieldRef.value.showSkillEffect(
          data.targetId,
          data.effectType as 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate',
          data.skillName
        )
      }
    }
    battleSystemAny.on('skillEffect', skillEffectHandler)
  }
}

// 清理事件监听器
const cleanupBattleSystemListeners = () => {
  const battleSystemAny = battleSystem as any
  if (battleSystemAny && typeof battleSystemAny.off === 'function') {
    if (battleLogHandler) {
      battleSystemAny.off('battleLog', battleLogHandler)
      battleLogHandler = null
    }
    if (battleStateUpdateHandler) {
      battleSystemAny.off('battleStateUpdate', battleStateUpdateHandler)
      battleStateUpdateHandler = null
    }
    if (damageAnimationHandler) {
      battleSystemAny.off('damageAnimation', damageAnimationHandler)
      damageAnimationHandler = null
    }
    if (skillEffectHandler) {
      battleSystemAny.off('skillEffect', skillEffectHandler)
      skillEffectHandler = null
    }
  }
}

const currentBattleId = ref<string | null>(null);
const battleData = computed(() => {
  return battleSystem.getCurBattleData();
});
// 监听 battleData 变化
watch(
  battleData,
  (newData) => {
    if (newData) {
      battleStatus.value = newData.battleState ?? BATTLE_STATUS.CREATED;
      isPaused.value = newData.battleState === BATTLE_STATUS.PAUSED;
      isAutoPlaying.value = newData.autoPlaying || false;
      currentTurn.value = newData.currentRound || 1;
      maxTurns.value = newData.maxTurns;
      battleSpeed.value = newData.battleSpeed
      battleId.value = newData.battleId
    }
  },
  { immediate: true, deep: true }
);

// 获取技能名称的工具函数
const getSkillName = async (skillId: string | undefined): Promise<string> => {
  if (!skillId) return "";
  const skill = GameDataProcessor.findSkillById(skillId);
  if (skill?.name) {
    return skill.name;
  }
  return "未知技能";
};

function initBattle() {
  // 完成 敌我ParticipantInfo的初始化
  const allyIds = ["boss_005", "boss_008"];
  const allyList = GameDataProcessor.findEnemiesByIds(allyIds);
  const enemyIds = ["boss_006", "boss_007"];
  const enemyList = GameDataProcessor.findEnemiesByIds(enemyIds);
  console.log('allyList', allyList, 'enemyList', enemyList);
  allyTeam.value = allyList.map((ally, index) => GameDataProcessor.enemyToBattleCharacter(ally, index));
  enemyTeam.value = enemyList.map((enemy, index) => GameDataProcessor.enemyToBattleCharacter(enemy, index, true));
  console.log('allyTeam', allyTeam.value, 'enemyTeam', enemyTeam.value);

  const allyParticipants = allyList.map((ally) => GameDataProcessor.enemyToParticipantInfo(ally, PARTICIPANT_SIDE.ALLY));
  const enemyParticipants = enemyList.map((enemy) => GameDataProcessor.enemyToParticipantInfo(enemy, PARTICIPANT_SIDE.ENEMY));

  const allParticipants = [...allyParticipants, ...enemyParticipants];
  const battleState = battleSystem.createBattle(allParticipants);
  currentBattleId.value = battleState.battleId;
  // 注册回合执行回调，用于自动战斗时同步日志
  battleSystem.onTurnExecuted = () => {
    syncBattleState();
  };
}

// 初始化战斗系统和快捷键
onMounted(() => {
  initBattle();

  // 初始化战斗系统事件监听
  initBattleSystemListeners();

  // // 获取第一个可行动的我方参与者作为当前行动者
  // const firstActor = battleState.turnOrder.find(id => id.startsWith('character_')) || battleState.turnOrder[0] || null;
  // currentActorId.value = firstActor;
  logManager.addSystemLog("测试工具已加载");

  // 初始化快捷键系统
  // initKeybindManager();
});

function initKeybindManager() {
  // 初始化快捷键系统
  keybindManager.startListening();

  // 注册快捷键处理函数
  keybindManager.onAction('menu', () => {
    // 打开菜单
    console.log('打开菜单');
  });

  keybindManager.onAction('pause', () => {
    // 暂停/继续战斗
    togglePause();
  });

  keybindManager.onAction('replay', () => {
    // 打开战斗回放
    console.log('打开战斗回放');
  });

  keybindManager.onAction('debug', () => {
    // 进入调试模式
    console.log('进入调试模式');
  });
}

// 监听自动播放速度变化，同步到战斗引擎
watch(battleSpeed, (newSpeed) => {
  if (currentBattleId.value && battleSystem) {
    try {
      battleSystem.setBattleSpeed(currentBattleId.value, newSpeed);
      logManager.addSystemLog(`自动播放速度更新为: ${newSpeed}x`);
    } catch (error) {
      console.error("设置自动战斗速度失败:", error);
      logManager.addErrorLog(`设置自动战斗速度失败: ${error}`);
    }
  }
});

// 监听自动播放状态，启动或停止自动战斗
watch(isAutoPlaying, (newValue) => {
  if (!currentBattleId.value || !battleSystem) {
    return;
  }

  try {
    if (newValue) {
      battleSystem?.startAutoBattle();
      syncBattleState();
    } else {
      battleSystem?.stopAutoBattle(currentBattleId.value);
      syncBattleState();
    }
  } catch (error) {
    console.error("切换自动战斗状态失败:", error);
    isAutoPlaying.value = !newValue;
    logManager.addErrorLog(`自动战斗切换失败: ${error}`);
  }
});

// 监听战斗状态变化，自动同步UI
watch(
  () => currentBattleId.value,
  (newBattleId) => {
    if (newBattleId) {
      syncBattleState();
    }
  }
);

// 监听battleSystem状态变化，自动同步界面状态
watch(
  () => isBattleActive.value,
  (newIsActive) => {
    if (!newIsActive && currentBattleId.value) {
      // 战斗已结束，同步界面状态
      syncUIStateWithBattleSystem();
    }
  }
);


// 创建日志管理器实例
const logManager = new BattleLogManager({ maxLogs: 100 })

// 使用响应式日志列表
const battleLogs = ref<BattleLogEntry[]>([])

// 设置日志监听器
logManager.addListener((logs) => {
  battleLogs.value = logs
})
const logFilters = computed(() => logManager.getFilters());

const rules = reactive({
  speedFirst: true,
  fixedTurns: false,
  critEnabled: true,
  dodgeEnabled: false,
});

const savedScenes = ref([]);

const injectableStatuses = reactive<InjectableStatus[]>([]);


const currentActor = computed(() => {
  if (!currentActorId.value) return null;
  return (
    allyTeam.value.find((c) => c.id === currentActorId.value) ||
    enemyTeam.value.find((e) => e.id === currentActorId.value) ||
    null
  );
});



const scenes = ref<any[]>([]);

const expandedScenes = reactive<Record<string, boolean>>({});
scenes.value.forEach((s) => (expandedScenes[s.id] = true));

watch(
  () => rules.critEnabled,
  (val) => {
    logManager.addSystemLog(`暴击率 ${val ? "已启用" : "已禁用"}`);
  }
);

const selectCharacter = (charId: string) => {
  selectedCharacterId.value = charId;
  selectedCharMonitor.value =
    allyTeam.value.find((c) => c.id === charId) ||
    enemyTeam.value.find((e) => e.id === charId) ||
    null;
};

const addEnemyToBattle = (enemy: Enemy, side: ParticipantSide = PARTICIPANT_SIDE.ALLY) => {
  const newCharacter: UIBattleCharacter = {
    originalId: enemy.id,
    id: `enemy_${Date.now()}_${enemy.id}`,
    team: side,
    name: enemy.name,
    level: enemy.level,
    maxHp: enemy.stats.health,
    currentHp: enemy.stats.health,
    maxMp: 100,
    currentMp: 100,
    currentEnergy: 0,
    maxEnergy: 150,
    minAttack: enemy.stats.minAttack,
    maxAttack: enemy.stats.maxAttack,
    attack: Math.floor((enemy.stats.minAttack + enemy.stats.maxAttack) / 2),
    defense: enemy.stats.defense,
    speed: enemy.stats.speed,
    critRate: 10,
    critDamage: 125,
    damageReduction: 0,
    healthBonus: 0,
    attackBonus: 0,
    defenseBonus: 0,
    speedBonus: 0,
    enabled: true,
    isFirst: false,
    buffs: [],
    skills: {
      small: GameDataProcessor.normalizeSkillIds(enemy.skills?.small),
      passive: GameDataProcessor.normalizeSkillIds(enemy.skills?.passive),
      ultimate: GameDataProcessor.normalizeSkillIds(enemy.skills?.ultimate),
    },
  };

  if (side === PARTICIPANT_SIDE.ALLY) {
    allyTeam.value.push(newCharacter);
  } else {
    enemyTeam.value.push(newCharacter);
  }

  selectCharacter(newCharacter.id);
};

const getSelectedCharName = () => {
  const char = allyTeam.value.find((c) => c.id === selectedCharacterId.value);
  const enemy = enemyTeam.value.find((e) => e.id === selectedCharacterId.value);
  return char?.name || enemy?.name || "未选择";
};

const moveCharacter = (direction: number) => {
  const selectedChar = allyTeam.value.find(c => c.id === selectedCharacterId.value) ||
    enemyTeam.value.find(e => e.id === selectedCharacterId.value);

  if (!selectedChar) return;

  const isAlly = allyTeam.value.some(c => c.id === selectedCharacterId.value);
  const team = isAlly ? allyTeam.value : enemyTeam.value;

  const enabledChars = team.filter((c) => c.enabled);
  const currentIndex = enabledChars.findIndex(
    (c) => c.id === selectedCharacterId.value
  );
  if (currentIndex < 0) return;
  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= enabledChars.length) return;
  const targetChar = enabledChars[newIndex];
  const currentChar = enabledChars[currentIndex];
  const idx1 = team.indexOf(currentChar);
  const idx2 = team.indexOf(targetChar);
  team[idx1] = targetChar;
  team[idx2] = currentChar;
};

// 子组件事件处理方法
const endTurn = () => {
  // 结束当前回合的逻辑
  if (currentActorId.value) {
    logManager.addActionLog("系统", "结束回合", currentActor.value?.name || "", "回合结束");
    currentActorId.value = null;
  }
};

const executeSkill = (skillName: string) => {
  if (!skillName) return;
  if (currentActor.value) {
    logManager.addActionLog(currentActor.value.name, "使用技能", "", skillName);
  }
};

const addStatus = (status: { name: string; turns: number }) => {
  if (!status.name) return;
  const selectedChar = allyTeam.find(c => c.id === selectedCharacterId.value) ||
    enemyTeam.find(e => e.id === selectedCharacterId.value);
  if (selectedChar) {
    selectedChar.buffs.push({
      id: `status_${Date.now()}`,
      name: status.name,
      remainingTurns: status.turns,
      isPositive: true
    });
    logManager.addActionLog("系统", "添加状态", selectedChar.name, `${status.name} (${status.turns}回合)`);
  }
};

const adjustStats = (stats: { hp: number; mp: number }) => {
  const selectedChar = allyTeam.value.find(c => c.id === selectedCharacterId.value) ||
    enemyTeam.value.find(e => e.id === selectedCharacterId.value);
  if (selectedChar) {
    selectedChar.currentHp = Math.max(0, Math.min(selectedChar.maxHp, selectedChar.currentHp + stats.hp));
    selectedChar.currentMp = Math.max(0, Math.min(selectedChar.maxMp, selectedChar.currentMp + stats.mp));
    logManager.addActionLog("系统", "调整属性", selectedChar.name, `HP:${stats.hp}, MP:${stats.mp}`);
  }
};

const clearStatuses = () => {
  const selectedChar = allyTeam.value.find(c => c.id === selectedCharacterId.value) ||
    enemyTeam.value.find(e => e.id === selectedCharacterId.value);
  if (selectedChar) {
    selectedChar.buffs = [];
    logManager.addActionLog("系统", "清除状态", selectedChar.name, "所有状态已清除");
  }
};

const exportState = () => {
  const state = {
    battleCharacters: allyTeam.value,
    enemyParty: enemyTeam.value,
    currentTurn: currentTurn.value,
    rules,
    battleLogs
  };
  const json = JSON.stringify(state, null, 2);
  localStorage.setItem('battleState', json);
  lastExportTime.value = new Date().toLocaleString();
  logManager.addSystemLog("战斗状态已导出");
};

const importState = () => {
  const savedState = localStorage.getItem('battleState');
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      // 这里需要实现导入逻辑
      logManager.addSystemLog("战斗状态已导入");
    } catch (e) {
      logManager.addErrorLog("导入失败");
    }
  }
};

const viewExport = () => {
  const savedState = localStorage.getItem('battleState');
  if (savedState) {
    console.log('Exported Battle State:', JSON.parse(savedState));
  }
};

const reloadExport = () => {
  importState();
};

const locateException = () => {
  // 异常定位逻辑
  logManager.addSystemLog("开始异常检测");
};


// 战斗规则组件事件处理
const updateRules = (newRules: any) => {
  Object.assign(rules, newRules);
};

const updateSpeed = (speed: number) => {
  battleSpeed.value = speed;
};

const handleRuleChange = (key: string, value: boolean) => {
  logManager.addSystemLog(`战斗规则已更新: ${key} = ${value}`);
};

// 场景管理组件事件处理
const handleSaveScene = (sceneNameValue: string) => {
  savedScenes.value.push(sceneNameValue);
  logManager.addSystemLog(`保存场景: ${sceneNameValue}`);
};

const handleLoadScene = (sceneNameValue: string) => {
  logManager.addSystemLog(`加载场景: ${sceneNameValue}`);
};

const handleDeleteScene = (sceneNameValue: string) => {
  const index = savedScenes.value.indexOf(sceneNameValue);
  if (index > -1) {
    savedScenes.value.splice(index, 1);
    logManager.addSystemLog(`删除场景: ${sceneNameValue}`);
  }
};

// 状态注入组件事件处理
const updateStatuses = (newStatuses: any[]) => {
  const targetIndex = injectableStatuses.findIndex(s => s.id === selectedCharacterId.value);
  if (targetIndex !== -1) {
    injectableStatuses.splice(targetIndex, 1, ...newStatuses);
  }
};

const handleAddStatus = () => {
  const selectedChar = allyTeam.value.find(c => c.id === selectedCharacterId.value) ||
    enemyTeam.value.find(e => e.id === selectedCharacterId.value);
  if (selectedChar) {
    const activeStatuses = injectableStatuses.filter(s => s.active);
    activeStatuses.forEach(status => {
      selectedChar.buffs.push({
        id: `status_${Date.now()}_${status.id}`,
        name: status.name,
        remainingTurns: status.duration,
        isPositive: status.isPositive
      });
    });
    if (activeStatuses.length > 0) {
      logManager.addActionLog("系统", "添加状态", selectedChar.name,
        `${activeStatuses.map(s => s.name).join(', ')} (${activeStatuses.length}个状态)`);
    }
  }
};

const handleClearStatuses = () => {
  const selectedChar = allyTeam.value.find(c => c.id === selectedCharacterId.value) ||
    enemyTeam.value.find(e => e.id === selectedCharacterId.value);
  if (selectedChar) {
    selectedChar.buffs = [];
    logManager.addActionLog("系统", "清除状态", selectedChar.name, "所有状态已清除");
  }
};


const allyTeam = ref<UIBattleCharacter[]>([]);
const enemyTeam = ref<UIBattleCharacter[]>([]);
// 选中的战斗角色ID
const selectedCharacterId = ref<string | null>(null);
// 选中的战斗角色监控
const selectedCharMonitor = ref<UIBattleCharacter | null>(null);

watch(
  selectedCharacterId,
  (newId) => {
    selectedCharMonitor.value =
      allyTeam.value.find((c) => c.id === newId) || null;
  },
  { immediate: true }
);

watch(
  () => [allyTeam.value.length, enemyTeam.value.length],
  ([allyCount, enemyCount]) => {
    logManager.addSystemLog(`当前参战角色: ${allyCount}人/${enemyCount}人`);
  }
);


const clearParticipants = () => {
  // 清空所有参与者
  allyTeam.value.length = 0;
  enemyTeam.value.length = 0;
  selectedCharacterId.value = null;
  selectedCharMonitor.value = null;
  logManager.addSystemLog("所有参战角色已清空");
};

const handleShowDamage = (characterId: string, value: number, type: 'damage' | 'heal' | 'critical' | 'miss', isCritical: boolean = false) => {
  if (battleFieldRef.value) {
    battleFieldRef.value.triggerHitEffect(characterId);
  }

  if (damageNumberRefs.value) {
    const damageType = type === 'heal' ? 'heal' : (type === 'critical' ? 'critical' : 'damage');
    damageNumberRefs.value.addDamage(
      value,
      damageType as any,
      'physical',
      isCritical || type === 'critical',
      false,
      false,
      { x: 100 + Math.random() * 100, y: 50 + Math.random() * 50 },
      1500,
      0
    );
  }

  console.log(`显示伤害: ${characterId} - ${value} (${type})`, { isCritical });
};

const handleShowSkillEffect = (characterId: string, type: 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate', name?: string) => {
  if (battleFieldRef.value) {
    battleFieldRef.value.triggerCastingEffect(characterId, 800);
  }

  if (skillEffectRefs.value) {
    skillEffectRefs.value.addSkillEffect(
      type,
      'physical',
      name,
      undefined,
      { x: 150, y: 100 },
      1000,
      0,
      1,
      true
    );
  }

  console.log(`显示技能效果: ${characterId} - ${type}`, { name });
};

// 战斗回放相关方法
const handleReplayEvent = (event: any, index: number) => {
  console.log('回放事件:', event, '索引:', index);

  // 根据事件类型处理不同的回放逻辑
  switch (event.type) {
    case 'action':
      // 处理动作回放
      handleActionReplay(event.data.action);
      break;
    case 'turn_start':
      // 处理回合开始回放
      handleTurnStartReplay(event.data.turn, event.data.participantId);
      break;
    case 'turn_end':
      // 处理回合结束回放
      handleTurnEndReplay(event.data.turn);
      break;
    case 'battle_start':
      // 处理战斗开始回放
      handleBattleStartReplay();
      break;
    case 'battle_end':
      // 处理战斗结束回放
      handleBattleEndReplay(event.data.winner);
      break;
  }
};

const handleReplayStart = (recording: any) => {
  console.log('开始回放:', recording);
  // 重置战斗状态，准备回放
  resetBattle();
};

const handleReplayEnd = (recording: any) => {
  console.log('回放结束:', recording);
  // 回放结束后的处理
};

const handleReplayPause = (recording: any, index: number) => {
  console.log('回放暂停:', recording, '当前索引:', index);
  // 回放暂停后的处理
};

// 具体的回放处理方法
const handleActionReplay = (action: any) => {
  console.log('回放动作:', action);
  // 这里可以添加动作回放的具体逻辑
};

const handleTurnStartReplay = (turn: number, participantId: string) => {
  console.log('回放回合开始:', turn, '行动者:', participantId);
  // 这里可以添加回合开始回放的具体逻辑
};

const handleTurnEndReplay = (turn: number) => {
  console.log('回放回合结束:', turn);
  // 这里可以添加回合结束回放的具体逻辑
};

const handleBattleStartReplay = () => {
  console.log('回放战斗开始');
  // 这里可以添加战斗开始回放的具体逻辑
};

const handleBattleEndReplay = (winner: string) => {
  console.log('回放战斗结束:', winner);
  // 这里可以添加战斗结束回放的具体逻辑
};

const togglePause = () => {
  if (isAutoPlaying.value && currentBattleId.value) {
    // 如果正在自动播放，先停止自动播放
    battleSystem?.stopAutoBattle(currentBattleId.value);
    isAutoPlaying.value = false;
    logManager.addSystemLog("停止自动战斗");
  }
  isPaused.value = !isPaused.value;
};

const singleStep = async () => {
  if (!currentBattleId.value) {
    notification.value?.addNotification("提示", "请先开始战斗", "warning");
    return;
  }

  isPaused.value = false;

  try {
    // 执行战斗回合
    await battleSystem?.processTurn(currentBattleId.value!);

    // 同步战斗状态
    syncBattleState();
  } catch (error) {
    console.error("执行回合时出错:", error);
    logManager.addErrorLog(`执行回合时出错: ${error}`);
    isPaused.value = true;
  }
};

const toggleAutoPlay = () => {
  if (!currentBattleId.value) {
    notification.value?.addNotification("提示", "请先开始战斗", "warning");
    return;
  }

  if (isAutoPlaying.value) {
    // 停止自动播放 - 使用战斗引擎API
    battleSystem?.stopAutoBattle(currentBattleId.value!);
    isAutoPlaying.value = false;
    isPaused.value = true;
    logManager.addSystemLog("停止自动战斗");
  } else {
    // 开始自动播放 - 使用战斗引擎API
    battleSystem?.startAutoBattle();
    isAutoPlaying.value = true;
    isPaused.value = false;
    syncBattleState();
    logManager.addSystemLog("开始自动战斗");
  }
};

// 处理战斗速度变化
const handleBattleSpeedChange = (speed: number) => {
  // 更新自动播放速度
  battleSpeed.value = speed;

  // 如果正在自动播放，更新战斗引擎的速度设置
  if (isAutoPlaying.value && currentBattleId.value && battleSystem) {
    battleSystem.setBattleSpeed(currentBattleId.value, speed);
  }

  logManager.addSystemLog(`战斗速度已调整为: ${speed}倍`);
};

const stepBack = () => {
  if (currentTurn.value > 1) {
    currentTurn.value--;
  }
};

// 开始战斗
const startBattle = () => {
  // 获取启用的角色和敌人的详细信息
  const enabledAllyTeam = allyTeam.value.filter((c) => c.enabled);
  const enabledEnemyTeam = enemyTeam.value.filter((e) => e.enabled);

  if (enabledAllyTeam.length === 0) {
    notification.value?.addNotification("提示", "我方请至少选择一个角色参战", "warning");
    return;
  }
  if (enabledEnemyTeam.length === 0) {
    notification.value?.addNotification("提示", "敌方请至少选择一个角色参战", "warning");
    return;
  }
  const allParticipants = battleSystem.getCurParticipantsInfo()


  battleSystem.startAutoBattle();
  logManager.addSystemLog("开始自动战斗");


  // 清空已处理的 action ID 集合，确保新战斗的所有 action 都能被处理
  processedActionIds.value.clear();

  // 添加战斗开始日志
  logManager.addSystemLog(`战斗开始！战斗ID: ${currentBattleId.value}`);
  logManager.addSystemLog(`参战角色: ${enabledAllyTeam.length} 人 | 参战敌人: ${enabledEnemyTeam.length} 人`);
};

/**
 * 状态同步器：确保界面状态与battleSystem状态一致
 */
const syncUIStateWithBattleSystem = () => {
  if (!currentBattleId.value || !battleSystem) {
    // 没有战斗时，保持界面状态不变
    return;
  }

  const battleState = battleSystem.getBattleState(currentBattleId.value);
  if (!battleState) {
    // 战斗不存在时，重置界面状态
    isPaused.value = true;
    isAutoPlaying.value = false;
    return;
  }

  // 同步战斗活跃状态
  if (!battleState.isActive && isBattleActive.value) {
    // 战斗已结束，但界面状态还未更新
    isPaused.value = true;
    isAutoPlaying.value = false;
  }
};

// 同步战斗状态到 UI
const syncBattleState = () => {
  // 首先同步界面状态与battleSystem状态
  syncUIStateWithBattleSystem();

  if (!currentBattleId.value) {
    return;
  }

  try {
    // 获取当前战斗状态
    const battleState = battleSystem?.getBattleState(currentBattleId.value!);
    if (!battleState) {
      console.error("无法获取战斗状态:", currentBattleId.value);
      logManager.addErrorLog(`无法获取战斗状态，战斗可能已结束`);
      currentBattleId.value = null;
      return;
    }

    // 注意：currentTurn现在是computed属性，会自动从battleSystem同步
    // 无需手动更新：currentTurn.value = battleState.currentTurn + 1;

    // 更新当前行动者
    if (battleState.currentTurn < battleState.turnOrder.length) {
      const currentParticipantId =
        battleState.turnOrder[battleState.currentTurn];
      currentActorId.value = currentParticipantId;
    }

    // 同步参与者状态
    try {
      syncParticipantsState(battleState);
    } catch (syncError: any) {
      console.error("同步参与者状态时出错:", syncError);
      logManager.addErrorLog(`同步参与者状态时出错: ${syncError.message || syncError}`);
    }

    // 同步战斗日志
    try {
      syncBattleLogs(battleState);
    } catch (logError: any) {
      console.error("同步战斗日志时出错:", logError);
      logManager.addErrorLog(`同步战斗日志时出错: ${logError.message || logError}`);
    }

    // 检查战斗是否结束
    if (!battleState.isActive) {
      // 战斗结束日志已经在 syncBattleLogs 中添加，这里不需要重复添加
      currentBattleId.value = null;
      isPaused.value = true;
      isAutoPlaying.value = false;
    }
  } catch (error: any) {
    console.error("同步战斗状态时出错:", error);
    logManager.addErrorLog(`同步战斗状态时出错: ${error.message || error}`);
    // 出错后重置战斗状态
    currentBattleId.value = null;
    isPaused.value = true;
    isAutoPlaying.value = false;
  }
};

// 同步参与者状态
const syncParticipantsState = (battleState: BattleState) => {
  // 遍历所有参与者
  battleState.participants.forEach((participant: BattleParticipant) => {
    // 查找对应的角色或敌人
    const character = allyTeam.value.find(
      (c) => c.id === participant.id.replace("character_", "")
    );
    const enemy = enemyTeam.value.find(
      (e) => e.id === participant.id.replace("enemy_", "")
    );

    if (character) {
      // 更新角色状态
      character.currentHp = participant.currentHealth;
      character.maxHp = participant.maxHealth;
      character.currentEnergy = participant.currentEnergy;
      character.maxEnergy = participant.maxEnergy;
      // 这里可以根据需要更新其他状态，如MP、buff等
    } else if (enemy) {
      // 更新敌人状态
      enemy.currentHp = participant.currentHealth;
      enemy.maxHp = participant.maxHealth;
      enemy.currentEnergy = participant.currentEnergy;
      enemy.maxEnergy = participant.maxEnergy;
      // 这里可以根据需要更新其他状态，如MP、buff等
    }
  });
};

// 已处理的 action ID 集合
const processedActionIds = ref<Set<string>>(new Set());

// 解析战斗动作并生成标准化日志
const parseBattleAction = async (action: BattleSystemAction, battleState: BattleState): Promise<{ log: any; shouldDisplay: boolean }> => {
  // 检查是否已经处理过该 action
  if (processedActionIds.value.has(action.id)) {
    return { log: null, shouldDisplay: false };
  }

  // 标记该 action 为已处理
  processedActionIds.value.add(action.id);

  // 解析来源和目标名称
  let sourceName = action.sourceId;
  let targetName = action.targetId;

  if (action.sourceId === "system") {
    sourceName = "系统";
  } else {
    const sourceParticipant = battleState.participants.get(action.sourceId);
    if (sourceParticipant) {
      sourceName = sourceParticipant.name;
    }
  }

  if (action.targetId === "system") {
    targetName = "";
  } else {
    const targetParticipant = battleState.participants.get(action.targetId);
    if (targetParticipant) {
      targetName = targetParticipant.name;
    }
  }

  // 判断来源和目标是友方还是敌方
  const sourceIsAlly = !action.sourceId.includes(PARTICIPANT_SIDE.ENEMY) && action.sourceId !== "system";
  const targetIsAlly = action.targetId && !action.targetId.includes(PARTICIPANT_SIDE.ENEMY) && action.targetId !== "system";

  // 根据动作类型生成标准化日志
  const turn = action.turn || 1;
  const options = {
    turn,
    source: sourceName,
    target: targetName,
    damage: action.damage,
    heal: action.heal,
    skillName: await getSkillName(action.skillId) || "",
    damageType: "物理",
    sourceIsAlly,
    targetIsAlly
  };

  let actionType = "normal_attack";
  let logLevel: any = action.sourceId.includes(PARTICIPANT_SIDE.ENEMY) ? PARTICIPANT_SIDE.ENEMY : PARTICIPANT_SIDE.ALLY;

  // 判断动作类型
  if (action.sourceId === "system") {
    if (action.effects?.some(e => e.description.includes("战斗开始"))) {
      actionType = "battle_start";
      logLevel = "info";
      // 解析战斗开始信息
      const match = action.effects[0].description.match(/参战角色: (\d+) 人，参战敌人: (\d+) 人/);
      if (match) {
        options.source = match[1];
        options.target = match[2];
      }
    } else if (action.effects?.some(e => e.description.includes("战斗结束"))) {
      actionType = "battle_end";
      logLevel = "info";
      // 解析战斗结束信息
      const match = action.effects[0].description.match(/胜利者: (.+)/);
      if (match) {
        options.source = match[1] === "角色方" ? "我方" : "敌方";
      }
    }
  } else if (action.type === "skill") {
    if (action.heal && action.heal > 0) {
      actionType = "heal_skill";
    } else if (action.damage && action.damage > 0) {
      actionType = "skill_attack";
    }
  }

  // 使用格式化工具生成标准化日志
  const formattedLog = BattleLogFormatter.createBattleLogHTML(actionType, options, logLevel);

  // 构建完整的日志对象
  const fullLog = {
    turn: formattedLog.turn,
    source: sourceName,
    action: "对",
    target: targetName,
    result: formattedLog.htmlResult,
    htmlResult: formattedLog.htmlResult,
    level: formattedLog.level
  };

  // 检查是否已经添加过该日志
  const isLogExists = battleLogs.value.some(
    (log) =>
      log.turn === fullLog.turn &&
      log.htmlResult === fullLog.htmlResult
  );

  if (isLogExists) {
    return { log: null, shouldDisplay: false };
  }

  return { log: fullLog, shouldDisplay: true };
};

// 同步战斗日志
const syncBattleLogs = async (battleState: BattleState) => {
  // 按时间戳和回合号排序 actions
  const sortedActions = [...battleState.actions].sort((a, b) => {
    // 首先按时间戳排序
    if (a.timestamp !== b.timestamp) {
      return a.timestamp - b.timestamp;
    }
    // 如果时间戳相同，按回合号排序
    const turnA = a.turn || 0;
    const turnB = b.turn || 0;
    if (turnA !== turnB) {
      return turnA - turnB;
    }
    // 如果回合号也相同，按 action ID 排序
    return a.id.localeCompare(b.id);
  });

  // 遍历排序后的 actions
  for (const action of sortedActions) {
    const { log, shouldDisplay } = await parseBattleAction(action, battleState);

    if (!shouldDisplay || !log) {
      continue;
    }

    // 触发视觉效果（伤害/治疗显示）
    if (battleFieldRef.value && (action.damage || action.heal)) {
      const targetCharacter = allyTeam.value.find(c => c.name === log.target) ||
        enemyTeam.value.find(e => e.name === log.target);
      if (targetCharacter) {
        const effectType = action.damage ? 'damage' : 'heal';
        battleFieldRef.value.showDamage(targetCharacter.id, action.damage || action.heal || 0, effectType, false);
      }
    }

    // 添加标准化日志
    logManager.addLog(
      log.turn,
      log.source,
      log.action,
      log.target,
      log.result || '',
      log.level,
      log.htmlResult
    );
  }
};

const endBattle = () => {
  if (!currentBattleId.value) {
    notification.value?.addNotification("提示", "当前没有进行中的战斗", "warning");
    return;
  }

  // 清除回合执行回调
  if (battleSystem) {
    battleSystem.onTurnExecuted = null;
  }

  // 停止自动战斗
  if (isAutoPlaying.value && battleSystem) {
    battleSystem.stopAutoBattle(currentBattleId.value);
    isAutoPlaying.value = false;
  }

  // 结束战斗，默认角色方胜利
  battleSystem?.endBattle(currentBattleId.value, PARTICIPANT_SIDE.ALLY);

  // 同步战斗状态
  syncBattleState();

  // 重置战斗状态
  currentBattleId.value = null;
  isPaused.value = true;
  isAutoPlaying.value = false;
  isBattleActive.value = false;
};

// 重置战斗
const resetBattle = () => {
  // 清除回合执行回调
  if (battleSystem) {
    battleSystem.onTurnExecuted = null;
  }

  // 重置战斗系统中的战斗状态
  if (currentBattleId.value && battleSystem) {
    battleSystem.resetBattle();
  }

  // 重置战斗状态
  currentBattleId.value = null;
  currentTurn.value = 1;
  isPaused.value = true;
  isAutoPlaying.value = false;
  isBattleActive.value = false;

  // 清空战斗日志
  logManager.clearLogs();

  // 清空已处理的 action ID 集合
  processedActionIds.value.clear();

  // 重置角色状态到初始值
  allyTeam.value.forEach(char => {
    char.currentHp = char.maxHp;
    char.currentEnergy = 0;
  });

  enemyTeam.value.forEach(enemy => {
    enemy.currentHp = enemy.maxHp;
    enemy.currentEnergy = 0;
  });

  // 添加重置日志
  logManager.addSystemLog("战斗已重置");
};

onUnmounted(() => {
  // 清理战斗系统事件监听器
  cleanupBattleSystemListeners();

  // 停止所有自动战斗
  if (currentBattleId.value && battleSystem) {
    battleSystem.stopAutoBattle(currentBattleId.value);
  }
});
</script>

<style lang="scss">
@use '@/styles/main.scss';
</style>
