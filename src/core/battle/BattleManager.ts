import type { IBattleSystem } from '@/core/battle/interfaces';
import { BattleStateManager } from '@/core/battle/state/BattleStateManager';
import { getBattleLogManager } from '@/core/battle/logs/BattleLogManager';
import { AutoBattleManager } from '@/core/battle/auto/AutoBattleManager';
import { InterventionManager } from '@/core/battle/intervention/InterventionManager';
import { BattleReplayManager } from '@/core/battle/replay/BattleReplayManager';
import type { UIBattleCharacter } from '@/types';
import { GameDataProcessor } from '@/utils/GameDataProcessor';
import type { BattleParticipant } from '@/types/battle';
import { PARTICIPANT_SIDE } from '@/types/battle';
import { BattleParticipantImpl } from '@/core/battle/BattleParticipantImpl';
import type { BattleEventName, BattleEventCallback, BattleEndedEventData } from '@/types/battle-events';
import { LocalStorage } from '@/utils/storage';
import { eventBus } from '@/main';

/**
 * 战斗管理器
 * 负责协调各个子管理器，提供统一的接口给UI组件
 */
export class BattleManager {
  private battleSystem: IBattleSystem;
  private battleStateManager: BattleStateManager;
  private battleLogManager = getBattleLogManager();
  private autoBattleManager: AutoBattleManager;
  private interventionManager: InterventionManager;
  private battleReplayManager: BattleReplayManager;
  /**
   * 构造函数
   * @param battleSystem 战斗系统实例
   * @param battleStateManager 战斗状态管理器实例
   * @param autoBattleManager 自动战斗管理器实例
   * @param interventionManager 干预管理器实例
   * @param battleReplayManager 战斗回放管理器实例
   */
  constructor(
    private battleSystem: IBattleSystem,
    private battleStateManager: BattleStateManager,
    private autoBattleManager: AutoBattleManager,
    private interventionManager: InterventionManager,
    private battleReplayManager: BattleReplayManager
  ) {
    // 构造函数现在只接收依赖，不再内部创建实例
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param data 事件数据
   */
  private emit<T extends BattleEventName>(event: T, data: any) {
    eventBus.emit(event, data);
  }

  /**
   * 获取战斗状态管理器
   */
  getBattleStateManager() {
    return this.battleStateManager;
  }

  /**
   * 获取战斗日志管理器
   */
  getBattleLogManager() {
    return this.battleLogManager;
  }

  /**
   * 获取自动战斗管理器
   */
  getAutoBattleManager() {
    return this.autoBattleManager;
  }

  /**
   * 获取手动干预管理器
   */
  getInterventionManager() {
    return this.interventionManager;
  }

  /**
   * 获取战斗回放管理器
   */
  getBattleReplayManager() {
    return this.battleReplayManager;
  }

  /**
   * 初始化队伍数据
   * @param allyTeam 我方队伍
   * @param enemyTeam 敌方队伍
   */
  initializeTeams(allyTeam: UIBattleCharacter[], enemyTeam: UIBattleCharacter[]) {
    try {
      // 验证队伍数据
      if (!allyTeam || !enemyTeam) {
        throw new Error('队伍数据不能为空');
      }

      if (allyTeam.length === 0 && enemyTeam.length === 0) {
        throw new Error('至少需要一个角色或敌人参战');
      }

      this.battleStateManager.initializeTeams(allyTeam, enemyTeam);

      // 转换我方队伍为战斗参与者
      const allyParticipants = allyTeam.map((char, index) => {
        // 验证角色数据
        if (!char) {
          throw new Error(`我方队伍中第${index + 1}个角色数据无效`);
        }

        // 安全获取属性值
        const maxHpValue = typeof char.maxHp === 'object' && char.maxHp.value !== undefined ? char.maxHp.value : 0;
        const attackValue = typeof char.attack === 'object' && char.attack.value !== undefined ? char.attack.value : 0;
        const defenseValue = typeof char.defense === 'object' && char.defense.value !== undefined ? char.defense.value : 0;
        const speedValue = typeof char.speed === 'object' && char.speed.value !== undefined ? char.speed.value : 0;
        const critRateValue = typeof char.critRate === 'object' && char.critRate.value !== undefined ? char.critRate.value : 10;
        const critDamageValue = typeof char.critDamage === 'object' && char.critDamage.value !== undefined ? char.critDamage.value : 125;
        const damageReductionValue = typeof char.damageReduction === 'object' && char.damageReduction.value !== undefined ? char.damageReduction.value : 0;
        const healthBonusValue = typeof char.healthBonus === 'object' && char.healthBonus.value !== undefined ? char.healthBonus.value : 0;
        const attackBonusValue = typeof char.attackBonus === 'object' && char.attackBonus.value !== undefined ? char.attackBonus.value : 0;
        const speedBonusValue = typeof char.speedBonus === 'object' && char.speedBonus.value !== undefined ? char.speedBonus.value : 0;

        return new BattleParticipantImpl({
          id: char.originalId || `ally_${index}`,
          name: char.name || `Ally ${index + 1}`,
          type: PARTICIPANT_SIDE.ALLY,
          team: PARTICIPANT_SIDE.ALLY,
          level: char.level || 1,
          maxHealth: maxHpValue,
          currentHealth: char.currentHp || maxHpValue,
          minAttack: char.minAttack || 0,
          maxAttack: char.maxAttack || 0,
          attack: attackValue,
          defense: defenseValue,
          speed: speedValue,
          critRate: critRateValue,
          critDamage: critDamageValue,
          damageReduction: damageReductionValue,
          healthBonus: healthBonusValue,
          attackBonus: attackBonusValue,
          speedBonus: speedBonusValue,
          skills: char.skills || {},
        });
      });
      
      // 转换敌方队伍为战斗参与者
      const enemyParticipants = enemyTeam.map((char, index) => {
        // 验证敌人数据
        if (!char) {
          throw new Error(`敌方队伍中第${index + 1}个角色数据无效`);
        }

        // 安全获取属性值
        const maxHpValue = typeof char.maxHp === 'object' && char.maxHp.value !== undefined ? char.maxHp.value : 0;
        const attackValue = typeof char.attack === 'object' && char.attack.value !== undefined ? char.attack.value : 0;
        const defenseValue = typeof char.defense === 'object' && char.defense.value !== undefined ? char.defense.value : 0;
        const speedValue = typeof char.speed === 'object' && char.speed.value !== undefined ? char.speed.value : 0;
        const critRateValue = typeof char.critRate === 'object' && char.critRate.value !== undefined ? char.critRate.value : 10;
        const critDamageValue = typeof char.critDamage === 'object' && char.critDamage.value !== undefined ? char.critDamage.value : 125;
        const damageReductionValue = typeof char.damageReduction === 'object' && char.damageReduction.value !== undefined ? char.damageReduction.value : 0;
        const healthBonusValue = typeof char.healthBonus === 'object' && char.healthBonus.value !== undefined ? char.healthBonus.value : 0;
        const attackBonusValue = typeof char.attackBonus === 'object' && char.attackBonus.value !== undefined ? char.attackBonus.value : 0;
        const speedBonusValue = typeof char.speedBonus === 'object' && char.speedBonus.value !== undefined ? char.speedBonus.value : 0;

        return new BattleParticipantImpl({
          id: char.originalId || `enemy_${index}`,
          name: char.name || `Enemy ${index + 1}`,
          type: PARTICIPANT_SIDE.ENEMY,
          team: PARTICIPANT_SIDE.ENEMY,
          level: char.level || 1,
          maxHealth: maxHpValue,
          currentHealth: char.currentHp || maxHpValue,
          minAttack: char.minAttack || 0,
          maxAttack: char.maxAttack || 0,
          attack: attackValue,
          defense: defenseValue,
          speed: speedValue,
          critRate: critRateValue,
          critDamage: critDamageValue,
          damageReduction: damageReductionValue,
          healthBonus: healthBonusValue,
          attackBonus: attackBonusValue,
          speedBonus: speedBonusValue,
          skills: char.skills || {},
        });
      });

      // 合并所有参与者
      const allParticipants = [...allyParticipants, ...enemyParticipants] as BattleParticipant[];

      // 验证参与者数据
      if (allParticipants.length === 0) {
        throw new Error('没有有效的参与者数据');
      }

      // 创建战斗状态
      const battleState = this.battleSystem.createBattle(allParticipants);
      
      const battleId = battleState.battleId;
      this.setBattleId(battleId);
      
      return {
        battleId
      };
    } catch (error) {
      console.error('初始化队伍数据时出错:', error);
      throw error;
    }
  }

  /**
   * 设置战斗ID
   * @param battleId 战斗ID
   */
  setBattleId(battleId: string) {
    this.battleStateManager.setBattleId(battleId);
    this.autoBattleManager.setBattleId(battleId);
  }

  /**
   * 同步战斗状态
   */
  syncBattleState() {
    this.battleStateManager.syncBattleState();
  }

  /**
   * 同步战斗日志
   * @param battleState 战斗状态
   */
  async syncBattleLogs(battleState: any) {
    await this.battleLogManager.syncBattleLogs(battleState);
  }

  /**
   * 加载技能配置
   * @param skillsData 技能配置数据
   */
  loadSkillConfigs(skillsData: any) {
    // 这里可以添加技能配置加载逻辑
    // 例如：this.battleSystem.loadSkills(skillsData);
  }

  /**
   * 开始战斗
   */
  async startBattle() {
    await this.autoBattleManager.startAutoBattle();
  }

  /**
   * 开始自动战斗
   */
  startAutoBattle() {
    return this.autoBattleManager.startAutoBattle();
  }

  /**
   * 停止自动战斗
   */
  stopAutoBattle() {
    return this.autoBattleManager.stopAutoBattle();
  }

  /**
   * 结束战斗
   * @param winner 获胜方
   */
  endBattle(winner: any) {
    const result = this.autoBattleManager.stopAutoBattle();
    // 触发战斗结束事件
    const eventData: any = { winner };
    this.emit('battleEnd', eventData);
    return result;
  }

  /**
   * 重置战斗
   */
  resetBattle() {
    this.battleStateManager.resetState();
    this.autoBattleManager.resetState();
    this.battleLogManager.clearLogs();
  }

  /**
   * 执行单个回合
   */
  async executeSingleTurn() {
    await this.autoBattleManager.executeSingleTurn();
  }

  /**
   * 处理单个回合
   */
  async processSingleTurn() {
    await this.autoBattleManager.executeSingleTurn();
  }

  /**
   * 切换自动战斗状态
   */
  async toggleAutoPlay() {
    await this.autoBattleManager.toggleAutoPlay();
  }

  /**
   * 切换暂停状态
   */
  togglePause() {
    this.autoBattleManager.togglePause();
  }

  /**
   * 设置战斗速度
   * @param speed 速度倍率
   */
  setBattleSpeed(speed: number) {
    this.autoBattleManager.setSpeed(speed);
  }

  /**
   * 选择角色
   * @param charId 角色ID
   */
  selectCharacter(charId: string) {
    this.interventionManager.selectCharacter(charId);
  }

  /**
   * 开始回放
   * @param recording 回放记录
   */
  startReplay(recording: any) {
    this.battleReplayManager.startReplay(recording);
  }

  /**
   * 暂停回放
   */
  pauseReplay() {
    this.battleReplayManager.pauseReplay();
  }

  /**
   * 继续回放
   */
  resumeReplay() {
    this.battleReplayManager.resumeReplay();
  }

  /**
   * 停止回放
   */
  stopReplay() {
    this.battleReplayManager.stopReplay();
  }

  /**
   * 设置回放速度
   * @param speed 速度倍率
   */
  setReplaySpeed(speed: number) {
    this.battleReplayManager.setReplaySpeed(speed);
  }

  /**
   * 获取战斗数据
   * 用于UI组件获取战斗状态信息
   */
  getBattleData() {
    return {
      isPaused: this.autoBattleManager.getIsPaused()?.value || false,
      isAutoPlaying: this.autoBattleManager.getIsAutoPlaying()?.value || false,
      currentTurn: this.battleStateManager.getCurrentTurn()?.value || 1,
      maxTurns: 999, // 默认最大回合数
      battleSpeed: this.autoBattleManager.getBattleSpeed()?.value || 1,
      battleId: this.battleStateManager.getBattleId()?.value || null
    };
  }

  /**
   * 获取保存的战斗记录列表
   */
  getSavedBattleRecordingsList() {
    // 从localStorage获取保存的战斗记录列表
    return LocalStorage.get<string[]>('battle_recordings_list', []);
  }

  /**
   * 加载战斗记录
   * @param key 记录键名
   */
  loadBattleRecording(key: string) {
    // 从localStorage加载战斗记录
    return LocalStorage.get(key);
  }

  /**
   * 保存战斗记录
   * @param battleId 战斗ID
   * @param name 记录名称
   */
  saveBattleRecording(battleId: string, name?: string) {
    // 生成记录键名
    const saveKey = `battle_recording_${battleId}`;
    
    // 这里可以添加保存战斗记录的逻辑
    // 例如：从战斗系统获取当前战斗状态并保存
    
    // 更新保存的记录列表
    const savedList = this.getSavedBattleRecordingsList();
    if (!savedList.includes(saveKey)) {
      savedList.push(saveKey);
      LocalStorage.set('battle_recordings_list', savedList);
    }
    
    return saveKey;
  }

  /**
   * 删除战斗记录
   * @param key 记录键名
   */
  deleteBattleRecording(key: string) {
    // 从localStorage删除战斗记录
    const removeResult = LocalStorage.remove(key);
    
    // 更新保存的记录列表
    const savedList = this.getSavedBattleRecordingsList();
    const updatedList = savedList.filter((item: string) => item !== key);
    LocalStorage.set('battle_recordings_list', updatedList);
    
    return removeResult;
  }
}
