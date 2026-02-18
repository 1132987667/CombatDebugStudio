import { defineStore } from 'pinia';
import { PARTICIPANT_SIDE, BattleSystemEvent } from '@/types/battle';
import { battleLogManager } from '@/utils/logging';
import type { UIBattleCharacter } from '@/types';
import type { BattleLogEntry } from '@/types/battle-log';
import type { BattleLogEventData, BattleStateUpdateEventData } from '@/types/battle-events';

/**
 * 战斗规则接口
 */
export interface BattleRules {
  speedFirst: boolean;
  fixedTurns: boolean;
  critEnabled: boolean;
  dodgeEnabled: boolean;
}

/**
 * 动画状态接口
 */
export interface AnimationState {
  damage: {
    targetId: string;
    damage: number;
    damageType: string;
    isCritical: boolean;
    isHeal: boolean;
  } | null;
  miss: {
    targetId: string;
  } | null;
  buff: {
    targetId: string;
    buffName: string;
    isPositive: boolean;
  } | null;
  skill: {
    sourceId: string;
    targetId: string;
    skillName: string;
    effectType: string;
    damageType: string;
  } | null;
}

/**
 * 加载状态接口
 */
export interface LoadingState {
  isLoading: boolean;
  operation: string | null; // 当前正在执行的操作
  progress: number | null; // 操作进度（0-100）
}

/**
 * 错误状态接口
 */
export interface ErrorState {
  hasError: boolean;
  message: string | null;
  details: string | null;
  field: string | null; // 出错的字段（用于表单错误）
}

/**
 * 战斗状态接口
 */
export interface BattleState {
  rules: BattleRules;
  currentActorId: string | null;
  loading: LoadingState;
  error: ErrorState;
  autoPlayMode: boolean;
  isBattleActive: boolean;
  battleLogs: BattleLogEntry[];
  animationState: AnimationState;
  currentBattleId: string | null;
  turnOrder: string[];
  battleSpeed: number;
}

