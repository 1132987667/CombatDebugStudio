# 任务规格：死代码审计验证

## 目标
验证用户提供的"10 个未被调用的死函数/方法"报告是否属实，对确认是死代码的进行删除（石匠守则：每行代码都是负债），删除后运行 typecheck 验证。

## 报告声称的死函数
### RoundNarrativeRenderer.ts (7 个)
1. `detectTurnAnnotation`
2. `renderBattleHeader`
3. `renderRoundHeader`
4. `renderSystemBlock`
5. `computeSummary`
6. `renderBattleSummary`
7. `buildBlocks`
（注：该文件还有 12 个未使用的私有方法，其中 2 个待确认）

### GameDataProcessor.ts (2 个)
8. `calculateStatBonus`
9. `validateBattleCharacter`

### BattleLogManager.ts (1 个)
10. `searchBattleLogs`

## 非目标
- 不重构正常工作的代码
- 不清理 RoundNarrativeRenderer 中仍被调用的方法
- 不做报告范围外的扫描（除非验证过程中自然发现）

## 允许的操作
- 读取源码、grep 引用、typecheck

## 成功标准
1. 每个声称的死函数都有证据（grep 无调用方 + 文件内无内部调用）
2. 确认死代码后删除，typecheck 通过
3. 输出每个函数的验证结论（真死代码 / 假死代码 / 部分存疑）

## 验证门
- 每个函数删除前：全库 grep 函数名，确认无引用
- 删除后：npm run typecheck 零错误
