<template>
  <div class="battle-test-tool">
    <!-- 加载指示器 -->
    <div v-if="battleStore.isBattleLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">{{ battleStore.getCurrentOperation || '加载中...' }}</div>
      <div v-if="battleStore.getLoadingProgress !== null" class="loading-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: battleStore.getLoadingProgress + '%' }"></div>
        </div>
        <div class="progress-text">{{ battleStore.getLoadingProgress }}%</div>
      </div>
    </div>
    
    <!-- 错误提示 -->
    <div v-if="battleStore.hasError" class="error-toast" @click="battleStore.clearError()">
      <span class="error-message">{{ battleStore.getErrorMessage }}</span>
      <span class="error-close">&times;</span>
    </div>

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
      <ParticipantPanel />

      <!-- 中间：战斗战场和日志 -->
      <BattleField ref="battleFieldRef" :current-actor-id="battleStore.getCurrentActorId"
        @select-character="selectCharacter" />

      <!-- 右侧：调试面板 -->
      <div class="right-panel">
        <DebugPanel />

        <BattleReplay @replay-event="handleReplayEvent" @replay-start="handleReplayStart"
          @replay-end="handleReplayEnd" @replay-pause="handleReplayPause" />
      </div>
    </div>

    <!-- 对话框组件 -->
    <BattleRulesDialog v-model="showRulesDialog" :rules="battleStore.getRules" :speed="battleStore.getBattleSpeed" @update:rules="battleStore.updateRules"
      @update:speed="updateSpeed" @rule-change="handleRuleChange" />

    <SceneManagementDialog v-model="showSceneDialog" :scene-name="sceneName" :selected-scene="selectedScene"
      :saved-scenes="savedScenes" @update:scene-name="val => sceneName = val"
      @update:selected-scene="val => selectedScene = val" @save="handleSaveScene" @load="handleLoadScene"
      @delete="handleDeleteScene" />

    <StatusInjectionDialog v-model="showStatusDialog" :selected-char-name="getSelectedCharName"
      :injectable-statuses="injectableStatuses" @update:injectable-statuses="val => updateStatuses(val)"
      @add="handleAddStatus" @clear="handleClearStatuses" />

    <!-- 底部控制栏 -->
    <ControlBar :is-battle-active="battleStore.getIsBattleActive" :is-paused="false" :is-auto-playing="battleStore.autoPlayMode"
      @start-battle="startBattle" @end-battle="endBattle" @reset-battle="resetBattle" @step-back="stepBack"
      @single-step="singleStep" @toggle-auto-play="toggleAutoPlay"
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
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { GameDataProcessor } from "@/utils/GameDataProcessor";
import ParticipantPanel from "./ParticipantPanel.vue";
import BattleField from "./BattleField.vue";
import DebugPanel from "./DebugPanel.vue";
import ControlBar from "./ControlBar.vue";
import BattleReplay from "./BattleReplay.vue";
import Notification from "@/components/Notification.vue";
import BattleRulesDialog from "./components/BattleRulesDialog.vue";
import SceneManagementDialog from "./components/SceneManagementDialog.vue";
import StatusInjectionDialog from "./components/StatusInjectionDialog.vue";
import { battleLogManager } from '@/utils/logging';
import { useCharacterStore, useBattleStore } from '@/stores';
import { container, initializeContainer } from '@/core/di/Container';
import type { UIBattleCharacter } from "@/types";
import { PARTICIPANT_SIDE } from "@/types/battle";
import type { InjectableStatus } from "./components/StatusInjectionDialog.vue";

// 通知组件引用
const notification = ref<InstanceType<typeof Notification> | null>(null);

// 使用Pinia状态管理
const characterStore = useCharacterStore();
const battleStore = useBattleStore();

const selectedScene = ref("");
const sceneName = ref("");
const showRulesDialog = ref(false);
const showSceneDialog = ref(false);
const showStatusDialog = ref(false);
const battleFieldRef = ref<InstanceType<typeof BattleField> | null>(null);
const savedScenes = ref<string[]>([]);
const injectableStatuses = ref<InjectableStatus[]>([]);

// 计算属性
const getSelectedCharName = computed(() => {
  return characterStore.selectedCharName;
});

// 使用统一的日志管理器单例
const logManager = battleLogManager;

// 初始化战斗
function initBattle() {
  // 完成 敌我ParticipantInfo的初始化
  const allyIds = ["boss_005", "boss_008"];
  const allyList = GameDataProcessor.findEnemiesByIds(allyIds);
  const enemyIds = ["boss_006", "boss_007"];
  const enemyList = GameDataProcessor.findEnemiesByIds(enemyIds);
  
  const allyTeamData = allyList.map((ally, index) => GameDataProcessor.enemyToBattleCharacter(ally, index));
  const enemyTeamData = enemyList.map((enemy, index) => GameDataProcessor.enemyToBattleCharacter(enemy, index, true));
  // 使用Pinia store初始化队伍数据
  characterStore.initializeTeams(allyTeamData, enemyTeamData);
}

