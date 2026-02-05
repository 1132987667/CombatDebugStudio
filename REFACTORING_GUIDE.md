# 数据处理工具类重构指南

## 概述

本指南说明如何将项目中重复的数据操作迁移到新的 `DataProcessor` 和 `GameDataProcessor` 工具类，以提高代码复用性、维护性和性能。

## 新工具类介绍

### DataProcessor
通用的数据处理工具类，提供基础的数据操作方法：
- `find` - 数据查找
- `filter` - 数据过滤和排序
- `map` - 数据转换
- `search` - 数据搜索（支持模糊匹配）
- `groupBy` - 数据分组
- `unique` - 数据去重
- `validate` - 数据验证
- `batchProcess` - 批量处理

### GameDataProcessor
游戏特定的数据处理工具类，封装了游戏相关的数据操作：
- 敌人数据管理
- 场景数据管理
- 技能数据管理
- 战斗角色管理
- 属性计算
- 数据验证

## 重构步骤

### 步骤1: 导入工具类

在需要使用数据操作的组件中导入工具类：

```typescript
import { GameDataProcessor } from '@/utils/GameDataProcessor';
import { DataProcessor } from '@/utils/DataProcessor';
```

### 步骤2: 创建处理器实例

在组件中创建处理器实例：

```typescript
const gameDataProcessor = new GameDataProcessor({
  enemies: enemiesData as any[],
  scenes: scenesData as any[],
  skills: skillsData as any[],
  buffs: [] // 根据需要添加
});
```

### 步骤3: 替换重复的数据操作

#### 3.1 替换 `find` 操作

**重构前：**
```typescript
const enemy = allEnemies.find((e) => e.id === char.originalId);
const character = battleCharacters.find((c) => c.id === characterId);
```

**重构后：**
```typescript
const enemy = gameDataProcessor.findEnemyById(char.originalId);
const character = gameDataProcessor.findCharacterById(battleCharacters, enemyParty, characterId);
```

#### 3.2 替换 `filter` 操作

**重构前：**
```typescript
const enabledChars = battleCharacters.filter((c) => c.enabled);
const filtered = enemies.filter((enemy) => 
  enemy.name.toLowerCase().includes(keyword)
);
```

**重构后：**
```typescript
const enabledChars = gameDataProcessor.filterActiveCharacters(battleCharacters);
const filtered = DataProcessor.search(enemies, {
  fields: ['name'],
  keyword: keyword,
  fuzzy: true
});
```

#### 3.3 替换 `map` 操作

**重构前：**
```typescript
const initialCharacters = allEnemies
  .slice(0, 4)
  .map((enemy, index) => createBattleCharacter(enemy, index));
```

**重构后：**
```typescript
const initialCharacters = gameDataProcessor.createBattleCharacters(allEnemies.slice(0, 4));
```

#### 3.4 替换属性计算操作

**重构前：**
```typescript
const getHpPercent = (char) => Math.max(0, (char.currentHp / char.maxHp) * 100);
const bonuses = char.buffs?.filter((b) => !b.isPositive) || [];
const finalStat = Math.floor(base * (1 + bonus / 100));
```

**重构后：**
```typescript
const hpPercent = gameDataProcessor.getHpPercent(char);
const bonus = gameDataProcessor.calculateStatBonus(char, 'attack');
const finalStat = gameDataProcessor.calculateFinalStat(char, 'attack');
```

## 具体文件重构示例

### BattleArena.vue 重构

#### 导入部分
```typescript
import { GameDataProcessor } from '@/utils/GameDataProcessor';
import enemiesData from "@configs/enemies/enemies.json";
import scenesData from "@configs/scenes/scenes.json";
import skillsData from "@configs/skills/skills.json";

// 创建处理器实例
const gameDataProcessor = new GameDataProcessor({
  enemies: enemiesData as any[],
  scenes: scenesData as any[],
  skills: skillsData as any[],
  buffs: []
});
```

#### 数据初始化部分
```typescript
// 重构前
const initialCharacters = allEnemies
  .slice(0, 4)
  .map((enemy, index) => createBattleCharacter(enemy, index));

const initialEnemies = allEnemies
  .slice(4, 6)
  .map((enemy, index) => createBattleCharacter(enemy, index));

// 重构后
const initialCharacters = gameDataProcessor.createBattleCharacters(
  allEnemies.slice(0, 4), 0, false
);

const initialEnemies = gameDataProcessor.createBattleCharacters(
  allEnemies.slice(4, 6), 0, true
);
```

