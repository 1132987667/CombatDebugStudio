import { ref, computed } from 'vue';
import type { IBattleSystem } from '@/core/battle/interfaces';
import type { BattleState, BattleParticipant, ParticipantSide } from '@/types/battle';
import type { UIBattleCharacter } from '@/types';
import { GameDataProcessor } from '@/utils/GameDataProcessor';
import { PARTICIPANT_SIDE } from '@/types/battle';

/**
 * 战斗状态管理器
 * 负责从BattleSystem获取状态，转换为UI角色状态，并管理状态同步
 */
export class BattleStateManager {
  private battleSystem: IBattleSystem;
  private allyTeam = ref<UIBattleCharacter[]>([]);
  private enemyTeam = ref<UIBattleCharacter[]>([]);
  private currentTurn = ref(1);
  private currentActorId = ref<string | null>(null);
  private battleId = ref<string | null>(null);
  private isBattleActive = ref(false);
  // 参与者ID到UI角色的映射表
  private participantToUICharacterMap = new Map<string, UIBattleCharacter>();
  // UI角色ID到参与者ID的映射表
  private uiCharacterToParticipantMap = new Map<string, string>();

  /**
   * 构造函数
   * @param battleSystem 战斗系统实例
   */
  constructor(battleSystem: IBattleSystem) {
    this.battleSystem = battleSystem;
  }

  /**
   * 获取我方队伍
   */
  getAllyTeam() {
    return this.allyTeam;
  }

  /**
   * 获取敌方队伍
   */
  getEnemyTeam() {
    return this.enemyTeam;
  }

  /**
   * 获取当前回合
   */
  getCurrentTurn() {
    return this.currentTurn;
  }

  /**
   * 获取当前行动者ID
   */
  getCurrentActorId() {
    return this.currentActorId;
  }

  /**
   * 获取战斗ID
   */
  getBattleId() {
    return this.battleId;
  }

  /**
   * 获取战斗是否活跃
   */
  getIsBattleActive() {
    return this.isBattleActive;
  }

  /**
   * 初始化队伍数据
   * @param allyTeam 我方队伍
   * @param enemyTeam 敌方队伍
   */
  initializeTeams(allyTeam: UIBattleCharacter[], enemyTeam: UIBattleCharacter[]) {
    this.allyTeam.value = [...allyTeam];
    this.enemyTeam.value = [...enemyTeam];
    
    // 清空映射表
    this.participantToUICharacterMap.clear();
    this.uiCharacterToParticipantMap.clear();
    
    // 建立我方队伍的映射关系
    allyTeam.forEach((char, index) => {
      // 从原始ID构建参与者ID
      const participantId = char.originalId || `character_${index}`;
      this.participantToUICharacterMap.set(participantId, char);
      this.uiCharacterToParticipantMap.set(char.id, participantId);
    });
    
    // 建立敌方队伍的映射关系
    enemyTeam.forEach((char, index) => {
      // 从原始ID构建参与者ID
      const participantId = char.originalId || `enemy_${index}`;
      this.participantToUICharacterMap.set(participantId, char);
      this.uiCharacterToParticipantMap.set(char.id, participantId);
    });
  }

  /**
   * 设置战斗ID
   * @param battleId 战斗ID
   */
  setBattleId(battleId: string) {
    this.battleId.value = battleId;
  }

  /**
   * 同步战斗状态
   */
  syncBattleState() {
    if (!this.battleId.value) {
      return;
    }

    try {
      const battleState = this.battleSystem.getBattleState(this.battleId.value);
      if (!battleState) {
        // 战斗不存在时，重置状态
        this.resetState();
        return;
      }

      // 同步战斗活跃状态
      this.isBattleActive.value = battleState.isActive;

      // 同步回合数
      if (battleState.currentTurn !== undefined) {
        this.currentTurn.value = battleState.currentTurn + 1; // 转换为从1开始的回合数
      }

      // 同步当前行动者
      if (battleState.currentTurn < battleState.turnOrder.length) {
        const currentParticipantId = battleState.turnOrder[battleState.currentTurn];
        this.currentActorId.value = currentParticipantId;
      }

      // 同步参与者状态
      this.syncParticipantsState(battleState);

      // 检查战斗是否结束
      if (!battleState.isActive) {
        this.handleBattleEnd();
      }
    } catch (error) {
      console.error('同步战斗状态时出错:', error);
      // 出错后重置状态
      this.resetState();
    }
  }