// 初始化战斗系统和快捷键
onMounted(() => {
  // 初始化队伍数据
  initBattle();
  
  // 初始化战斗管理器
  // 确保容器已初始化
  initializeContainer();
  const battleManager = container.resolve('BattleManager');
  battleStore.initializeBattleManager(battleManager);
  
  // 初始化队伍到战斗管理器
  const allyTeam = characterStore.allyTeam;
  const enemyTeam = characterStore.enemyTeam;
  if (allyTeam.size > 0 && enemyTeam.size > 0) {
    battleManager.initializeTeams(Array.from(allyTeam.values()), Array.from(enemyTeam.values()));
  }
  
  logManager.addSystemLog("测试工具已加载");
  logManager.addSystemLog(`战斗管理器初始化完成，队伍数据: 我方${allyTeam.size}人 | 敌方${enemyTeam.size}人`);
});

// 监听战斗日志变化
watch(
  () => battleStore.getBattleLogs,
  (newLogs) => {
    if (newLogs.length > 0) {
      const lastLog = newLogs[newLogs.length - 1];
      logManager.addLog(
        lastLog.turn,
        lastLog.source,
        lastLog.action,
        lastLog.target,
        lastLog.result || '',
        lastLog.level,
        lastLog.htmlResult
      );
    }
  },
  { deep: true }
);

// 监听动画状态变化
watch(
  () => battleStore.getAnimationState,
  (newAnimationState) => {
    if (battleFieldRef.value) {
      // 处理伤害动画
      if (newAnimationState.damage) {
        const { targetId, damage, isHeal, isCritical } = newAnimationState.damage;
        battleFieldRef.value.showDamage(
          targetId,
          damage,
          isHeal ? 'heal' : 'damage',
          isCritical
        );
      }

      // 处理闪避动画
      if (newAnimationState.miss) {
        const { targetId } = newAnimationState.miss;
        battleFieldRef.value.showMiss(targetId);
      }

      // 处理Buff效果动画
      if (newAnimationState.buff) {
        const { targetId, buffName, isPositive } = newAnimationState.buff;
        battleFieldRef.value.showBuffEffect(targetId, buffName, isPositive);
      }

      // 处理技能效果动画
      if (newAnimationState.skill) {
        const { targetId, effectType, skillName } = newAnimationState.skill;
        battleFieldRef.value.showSkillEffect(
          targetId,
          effectType as 'attack' | 'heal' | 'buff' | 'debuff' | 'ultimate',
          skillName
        );
      }
    }
  },
  { deep: true }
);

// 监听战斗活跃状态变化
watch(
  () => battleStore.getIsBattleActive,
  (isActive) => {
    if (!isActive) {
      // 清理所有角色的动画状态
      characterStore.resetCharacterStates();
      
      // 清理BattleField中的动画效果
      if (battleFieldRef.value) {
        battleFieldRef.value.cleanupAnimations();
      }
    }
  }
);

// 子组件事件处理方法
const exportState = () => {
  const result = battleStore.exportState(
    Array.from(characterStore.allyTeam.values()),
    Array.from(characterStore.enemyTeam.values()),
    characterStore.currentTurn
  );
  
  if (result) {
    logManager.addSystemLog("战斗状态已导出");
  }
  
  return result;
};

// 战斗规则组件事件处理
const updateSpeed = (speed: number) => {
  battleStore.setBattleSpeed(speed);
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
  const targetIndex = injectableStatuses.value.findIndex(s => s.id === characterStore.selectedCharacterId);
  if (targetIndex !== -1) {
    injectableStatuses.value.splice(targetIndex, 1, ...newStatuses);
  }
};

