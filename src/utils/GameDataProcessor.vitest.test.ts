/**
 * 游戏数据处理工具类 Vitest 测试文件
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

describe('GameDataProcessor', () => {
  let processor: GameDataProcessor;

  beforeEach(() => {
    processor = new GameDataProcessor(testConfig);
  });

  describe('基础功能', () => {
    it('应该能够查找敌人数据', () => {
      const enemy = processor.findEnemyById("enemy_001_easy_1");
      expect(enemy).toBeDefined();
      expect(enemy?.name).toBe("花妖");
    });

    it('应该能够搜索敌人', () => {
      const enemies = processor.searchEnemiesByName("花妖");
      expect(enemies.length).toBeGreaterThan(0);
      expect(enemies.some(e => e.name.includes("花妖"))).toBe(true);
    });

    it('应该能够创建战斗角色', () => {
      const enemy = processor.findEnemyById("enemy_001_easy_1");
      expect(enemy).toBeDefined();
      
      if (enemy) {
        const character = processor.createBattleCharacter(enemy, 0);
        expect(character.id).toBe("char_1");
        expect(character.name).toBe("花妖");
        expect(character.currentHp).toBe(enemy.stats.health);
      }
    });

    it('应该能够获取场景数据', () => {
      const scene = processor.findSceneById("scene_001");
      expect(scene).toBeDefined();
      expect(scene?.name).toBe("小花山");
    });

    it('应该能够获取场景敌人', () => {
      const enemies = processor.getSceneEnemies("scene_001", "easy");
      expect(enemies.length).toBeGreaterThan(0);
    });
  });

  describe('数据处理功能', () => {
    it('应该能够过滤活跃角色', () => {
      const enemy = processor.findEnemyById("enemy_001_easy_1");
      expect(enemy).toBeDefined();
      
      if (enemy) {
        const characters = [
          processor.createBattleCharacter(enemy, 0),
          processor.createBattleCharacter(enemy, 1),
          processor.createBattleCharacter(enemy, 2)
        ];
        
        characters[1].enabled = false;
        const activeChars = processor.filterActiveCharacters(characters);
        
        expect(activeChars.length).toBe(2);
        expect(activeChars.every(char => char.enabled)).toBe(true);
      }
    });

    it('应该能够计算属性', () => {
      const enemy = processor.findEnemyById("enemy_001_easy_1");
      expect(enemy).toBeDefined();
      
      if (enemy) {
        const character = processor.createBattleCharacter(enemy, 0);
        const hpPercent = processor.getHpPercent(character);
        const finalAttack = processor.calculateFinalStat(character, 'attack');
        
        expect(hpPercent).toBe(100);
        expect(finalAttack).toBe(character.attack);
      }
    });

    it('应该能够验证数据', () => {
      const enemy = processor.findEnemyById("enemy_001_easy_1");
      expect(enemy).toBeDefined();
      
      if (enemy) {
        const character = processor.createBattleCharacter(enemy, 0);
        const validation = processor.validateBattleCharacter(character);
        
        expect(validation.isValid).toBe(true);
        expect(validation.errors.length).toBe(0);
      }
    });

    it('应该能够分组数据', () => {
      const grouped = processor.groupEnemiesByScene();
      expect(Array.isArray(grouped)).toBe(true);
      expect(grouped.length).toBeGreaterThan(0);
    });
  });

  describe('错误处理', () => {
    it('查找不存在的敌人应该返回undefined', () => {
      const enemy = processor.findEnemyById("non_existent_id");
      expect(enemy).toBeUndefined();
    });

    it('应该能够验证无效数据', () => {
      const invalidCharacter = {
        id: "",
        name: "",
        level: -1,
        maxHp: 0,
        currentHp: -10,
        attack: -5,
        defense: -3,
        speed: -1
      };
      
      const validation = processor.validateBattleCharacter(invalidCharacter as any);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('空搜索应该返回数组', () => {
      const result = processor.searchEnemiesByName("");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('缓存功能', () => {
    it('应该能够缓存数据', () => {
      const enemy1 = processor.findEnemyById("enemy_001_easy_1");
      const enemy2 = processor.findEnemyById("enemy_001_easy_1");
      
      expect(enemy1).toBe(enemy2);
    });

    it('清除缓存后应该仍能获取数据', () => {
      processor.clearCache();
      const enemy = processor.findEnemyById("enemy_001_easy_1");
      expect(enemy).toBeDefined();
    });
  });

  describe('批量处理', () => {
    it('应该能够批量创建战斗角色', () => {
      const testEnemies = Array(10).fill(null).map((_, index) => ({
        id: `test_enemy_${index}`,
        name: `测试敌人${index}`,
        level: 1,
        stats: {
          health: 100,
          minAttack: 10,
          maxAttack: 20,
          defense: 5,
          speed: 10
        },
        drops: [],
        skills: {}
      }));
      
      const characters = processor.createBattleCharacters(testEnemies);
      expect(characters.length).toBe(testEnemies.length);
    });
  });

  describe('性能', () => {
    it('查找操作应该高效', () => {
      const startTime = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        processor.findEnemyById("enemy_001_easy_1");
      }
      
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(100); // 应在100ms内完成
    });
  });
});