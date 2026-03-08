# 战斗记录系统实施计划

## 概述

根据方案 `output.txt` 的设计，实现统一的战斗记录系统，贯穿整个动作生命周期，在各个处理阶段逐步填充记录对象。

---

## 实施步骤

### 阶段一：创建核心类型定义

**任务 1.1** - 创建 `src/types/combat-record.ts` 文件，定义以下接口：
- `EffectRecord` - 效果条目接口（伤害、治疗、Buff、Debuff、闪避、暴击等）
- `CalculationStep` - 计算步骤细节接口
- `CalculationDetail` - 计算详情接口（调试模式）
- `CombatRecord` - 统一动作记录核心接口

**产出文件**：`src/types/combat-record.ts`

---

### 阶段二：修改伤害/治疗计算器

**任务 2.1** - 修改 `src/core/skill/DamageCalculator.ts`：
- 在 `calculateDamage` 方法中添加可选的 `record?: CombatRecord` 参数
- 当 `record` 传入且 `record.hasDetail === true` 时：
  - 初始化 `record.detail` 对象
  - 记录每个计算步骤（基础值、属性加成、暴击判定等）
  - 记录暴击/闪避状态、修正系数、最终值
- 无论是否开启调试模式，都将效果添加到 `record.effects` 列表
- 累加总伤害到 `record.damage`

**任务 2.2** - 修改 `src/core/skill/HealCalculator.ts`：
- 在 `calculateHeal` 方法中添加可选的 `record?: CombatRecord` 参数
- 实现与 DamageCalculator类似的记录逻辑
- 记录治疗计算步骤到 `record.detail`
- 将治疗效果添加到 `record.effects` 并累加 `record.heal`

---

### 阶段三：修改 BuffSystem

**任务 3.1** - 修改 `src/core/BuffSystem.ts`：
- 在 `addBuff` 方法中添加可选的 `record?: CombatRecord` 参数
- 当 `record` 传入时，向 `record.effects` 添加 Buff 效果记录
- 记录内容包含：buffId、instanceId、目标角色ID、效果描述

---

### 阶段四：修改 SkillManager

**任务 4.1** - 修改 `src/core/skill/SkillManager.ts`：
- 在 `executeSkill` 方法中添加可选的 `record?: CombatRecord` 参数
- 在遍历步骤时，将 `record` 传递给 `executeSkillStep`
- 修改 `executeDamageStep`：接收 record 参数并传递给 DamageCalculator
- 修改 `executeHealStep`：接收 record 参数并传递给 HealCalculator
- 修改 `executeBuffStep`：接收 record 参数并传递给 BuffSystem.addBuff

---

### 阶段五：修改 ActionExecutor

**任务 5.1** - 修改 `src/core/battle/ActionExecutor.ts`：
- 添加 `shouldRecordDetail()` 方法判断是否需要记录调试详情
- 添加 `createEmptyRecord()` 方法创建空的记录对象
- 添加 `finalizeRecord()` 方法完成记录的最终处理
- 在 `processSkill` 方法中：
  - 根据调试模式决定是否创建详细记录对象
  - 将 record 传递给 `skillManager.executeSkill`
  - 记录完成后调用 `battleRecorder.addRecord`（如已集成）
  - 发送日志事件（如已集成）

---

### 阶段六：集成与测试

**任务 6.1** - 确保与现有 BattleRecorder 系统集成：
- 在 ActionExecutor 中获取或注入 BattleRecorder 实例
- 战斗记录添加到 BattleRecorder 的事件系统中

**任务 6.2** - 验证数据流完整性：
- 从 ActionExecutor -> SkillManager -> DamageCalculator/HealCalculator/BuffSystem
- 确认 record 对象在各个阶段被正确填充

---

## 关键文件清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/types/combat-record.ts` | 新建 | 核心类型定义 |
| `src/core/skill/DamageCalculator.ts` | 修改 | 添加 record 参数 |
| `src/core/skill/HealCalculator.ts` | 修改 | 添加 record 参数 |
| `src/core/BuffSystem.ts` | 修改 | addBuff 添加 record 参数 |
| `src/core/skill/SkillManager.ts` | 修改 | 传递 record 参数 |
| `src/core/battle/ActionExecutor.ts` | 修改 | 创建和传递 record |

---

## 实施顺序

1. 任务 1.1 - 创建类型定义文件
2. 任务 2.1 - 修改 DamageCalculator
3. 任务 2.2 - 修改 HealCalculator
4. 任务 3.1 - 修改 BuffSystem
5. 任务 4.1 - 修改 SkillManager
6. 任务 5.1 - 修改 ActionExecutor
7. 任务 6.1 - 集成测试
