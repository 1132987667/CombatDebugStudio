# 对抗式审查报告：被动技能 Buff 初始化迁移方案（已归档）

> **此审查针对的是已被方案 B 取代的过渡方案。** 方案 B 的对抗式审查及修复详见 [`统一管道-Buff全生命周期时序.md`](./统一管道-Buff全生命周期时序.md) 末尾的「修复清单」。

## 审查方法

站在对立面，以「这方案有问题」为预设，主动寻找漏洞、盲区、过度简化和假设失效点。

## 审查结论（仅保留对方案 B 仍有意义的发现）

以下发现已全部在方案 B 中解决：

| 原始发现 | 严重度 | 方案 B 的解决方式 |
|:---------|:------:|:-----------------|
| `addImmunity` 逻辑被静默丢弃 | 🔴 中 | `BuffSystem.addBuff` 中已实现 `applyBuffImmunities` |
| `maxUses` / `maxStacks` 边界条件 | 🔶 中 | 统一管道中 `battle_start` 默认 `maxTriggerCount = 1`，叠加规则由 `StackRule` 控制 |
| BATTLE_START 回调注册时序 | ⚠️ 低 | 回调注册在 `applyPassiveSkills` 之前，时序正确 |
| pending 循环职责膨胀 | ⚠️ 低 | 方案 B 无 pending 循环 |
| `pendingPassiveBuffIds` 附着在实体上 | ⚠️ 低 | 方案 B 完全删除此字段 |

## 与方案 B 的审查差异

方案 B 的第二轮对抗式审查发现了此审查未覆盖的问题：

| 新发现 | 严重度 |
|:-------|:------:|
| BATTLE_START 的 `target` 为 undefined 导致全部被动静默拦截 | 🔴 严重 |
| `executeModifyAttribute` 缺少加成属性同步 | 🔴 严重 |
| 纯 `modify_attribute` 被动在 buff 列表中不可见 | 🔴 严重 |
| `PassiveSkillManager` 跨战斗污染 | 🔶 中 |
| 光环修饰符游离于 buff 生命周期之外 | 🔶 中 |
