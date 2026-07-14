<template>
  <div class="battle-test-tool">
    <!-- 加载指示器 -->
    <div v-if="battleStore.loading.isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <div class="loading-text">{{ battleStore.loading.operation || '加载中...' }}</div>
      <div v-if="battleStore.loading.progress !== null" class="loading-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: battleStore.loading.progress + '%' }"></div>
        </div>
        <div class="progress-text">{{ battleStore.loading.progress }}%</div>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="battleStore.error.hasError" class="error-toast" @click="battleStore.clearError()">
      <span class="error-message">{{ battleStore.error.message }}</span>
      <span class="error-close">&times;</span>
    </div>

    <div class="tool-header">
      <h1>回合制战斗系统测试工具 v1.0</h1>
      <div class="header-actions">
        <button class="header-btn" @click="showDataSnapshotDialog = true">数据快照</button>
        <button class="header-btn" @click="showRecordingDialog = true">战斗记录</button>
        <button class="header-btn" @click="showDebugLogDialog = true">调试日志</button>
        <button class="header-btn" @click="showDebugControlDialog = true">调试面板</button>
        <button class="header-btn" @click="showCompendiumDialog = true">图鉴</button>
        <button class="header-btn" @click="showRulesDialog = true">战斗规则</button>
        <button class="header-btn" @click="showSceneDialog = true">场景管理</button>
        <button class="header-btn" @click="showStatusDialog = true">初始状态注入</button>
      </div>
    </div>

    <div class="main-layout">
      <!-- 左侧：参战角色配置 -->
      <ParticipantPanel />

      <!-- 中间：战斗战场和日志 -->
      <BattleField ref="battleFieldRef" :current-actor-id="battleStore.currentActorId"
        @select-character="selectCharacter" />

      <!-- 右侧：调试面板 -->
      <div class="right-panel">
        <BattleDashboard />
      </div>
    </div>

    <!-- 对话框组件 -->
    <BattleRulesDialog v-model="showRulesDialog" :rules="battleStore.rules" :speed="battleStore.battleSpeed"
      @update:rules="battleStore.updateRules" @update:speed="updateSpeed" @rule-change="handleRuleChange" />

    <SceneManagementDialog v-model="showSceneDialog" :scene-name="sceneName" :selected-scene="selectedScene"
      :saved-scenes="savedScenes" @update:scene-name="val => sceneName = val"
      @update:selected-scene="val => selectedScene = val" @save="handleSaveScene" @load="handleLoadScene"
      @delete="handleDeleteScene" />

    <StatusInjectionDialog v-model="showStatusDialog" :selected-char-name="getSelectedCharName"
      :injectable-statuses="injectableStatuses" @update:injectable-statuses="val => updateStatuses(val)"
      @add="handleAddStatus" @clear="handleClearStatuses" />

    <CompendiumDialog v-model="showCompendiumDialog" />

    <DataSnapshotDialog v-model="showDataSnapshotDialog" />

    <BattleRecordingDialog v-model="showRecordingDialog" />

    <DebugLogDialog v-model="showDebugLogDialog" :logs="debugLogs" @clear="clearDebugLogs" />

    <DebugControlDialog v-model="showDebugControlDialog" @action="handleDebugAction" />

    <!-- 底部控制栏 -->
    <ControlBar :is-battle-active="battleStore.isBattleActive" :is-paused="battleStore.isPaused"
      :is-auto-playing="battleStore.autoPlayMode" :battle-speed="battleStore.battleSpeed" @start-battle="startBattle"
      @end-battle="endBattle" @reset-battle="resetBattle" @step-back="stepBack" @single-step="singleStep"
      @toggle-auto-play="toggleAutoPlay" @battle-speed-change="handleBattleSpeedChange"
      @toggle-pause="handleTogglePause" />

    <!-- 快捷键提示面板 -->
    <!-- <KeybindHintPanel ref="keybindHintPanelRef" /> -->

    <!-- 调试模式浮动面板 -->
    <DebugStepOverlay />

    <!-- 通知组件 -->
    <Notification ref="notification" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, shallowReactive } from "vue";
