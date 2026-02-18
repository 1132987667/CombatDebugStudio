import { defineStore } from 'pinia';
import type { UIBattleCharacter } from '@/types';
import { PARTICIPANT_SIDE } from '@/types/battle';

interface CharacterState {
  allyTeam: Map<string, UIBattleCharacter>;
  enemyTeam: Map<string, UIBattleCharacter>;
  selectedCharacterId: string | null;
  currentTurn: number;
  maxTurns: number;
}

export const useCharacterStore = defineStore('character', {
  state: (): CharacterState => ({
    allyTeam: new Map(),
    enemyTeam: new Map(),
    selectedCharacterId: null,
    currentTurn: 1,
    maxTurns: 999,
  }),

  getters: {
    /**
     * 获取选中的角色
     */
    selectedChar: (state): UIBattleCharacter | null => {
      if (!state.selectedCharacterId) return null;
      return state.allyTeam.get(state.selectedCharacterId) ||
             state.enemyTeam.get(state.selectedCharacterId) ||
             null;
    },

    /**
     * 获取当前选中角色的名称
     */
    selectedCharName: (state): string => {
      if (!state.selectedCharacterId) return "未选择";
      const char = state.allyTeam.get(state.selectedCharacterId) ||
                   state.enemyTeam.get(state.selectedCharacterId);
      return char?.name || "未选择";
    },

    /**
     * 获取当前角色（用于技能冷却时间计算）
     */
    currentCharacter: (state): UIBattleCharacter | null => {
      if (!state.selectedCharacterId) return null;
      return state.allyTeam.get(state.selectedCharacterId) ||
             state.enemyTeam.get(state.selectedCharacterId) ||
             null;
    },

    /**
     * 获取攻击范围
     */
    attackRange: (state): { min: number; max: number } => {
      const char = state.allyTeam.get(state.selectedCharacterId!) ||
                   state.enemyTeam.get(state.selectedCharacterId!);
      if (!char) return { min: 0, max: 0 };
      return {
        min: char.minAttack || 0,
        max: char.maxAttack || 0,
      };
    },

    /**
     * 获取当前回合数
     */
    getCurrentTurn: (state): number => {
      return state.currentTurn;
    },

    /**
     * 获取队伍成员数量
     */
    getTeamCounts: (state): { ally: number; enemy: number } => {
      return {
        ally: Array.from(state.allyTeam.values()).filter(c => c.enabled).length,
        enemy: Array.from(state.enemyTeam.values()).filter(e => e.enabled).length,
      };
    },

    /**
     * 获取所有角色
     */
    getAllCharacters: (state): UIBattleCharacter[] => {
      return [...state.allyTeam.values(), ...state.enemyTeam.values()];
    },

    /**
     * 获取启用的角色
     */
    getEnabledCharacters: (state): UIBattleCharacter[] => {
      return [...Array.from(state.allyTeam.values()).filter(c => c.enabled), ...Array.from(state.enemyTeam.values()).filter(e => e.enabled)];
    },

    /**
     * 获取指定角色
     */
    getCharacterById: (state) => (characterId: string): UIBattleCharacter | undefined => {
      return state.allyTeam.get(characterId) ||
             state.enemyTeam.get(characterId);
    },
  },

  actions: {
    /**
     * 初始化队伍
     */
    initializeTeams(allyTeam: UIBattleCharacter[], enemyTeam: UIBattleCharacter[]) {
      const allyMap = new Map<string, UIBattleCharacter>();
      allyTeam.forEach(char => {
        allyMap.set(char.id, char);
      });
      this.allyTeam = allyMap;

      const enemyMap = new Map<string, UIBattleCharacter>();
      enemyTeam.forEach(char => {
        enemyMap.set(char.id, char);
      });
      this.enemyTeam = enemyMap;
    },

    /**
     * 更新角色状态
     */
    updateCharacterState(characterId: string, updates: Partial<UIBattleCharacter>) {
      const character = this.allyTeam.get(characterId);
      const enemy = this.enemyTeam.get(characterId);
      const target = character || enemy;
      
      if (target) {
        Object.assign(target, updates);
      }
    },

    /**
     * 批量更新角色状态
     */
    updateMultipleCharacters(updates: Array<{ id: string; data: Partial<UIBattleCharacter> }>) {
      updates.forEach(({ id, data }) => {
        this.updateCharacterState(id, data);
      });
    },

    /**
     * 选择角色
     */
    selectCharacter(charId: string) {
      this.selectedCharacterId = charId;
    },

    /**
     * 添加敌人到战斗
     */
    addEnemyToBattle(enemy: UIBattleCharacter, side: PARTICIPANT_SIDE = PARTICIPANT_SIDE.ALLY) {
      if (side === PARTICIPANT_SIDE.ALLY) {
        this.allyTeam.set(enemy.id, enemy);
      } else {
        this.enemyTeam.set(enemy.id, enemy);
      }
      this.selectCharacter(enemy.id);
    },

    /**
     * 从战斗中移除角色
     */
    removeCharacter(characterId: string) {
      this.allyTeam.delete(characterId);
      this.enemyTeam.delete(characterId);
      
      if (this.selectedCharacterId === characterId) {
        this.selectedCharacterId = null;
      }
    },

    /**
     * 移动角色位置
     */
    moveCharacter(direction: number) {
      if (!this.selectedCharacterId) return;

      const isAlly = this.allyTeam.has(this.selectedCharacterId);
      const team = isAlly ? this.allyTeam : this.enemyTeam;

      // 将Map转换为数组
      const teamArray = Array.from(team.values());
      const enabledChars = teamArray.filter((c) => c.enabled);
      const currentIndex = enabledChars.findIndex(
        (c) => c.id === this.selectedCharacterId
      );

      if (currentIndex < 0) return;
      
      const newIndex = currentIndex + direction;
      if (newIndex < 0 || newIndex >= enabledChars.length) return;

      const targetChar = enabledChars[newIndex];
      const currentChar = enabledChars[currentIndex];
      const idx1 = teamArray.indexOf(currentChar);
      const idx2 = teamArray.indexOf(targetChar);
      
      // 交换角色位置
      [teamArray[idx1], teamArray[idx2]] = [teamArray[idx2], teamArray[idx1]];

      // 将数组转换回Map
      const newTeamMap = new Map<string, UIBattleCharacter>();
      teamArray.forEach(char => {
        newTeamMap.set(char.id, char);
      });

      if (isAlly) {
        this.allyTeam = newTeamMap;
      } else {
        this.enemyTeam = newTeamMap;
      }
    },

    /**
     * 清空所有参与者
     */
    clearParticipants() {
      this.allyTeam.clear();
      this.enemyTeam.clear();
      this.selectedCharacterId = null;
      this.currentTurn = 1;
    },

    /**
     * 重置角色状态
     */
    resetCharacterStates() {
      // 重置角色状态到初始值
      this.allyTeam.forEach(char => {
        char.currentHp = typeof char.maxHp === 'object' && char.maxHp.value !== undefined ? char.maxHp.value : 0;
        char.currentEnergy = 0;
      });

      this.enemyTeam.forEach(enemy => {
        enemy.currentHp = typeof enemy.maxHp === 'object' && enemy.maxHp.value !== undefined ? enemy.maxHp.value : 0;
        enemy.currentEnergy = 0;
      });
    },



    /**
     * 更新回合数
     */
    updateTurn(turn: number) {
      this.currentTurn = turn;
    },

    /**
     * 增加回合数
     */
    incrementTurn() {
      this.currentTurn++;
    },

    /**
     * 减少回合数
     */
    decrementTurn() {
      if (this.currentTurn > 1) {
        this.currentTurn--;
      }
    },

    /**
     * 设置角色启用状态
     */
    setCharacterEnabled(characterId: string, enabled: boolean) {
      const character = this.allyTeam.get(characterId);
      const enemy = this.enemyTeam.get(characterId);
      const target = character || enemy;
      
      if (target) {
        target.enabled = enabled;
      }
    },

    /**
     * 批量设置角色启用状态
     */
    setMultipleCharactersEnabled(characterIds: string[], enabled: boolean) {
      characterIds.forEach(id => {
        this.setCharacterEnabled(id, enabled);
      });
    },
  },
});