#### 计算属性部分
```typescript
// 重构前
const ourParty = computed(() => {
  return battleCharacters
    .filter((c) => c.enabled)
    .sort((a, b) => b.speed - a.speed);
});

// 重构后
const ourParty = computed(() => {
  return gameDataProcessor.filterActiveCharacters(battleCharacters);
});
```

#### 方法重构
```typescript
// 重构前
const getCharPassive = (char: BattleCharacter | null): string => {
  if (!char) return "";
  const enemy = allEnemies.find((e) => e.id === char.originalId);
  return enemy?.skills?.passive || "";
};

// 重构后
const getCharPassive = (char: BattleCharacter | null): string => {
  if (!char) return "";
  const skills = gameDataProcessor.getCharacterSkills(char);
  return skills.passive?.name || "";
};
```

### DebugPanel.vue 重构

#### 导入部分
```typescript
import { GameDataProcessor } from '@/utils/GameDataProcessor';

// 使用全局处理器实例或创建新的实例
const gameDataProcessor = new GameDataProcessor({
  enemies: enemiesData as any[],
  scenes: scenesData as any[],
  skills: skillsData as any[],
  buffs: []
});
```

#### 方法重构
```typescript
// 重构前
const getEnemyData = (char: BattleCharacter | null) => {
  return (enemiesData as EnemyData[]).find((e) => e.id === char.originalId) || null;
};

// 重构后
const getEnemyData = (char: BattleCharacter | null) => {
  if (!char?.originalId) return null;
  return gameDataProcessor.findEnemyById(char.originalId);
};
```

### ParticipantPanel.vue 重构

#### 分组敌人数据
```typescript
// 重构前
const groupedEnemies = computed(() => {
  return scenes.value
    .map((scene) => {
      const sceneEnemies = allEnemies.filter((enemy) =>
        scene.difficulties.easy.enemyIds.includes(enemy.id) ||
        scene.difficulties.normal.enemyIds.includes(enemy.id) ||
        scene.difficulties.hard.enemyIds.includes(enemy.id)
      );
      return { scene, enemies: sceneEnemies };
    })
    .filter((group) => group.enemies.length > 0);
});

// 重构后
const groupedEnemies = computed(() => {
  return gameDataProcessor.groupEnemiesByScene();
});
```

## 性能优化建议

### 1. 启用缓存
```typescript
const gameDataProcessor = new GameDataProcessor({
  // ... 配置
}, {
  enableCache: true,
  cacheExpiry: 300000 // 5分钟
});
```

### 2. 批量处理大数据
```typescript
// 处理大量数据时使用批量处理
const processedData = DataProcessor.batchProcess(largeDataset, processor, 1000, 
  (processed, total) => {
    console.log(`处理进度: ${processed}/${total}`);
  }
);
```

### 3. 合理使用搜索选项
```typescript
// 精确搜索
const exactResults = DataProcessor.search(data, {
  fields: ['name'],
  keyword: searchTerm,
  fuzzy: false
});

// 模糊搜索
const fuzzyResults = DataProcessor.search(data, {
  fields: ['name'],
  keyword: searchTerm,
  fuzzy: true,
  threshold: 0.7 // 相似度阈值
});
```

## 测试和验证

### 1. 数据验证
使用工具类的验证功能确保数据质量：
```typescript
const validation = gameDataProcessor.validateBattleCharacter(character);
if (!validation.isValid) {
  console.warn('角色数据验证失败:', validation.errors);
}
```

### 2. 性能测试
比较重构前后的性能差异：
```typescript
// 重构前性能测试
console.time('oldMethod');
// ... 旧代码
console.timeEnd('oldMethod');

// 重构后性能测试
console.time('newMethod');
// ... 新代码
console.timeEnd('newMethod');
```

## 注意事项

1. **渐进式重构**：不要一次性重构所有代码，先从一个文件开始
2. **测试验证**：重构后务必进行功能测试
3. **性能监控**：监控重构后的性能变化
4. **错误处理**：确保新的工具类有适当的错误处理
5. **文档更新**：更新相关代码注释和文档

## 总结

通过使用新的数据处理工具类，可以：
- 减少代码重复，提高复用性
- 统一数据操作逻辑，提高维护性
- 优化性能，减少不必要的计算
- 提供更好的错误处理和验证
- 支持缓存和批量处理等高级功能

建议按照本指南逐步重构项目中的数据处理代码，优先处理重复率高的部分。