  /**
   * 同步参与者状态
   * @param battleState 战斗状态
   */
  private syncParticipantsState(battleState: BattleState) {
    // 遍历所有参与者
    battleState.participants.forEach((participant: BattleParticipant) => {
      // 查找对应的UI角色
      const character = this.findUICharacter(participant.id);
      if (character) {
        // 更新角色状态
        this.updateCharacterState(character, participant);
      }
    });

    // 使用不可变数据模式更新队伍
    this.allyTeam.value = [...this.allyTeam.value];
    this.enemyTeam.value = [...this.enemyTeam.value];
  }

  /**
   * 查找UI角色
   * @param participantId 参与者ID
   * @returns UI角色或undefined
   */
  private findUICharacter(participantId: string): UIBattleCharacter | undefined {
    // 优先使用映射表查找
    const mappedCharacter = this.participantToUICharacterMap.get(participantId);
    if (mappedCharacter) {
      return mappedCharacter;
    }
    
    // 映射表未找到时，尝试回退方案：遍历所有角色查找匹配的原始ID
    return (
      this.allyTeam.value.find(c => c.originalId === participantId) ||
      this.enemyTeam.value.find(e => e.originalId === participantId)
    );
  }

  /**
   * 更新角色状态
   * @param character UI角色
   * @param participant 战斗参与者
   */
  private updateCharacterState(character: UIBattleCharacter, participant: BattleParticipant) {
    // 使用新的转换方法创建更新后的UI角色
    const updatedCharacter = GameDataProcessor.participantToUIBattleCharacter(participant);
    
    // 保留原有的UI特定属性
    updatedCharacter.enabled = character.enabled;
    updatedCharacter.isFirst = character.isFirst;
    updatedCharacter.originalId = character.originalId;
    updatedCharacter.id = character.id;
    
    // 更新角色属性
    Object.assign(character, updatedCharacter);
  }

  /**
   * 处理战斗结束
   */
  private handleBattleEnd() {
    this.isBattleActive.value = false;
    // 可以添加战斗结束的额外逻辑
  }

  /**
   * 重置状态
   */
  resetState() {
    this.currentActorId.value = null;
    this.currentTurn.value = 1;
    this.isBattleActive.value = false;
  }

  /**
   * 手动更新角色状态
   * @param characterId 角色ID
   * @param updates 更新内容
   */
  updateCharacterManually(characterId: string, updates: Partial<UIBattleCharacter>) {
    const character = this.findUICharacter(characterId);
    if (character) {
      // 更新角色属性
      Object.assign(character, updates);

      // 使用不可变数据模式更新队伍
      this.allyTeam.value = [...this.allyTeam.value];
      this.enemyTeam.value = [...this.enemyTeam.value];

      // 同步到核心战斗系统
      if (this.battleId.value) {
        try {
          const participantId = this.getParticipantId(characterId);
          if (participantId) {
            this.battleSystem.updateParticipant(this.battleId.value, participantId, updates);
          }
        } catch (error) {
          console.error('同步手动更新到战斗系统时出错:', error);
        }
      }
    }
  }

  /**
   * 获取参与者ID
   * @param characterId 角色ID
   * @returns 参与者ID
   */
  private getParticipantId(characterId: string): string | null {
    // 优先使用映射表查找
    const mappedParticipantId = this.uiCharacterToParticipantMap.get(characterId);
    if (mappedParticipantId) {
      return mappedParticipantId;
    }
    
    // 映射表未找到时，尝试回退方案
    const character = this.allyTeam.value.find(c => c.id === characterId) ||
                     this.enemyTeam.value.find(e => e.id === characterId);
    
    if (character) {
      // 如果角色有原始ID，直接使用
      if (character.originalId) {
        return character.originalId;
      }
      // 否则根据队伍类型生成
      const isAlly = this.allyTeam.value.some(c => c.id === characterId);
      return isAlly ? `character_${characterId}` : `enemy_${characterId}`;
    }
    
    return null;
  }
}
