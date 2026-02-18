import { ref, computed } from 'vue';
import { container, initializeContainer } from '@/core/di/Container';
import { useCharacterStore, useBattleStore } from '@/stores';
import type { UIBattleCharacter } from '@/types';
import { PARTICIPANT_SIDE } from '@/types/battle';
import { battleLogManager } from '@/utils/logging';

/**
 * 战斗操作组合式函数
 * 封装战斗相关的操作，提供给组件使用
 */
export function useBattle() {
  const characterStore = useCharacterStore();
  const battleStore = useBattleStore();
  // 确保容器已初始化
  initializeContainer();
  const battleManager = container.resolve('BattleManager');
  const logManager = battleLogManager;

  // 当前战斗ID
  const currentBattleId = ref<string | null>(null);
  // 加载状态 - 使用store中的状态
  const isLoading = computed(() => battleStore.isLoading);
  // 错误信息 - 使用store中的状态
  const errorMessage = computed(() => battleStore.errorMessage);

  /**
   * 初始化战斗
   * @param allyTeam 我方队伍
   * @param enemyTeam 敌方队伍
   */
  const initializeBattle = (allyTeam: UIBattleCharacter[], enemyTeam: UIBattleCharacter[]) => {
    // 使用BattleManager初始化战斗
    const battleState = battleManager.initializeTeams(allyTeam, enemyTeam);
    currentBattleId.value = battleState.battleId;
    characterStore.setBattleState({ battleId: battleState.battleId });
    return battleState;
  };

  /**
   * 开始战斗
   */
  const startBattle = async () => {
    const result = await battleStore.startBattle(
      battleManager,
      characterStore.allyTeam,
      characterStore.enemyTeam
    );
    
    if (result) {
      characterStore.setBattleState({ 
        isBattleActive: true, 
        isAutoPlaying: true 
      });
    }
    
    return result;
  };

  /**
   * 结束战斗
   * @param winner 获胜方
   */
  const endBattle = async (winner: string = PARTICIPANT_SIDE.ALLY) => {
    const result = await battleStore.endBattle(battleManager, winner);
    
    if (result) {
      // 重置战斗状态
      currentBattleId.value = null;
      characterStore.setBattleState({ 
        isPaused: true, 
        isAutoPlaying: false, 
        isBattleActive: false, 
        battleId: null 
      });
    }
    
    return result;
  };

  /**
   * 重置战斗
   */
  const resetBattle = async () => {
    const result = await battleStore.resetBattle(battleManager);
    
    if (result) {
      // 重置战斗状态
      currentBattleId.value = null;
      characterStore.resetBattle();
    }
    
    return result;
  };

  /**
   * 执行单个回合
   */
  const executeSingleTurn = async () => {
    if (!currentBattleId.value) {
      battleStore.setErrorMessage("请先开始战斗");
      return false;
    }

    const result = await battleStore.processSingleTurn(battleManager);
    return result;
  };

  /**
   * 切换自动播放状态
   */
  const toggleAutoPlay = async () => {
    if (!currentBattleId.value) {
      battleStore.setErrorMessage("请先开始战斗");
      return false;
    }

    const result = await battleStore.toggleAutoPlay(battleManager);
    
    if (result) {
      characterStore.setBattleState({ 
        isAutoPlaying: battleStore.autoPlayMode,
        isPaused: !battleStore.autoPlayMode
      });
    }
    
    return result;
  };

  /**
   * 切换暂停状态
   */
  const togglePause = () => {
    if (characterStore.isAutoPlaying) {
      // 如果正在自动播放，先停止自动播放
      battleManager.stopAutoBattle();
      characterStore.setBattleState({ isAutoPlaying: false });
      logManager.addSystemLog("停止自动战斗");
    }
    characterStore.setBattleState({ isPaused: !characterStore.isPaused });
  };

  /**
   * 设置战斗速度
   * @param speed 速度倍率
   */
  const setBattleSpeed = (speed: number) => {
    characterStore.setBattleState({ battleSpeed: speed });
    // 使用store中的方法设置战斗速度
    battleStore.setBattleSpeed(battleManager, speed);
  };

  /**
   * 加载技能配置
   * @param skillsData 技能配置数据
   */
  const loadSkillConfigs = (skillsData: any) => {
    battleManager.loadSkillConfigs(skillsData);
    logManager.addSystemLog("技能配置加载完成");
  };

  /**
   * 导入战斗状态
   */
  const importState = async () => {
    const result = await battleStore.importState();
    return result;
  };

  /**
   * 导出战斗状态
   */
  const exportState = () => {
    const result = battleStore.exportState(
      characterStore.allyTeam,
      characterStore.enemyTeam,
      characterStore.currentTurn,
      battleStore.rules,
      battleStore.battleLogs
    );
    return result;
  };

  return {
    // 状态
    currentBattleId,
    isLoading,
    errorMessage,
    // 方法
    initializeBattle,
    startBattle,
    endBattle,
    resetBattle,
    executeSingleTurn,
    toggleAutoPlay,
    togglePause,
    setBattleSpeed,
    loadSkillConfigs,
    importState,
    exportState,
    // 管理器
    battleManager,
    logManager
  };
}
