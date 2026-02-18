import { ref } from 'vue';
import type { IBattleSystem } from '@/core/battle/interfaces';
import { BattleStateManager } from '@/core/battle/state/BattleStateManager';
import { getBattleLogManager } from '@/core/battle/logs/BattleLogManager';
import type { UIBattleCharacter } from '@/types';
import { GameDataProcessor } from '@/utils/GameDataProcessor';

/**
 * 手动干预管理器
 * 负责处理DebugPanel的事件和手动修改
 */
export class InterventionManager {
  private battleSystem: IBattleSystem;
  private battleStateManager: BattleStateManager;
  private battleLogManager = getBattleLogManager();
  private selectedCharacterId = ref<string | null>(null);
  private selectedChar = ref<UIBattleCharacter | null>(null);

  /**
   * 构造函数
   * @param battleSystem 战斗系统实例
   * @param battleStateManager 战斗状态管理器实例
   */
  constructor(battleSystem: IBattleSystem, battleStateManager: BattleStateManager) {
    this.battleSystem = battleSystem;
    this.battleStateManager = battleStateManager;
  }

  /**
   * 获取选中的角色ID
   */
  getSelectedCharacterId() {
    return this.selectedCharacterId;
  }

  /**
   * 获取选中的角色
   */
  getSelectedChar() {
    return this.selectedChar;
  }

  /**
   * 选择角色
   * @param charId 角色ID
   */
  selectCharacter(charId: string) {
    this.selectedCharacterId.value = charId;
    
    // 查找并设置选中的角色
    const allyTeam = this.battleStateManager.getAllyTeam().value;
    const enemyTeam = this.battleStateManager.getEnemyTeam().value;
    
    this.selectedChar.value = 
      allyTeam.find((c) => c.id === charId) ||
      enemyTeam.find((e) => e.id === charId) ||
      null;
  }

  /**
   * 结束回合
   */
  endTurn() {
    // 结束当前回合的逻辑
    if (this.selectedCharacterId.value) {
      this.battleLogManager.addActionLog(
        "系统",
        "结束回合",
        this.selectedChar.value?.name || "",
        "回合结束"
      );
      this.selectedCharacterId.value = null;
    }
  }

  /**
   * 执行技能
   * @param skillName 技能名称
   */
  executeSkill(skillName: string) {
    if (this.selectedChar.value) {
      this.battleLogManager.addActionLog(
        this.selectedChar.value.name,
        "使用技能",
        "",
        skillName
      );
    }
  }

  /**
   * 添加状态
   * @param status 状态对象
   */
  addStatus(status: { name: string; turns: number }) {
    if (!status.name) return;
    
    if (this.selectedChar.value) {
      // 创建新的状态对象
      const newStatus = {
        id: `status_${Date.now()}`,
        name: status.name,
        duration: status.turns,
        maxStacks: 1,
        cooldown: 0,
        description: '',
        isPositive: true
      };

      // 添加状态到角色
      if (!this.selectedChar.value.buffs) {
        this.selectedChar.value.buffs = [];
      }
      this.selectedChar.value.buffs.push(newStatus);

      // 使用状态管理器更新角色
      this.battleStateManager.updateCharacterManually(this.selectedChar.value.id, {
        buffs: [...this.selectedChar.value.buffs]
      });

      this.battleLogManager.addActionLog(
        "系统",
        "添加状态",
        this.selectedChar.value.name,
        `${status.name} (${status.turns}回合)`
      );
    }
  }

  /**
   * 调整属性
   * @param stats 属性对象
   */
  adjustStats(stats: { hp: number; mp: number }) {
    if (this.selectedChar.value) {
      const maxHp = GameDataProcessor.getAttributeValue(this.selectedChar.value.maxHp);
      const maxMp = this.selectedChar.value.maxMp || 100;

      // 计算新的属性值
      const newHp = Math.max(0, Math.min(maxHp, this.selectedChar.value.currentHp + stats.hp));
      const newMp = Math.max(0, Math.min(maxMp, (this.selectedChar.value.currentMp || 0) + stats.mp));

      // 使用状态管理器更新角色
      this.battleStateManager.updateCharacterManually(this.selectedChar.value.id, {
        currentHp: newHp,
        currentMp: newMp
      });

      this.battleLogManager.addActionLog(
        "系统",
        "调整属性",
        this.selectedChar.value.name,
        `HP:${stats.hp}, MP:${stats.mp}`
      );
    }
  }

  /**
   * 清除状态
   */
  clearStatuses() {
    if (this.selectedChar.value) {
      // 使用状态管理器更新角色
      this.battleStateManager.updateCharacterManually(this.selectedChar.value.id, {
        buffs: []
      });

      this.battleLogManager.addActionLog(
        "系统",
        "清除状态",
        this.selectedChar.value.name,
        "所有状态已清除"
      );
    }
  }

  /**
   * 导出状态
   * @returns 导出的状态对象
   */
  exportState() {
    const state = {
      battleCharacters: this.battleStateManager.getAllyTeam().value,
      enemyParty: this.battleStateManager.getEnemyTeam().value,
      currentTurn: this.battleStateManager.getCurrentTurn().value,
      battleLogs: this.battleLogManager.getLogs().value
    };

    // 保存到本地存储
    localStorage.setItem('battleState', JSON.stringify(state, null, 2));

    this.battleLogManager.addSystemLog("战斗状态已导出");
    return state;
  }

  /**
   * 导入状态
   * @returns 是否导入成功
   */
  importState() {
    try {
      const savedState = localStorage.getItem('battleState');
      if (savedState) {
        const state = JSON.parse(savedState);
        
        // 这里可以实现导入逻辑，更新队伍和状态
        // 例如：
        // this.battleStateManager.initializeTeams(state.battleCharacters, state.enemyParty);
        
        this.battleLogManager.addSystemLog("战斗状态已导入");
        return true;
      } else {
        this.battleLogManager.addErrorLog("没有找到保存的战斗状态");
        return false;
      }
    } catch (error) {
      console.error('导入状态时出错:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.battleLogManager.addErrorLog(`导入失败: ${errorMsg}`);
      return false;
    }
  }

  /**
   * 查看导出
   * @returns 导出的状态对象
   */
  viewExport() {
    const savedState = localStorage.getItem('battleState');
    if (savedState) {
      try {
        return JSON.parse(savedState);
      } catch (error) {
        console.error('查看导出时出错:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * 重新加载导出
   * @returns 是否重新加载成功
   */
  reloadExport() {
    return this.importState();
  }

  /**
   * 定位异常
   */
  locateException() {
    this.battleLogManager.addSystemLog("开始异常检测");
    // 这里可以实现异常检测逻辑
  }

  /**
   * 清空所有参与者
   */
  clearParticipants() {
    // 使用状态管理器清空队伍
    this.battleStateManager.initializeTeams([], []);
    
    // 重置选中状态
    this.selectedCharacterId.value = null;
    this.selectedChar.value = null;
    
    this.battleLogManager.addSystemLog("所有参战角色已清空");
  }
}
