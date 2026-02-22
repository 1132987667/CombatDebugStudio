import { ref, computed } from 'vue';
import type { IBattleSystem } from '@/core/battle/interfaces';
import type { BattleState, BattleParticipant, ParticipantSide } from '@/types/battle';
import type { UIBattleCharacter } from '@/types';
import { GameDataProcessor } from '@/utils/GameDataProcessor';
import { PARTICIPANT_SIDE } from '@/types/battle';
import { useCharacterStore } from '@/stores/characterStore';
import { eventBus } from '@/main';

/**
 * 战斗状态管理器
 * 负责从BattleSystem获取状态，转换为UI角色状态，并管理状态同步
 * 注意：不再存储队伍数据，只通过映射表关联参与者和UI角色
 */
export class BattleStateManager {
  private battleSystem: IBattleSystem;
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
    
    // 监听队伍数据变化事件
    eventBus.on('teamDataChanged', () => {
      // 重新初始化队伍映射关系
      this.initializeTeams();
    });
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
   * 从 characterStore 获取启用的队伍数据
   */
  initializeTeams() {
    // 清空映射表
    this.participantToUICharacterMap.clear();
    this.uiCharacterToParticipantMap.clear();
    
    // 从 characterStore 获取启用的队伍数据
    const characterStore = useCharacterStore();
    const allyTeam = Array.from(characterStore.allyTeam.values()).filter(c => c.enabled);
    const enemyTeam = Array.from(characterStore.enemyTeam.values()).filter(e => e.enabled);
    
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
  }

  /**
   * 查找UI角色
   * @param participantId 参与者ID
   * @returns UI角色或undefined
   */
  private findUICharacter(participantId: string): UIBattleCharacter | undefined {
    // 首先通过映射表查找
    let character = this.participantToUICharacterMap.get(participantId);
    
    // 如果映射表中找不到，直接从 characterStore 查找
    if (!character) {
      const characterStore = useCharacterStore();
      // 尝试在 allyTeam 中查找
      character = characterStore.allyTeam.get(participantId);
      // 尝试在 enemyTeam 中查找
      if (!character) {
        character = characterStore.enemyTeam.get(participantId);
      }
      // 如果找到，更新映射表
      if (character) {
        this.participantToUICharacterMap.set(participantId, character);
      }
    }
    
    return character;
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
    // 通过映射表查找
    return this.uiCharacterToParticipantMap.get(characterId) || null;
  }
}