import { GameDataProcessor } from "@/shared/utils/GameDataProcessor";
import ParticipantPanel from "./ParticipantPanel.vue";
import BattleField from "./BattleField.vue";
import BattleDashboard from "./BattleDashboard.vue";
import ControlBar from "./ControlBar.vue";
import Notification from "@/presentation/components/Notification.vue";
import BattleRulesDialog from "./components/BattleRulesDialog.vue";
import SceneManagementDialog from "./components/SceneManagementDialog.vue";
import StatusInjectionDialog from "./components/StatusInjectionDialog.vue";
import CompendiumDialog from "@/presentation/components/CompendiumDialog.vue";
import DebugLogDialog from "./components/DebugLogDialog.vue";
import DebugControlDialog from "./components/DebugControlDialog.vue";
import DebugStepOverlay from "./components/DebugStepOverlay.vue";
import DataSnapshotDialog from "./components/DataSnapshotDialog.vue";
import BattleRecordingDialog from "./components/BattleRecordingDialog.vue";
import { useBattleStore } from '@/presentation/stores';
import { container } from '@/infrastructure/di/Container';
import { battleLogManager } from '@/infrastructure/adapters/logging/BattleLogManager';
import { PARTICIPANT_SIDE } from "@/domain/battle/type/types.ts";
import type { InjectableStatus } from "./components/StatusInjectionDialog.vue";
import type { BattleService } from '@/application/facade/BattleFacade';
import type { LogEntry } from '@/shared/types/battle-log';
import { EffectType } from '@/shared/types/effect';
import { DamageCategory } from '@/domain/skill/types';
import { BuffSystem } from '@/domain/buff/BuffSystem'
import { PassiveSkillManager } from '@/domain/skill/PassiveSkillManager'
// 通知组件引用
const notification = ref<InstanceType<typeof Notification> | null>(null);

// 使用Pinia状态管理
const battleStore = useBattleStore();

// BattleService 响应式实例
const battleService = shallowReactive(container.resolve<BattleService>('BattleService'));

const selectedScene = ref("");
const sceneName = ref("");
const showRulesDialog = ref(false);
const showSceneDialog = ref(false);
const showStatusDialog = ref(false);
const showCompendiumDialog = ref(false);
const showDataSnapshotDialog = ref(false);
const showDebugLogDialog = ref(false);
const showDebugControlDialog = ref(false);
const showRecordingDialog = ref(false);

// ponytail: 调试面板现在独立监听事件总线，无需 BattleArena 维护 phase 状态

const debugLogs = ref<LogEntry[]>([]);

const clearDebugLogs = () => {
  debugLogs.value = [];
  battleLogManager.clearDebugLogs();
};

