# Task Spec: 调试日志要求文档落地

- task_id: 20260731-224957-debug-log-requirements
- 创建时间: 2026-07-31 22:49:57
- 状态: COMPLETED

## Goal

把用户提供的"优秀回合制战斗引擎调试日志体系"说明文字，结合本局项目（CombatDebugStudio）当前实际情况调整后，写入 `documents/调试日志要求.md`。

## Scope

- 阅读项目现有日志体系：`documents/需求文档/调试日志改造.md`（设计愿景+规范）、`documents/日志管理.md`（原始需求）、`src/shared/types/trace-event.ts`（TracePhase/TraceEvent 实装）、`src/domain/battle/service/BattleRecorder.ts`（RecordedBattle/randomSeed）、`src/shared/utils/SeededRandom.ts`（确定性随机）、`src/domain/battle/service/TurnManager.ts`（速度排序）。
- 结合现状调整说明文字：行动条→速度优先排序（speedFirst/turnOrder）；随机判定落地为 required/roll/passed + verdict/skipReason；可复现落地为 SeededRandom + BattleRecorder + ReplayEngine + JSON 导出。
- 产出 `documents/调试日志要求.md`（UTF-8 带 BOM，符合 AGENTS.md 编码约定）。

## Non-Goals

- 不改动任何源码。
- 不重写 `调试日志改造.md` / `日志管理.md`（只作关联引用）。

## Success Criteria

1. `documents/调试日志要求.md` 存在，内容以用户说明文字为骨架、落地为本项目机制。
2. 文件头 3 字节为 EF BB BF（BOM 验证通过）。
3. 关键机制名与源码实装一致（TracePhase、TraceEvent、correlationId、BattleRecorder.randomSeed、SeededRandom、TurnManager）。

## Verification Gates

- `[System.IO.File]::ReadAllBytes(path)[0..2]` = EF BB BF ✓
- 文件 118 行，首行为 `# 调试日志要求` ✓
