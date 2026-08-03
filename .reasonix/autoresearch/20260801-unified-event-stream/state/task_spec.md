# Task Spec：结合分析报告 + 统一战斗事件流方案，有则改之无则加勉

## Goal
用户提供了两份文档：
1. 《CombatDebugStudio 项目分析报告与可行性评估》（评估三份 .mimocode/plans/ 计划）
2. 《统一战斗事件流方案.md》（documents/，ADR：将 ReplayBattleEvent + TraceEvent 合并为单一 TraceEvent[] 事件流）

要求"结合这两个文档，有则改之无则加勉"——即：以文档为检查清单，验证其论断与代码现状是否一致；
存在的缺陷则修复（有则改之），不存在/已修复的则确认并记录（无则加勉）。

## Scope
- 验证统一战斗事件流方案的四大不一致点（双枚举 / 双时基 / 派生逻辑重复 / 消费割裂）是否仍存在于代码
- 验证分析报告 P0/P1/P2 债务（pendingDeaths 残留、死代码、God Method 等）是否仍存在
- 修复存在的、低-中风险的问题；高风险分批
- 每次改动后跑 typecheck + test

## Non-Goals
- 不做完整重写（如真重演计算）
- 不引入新依赖
- 不一次性迁移 66 处属性数据（计划三范围，若做则分批）

## Success Criteria
- 对每一条文档论断给出"现状已修复 / 现状仍存在"的结论，附文件:行号证据
- 存在的缺陷被修复（至少覆盖低-中风险项），typecheck + test 全绿
- 产出 findings.jsonl 记录每条论断的验证结果

## Verification Gates
- npm run typecheck 通过
- npm test 通过
