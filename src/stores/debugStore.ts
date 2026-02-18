import { defineStore } from 'pinia';
import type { UIBattleCharacter } from '@/types';
import type { BattleRules } from '@/stores/battleStore';
import type { BattleLogEntry } from '@/types/battle-log';
import type { InjectableStatus } from '@/views/components/StatusInjectionDialog.vue';

interface ExportedBattleState {
  battleCharacters: UIBattleCharacter[];
  enemyParty: UIBattleCharacter[];
  currentTurn: number;
  rules: BattleRules;
  battleLogs: BattleLogEntry[];
}

interface DebugState {
  injectableStatuses: InjectableStatus[];
  lastExportTime: string | null;
}

export const useDebugStore = defineStore('debug', {
  state: (): DebugState => ({
    injectableStatuses: [],
    lastExportTime: null,
  }),

  getters: {
    /**
     * 获取可注入的状态列表
     */
    getInjectableStatuses: (state): InjectableStatus[] => {
      return state.injectableStatuses;
    },

    /**
     * 获取最后导出时间
     */
    getLastExportTime: (state): string | null => {
      return state.lastExportTime;
    },
  },

  actions: {
    /**
     * 设置可注入的状态列表
     */
    setInjectableStatuses(statuses: InjectableStatus[]) {
      this.injectableStatuses = statuses;
    },

    /**
     * 设置最后导出时间
     */
    setLastExportTime(time: string | null) {
      this.lastExportTime = time;
    },

    /**
     * 更新可注入的状态
     */
    updateStatuses(statuses: InjectableStatus[]) {
      this.injectableStatuses = statuses;
    },

    /**
     * 导出战斗状态
     */
    exportState(allyTeam: UIBattleCharacter[], enemyTeam: UIBattleCharacter[], currentTurn: number, rules: BattleRules, battleLogs: BattleLogEntry[]) {
      const state = {
        battleCharacters: allyTeam,
        enemyParty: enemyTeam,
        currentTurn,
        rules,
        battleLogs
      };
      const json = JSON.stringify(state, null, 2);
      localStorage.setItem('battleState', json);
      this.setLastExportTime(new Date().toLocaleString());
    },

    /**
     * 导入战斗状态
     */
    importState(): ExportedBattleState | null {
      try {
        const savedState = localStorage.getItem('battleState');
        if (savedState) {
          return JSON.parse(savedState) as ExportedBattleState;
        }
        return null;
      } catch (error) {
        console.error('导入状态失败:', error);
        return null;
      }
    },

    /**
     * 查看导出的状态
     */
    viewExport(): ExportedBattleState | null {
      try {
        const savedState = localStorage.getItem('battleState');
        if (savedState) {
          return JSON.parse(savedState) as ExportedBattleState;
        }
        return null;
      } catch (error) {
        console.error('查看导出状态失败:', error);
        return null;
      }
    },

    /**
     * 重置导出时间
     */
    resetExportTime() {
      this.setLastExportTime(null);
    },

    /**
     * 重载导出的状态
     */
    reloadExport() {
      // 重载导出状态的逻辑
      return this.importState();
    },
  },
});
