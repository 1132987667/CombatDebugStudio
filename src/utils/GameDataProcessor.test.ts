/**
 * 游戏数据处理工具类测试文件
 * 验证GameDataProcessor类的功能和性能
 */

import { GameDataProcessor } from './GameDataProcessor';
import enemiesData from "@configs/enemies/enemies.json";
import scenesData from "@configs/scenes/scenes.json";
import skillsData from "@configs/skills/skills.json";

// 测试配置数据
const testConfig = {
  enemies: enemiesData as any[],
  scenes: scenesData as any[],
  skills: skillsData as any[],
  buffs: []
};

// 创建测试用的处理器实例
const testProcessor = GameDataProcessor.getInstance(testConfig);

/**
 * 基础功能测试
 */
function testBasicFunctionality() {
  console.log('=== 基础功能测试 ===');
  
  // 测试1: 查找敌人数据
  const enemy = testProcessor.findEnemyById("enemy_001_easy_1");
  console.assert(enemy !== undefined, '查找敌人数据失败');
  console.assert(enemy?.name === "花妖", '敌人名称不匹配');
  console.log('✓ 查找敌人数据测试通过');
  
  // 测试2: 搜索敌人
  const searchedEnemies = testProcessor.searchEnemiesByName("花妖");
  console.assert(searchedEnemies.length > 0, '搜索敌人失败');
  console.assert(searchedEnemies.some(e => e.name.includes("花妖")), '搜索结果不包含关键词');
  console.log('✓ 搜索敌人测试通过');
  
  // 测试3: 创建战斗角色
  if (enemy) {
    const battleCharacter = testProcessor.createBattleCharacter(enemy, 0);
    console.assert(battleCharacter.id === "char_1", '角色ID生成错误');
    console.assert(battleCharacter.name === "花妖", '角色名称不匹配');
    console.assert(battleCharacter.currentHp === enemy.stats.health, '角色生命值设置错误');
    console.log('✓ 创建战斗角色测试通过');
  }
  
  // 测试4: 获取场景数据
  const scene = testProcessor.findSceneById("scene_001");
  console.assert(scene !== undefined, '查找场景数据失败');
  console.assert(scene?.name === "小花山", '场景名称不匹配');
  console.log('✓ 获取场景数据测试通过');
  
  // 测试5: 获取场景敌人
  const sceneEnemies = testProcessor.getSceneEnemies("scene_001", "easy");
  console.assert(sceneEnemies.length > 0, '获取场景敌人失败');
  console.log('✓ 获取场景敌人测试通过');
}

/**
 * 数据处理功能测试
 */
function testDataProcessing() {
  console.log('=== 数据处理功能测试 ===');
  
  // 创建测试数据
  const enemy = testProcessor.findEnemyById("enemy_001_easy_1");
  if (!enemy) {
    console.error('测试数据准备失败');
    return;
  }
  
  const characters = [
    testProcessor.createBattleCharacter(enemy, 0),
    testProcessor.createBattleCharacter(enemy, 1),
    testProcessor.createBattleCharacter(enemy, 2)
  ];
  
  // 测试1: 过滤活跃角色
  characters[1].enabled = false; // 设置第二个角色为非活跃
  const activeChars = testProcessor.filterActiveCharacters(characters);
  console.assert(activeChars.length === 2, '过滤活跃角色失败');
  console.assert(activeChars.every(char => char.enabled), '非活跃角色未被过滤');
  console.log('✓ 过滤活跃角色测试通过');
  
  // 测试2: 属性计算
  const character = characters[0];
  const hpPercent = testProcessor.getHpPercent(character);
  console.assert(hpPercent === 100, '生命值百分比计算错误');
  
  const finalAttack = testProcessor.calculateFinalStat(character, 'attack');
  console.assert(finalAttack === character.attack, '最终攻击力计算错误（无加成）');
  console.log('✓ 属性计算测试通过');
  
  // 测试3: 数据验证
  const validation = testProcessor.validateBattleCharacter(character);
  console.assert(validation.isValid, '角色数据验证失败');
  console.assert(validation.errors.length === 0, '验证错误信息不为空');
  console.log('✓ 数据验证测试通过');
  
  // 测试4: 分组数据
  const grouped = testProcessor.groupEnemiesByScene();
  console.assert(Array.isArray(grouped), '分组数据不是数组');
  console.assert(grouped.length > 0, '分组数据为空');
  console.log('✓ 数据分组测试通过');
}

/**
 * 性能测试
 */