export const useBattleStore = defineStore('battle', {
  state: (): BattleState => ({
    rules: {
      speedFirst: true,
      fixedTurns: false,
      critEnabled: true,
      dodgeEnabled: false,
    },
    currentActorId: null,
    loading: {
      isLoading: false,
      operation: null,
      progress: null,
    },
    error: {
      hasError: false,
      message: null,
      details: null,
      field: null,
    },
    autoPlayMode: false,
    isBattleActive: false,
    battleLogs: [],
    animationState: {
      damage: null,
      miss: null,
      buff: null,
      skill: null,
    },
    currentBattleId: null,
    turnOrder: [],
    battleSpeed: 1,
  }),

  getters: {
    /**
     * 获取当前战斗规则
     */
    getRules: (state): BattleRules => {
      return state.rules;
    },

    /**
     * 获取当前行动者ID
     */
    getCurrentActorId: (state): string | null => {
      return state.currentActorId;
    },

    /**
     * 获取加载状态
     */
    getLoadingState: (state): LoadingState => {
      return state.loading;
    },

    /**
     * 获取是否正在加载
     */
    isBattleLoading: (state): boolean => {
      return state.loading.isLoading;
    },

    /**
     * 获取当前加载的操作
     */
    getCurrentOperation: (state): string | null => {
      return state.loading.operation;
    },

    /**
     * 获取加载进度
     */
    getLoadingProgress: (state): number | null => {
      return state.loading.progress;
    },

    /**
     * 获取错误状态
     */
    getErrorState: (state): ErrorState => {
      return state.error;
    },

    /**
     * 获取是否有错误
     */
    hasError: (state): boolean => {
      return state.error.hasError;
    },

    /**
     * 获取错误信息
     */
    getErrorMessage: (state): string | null => {
      return state.error.message;
    },

    /**
     * 获取错误详情
     */
    getErrorDetails: (state): string | null => {
      return state.error.details;
    },

    /**
     * 获取出错的字段
     */
    getErrorField: (state): string | null => {
      return state.error.field;
    },

    /**
     * 获取战斗活跃状态
     */
    getIsBattleActive: (state): boolean => {
      return state.isBattleActive;
    },

    /**
     * 获取战斗日志
     */
    getBattleLogs: (state): BattleLogEntry[] => {
      return state.battleLogs;
    },

    /**
     * 获取动画状态
     */
    getAnimationState: (state): AnimationState => {
      return state.animationState;
    },



    /**
     * 获取当前战斗ID
     */
    getCurrentBattleId: (state): string | null => {
      return state.currentBattleId;
    },

    /**
     * 获取回合顺序
     */
    getTurnOrder: (state): string[] => {
      return state.turnOrder;
    },

    /**
     * 获取战斗速度
     */
    getBattleSpeed: (state): number => {
      return state.battleSpeed;
    },
  },

  actions: {
    /**
     * 更新战斗规则
     */
    updateRules(newRules: Partial<BattleRules>) {
      Object.assign(this.rules, newRules);
      battleLogManager.addSystemLog(`战斗规则已更新: ${JSON.stringify(newRules)}`);
    },

    /**
     * 设置当前行动者
     */
    setCurrentActorId(actorId: string | null) {
      this.currentActorId = actorId;
    },

    /**
     * 设置加载状态
     */
    setLoading(loading: boolean, operation: string | null = null, progress: number | null = null) {
      this.loading = {
        isLoading: loading,
        operation,
        progress,
      };
    },

    /**
     * 更新加载进度
     */
    updateLoadingProgress(progress: number) {
      this.loading.progress = Math.max(0, Math.min(100, progress));
    },

    /**
     * 设置错误信息
     */
    setError(message: string | null, details: string | null = null, field: string | null = null) {
      this.error = {
        hasError: !!message,
        message,
        details,
        field,
      };
      
      // 在控制台输出错误详情
      if (message && details) {
        console.error(`[Battle Error] ${message}: ${details}`);
      } else if (message) {
        console.error(`[Battle Error] ${message}`);
      }
    },

    /**
     * 清除错误信息
     */
    clearError() {
      this.error = {
        hasError: false,
        message: null,
        details: null,
        field: null,
      };
    },

    /**
     * 清除所有状态
     */
    clearState() {
      this.setLoading(false);
      this.clearError();
    },

    /**
     * 设置自动播放模式
     */
    setAutoPlayMode(mode: boolean) {
      this.autoPlayMode = mode;
    },

    /**
     * 设置战斗活跃状态
     */
    setBattleActive(active: boolean) {
      this.isBattleActive = active;
    },

    /**
     * 添加战斗日志
     */
    addBattleLog(log: BattleLogEntry) {
      this.battleLogs.push(log);
      // 限制日志数量，避免内存占用过高
      if (this.battleLogs.length > 100) {
        this.battleLogs.shift();
      }
    },

    /**
     * 清除战斗日志
     */
    clearBattleLogs() {
      this.battleLogs = [];
    },

    /**
     * 设置动画状态
     */
    setAnimationState(type: keyof AnimationState, data: AnimationState[keyof AnimationState]) {
      this.animationState[type] = data;
      // 动画状态自动清除
      setTimeout(() => {
        this.animationState[type] = null;
      }, 1000);
    },



    /**
     * 开始战斗
     */
    async startBattle(allyTeam: UIBattleCharacter[], enemyTeam: UIBattleCharacter[]) {
      this.setLoading(true, '开始战斗');
      this.clearError();

      try {
        // 验证队伍数据
        if (!allyTeam || !enemyTeam) {
          throw new Error('队伍数据不能为空');
        }

        // 获取启用的角色
        const enabledAllyTeam = allyTeam.filter((c) => c.enabled);
        const enabledEnemyTeam = enemyTeam.filter((e) => e.enabled);

        if (enabledAllyTeam.length === 0) {
          throw new Error('我方请至少选择一个角色参战');
        }
        if (enabledEnemyTeam.length === 0) {
          throw new Error('敌方请至少选择一个角色参战');
        }

        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化');
        }

        // 开始自动战斗
        await this.battleManager.startAutoBattle();
        this.setBattleActive(true);
        this.autoPlayMode = true;
        battleLogManager.addSystemLog(`战斗开始！参战角色: ${enabledAllyTeam.length}人 | 参战敌人: ${enabledEnemyTeam.length}人`);
        
        // 记录战斗开始日志
        this.addBattleLog({
          turn: '战斗开始',
          source: '系统',
          action: '宣布',
          target: '',
          result: `战斗开始！参战角色: ${enabledAllyTeam.length}人 | 参战敌人: ${enabledEnemyTeam.length}人`,
          level: 'system'
        });
        
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.setError(errorMsg, error instanceof Error ? error.stack : null);
        battleLogManager.addErrorLog(`开始战斗失败: ${errorMsg}`);
        return false;
      } finally {
        this.setLoading(false);
      }
    },

    /**
     * 结束战斗
     */
    async endBattle(winner: PARTICIPANT_SIDE = PARTICIPANT_SIDE.ALLY) {
      this.setLoading(true, '结束战斗');
      this.clearError();

      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化');
        }

        // 结束战斗
        this.battleManager.endBattle(winner);
        // 同步战斗状态
        this.battleManager.syncBattleState();
        this.setBattleActive(false);
        battleLogManager.addSystemLog(`战斗结束！胜利者: ${winner === PARTICIPANT_SIDE.ALLY ? '我方' : '敌方'}`);
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.setError(errorMsg, error instanceof Error ? error.stack : null);
        battleLogManager.addErrorLog(`结束战斗失败: ${errorMsg}`);
        return false;
      } finally {
        this.setLoading(false);
      }
    },

    /**
     * 重置战斗
     */
    async resetBattle() {
      this.setLoading(true, '重置战斗');
      this.clearError();

      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化');
        }

        // 重置战斗系统
        this.battleManager.resetBattle();
        // 重置当前行动者
        this.setCurrentActorId(null);
        this.setBattleActive(false);
        this.clearBattleLogs();
        this.currentBattleId = null;
        this.turnOrder = [];
        battleLogManager.addSystemLog('战斗已重置');
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.setError(errorMsg, error instanceof Error ? error.stack : null);
        battleLogManager.addErrorLog(`重置战斗失败: ${errorMsg}`);
        return false;
      } finally {
        this.setLoading(false);
      }
    },

    /**
     * 执行单个回合
     */
    async processSingleTurn() {
      this.setLoading(true, '执行回合');
      this.clearError();

      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化');
        }

        // 执行单个回合
        await this.battleManager.processSingleTurn();
        // 同步战斗状态
        this.battleManager.syncBattleState();
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.setError(errorMsg, error instanceof Error ? error.stack : null);
        battleLogManager.addErrorLog(`执行回合时出错: ${errorMsg}`);
        return false;
      } finally {
        this.setLoading(false);
      }
    },

    /**
     * 切换自动战斗状态
     */
    async toggleAutoPlay() {
      this.setLoading(true);
      this.clearError();

      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化');
        }

        if (this.autoPlayMode) {
          // 停止自动播放
          this.battleManager.stopAutoBattle();
          this.autoPlayMode = false;
          this.isBattleActive = false;
          battleLogManager.addSystemLog('停止自动战斗');
        } else {
          // 开始自动播放
          await this.battleManager.startAutoBattle();
          this.autoPlayMode = true;
          this.isBattleActive = true;
          this.battleManager.syncBattleState();
          battleLogManager.addSystemLog('开始自动战斗');
        }
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.setError(errorMsg, error instanceof Error ? error.stack : null);
        battleLogManager.addErrorLog(`切换自动战斗状态失败: ${errorMsg}`);
        // 恢复原状态
        this.autoPlayMode = !this.autoPlayMode;
        return false;
      } finally {
        this.setLoading(false);
      }
    },

    /**
     * 导入战斗状态
     */
    async importState() {
      this.setLoading(true);
      this.clearError();

      try {
        const savedState = localStorage.getItem('battleState');
        if (savedState) {
          try {
            const state = JSON.parse(savedState);
            // 这里需要实现导入逻辑
            battleLogManager.addSystemLog('战斗状态已导入');
            return true;
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            throw new Error(`导入失败: ${errorMsg}`);
          }
        } else {
          throw new Error('没有找到保存的战斗状态');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.setError(errorMsg, error instanceof Error ? error.stack : null);
        battleLogManager.addErrorLog(`导入失败: ${errorMsg}`);
        return false;
      } finally {
        this.setLoading(false);
      }
    },

    /**
     * 导出战斗状态
     */
    exportState(allyTeam: UIBattleCharacter[], enemyTeam: UIBattleCharacter[], currentTurn: number) {
      try {
        const state = {
          battleCharacters: allyTeam,
          enemyParty: enemyTeam,
          currentTurn,
          rules: this.rules,
          battleLogs: this.battleLogs
        };
        const json = JSON.stringify(state, null, 2);
        localStorage.setItem('battleState', json);
        battleLogManager.addSystemLog('战斗状态已导出');
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.setError(errorMsg, error instanceof Error ? error.stack : null);
        battleLogManager.addErrorLog(`导出状态时出错: ${errorMsg}`);
        return false;
      }
    },

    /**
     * 设置战斗速度
     */
    setBattleSpeed(speed: number) {
      try {
        if (!this.battleManager) {
          throw new Error('战斗管理器未初始化');
        }

        this.battleManager.setBattleSpeed(speed);
        this.battleSpeed = speed;
        battleLogManager.addSystemLog(`战斗速度已调整为: ${speed}倍`);
        return true;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.setError(errorMsg, error instanceof Error ? error.stack : null);
        battleLogManager.addErrorLog(`设置战斗速度失败: ${errorMsg}`);
        return false;
      }
    },

    /**
     * 清理战斗管理器事件监听器
     */
    destroy() {
      try {
        if (!this.battleManager) return;

        // 移除所有事件监听器
        this.battleManager.off(BattleSystemEvent.BATTLE_LOG);
        this.battleManager.off(BattleSystemEvent.BATTLE_STATE_UPDATE);
        this.battleManager.off(BattleSystemEvent.DAMAGE_ANIMATION);
        this.battleManager.off(BattleSystemEvent.MISS_ANIMATION);
        this.battleManager.off(BattleSystemEvent.BATTLE_END);
        this.battleManager.off(BattleSystemEvent.BUFF_EFFECT);
        this.battleManager.off(BattleSystemEvent.SKILL_EFFECT);
        this.battleManager.off(BattleSystemEvent.TURN_START);
        this.battleManager.off(BattleSystemEvent.TURN_END);

        // 清理战斗状态
        this.currentActorId = null;
        this.isBattleActive = false;
        this.autoPlayMode = false;
        this.clearBattleLogs();
        this.currentBattleId = null;
        this.turnOrder = [];

        // 清理动画状态
        this.animationState = {
          damage: null,
          miss: null,
          buff: null,
          skill: null,
        };

        // 清理战斗管理器引用
        this.battleManager = null;

        console.log('战斗管理器事件监听器已清理');
      } catch (error) {
        console.error('清理战斗管理器事件监听器时出错:', error);
      }
    },
  },
});
