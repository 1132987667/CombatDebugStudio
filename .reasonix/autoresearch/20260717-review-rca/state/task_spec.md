# Task: 审查-V1.md RCA 合并与修复

## Goal
对 `documents/审查-V1.md` 中约 50+ 个具体问题执行根因分析（RCA），合并为不超过 7 个"底层架构/设计缺陷"，然后按缺陷优先级逐步修复。

## Scope
- 输入：`documents/审查-V1.md`（架构、Buff、技能、属性四份评审）
- 合并方法：用户提供的 RCA 提示词模板
- 输出 1：合并后的「核心缺陷全景图」+ 逐缺陷展开
- 输出 2：对每个核心缺陷确定修复策略
- 输出 3：按优先级执行修复（代码修改）

## Non-goals
- 不新增评审内容
- 不修改用户提供的提示词结构
- 不讨论重构方案可行性（直接执行最小修复）

## Success criteria
1. 合并后不超过 7 个核心缺陷
2. 每个缺陷含：根本原因一句话 + 2-4 个典型症状 + 一拳到底的修复策略
3. 删除原报告中所有 P3/代码风格/噪音项
4. P0 级问题有具体的修复方案

## Allowed operations
- grep / read_file / write_file / edit_file / multi_edit / bash / explore
