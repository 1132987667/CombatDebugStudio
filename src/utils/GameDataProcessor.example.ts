/**
 * 游戏数据处理工具类使用示例
 * 展示如何使用GameDataProcessor类来简化数据操作
 */

import { GameDataProcessor } from './GameDataProcessor';

// 示例配置数据
const exampleConfig = {
  enemies: [
    {
      id: "enemy_001_easy_1",
      name: "花妖",
      level: 1,
      stats: {
        health: 57,
        minAttack: 6,
        maxAttack: 9,
        defense: 3,
        speed: 11
      },
      drops: [],
      skills: {
        small: "skill_enemy_001_easy_1_small"
      }
    }
  ],
  skills: [
    {
      id: "skill_enemy_001_easy_1_small",
      name: "花粉迷雾",
      mpCost: 5,
      cooldown: 2,
      selector: "single_enemy",
      actions: []
    }
  ],
  scenes: [
    {
      id: "scene_001",
      name: "小花山",
      background: "花果山外围，花妖草精遍布，是初出茅庐的修仙者试炼之地。",
      difficulties: {
        easy: {
          enemyIds: ["enemy_001_easy_1", "enemy_001_easy_2", "enemy_001_easy_3"]
        }
      },
      requiredLevel: 1,
      rewards: {
        exp: 100,
        gold: 200
      }
    }
  ],
  buffs: []
};

// 创建处理器实例
const gameDataProcessor = new GameDataProcessor(exampleConfig);

/**
 * 示例1: 查找敌人数据
 */
function exampleFindEnemy() {
  const enemy = gameDataProcessor.findEnemyById("enemy_001_easy_1");
  console.log('找到敌人:', enemy?.name);
}

/**
 * 示例2: 搜索敌人
 */
function exampleSearchEnemies() {
  const enemies = gameDataProcessor.searchEnemiesByName("花妖");
  console.log('搜索到的敌人:', enemies.map(e => e.name));
}

/**
 * 示例3: 创建战斗角色
 */
function exampleCreateBattleCharacter() {
  const enemy = gameDataProcessor.findEnemyById("enemy_001_easy_1");
  if (enemy) {
    const battleCharacter = gameDataProcessor.createBattleCharacter(enemy, 0);
    console.log('创建的战斗角色:', battleCharacter);
  }
}

/**
 * 示例4: 获取场景敌人
 */
function exampleGetSceneEnemies() {
  const enemies = gameDataProcessor.getSceneEnemies("scene_001", "easy");
  console.log('场景敌人:', enemies.map(e => e.name));
}

/**
 * 示例5: 批量处理数据
 */
function exampleBatchProcessing() {
  const enemies = gameDataProcessor.searchEnemiesByName("");
  const battleCharacters = gameDataProcessor.createBattleCharacters(enemies);
  const activeCharacters = gameDataProcessor.filterActiveCharacters(battleCharacters);
  
  console.log('总敌人数量:', enemies.length);
  console.log('战斗角色数量:', battleCharacters.length);
  console.log('活跃角色数量:', activeCharacters.length);
}

/**
 * 示例6: 属性计算
 */
function exampleStatCalculation() {
  const enemy = gameDataProcessor.findEnemyById("enemy_001_easy_1");
  if (enemy) {
    const character = gameDataProcessor.createBattleCharacter(enemy, 0);
    const finalAttack = gameDataProcessor.calculateFinalStat(character, 'attack');
    const hpPercent = gameDataProcessor.getHpPercent(character);
    
    console.log('最终攻击力:', finalAttack);
    console.log('生命值百分比:', hpPercent);
  }
}

/**
 * 示例7: 数据验证
 */
function exampleValidation() {
  const enemy = gameDataProcessor.findEnemyById("enemy_001_easy_1");
  if (enemy) {
    const character = gameDataProcessor.createBattleCharacter(enemy, 0);
    const validation = gameDataProcessor.validateBattleCharacter(character);
    
    console.log('验证结果:', validation.isValid ? '通过' : '失败');
    if (!validation.isValid) {
      console.log('错误信息:', validation.errors);
    }
  }
}

/**
 * 示例8: 分组数据
 */
function exampleGrouping() {
  const grouped = gameDataProcessor.groupEnemiesByScene();
  console.log('分组数据:');
  grouped.forEach(group => {
    console.log(`场景: ${group.scene.name}, 敌人数量: ${group.enemies.length}`);
  });
}

/**
 * 示例9: 搜索和过滤
 */
function exampleSearchAndFilter() {
  const result = gameDataProcessor.searchAndFilterEnemies("花妖", "scene_001");
  console.log('搜索结果:');
  console.log('所有敌人:', result.all.map(e => e.name));
  console.log('分组敌人:', result.grouped.map(g => g.scene.name));
}

/**
 * 运行所有示例
 */
function runAllExamples() {
  console.log('=== 游戏数据处理工具类使用示例 ===');
  
  exampleFindEnemy();
  exampleSearchEnemies();
  exampleCreateBattleCharacter();
  exampleGetSceneEnemies();
  exampleBatchProcessing();
  exampleStatCalculation();
  exampleValidation();
  exampleGrouping();
  exampleSearchAndFilter();
  
  console.log('=== 示例运行完成 ===');
}

// 导出示例函数供外部使用
export {
  gameDataProcessor,
  runAllExamples,
  exampleFindEnemy,
  exampleSearchEnemies,
  exampleCreateBattleCharacter,
  exampleGetSceneEnemies,
  exampleBatchProcessing,
  exampleStatCalculation,
  exampleValidation,
  exampleGrouping,
  exampleSearchAndFilter
};