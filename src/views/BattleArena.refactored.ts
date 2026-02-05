/**
 * BattleArena.vue 重构示例
 * 展示如何使用GameDataProcessor来简化数据操作
 */

import { GameDataProcessor } from '@/utils/GameDataProcessor';
import enemiesData from "@configs/enemies/enemies.json";
import scenesData from "@configs/scenes/scenes.json";
import skillsData from "@configs/skills/skills.json";

// 创建游戏数据处理器实例
const gameDataProcessor = new GameDataProcessor({
  enemies: enemiesData as any[],
  scenes: scenesData as any[],
  skills: skillsData as any[],
  buffs: [] // 可以根据需要添加buff数据
});

// 重构后的数据操作方法示例

/**
 * 重构：创建初始角色数据
 * 替换原有的重复的map和slice操作
 */
function createInitialCharacters() {
  const initialEnemies = enemiesData.slice(0, 4) as any[];
  return gameDataProcessor.createBattleCharacters(initialEnemies, 0, false);
}

/**
 * 重构：创建敌方队伍
 * 替换原有的重复的map操作
 */
function createEnemyParty() {
  const enemyData = enemiesData.slice(4, 6) as any[];
  return gameDataProcessor.createBattleCharacters(enemyData, 0, true);
}

/**
 * 重构：过滤活跃角色
 * 替换原有的filter操作
 */
function getActiveCharacters(characters: any[]) {
  return gameDataProcessor.filterActiveCharacters(characters);
}

/**
 * 重构：根据ID查找角色
 * 替换原有的重复的find操作
 */
function findCharacterById(characters: any[], enemyParty: any[], characterId: string) {
  return gameDataProcessor.findCharacterById(characters, enemyParty, characterId);
}

/**
 * 重构：根据原始ID查找敌人数据
 * 替换原有的重复的find操作
 */
function findEnemyByOriginalId(originalId: string) {
  return gameDataProcessor.findEnemyById(originalId);
}

/**
 * 重构：获取角色技能信息
 * 替换原有的重复的find操作
 */
function getCharacterSkills(character: any) {
  return gameDataProcessor.getCharacterSkills(character);
}

/**
 * 重构：计算属性加成
 * 替换原有的重复的filter和计算操作
 */
function calculateStatBonus(character: any, stat: string) {
  return gameDataProcessor.calculateStatBonus(character, stat);
}

/**
 * 重构：计算最终属性值
 * 替换原有的重复的计算操作
 */
function calculateFinalStat(character: any, stat: string) {
  return gameDataProcessor.calculateFinalStat(character, stat);
}

/**
 * 重构：获取生命值百分比
 * 替换原有的重复的计算操作
 */
function getHpPercent(character: any) {
  return gameDataProcessor.getHpPercent(character);
}

/**
 * 重构：获取生命值颜色类别
 * 替换原有的重复的计算操作
 */
function getHpColorClass(character: any) {
  return gameDataProcessor.getHpColorClass(character);
}

/**
 * 重构：搜索和过滤敌人数据
 * 替换原有的重复的filter和map操作
 */
function searchAndFilterEnemies(searchQuery: string, sceneId?: string) {
  return gameDataProcessor.searchAndFilterEnemies(searchQuery, sceneId);
}

/**
 * 重构：分组场景敌人数据
 * 替换原有的重复的map和filter操作
 */
function groupEnemiesByScene() {
  return gameDataProcessor.groupEnemiesByScene();
}

/**
 * 重构：添加敌人到战斗
 * 使用工具类简化操作
 */
function addEnemyToBattle(enemyData: any, side: "our" | "enemy" = "our") {
  const newCharacter = gameDataProcessor.createBattleCharacter(
    enemyData, 
    Date.now(), 
    side === "enemy"
  );
  
  // 验证角色数据
  const validation = gameDataProcessor.validateBattleCharacter(newCharacter);
  if (!validation.isValid) {
    console.warn('角色数据验证失败:', validation.errors);
  }
  
  return newCharacter;
}

/**
 * 重构：获取可注入的状态效果
 * 使用工具类统一管理
 */
function getInjectableStatuses() {
  return gameDataProcessor.getInjectableStatuses();
}

/**
 * 重构：移动角色位置
 * 使用工具类简化操作
 */
function moveCharacter(characters: any[], selectedCharacterId: string, direction: number) {
  const enabledChars = gameDataProcessor.filterActiveCharacters(characters);
  const currentIndex = enabledChars.findIndex(c => c.id === selectedCharacterId);
  
  if (currentIndex < 0) return characters;
  
  const newIndex = currentIndex + direction;
  if (newIndex < 0 || newIndex >= enabledChars.length) return characters;
  
  const targetChar = enabledChars[newIndex];
  const currentChar = enabledChars[currentIndex];
  const idx1 = characters.indexOf(currentChar);
  const idx2 = characters.indexOf(targetChar);
  
  // 创建新数组避免直接修改
  const newCharacters = [...characters];
  newCharacters[idx1] = targetChar;
  newCharacters[idx2] = currentChar;
  
  return newCharacters;
}