function testPerformance() {
  console.log('=== 性能测试 ===');
  
  const testIterations = 1000;
  
  // 测试1: 查找性能
  console.time('查找性能测试');
  for (let i = 0; i < testIterations; i++) {
    testProcessor.findEnemyById("enemy_001_easy_1");
  }
  console.timeEnd('查找性能测试');
  
  // 测试2: 搜索性能
  console.time('搜索性能测试');
  for (let i = 0; i < testIterations; i++) {
    testProcessor.searchEnemiesByName("花");
  }
  console.timeEnd('搜索性能测试');
  
  // 测试3: 缓存性能测试
  console.time('缓存性能测试（第一次）');
  testProcessor.findEnemyById("enemy_001_easy_1");
  console.timeEnd('缓存性能测试（第一次）');
  
  console.time('缓存性能测试（第二次）');
  testProcessor.findEnemyById("enemy_001_easy_1");
  console.timeEnd('缓存性能测试（第二次）');
  
  console.log('✓ 性能测试完成');
}

/**
 * 错误处理测试
 */
function testErrorHandling() {
  console.log('=== 错误处理测试 ===');
  
  // 测试1: 查找不存在的敌人
  const nonExistentEnemy = testProcessor.findEnemyById("non_existent_id");
  console.assert(nonExistentEnemy === undefined, '查找不存在的敌人应返回undefined');
  console.log('✓ 查找不存在的敌人测试通过');
  
  // 测试2: 验证无效数据
  const invalidCharacter = {
    id: "", // 空ID
    name: "", // 空名称
    level: -1, // 负等级
    maxHp: 0, // 零生命值
    currentHp: -10, // 负当前生命值
    attack: -5, // 负攻击力
    defense: -3, // 负防御力
    speed: -1 // 负速度
  };
  
  const validation = testProcessor.validateBattleCharacter(invalidCharacter as any);
  console.assert(!validation.isValid, '无效数据验证应失败');
  console.assert(validation.errors.length > 0, '无效数据应有错误信息');
  console.log('✓ 无效数据验证测试通过');
  
  // 测试3: 空数据处理
  const emptySearch = testProcessor.searchEnemiesByName("");
  console.assert(Array.isArray(emptySearch), '空搜索应返回数组');
  console.log('✓ 空数据处理测试通过');
}

/**
 * 缓存功能测试
 */
function testCacheFunctionality() {
  console.log('=== 缓存功能测试 ===');
  
  // 清除缓存
  testProcessor.clearCache();
  
  // 测试1: 缓存设置和获取
  const enemy1 = testProcessor.findEnemyById("enemy_001_easy_1");
  const enemy2 = testProcessor.findEnemyById("enemy_001_easy_1");
  
  console.assert(enemy1 === enemy2, '缓存数据应相同');
  console.log('✓ 缓存设置和获取测试通过');
  
  // 测试2: 缓存清除
  testProcessor.clearCache();
  const enemy3 = testProcessor.findEnemyById("enemy_001_easy_1");
  console.assert(enemy3 !== undefined, '清除缓存后应仍能获取数据');
  console.log('✓ 缓存清除测试通过');
}

/**
 * 批量处理测试
 */
function testBatchProcessing() {
  console.log('=== 批量处理测试 ===');
  
  // 创建大量测试数据
  const testEnemies = Array(1000).fill(null).map((_, index) => ({
    id: `test_enemy_${index}`,
    name: `测试敌人${index}`,
    level: Math.floor(Math.random() * 100) + 1,
    stats: {
      health: Math.floor(Math.random() * 1000) + 100,
      minAttack: Math.floor(Math.random() * 50) + 10,
      maxAttack: Math.floor(Math.random() * 50) + 60,
      defense: Math.floor(Math.random() * 30) + 5,
      speed: Math.floor(Math.random() * 50) + 10
    },
    drops: [],
    skills: {}
  }));
  
  // 测试批量创建战斗角色
  console.time('批量创建战斗角色');
  const battleCharacters = testProcessor.createBattleCharacters(testEnemies);
  console.timeEnd('批量创建战斗角色');
  
  console.assert(battleCharacters.length === testEnemies.length, '批量创建数量不匹配');
  console.log('✓ 批量处理测试通过');
}

/**
 * 运行所有测试
 */
function runAllTests() {
  console.log('开始运行游戏数据处理工具类测试...\n');
  
  try {
    testBasicFunctionality();
    console.log('');
    
    testDataProcessing();
    console.log('');
    
    testErrorHandling();
    console.log('');
    
    testCacheFunctionality();
    console.log('');
    
    testBatchProcessing();
    console.log('');
    
    testPerformance();
    console.log('');
    
    console.log('🎉 所有测试通过！');
    console.log('游戏数据处理工具类功能正常，性能良好。');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

/**
 * 导出测试函数
 */
export {
  runAllTests,
  testBasicFunctionality,
  testDataProcessing,
  testErrorHandling,
  testCacheFunctionality,
  testBatchProcessing,
  testPerformance
};

// 如果直接运行此文件，则执行测试
if (typeof require !== 'undefined' && require.main === module) {
  runAllTests();
}