# 属性系统清理 — 迭代二

## 上一次迭代完成
- ✅ AttributeEngine 删除
- ✅ modifier-template 6 个死类型清理
- ✅ types.ts AttributeComputeResult/SourceContribution/trace 删除 + 5 个 ATTRIBUTE_CODE 删除
- ✅ ModifierStack.calculate 删除
- ✅ breakdown 填充
- ✅ recalcAll/recalculateAll 合并
- ✅ getAttrValue @deprecated
- ✅ BattleDashboard 响应式修复
- ✅ useParticipantStats computed 响应式

## 本次迭代范围（剩余未处理）

### P0
1. `calculateFinalValue` 添加 @deprecated 标记 + 单位约定 JSDoc

### P1
2. `_statsVersion` 与 `stats.version` 统一：让 `_statsVersion` 跟踪 `stats.getCurrentVersion()`
3. `pushModifier` ADDITIVE modifier 同步到 minAttack/maxAttack

### 遗留（延期 — 范围过大或风险高）
- `syncModifiersFromProvider` 全量遍历优化（需 ModifierStack 改动）
- `AttributeMetaMap` displayTier/group 移出领域层（需 UI 层重构）
- 剩余 ATTRIBUTE_CODE 验证后结论：除已删 5 个外，其余均被 configs/ 或代码引用，不可删