const handleDebugAction = (action: string) => {
  console.log('Debug action:', action)
  switch (action) {
    case 'win_battle':
      battleLogManager.addSystemLog({
        message: '调试: 立即胜利',
      })
      break
    case 'lose_battle':
      battleLogManager.addSystemLog({
        message: '调试: 立即失败',
      })
      break
    case 'skip_turn':
      battleLogManager.addSystemLog({
        message: '调试: 跳过回合',
      })
      break
    case 'end_battle':
      battleLogManager.addSystemLog({
        message: '调试: 强制结束战斗',
      })
      break
    case 'full_health':
      battleLogManager.addSystemLog({
        message: '调试: 满血',
      })
      break
    case 'full_energy':
      battleLogManager.addSystemLog({
        message: '调试: 满能量',
      })
      break
    case 'kill_selected':
      battleLogManager.addSystemLog({
        message: '调试: 杀死选中',
      })
      break
    case 'max_skill_cd':
      battleLogManager.addSystemLog({
        message: '调试: 满技能CD',
      })
      break
    case 'force_crit':
      battleLogManager.addSystemLog({
        message: '调试: 触发暴击',
      })
      break
    case 'force_dodge':
      battleLogManager.addSystemLog({
        message: '调试: 触发闪避',
      })
      break
    case 'force_block':
      battleLogManager.addSystemLog({
        message: '调试: 触发格挡',
      })
      break
    case 'add_buff':
      battleLogManager.addSystemLog({
        message: '调试: 添加Buff',
      })
      break
    case 'dump_logs':
      console.log('Current logs:', battleLogManager.getAllLogs())
      battleLogManager.addSystemLog({
        message: ' 日志已输出到控制台',
      })
      break
    case 'export_state':
      battleLogManager.addSystemLog({
        message: '调试: 导出状态',
      })
      break
    case 'import_state':
      battleLogManager.addSystemLog({
        message: '调试: 导入状态',
      })
      break
    case 'reset_battle':
      battleLogManager.addSystemLog({
        message: '调试: 重置战斗',
      })
      break
    case 'log_battle':
      battleLogManager.addTurnStartLog(1)
      break
    case 'log_system':
      battleLogManager.addSystemLog({
        message: '测试系统日志',
      })
      break
    case 'log_item':
      battleLogManager.addGainItemLog([])
      break
    case 'log_action':
      battleLogManager.addActionLog({ source: '调试角色', action: '普通攻击', message: '测试行为日志' })
      break
    case 'log_debug':
      battleLogManager.addDebugLog('测试调试日志')
      break

    // ========== 动画调试 ==========
    case 'test_damage_num': {
      const tId = battleStore.selectedCharacterId || battleStore.enemyTeam[0]?.id || battleStore.allyTeam[0]?.id
      if (tId) {
        battleStore.setAnimationState(EffectType.DAMAGE, { targetId: tId, damage: 999, damageCategory: DamageCategory.PHYSICAL, isCritical: false, isHeal: false })
        battleLogManager.addSystemLog({ message: `调试: 在 [${tId}] 上测试伤害数字 999` })
      } else {
        battleLogManager.addSystemLog({ message: '调试: 没有可用的角色' })
      }
      break
    }
    case 'test_crit_num': {
      const tId = battleStore.selectedCharacterId || battleStore.enemyTeam[0]?.id || battleStore.allyTeam[0]?.id
      if (tId) {
        battleStore.setAnimationState(EffectType.DAMAGE, { targetId: tId, damage: 1999, damageCategory: DamageCategory.PHYSICAL, isCritical: true, isHeal: false })
        battleLogManager.addSystemLog({ message: `调试: 在 [${tId}] 上测试暴击数字 1999` })
      } else {
        battleLogManager.addSystemLog({ message: '调试: 没有可用的角色' })
      }
      break
    }
    case 'test_heal_num': {
      const tId = battleStore.selectedCharacterId || battleStore.allyTeam[0]?.id || battleStore.enemyTeam[0]?.id
      if (tId) {
        battleStore.setAnimationState(EffectType.DAMAGE, { targetId: tId, damage: 500, damageCategory: 'heal', isCritical: false, isHeal: true })
        battleLogManager.addSystemLog({ message: `调试: 在 [${tId}] 上测试治疗数字 500` })
      } else {
        battleLogManager.addSystemLog({ message: '调试: 没有可用的角色' })
      }
      break
    }
    case 'test_skill_fly': {
      const source = battleStore.allyTeam[0]
      const target = battleStore.enemyTeam[0]
      if (source && target) {
        battleStore.setAnimationState('skill', { sourceId: source.id, targetId: target.id, skillName: '测试技能·裂空斩', effectType: 'attack', damageCategory: DamageCategory.PHYSICAL })
        battleLogManager.addSystemLog({ message: `调试: 测试技能飞行 [${source.name}] → [${target.name}]` })
      } else {
        battleLogManager.addSystemLog({ message: '调试: 没有足够的角色' })
      }
      break
    }
    case 'clear_animations':
      battleFieldRef.value?.cleanupAnimations()
      battleStore.setAnimationState(EffectType.DAMAGE, null)
      battleStore.setAnimationState(EffectType.MISS, null)
      battleStore.setAnimationState(EffectType.BUFF, null)
      battleStore.setAnimationState('skill', null)
      battleLogManager.addSystemLog({ message: '调试: 清除所有动画效果' })
      break
    case 'dump_animation':
      console.log('[动画调试] animationState:', JSON.parse(JSON.stringify(battleStore.animationState)))
      console.log('[动画调试] battleSpeed:', battleStore.battleSpeed)
      console.log('[动画调试] getAnimationDuration:', battleStore.getAnimationDuration())
      console.log('[动画调试] isBattleActive:', battleStore.isBattleActive)
      battleLogManager.addSystemLog({ message: '动画状态已输出到控制台' })
      break
  }
};

