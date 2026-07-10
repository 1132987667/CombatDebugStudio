import type { BattleEntity } from '@/domain/battle/type/types'
import type { BattleRules } from '@/presentation/stores/battleStore'
import type { InjectableStatus } from '@/presentation/views/components/StatusInjectionDialog.vue'
import type { BattleLogEntry } from '@/shared/types/battle-log'
import { defineStore } from 'pinia'

interface ExportedBattleState {
  battleCharacters: BattleEntity[]
  enemyParty: BattleEntity[]
  currentTurn: number
  rules: BattleRules
  battleLogs: BattleLogEntry[]
}

/** 基本形状校验：检查反序列化后的对象是否具备 ExportedBattleState 的必要字段 */
function isValidExportedState(obj: unknown): obj is ExportedBattleState {
  if (!obj || typeof obj !== 'object') return false
  const s = obj as Record<string, unknown>
  return (
    Array.isArray(s.battleCharacters) &&
    Array.isArray(s.enemyParty) &&
    typeof s.currentTurn === 'number' &&
    s.rules !== null && typeof s.rules === 'object' &&
    Array.isArray(s.battleLogs)
  )
}

interface DebugState {
  injectableStatuses: InjectableStatus[]
  lastExportTime: string | null
  /** 当前选中的命中爆炸动画样式 */
  impactStyle: string
}

export const useDebugStore = defineStore('debug', {
  state: (): DebugState => ({
    injectableStatuses: [],
    lastExportTime: null,
    impactStyle: 'slash',
  }),

  getters: {
    /**
     * 获取可注入的状态列表
     */
    getInjectableStatuses: (state): InjectableStatus[] => {
      return state.injectableStatuses
    },

    /**
     * 获取最后导出时间
     */
    getLastExportTime: (state): string | null => {
      return state.lastExportTime
    },
  },

  actions: {
    /**
     * 设置可注入的状态列表
     */
    setInjectableStatuses(statuses: InjectableStatus[]) {
      this.injectableStatuses = statuses
    },

    /**
     * 设置最后导出时间
     */
    setLastExportTime(time: string | null) {
      this.lastExportTime = time
    },

    /**
     * 更新可注入的状态
     */
    updateStatuses(statuses: InjectableStatus[]) {
      this.injectableStatuses = statuses
    },

    /**
     * 导出战斗状态
     */
    exportState(
      allyTeam: BattleEntity[],
      enemyTeam: BattleEntity[],
      currentTurn: number,
      rules: BattleRules,
      battleLogs: BattleLogEntry[],
    ) {
      const state = {
        battleCharacters: allyTeam,
        enemyParty: enemyTeam,
        currentTurn,
        rules,
        battleLogs,
      }
      const json = JSON.stringify(state, null, 2)
      localStorage.setItem('battleState', json)
      this.setLastExportTime(new Date().toLocaleString())
    },

    /**
     * 导入战斗状态
     */
    importState(): ExportedBattleState | null {
      try {
        const savedState = localStorage.getItem('battleState')
        if (savedState) {
          const parsed = JSON.parse(savedState)
          if (!isValidExportedState(parsed)) {
            console.warn('导入状态校验失败: 数据结构异常')
            return null
          }
          return parsed
        }
        return null
      } catch (error) {
        console.error('导入状态失败:', error)
        return null
      }
    },

    /**
     * 查看导出的状态
     */
    viewExport(): ExportedBattleState | null {
      try {
        const savedState = localStorage.getItem('battleState')
        if (savedState) {
          const parsed = JSON.parse(savedState)
          if (!isValidExportedState(parsed)) {
            console.warn('查看导出校验失败: 数据结构异常')
            return null
          }
          return parsed
        }
        return null
      } catch (error) {
        console.error('查看导出状态失败:', error)
        return null
      }
    },

    /**
     * 重置导出时间
     */
    resetExportTime() {
      this.setLastExportTime(null)
    },

    /**
     * 重载导出的状态
     */
    reloadExport() {
      // 重载导出状态的逻辑
      return this.importState()
    },

    /**
     * 设置命中爆炸动画样式
     */
    setImpactStyle(style: string) {
      this.impactStyle = style
    },
  },
})