/**
 * 重构：批量处理角色数据
 * 使用工具类提高性能
 */
function batchProcessCharacters(
  characters: any[], 
  processor: (char: any) => any,
  onProgress?: (processed: number, total: number) => void
) {
  return gameDataProcessor.batchProcess(characters, processor, 100, onProgress);
}

/**
 * 重构：验证战斗状态
 * 使用工具类进行数据验证
 */
function validateBattleState(battleCharacters: any[], enemyParty: any[]) {
  const allCharacters = [...battleCharacters, ...enemyParty];
  const results = allCharacters.map(char => 
    gameDataProcessor.validateBattleCharacter(char)
  );
  
  const isValid = results.every(result => result.isValid);
  const errors = results.flatMap(result => result.errors);
  
  return { isValid, errors };
}

/**
 * 重构：导出战斗状态
 * 使用工具类进行数据转换
 */
function exportBattleState(battleCharacters: any[], enemyParty: any[], currentTurn: number, rules: any, battleLogs: any[]) {
  // 验证数据
  const validation = validateBattleState(battleCharacters, enemyParty);
  if (!validation.isValid) {
    console.warn('导出数据验证失败:', validation.errors);
  }
  
  const state = {
    battleCharacters: battleCharacters.map(char => ({
      ...char,
      // 确保只导出必要字段
      id: char.id,
      name: char.name,
      level: char.level,
      currentHp: char.currentHp,
      maxHp: char.maxHp,
      currentMp: char.currentMp,
      maxMp: char.maxMp,
      attack: char.attack,
      defense: char.defense,
      speed: char.speed,
      buffs: char.buffs
    })),
    enemyParty: enemyParty.map(enemy => ({
      ...enemy,
      // 确保只导出必要字段
      id: enemy.id,
      name: enemy.name,
      level: enemy.level,
      currentHp: enemy.currentHp,
      maxHp: enemy.maxHp,
      currentMp: enemy.currentMp,
      maxMp: enemy.maxMp,
      attack: enemy.attack,
      defense: enemy.defense,
      speed: enemy.speed,
      buffs: enemy.buffs
    })),
    currentTurn,
    rules,
    battleLogs
  };
  
  return JSON.stringify(state, null, 2);
}

/**
 * 重构：导入战斗状态
 * 使用工具类进行数据验证和转换
 */
function importBattleState(jsonString: string) {
  try {
    const state = JSON.parse(jsonString);
    
    // 验证导入的数据
    const validation = validateBattleState(state.battleCharacters || [], state.enemyParty || []);
    if (!validation.isValid) {
      throw new Error(`导入数据验证失败: ${validation.errors.join(', ')}`);
    }
    
    return state;
  } catch (error) {
    console.error('导入战斗状态失败:', error);
    throw error;
  }
}

/**
 * 重构：清除缓存
 * 使用工具类管理缓存
 */
function clearDataCache() {
  gameDataProcessor.clearCache();
}

// 导出重构后的函数
export {
  gameDataProcessor,
  createInitialCharacters,
  createEnemyParty,
  getActiveCharacters,
  findCharacterById,
  findEnemyByOriginalId,
  getCharacterSkills,
  calculateStatBonus,
  calculateFinalStat,
  getHpPercent,
  getHpColorClass,
  searchAndFilterEnemies,
  groupEnemiesByScene,
  addEnemyToBattle,
  getInjectableStatuses,
  moveCharacter,
  batchProcessCharacters,
  validateBattleState,
  exportBattleState,
  importBattleState,
  clearDataCache
};

/**
 * 使用示例
 */
function demonstrateRefactoredUsage() {
  console.log('=== 重构后的数据操作示例 ===');
  
  // 1. 创建初始角色
  const initialCharacters = createInitialCharacters();
  console.log('初始角色数量:', initialCharacters.length);
  
  // 2. 创建敌方队伍
  const enemyParty = createEnemyParty();
  console.log('敌方队伍数量:', enemyParty.length);
  
  // 3. 获取活跃角色
  const activeChars = getActiveCharacters(initialCharacters);
  console.log('活跃角色数量:', activeChars.length);
  
  // 4. 查找角色
  if (initialCharacters.length > 0) {
    const char = findCharacterById(initialCharacters, enemyParty, initialCharacters[0].id);
    console.log('找到角色:', char?.name);
  }
  
  // 5. 计算属性
  if (initialCharacters.length > 0) {
    const finalAttack = calculateFinalStat(initialCharacters[0], 'attack');
    console.log('最终攻击力:', finalAttack);
  }
  
  // 6. 验证数据
  const validation = validateBattleState(initialCharacters, enemyParty);
  console.log('数据验证:', validation.isValid ? '通过' : '失败');
  
  console.log('=== 示例完成 ===');
}