const battleFieldRef = ref<InstanceType<typeof BattleField> | null>(null);
const savedScenes = ref<string[]>([]);
const injectableStatuses = ref<InjectableStatus[]>([]);

// 计算属性
const getSelectedCharName = computed(() => {
  const selectedChar = battleService.getSelectedCharacter()
  return selectedChar?.name || "未选择"
});

const selectedCharacterId = computed(() => {
  return battleService.getSelectedCharacterId() || null
});

const selectedCharacter = computed(() => {
  return battleService.getSelectedCharacter()
});

const currentTurn = computed(() => {
  return battleService.getCurrentTurn() || 1
});

const allyTeam = computed(() => {
  return battleService.getAllyTeam() || []
});

const enemyTeam = computed(() => {
  return battleService.getEnemyTeam() || []
});

const teamCounts = computed(() => {
  return battleService.getTeamCounts() || { ally: 0, enemy: 0 }
});



// 初始化战斗
function initBattle() {
  // ponytail: 默认测试阵容 — 覆盖伤害/治疗/护盾/buff/debuff 的典型组合
  const allyIds = ["guardian_fire", "guardian_gold"]; // "enemy_005", "boss_003", "boss_001", "enemy_004", 
  const allyList = GameDataProcessor.findEnemiesByIds(allyIds);
  const enemyIds = ["guardian_fire", "guardian_gold"]; // "enemy_008", "boss_002", "enemy_007", "enemy_003", 
  const enemyList = GameDataProcessor.findEnemiesByIds(enemyIds);
  console.log('allyList', allyList)
  console.log('enemyList', enemyList)

  const allyTeamData = allyList.map((ally, index) => GameDataProcessor.enemyToParticipant(ally, PARTICIPANT_SIDE.ALLY));
  const enemyTeamData = enemyList.map((enemy, index) => GameDataProcessor.enemyToParticipant(enemy, PARTICIPANT_SIDE.ENEMY));
  console.log('allyTeamData', allyTeamData)
  console.log('enemyTeamData', enemyTeamData)
  // 使用BattleService初始化队伍数据
  battleService.initializeTeams(allyTeamData, enemyTeamData);

  // ponytail: 将实体的免疫标签注册到 BuffSystem
  const buffSystem = container.resolve<BuffSystem>('BuffSystem');
  const allParticipants = [
    ...battleService.getAllyTeam(),
    ...battleService.getEnemyTeam(),
  ];
  for (const entity of allParticipants) {
    if (entity && typeof entity.getImmunities === 'function') {
      const tags: string[] = entity.getImmunities();
      if (tags.length > 0) {
        buffSystem.registerCharacterImmunities(entity.id, tags);
      }
    }
  }

  // ponytail: 将触发型被动技能注册到 PassiveSkillManager
  const passiveSkillManager = container.resolve<PassiveSkillManager>('PassiveSkillManager');
  for (const entity of allParticipants) {
    GameDataProcessor.registerParticipantPassives(entity, passiveSkillManager);
  }

  // ponytail: 默认选中第一个友方，避免面板显示 0/0
  const firstAlly = battleService.getAllyTeam()[0];
  if (firstAlly) {
    battleStore.selectCharacter(firstAlly.id);
  }
}

// 初始化战斗系统和快捷键
onMounted(() => {
  // 初始化战斗管理器
  battleStore.initializeBattleService(battleService);
  battleService.loadSkillConfigs();
  // 初始化队伍数据
  initBattle();
  // 监听 battleLogManager 的调试日志 — 通过 addListener 订阅而非 setInterval 轮询
  debugLogListener = () => {
    debugLogs.value = battleLogManager.getDebugLogs();
  };
  battleLogManager.addListener(debugLogListener);
  debugLogs.value = battleLogManager.getDebugLogs();
});

