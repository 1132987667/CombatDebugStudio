import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { BattleStateManager } from '@/domain/battle/state/BattleStateManager'
import type { BattleEntity, StatusEffect } from '@/domain/battle/type/types'
import { GameDataProcessor } from '@/shared/utils/GameDataProcessor'
import { LoggerProvider } from '@/domain/port/LoggerProvider'

/**
 * 手动干预管理器
 * 负责处理 BattleDashboard 的事件和手动修改
 */
export class InterventionManager {
  private battleSystem: BattleSystem
  private battleStateManager: BattleStateManager
  private get logger() { return LoggerProvider.logger }
  private selectedCharacterId: string | null = null
  private selectedChar: BattleEntity | null = null

  /**
   * 构造函数
   * @param battleSystem 战斗系统实例
   * @param battleStateManager 战斗状态管理器实例
   */
  constructor(
    battleSystem: BattleSystem,
    battleStateManager: BattleStateManager,
  ) {
    this.battleSystem = battleSystem
    this.battleStateManager = battleStateManager
  }

  /**
   * 获取选中的角色ID
   */
  getSelectedCharacterId() {
    return this.selectedCharacterId
  }

  /**
   * 获取选中的角色
   */
  getSelectedChar() {
    return this.selectedChar
  }

  /**
   * 选择角色
   * @param charId 角色ID
   */
  selectCharacter(charId: string) {
    this.selectedCharacterId = charId

    // 查找并设置选中的角色
    const allyTeam = this.battleSystem.getEnabledAllyTeam()
    const enemyTeam = this.battleSystem.getEnabledEnemyTeam()

    this.selectedChar =
      allyTeam.find((c) => c.id === charId) ||
      enemyTeam.find((e) => e.id === charId) ||
      null
  }

  /**
   * 结束回合
   */
  endTurn() {
    // 结束当前回合的逻辑
    if (this.selectedCharacterId) {
      this.logger.addActionLog({
        source: '系统',
        action: '结束回合',
        target: this.selectedChar?.name || '',
        message: '回合结束',
      })
      this.selectedCharacterId = null
    }
  }

  /**
   * 执行技能
   * @param skillName 技能名称
   */
  executeSkill(skillName: string) {
    if (this.selectedChar) {
      this.logger.addActionLog({
        source: this.selectedChar.name,
        action: '使用技能',
        target: '',
        message: skillName,
      })
    }
  }

  /**
   * 添加状态
   * @param status 状态对象
   */
  addStatus(status: { name: string; turns: number }) {
    if (!status.name) return

    if (this.selectedChar) {
      const newStatus: StatusEffect = {
        id: `status_${Date.now()}`,
        name: status.name,
        type: 'buff',
        duration: status.turns,
        remainingTurns: status.turns,
      }

      if (!this.selectedChar.statusEffects) {
        this.selectedChar.statusEffects = []
      }
      this.selectedChar.statusEffects.push(newStatus)

      this.battleStateManager.updateCharacterManually(this.selectedChar.id, {
        statusEffects: [...this.selectedChar.statusEffects],
      })

      // 通知投影层刷新（手动添加状态需要反映到 UI）
      this.selectedChar.recalcAll()

      this.logger.addActionLog({
        source: '系统',
        action: '添加状态',
        target: this.selectedChar.name,
        message: `${status.name} (${status.turns}回合)`,
      })
    }
  }

  /**
   * 调整属性
   * @param stats 属性对象
   */
  adjustStats(stats: { hp: number; energy: number }) {
    if (this.selectedChar) {
      const maxHp = this.selectedChar.maxHealth
      const maxEnergy = this.selectedChar.maxEnergy
      const currentEnergy = this.selectedChar.currentEnergy

      const newHp = Math.max(
        0,
        Math.min(maxHp, this.selectedChar.currentHealth + stats.hp),
      )
      const newEnergy = Math.max(
        0,
        Math.min(maxEnergy, currentEnergy + stats.energy),
      )

      this.battleStateManager.updateCharacterManually(this.selectedChar.id, {
        currentHealth: newHp,
        currentEnergy: newEnergy,
      })

      this.logger.addActionLog({
        source: '系统',
        action: '调整属性',
        target: this.selectedChar.name,
        message: `HP:${stats.hp}, 能量:${stats.energy}`,
      })
    }
  }

  /**
   * 清除状态
   */
  clearStatuses() {
    if (this.selectedChar) {
      this.battleStateManager.updateCharacterManually(this.selectedChar.id, {
        statusEffects: [],
      })

      // 通知投影层刷新
      this.selectedChar.recalcAll()

      this.logger.addActionLog({
        source: '系统',
        action: '清除状态',
        target: this.selectedChar.name,
        message: '所有状态已清除',
      })
    }
  }

  /**
   * 导出状态
   * @returns 导出的状态对象
   */
  exportState() {
    const state = {
      battleCharacters: this.battleSystem.getEnabledAllyTeam(),
      enemyParty: this.battleSystem.getEnabledEnemyTeam(),
      currentTurn: this.battleStateManager.getCurrentTurn(),
      battleLogs: this.logger.getSystemLogs(),
    }

    // 保存到本地存储
    localStorage.setItem('battleState', JSON.stringify(state, null, 2))

    this.logger.addSystemLog({
      message: '战斗状态已导出',
    })
    return state
  }

  /**
   * 导入状态
   * @returns 是否导入成功
   */
  importState() {
    try {
      const savedState = localStorage.getItem('battleState')
      if (savedState) {
        const state = JSON.parse(savedState)
        // 基本形状校验：确保解析结果是对象且包含必要字段
        if (!state || typeof state !== 'object') {
          this.logger.addDebugLog('导入状态校验失败: 不是有效对象')
          return false
        }

        // 这里可以实现导入逻辑，更新队伍和状态
        // 例如：
        // this.battleStateManager.initializeTeams(state.battleCharacters, state.enemyParty);

        this.logger.addSystemLog({message: '战斗状态已导入'})
        return true
      } else {
        this.logger.addDebugLog('没有找到保存的战斗状态')
        return false
      }
    } catch (error) {
      console.error('导入状态时出错:', error)
      const errorMsg = error instanceof Error ? error.message : String(error)
      this.logger.addDebugLog(`导入失败: ${errorMsg}`)
      return false
    }
  }

  /**
   * 查看导出
   * @returns 导出的状态对象
   */
  viewExport() {
    const savedState = localStorage.getItem('battleState')
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState)
        // 基本形状校验
        if (!parsed || typeof parsed !== 'object') {
          console.warn('查看导出校验失败: 不是有效对象')
          return null
        }
        return parsed
      } catch (error) {
        console.error('查看导出时出错:', error)
        return null
      }
    }
    return null
  }

  /**
   * 重新加载导出
   * @returns 是否重新加载成功
   */
  reloadExport() {
    return this.importState()
  }

  /**
   * 定位异常
   */
  locateException() {
    this.logger.addSystemLog({
      message: '开始异常检测',
    })
    // 这里可以实现异常检测逻辑
  }

  /**
   * 清空所有参与者
   */
  clearParticipants() {
    // 使用状态管理器清空队伍
    // this.battleStateManager.initializeTeams([], [])

    // 重置选中状态
    this.selectedCharacterId = null
    this.selectedChar = null

    this.logger.addSystemLog({
      message: '所有参战角色已清空',
    })
  }
}