const handleAddStatus = () => {
  if (characterStore.selectedChar) {
    const selectedChar = characterStore.selectedChar;
    const activeStatuses = injectableStatuses.value.filter(s => s.active);
    activeStatuses.forEach(status => {
      selectedChar.buffs.push({
        id: `status_${Date.now()}_${status.id}`,
        name: status.name,
        duration: status.duration,
        maxStacks: 1,
        cooldown: 0,
        description: status.effect,
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
  if (characterStore.selectedChar) {
    characterStore.selectedChar.buffs = [];
    logManager.addActionLog("系统", "清除状态", characterStore.selectedChar.name, "所有状态已清除");
  }
};

// 监听队伍成员数量变化
watch(
  () => [characterStore.allyTeam.size, characterStore.enemyTeam.size],
  ([allyCount, enemyCount]) => {
    logManager.addSystemLog(`当前参战角色: ${allyCount}人/${enemyCount}人`);
  }
);

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
  // 使用battleManager开始回放
  if (battleStore.getBattleManager) {
    battleStore.getBattleManager.startReplay(recording);
  }
};

const handleReplayEnd = (recording: any) => {
  console.log('回放结束:', recording);
  // 回放结束后的处理
  if (battleStore.getBattleManager) {
    battleStore.getBattleManager.stopReplay();
  }
};

const handleReplayPause = (recording: any, index: number) => {
  console.log('回放暂停:', recording, '当前索引:', index);
  // 回放暂停后的处理
  if (battleStore.getBattleManager) {
    battleStore.getBattleManager.pauseReplay();
  }
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

const stepBack = () => {
  if (characterStore.currentTurn > 1) {
    characterStore.decrementTurn();
  }
};

// 开始战斗
const startBattle = async () => {
  // 获取启用的角色和敌人的详细信息
  const enabledAllyTeam = Array.from(characterStore.allyTeam.values()).filter((c) => c.enabled);
  const enabledEnemyTeam = Array.from(characterStore.enemyTeam.values()).filter((e) => e.enabled);

  if (enabledAllyTeam.length === 0) {
    notification.value?.addNotification("提示", "我方请至少选择一个角色参战", "warning");
    return;
  }
  if (enabledEnemyTeam.length === 0) {
    notification.value?.addNotification("提示", "敌方请至少选择一个角色参战", "warning");
    return;
  }

  try {
    const result = await battleStore.startBattle(Array.from(characterStore.allyTeam.values()), Array.from(characterStore.enemyTeam.values()));
    
    if (result) {
      notification.value?.addNotification("成功", "战斗已开始", "success");
    } else {
      notification.value?.addNotification("错误", battleStore.getErrorMessage || "开始战斗失败", "error");
    }
  } catch (error) {
    console.error("开始战斗时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logManager.addErrorLog(`开始战斗时出错: ${errorMsg}`);
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

const endBattle = async () => {
  try {
    const result = await battleStore.endBattle(PARTICIPANT_SIDE.ALLY);
    
    if (result) {
      notification.value?.addNotification("成功", "战斗已结束", "success");
    } else {
      notification.value?.addNotification("错误", battleStore.getErrorMessage || "结束战斗失败", "error");
    }
  } catch (error) {
    console.error("结束战斗时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logManager.addErrorLog(`结束战斗时出错: ${errorMsg}`);
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

// 重置战斗
const resetBattle = async () => {
  try {
    const result = await battleStore.resetBattle();
    
    if (result) {
      notification.value?.addNotification("成功", "战斗已重置", "success");
    } else {
      notification.value?.addNotification("错误", battleStore.getErrorMessage || "重置战斗失败", "error");
    }
  } catch (error) {
    console.error("重置战斗时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logManager.addErrorLog(`重置战斗时出错: ${errorMsg}`);
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

// 执行单个回合
const singleStep = async () => {
  try {
    const result = await battleStore.processSingleTurn();
    
    if (!result) {
      notification.value?.addNotification("错误", battleStore.getErrorMessage || "执行回合失败", "error");
    }
  } catch (error) {
    console.error("执行回合时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logManager.addErrorLog(`执行回合时出错: ${errorMsg}`);
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

// 切换自动战斗状态
const toggleAutoPlay = async () => {
  try {
    const result = await battleStore.toggleAutoPlay();
    
    if (result) {
      notification.value?.addNotification("成功", battleStore.autoPlayMode ? "已开始自动战斗" : "已停止自动战斗", "success");
    } else {
      notification.value?.addNotification("错误", battleStore.getErrorMessage || "切换自动战斗状态失败", "error");
    }
  } catch (error) {
    console.error("切换自动战斗状态失败:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    logManager.addErrorLog(`切换自动战斗状态失败: ${errorMsg}`);
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

// 处理战斗速度变化
const handleBattleSpeedChange = (speed: number) => {
  battleStore.setBattleSpeed(speed);
};

// 选择角色
const selectCharacter = (characterId: string) => {
  characterStore.selectCharacter(characterId);
};

onUnmounted(() => {
  // 组件卸载时的清理工作
  // 清理战斗管理器事件监听器，防止内存泄漏
  battleStore.destroy();
});
</script>

<style lang="scss">
@use '@/styles/main.scss';

// 加载指示器样式
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;

  .loading-spinner {
    width: 60px;
    height: 60px;
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: #22d3ee;
    animation: spin 1s ease-in-out infinite;
    margin-bottom: 20px;
  }

  .loading-text {
    color: white;
    font-size: 18px;
    font-weight: 500;
    margin-bottom: 20px;
  }

  .loading-progress {
    width: 300px;
    margin-top: 20px;

    .progress-bar {
      width: 100%;
      height: 8px;
      background-color: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 8px;

      .progress-fill {
        height: 100%;
        background-color: #22d3ee;
        border-radius: 4px;
        transition: width 0.3s ease;
      }
    }

    .progress-text {
      color: white;
      font-size: 14px;
      text-align: center;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
}

// 错误提示样式
.error-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  background-color: rgba(249, 115, 22, 0.9);
  color: white;
  padding: 12px 20px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 999;
  cursor: pointer;
  transition: all 0.3s ease;
  backdrop-filter: blur(2px);

  &:hover {
    background-color: rgba(249, 115, 22, 1);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  .error-message {
    flex: 1;
    margin-right: 12px;
    font-size: 14px;
    line-height: 1.4;
  }

  .error-close {
    font-size: 20px;
    font-weight: bold;
    cursor: pointer;
    padding: 0 4px;

    &:hover {
      opacity: 0.8;
    }
  }
}
</style>