// 监听战斗活跃状态变化
watch(
  () => battleStore.getIsBattleActive,
  (isActive) => {
    if (!isActive) {
      // 清理所有角色的动画状态
      battleService.resetCharacterStates();

      // 清理BattleField中的动画效果
      if (battleFieldRef.value) {
        battleFieldRef.value.cleanupAnimations();
      }
    }
  }
);

// 子组件事件处理方法
const exportState = () => {
  const result = battleStore.exportState(currentTurn.value);

  if (result) {
    battleLogManager.addSystemLog({
      message: '战斗状态已导出',
    });
  }

  return result;
};

// 战斗规则组件事件处理
const updateSpeed = (speed: number) => {
  battleStore.setBattleSpeed(speed);
};

const handleRuleChange = (key: string, value: boolean) => {
  battleLogManager.addSystemLog({
    message: `战斗规则已更新: ${key} = ${value}`,
  });
};

// 场景管理组件事件处理
const handleSaveScene = (sceneNameValue: string) => {
  savedScenes.value.push(sceneNameValue);
  battleLogManager.addSystemLog({
    message: `保存场景: ${sceneNameValue}`,
  });
};

const handleLoadScene = (sceneNameValue: string) => {
  battleLogManager.addSystemLog({
    message: `加载场景: ${sceneNameValue}`,
  });
};

const handleDeleteScene = (sceneNameValue: string) => {
  const index = savedScenes.value.indexOf(sceneNameValue);
  if (index > -1) {
    savedScenes.value.splice(index, 1);
    battleLogManager.addSystemLog({
      message: `删除场景: ${sceneNameValue}`,
    });
  }
};

// 状态注入组件事件处理
const updateStatuses = (newStatuses: any[]) => {
  const targetIndex = injectableStatuses.value.findIndex(s => s.id === selectedCharacterId.value);
  if (targetIndex !== -1) {
    injectableStatuses.value.splice(targetIndex, 1, ...newStatuses);
  }
};

const handleAddStatus = () => {
  const selectedChar = selectedCharacter.value;
  if (selectedChar) {
    const activeStatuses = injectableStatuses.value.filter(s => s.active);
    // ponytail: 实体不再存储 buffs，状态注入需通过 BuffSystem 重新实现（待 Step 2）
    if (activeStatuses.length > 0) {
      battleLogManager.addActionLog({
        source: "系统",
        action: "添加状态",
        target: selectedChar.name,
        message: `${activeStatuses.map(s => s.name).join(', ')} (${activeStatuses.length}个状态)`
      });
    }
  }
};

const handleClearStatuses = () => {
  const selectedChar = selectedCharacter.value;
  if (selectedChar) {
    // ponytail: 实体不再存储 buffs，清除状态需通过 BuffSystem 重新实现（待 Step 2）
    battleLogManager.addActionLog({ source: "系统", action: "清除状态", target: selectedChar.name, message: "所有状态已清除" });
  }
};

// 监听队伍成员数量变化
watch(
  () => teamCounts.value,
  ({ ally, enemy }) => {
    battleLogManager.addSystemLog({
      message: `当前参战角色: ${ally}人/${enemy}人`,
    });
  },
  { deep: true }
);

// 战斗回放相关方法
const stepBack = () => {
  if (currentTurn.value > 1) {
    battleService.decrementTurn();
  }
};

