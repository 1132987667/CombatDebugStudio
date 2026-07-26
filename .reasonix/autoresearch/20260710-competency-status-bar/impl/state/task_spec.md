# 演武台角色状态栏修改

## Goal
按照《演武台角色状态栏》详细修改方案，逐阶段修复所有问题：响应式断裂、数据源统一、文本启发式替换、类型安全收紧、测试修复。

## Scope
- P0: 修复响应式断裂（setBuffConditionState / addStatus / useSituationalAttributes）
- P1: 统一数据源（快照扩展 + 卡片改消费 + 删除 BuffDisplayItem）
- P2: 数据驱动替换文本启发式（固定值格式 / controlType / conditionState）
- P3: 类型安全与契约收紧（baseAttributes / 统一映射表 / BuffRawItem）
- P4: 测试修复与配置校验

## Non-goals
- 不修改 BuffTextBar/BuffTextTag/BuffTextPanel/BuffTextGroup 接口
- 不修改 BattleProjection microtask 批处理机制
- 不删除 CONTROL_NAMES 回退
- 不修改 isContextRelevant 逻辑

## Success criteria
1. 所有修改按文档执行，无遗漏
2. 类型检查通过 (npm run typecheck)
3. 测试通过 (npm run test)
4. 构建通过 (npm run build)
