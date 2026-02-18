import { defineStore } from 'pinia';
import type { BattleLogEntry } from '@/types/battle-log';
import { battleLogManager } from '@/utils/logging';

interface LogState {
  battleLogs: BattleLogEntry[];
  logFilters: {
    showSystem: boolean;
    showAction: boolean;
    showError: boolean;
  };
  logKeyword: string;
}

export const useLogStore = defineStore('log', {
  state: (): LogState => ({
    battleLogs: [],
    logFilters: {
      showSystem: true,
      showAction: true,
      showError: true,
    },
    logKeyword: '',
  }),

  getters: {
    /**
     * 获取过滤后的日志
     */
    filteredLogs: (state): BattleLogEntry[] => {
      let logs = [...state.battleLogs];
      
      // 应用过滤器
      logs = logs.filter(log => {
        if (log.level === 'system' && !state.logFilters.showSystem) return false;
        if (log.level === 'action' && !state.logFilters.showAction) return false;
        if (log.level === 'error' && !state.logFilters.showError) return false;
        return true;
      });
      
      // 应用关键词过滤
      if (state.logKeyword) {
        const keyword = state.logKeyword.toLowerCase();
        logs = logs.filter(log => {
          return log.source.toLowerCase().includes(keyword) ||
                 log.action.toLowerCase().includes(keyword) ||
                 log.target.toLowerCase().includes(keyword) ||
                 log.result.toLowerCase().includes(keyword);
        });
      }
      
      return logs;
    },

    /**
     * 获取日志数量
     */
    logCount: (state): number => {
      return state.battleLogs.length;
    },
  },

  actions: {
    /**
     * 初始化日志监听器
     */
    initializeLogger() {
      // 监听日志管理器的更新
      battleLogManager.addListener((logs) => {
        this.battleLogs = logs;
      });
    },

    /**
     * 更新日志过滤器
     */
    updateLogFilters(filters: Partial<LogState['logFilters']>) {
      Object.assign(this.logFilters, filters);
    },

    /**
     * 设置日志关键词
     */
    setLogKeyword(keyword: string) {
      this.logKeyword = keyword;
    },

    /**
     * 清空日志
     */
    clearLogs() {
      battleLogManager.clearLogs();
      this.battleLogs = [];
    },

    /**
     * 添加系统日志
     */
    addSystemLog(message: string) {
      battleLogManager.addLog(0, '系统', '系统消息', '', message, 'system', '');
    },

    /**
     * 添加动作日志
     */
    addActionLog(source: string, action: string, target: string, result: string) {
      battleLogManager.addLog(0, source, action, target, result, 'action', '');
    },

    /**
     * 添加错误日志
     */
    addErrorLog(message: string) {
      battleLogManager.addLog(0, '系统', '错误', '', message, 'error', '');
    },
  },
});