// 开始战斗
const startBattle = async () => {
  // 获取启用的角色和敌人的详细信息
  const enabledAllyTeam = allyTeam.value.filter((c) => c.enabled);
  const enabledEnemyTeam = enemyTeam.value.filter((e) => e.enabled);

  if (enabledAllyTeam.length === 0) {
    notification.value?.addNotification("提示", "敌我双方各至少选择一个角色参战", "warning");
    return;
  }
  if (enabledEnemyTeam.length === 0) {
    notification.value?.addNotification("提示", "敌我双方各至少选择一个角色参战", "warning");
    return;
  }

  try {
    const result = await battleStore.startBattle();

    if (result) {
      // ponytail: 开始战斗后同步预设的战斗速度
      battleStore.setBattleSpeed(battleStore.battleSpeed)
      notification.value?.addNotification("成功", "战斗已开始", "success");
    } else {
      notification.value?.addNotification("错误", "开始战斗失败", "error");
    }
  } catch (error) {
    console.error("开始战斗时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addSystemLog({
      message: `开始战斗时出错: ${errorMsg}`,
    });
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

const endBattle = async () => {
  try {
    const result = await battleStore.endBattle(PARTICIPANT_SIDE.ALLY);

    if (result) {
      notification.value?.addNotification("成功", "战斗已结束", "success");
    } else {
      notification.value?.addNotification("错误", battleStore.error.message || "结束战斗失败", "error");
    }
  } catch (error) {
    console.error("结束战斗时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addSystemLog({
      message: `结束战斗时出错: ${errorMsg}`,
    });
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
      notification.value?.addNotification("错误", battleStore.error.message || "重置战斗失败", "error");
    }
  } catch (error) {
    console.error("重置战斗时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addSystemLog({
      message: `重置战斗时出错: ${errorMsg}`,
    });
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

// 执行单个回合
const singleStep = async () => {
  try {
    const result = await battleStore.processSingleTurn();

    if (!result) {
      notification.value?.addNotification("错误", battleStore.error.message || "执行回合失败", "error");
    }
  } catch (error) {
    console.error("执行回合时出错:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addSystemLog({
      message: `执行回合时出错: ${errorMsg}`,
    });
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
      notification.value?.addNotification("错误", battleStore.error.message || "切换自动战斗状态失败", "error");
    }
  } catch (error) {
    console.error("切换自动战斗状态失败:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    battleLogManager.addSystemLog({
      message: `切换自动战斗状态失败: ${errorMsg}`,
    });
    notification.value?.addNotification("错误", errorMsg, "error");
  }
};

// 处理战斗速度变化
const handleBattleSpeedChange = (speed: number) => {
  battleStore.setBattleSpeed(speed);
};

// 处理暂停切换
const handleTogglePause = () => {
  battleStore.togglePause();
};

// 选择角色
const selectCharacter = (characterId: string) => {
  battleStore.selectCharacter(characterId);
};

let debugLogListener: (() => void) | null = null

onUnmounted(() => {
  // 组件卸载时的清理工作
  // 清理战斗管理器事件监听器，防止内存泄漏
  battleStore.destroy();
  if (debugLogListener) {
    battleLogManager.removeListener(debugLogListener);
    debugLogListener = null;
  }
});
</script>

<style lang="scss">
@use '@/presentation/styles/main.scss';

// 加载指示器样式
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--color-overlay);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;

  .loading-spinner {
    width: 60px;
    height: 60px;
    /* ponytail: rgba(255,255,255,.3) unique to spinner border */
    border: 4px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    border-top-color: var(--color-energy);
    animation: spin 1s ease-in-out infinite;
    margin-bottom: var(--space-5);
  }

  .loading-text {
    color: var(--color-text-primary);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--space-5);
  }

  .loading-progress {
    width: 300px;
    margin-top: var(--space-5);

    .progress-bar {
      width: 100%;
      height: 8px;
      background-color: rgba(255, 255, 255, 0.2);
      border-radius: var(--radius-sm);
      overflow: hidden;
      margin-bottom: var(--space-2);

      .progress-fill {
        height: 100%;
        background-color: var(--color-energy);
        border-radius: var(--radius-sm);
        transition: width 0.3s ease;
      }
    }

    .progress-text {
      color: var(--color-text-primary);
      font-size: var(--font-size-md);
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
  color: var(--color-text-primary);
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 999;
  cursor: pointer;
  transition: var(--transition-base);
  backdrop-filter: blur(2px);

  &:hover {
    background-color: rgba(249, 115, 22, 1);
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  .error-message {
    flex: 1;
    margin-right: var(--space-3);
    font-size: var(--font-size-md);
    line-height: var(--line-height-sm);
  }

  .error-close {
    font-size: var(--font-size-xxl);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    padding: 0 var(--space-1);

    &:hover {
      opacity: 0.8;
    }
  }
}
</style>