# Buff 系统架构能力评估

> 针对典型架构挑战，逐项评估当前系统的未完成项——能处理的、部分能处理的、不能处理及原因。
> 评估基准：代码库当前 HEAD，基于领域层 `src/domain/buff/` 的实际实现。
> 已完成的条目（光环/级联失效、即时/持续效果组件化、Buff-技能双向交互）已从本文档移除，不再追踪。

---

## 评估总览

| #   | 主题                          | 结论           |
| --- | ----------------------------- | -------------- |
| 1   | 条件性属性（残血增伤）        | ▲ 部分能处理   |
| 2   | 修饰符来源追踪（UI 碎片展示） | ▲ 部分能处理   |
| 3   | 死亡与复活的 Buff 保留        | ❌ 不能处理    |
| 4   | 驱散与净化（基础）            | ▲ 部分能处理   |
| 5   | 层数边界与溢出                | ▲ 部分能处理   |
| 6   | 驱散优先级博弈（霸体/免疫）   | ▲ 部分能处理   |
| 7   | 性能优化与对象池              | ▲ 部分能处理   |

---

## 逐项详评

### 1. 条件性属性（血量 < 30% 增伤）

**结论：▲ 部分能处理**

**已有的基础设施：**

- `BuffInstance.conditionState`（`'active' | 'inactive'`）已定义
- `BuffSystem.setBuffConditionState()` 已实现，会 emit `CONDITION_CHANGED` 事件并触发属性变更通知（`BuffSystem.ts:1153`）
- `BattleTriggerPhase.HP_LOWER_THAN` 阶段已定义，且被被动技能系统消费（`PassiveSkillManager.ts:228` 按 `hpThreshold` 判定）

**未闭合的链路：**

- `conditionState` 变更**不会自动触发 modifier 重算**——需脚本在监听 `CONDITION_CHANGED` 后手动 remove + re-add
- 事件总线上的 `HP_LOWER_THAN` emit 没有调用者（被动技能是自行判定阈值，不走事件总线）
- 没有惰性求值/响应式依赖追踪——`getModifiers()` 每次都全量返回

**推荐实现方向：**

- 战斗系统在血量变化处 emit `HP_LOWER_THAN`
- 配置 `triggers` 响应此事件 → `setBuffConditionState` → 脚本重算修饰符

---

### 2. 修饰符来源追踪（UI 碎片展示）

**结论：▲ 部分能处理**

**已有的：**

- `Modifier` 接口包含 `sourceKey`（= `buffInstanceId`）、`sourceType`、`attribute`、`value`、`type`、`description?`（`attribute/types.ts:67`）
- `ModifierStack.getModifiers()` 供 UI 层遍历
- `BuffSystem.getSourceName()` 提供 instanceId → 名称的映射入口

**不足：**

- `BuffContext.addModifier()` / `ModifierStack.addModifier()` 签名仍不接收 `description`（`Modifier.description` 为可选字段但从未被写入）
- `getSourceName` 依赖 `buffInstances` → `scriptRegistry.getBuffConfig.name` 链路，UI 侧连通性未验证
- Modifier 的 `sourceKey` 是 instanceId（如 `"buff_17"`），UI 需要额外映射到人类可读名

---

### 3. 死亡与复活的 Buff 状态保留

**结论：❌ 不能处理**

**现状：**

- `BuffConfig` 没有 `persistOnDeath: boolean` 字段
- `BuffSystem` 没有监听 `ON_DEATH` 并遍历清理非持久 Buff 的逻辑（战斗结束/重置时才 `clearAllBuffs`）
- 没有"复活时恢复哪些 Buff"的机制
- `ON_DEATH` / `ON_KILL` / `ON_REVIVE` 事件阶段已定义（`types.ts`），其中 `ON_REVIVE` 已被复活流程触发被动技能（`BattleExecutor.ts:686`），但均不承担 Buff 气血周期管理

**要支持需要的改动：**

- `BuffConfig` 加 `persistOnDeath: boolean`
- `BuffSystem` 加死亡事件监听，遍历清理
- 复活恢复逻辑

---

### 4. 驱散与净化机制

**结论：▲ 部分能处理**

**已有的：**

- `BuffConfig.tags?: string[]` —— 多维标签已就位
- `BuffConfig.dispellable?: boolean` —— 是否可驱散标记
- **`BuffSystem.removeDispellableBuffs()` 已是公开 API**（`BuffSystem.ts:863`），按 `dispellable === true` 过滤，技能系统在调用（`SkillExecutor.ts:942`）
- `cleanse_random_debuff` trigger 脚本——按 `isDebuff && dispellable` 过滤
- 免疫检查 `characterImmunities` 在 `addBuff` 时阻断施加

**不足：**

- 没有 `DispelFilter` 类型（含 `tags` / `excludeTags` / `maxCount`）——公开 API 是"全部可驱散"，不支持按标签精确筛选
- `undispellable` 等价于 `dispellable: false`，但作为布尔字段而非 tag，不能参与标签过滤

---

### 5. 层数边界与溢出回滚

**结论：▲ 部分能处理**

**已有的：**

- `maxStacks` + `stackRule`（`LIMITED` / `REFRESH` / `INDEPENDENT`）
- `LIMITED` 满层时：刷新持续时间、不增加层数、同步 `_stacks` 变量并通知 effectPlan 各原语 `onStackChange`（`BuffSystem.ts:539-563`）
- `IAtomicEffect.onStackChange?` 回调——层数变化时重新计算修饰符值（`ModifierEffect` 使用）

**不足：**

- `onMaxStacksStrategy`（满层策略枚举）不存在——`LIMITED` 的"满层刷新时间"硬编码，没有 `REFRESH` / `IGNORE` / `EXPLODE` / `RESET` 等差化策略
- `setStacks(n)` 单一入口不存在——`currentStacks` 的修改分散在 `addBuff` 的 `LIMITED` 分支
- 没有"驱散 N 层"和"驱散整个 Buff"的 API 区分——只有 `removeBuff(instanceId)` / `removeDispellableBuffs()`

---

### 6. 驱散优先级博弈（霸体/免疫）

**结论：▲ 部分能处理**

**已有的：**

- `controlType` 和 `controlPriority` 已存在，`getHighestPriorityControlEffect()` 解决多控制竞争
- 免疫检查 `characterImmunities` 在 `addBuff` 时阻断施加
- `ImmunityEffect` 原语 + `rebuildCharacterImmunities()` 重建策略，免疫标签随 Buff 生命周期增删

**不足：**

- **"免疫阻止施加"与"净化移除已存在"没有区分**——免疫只在 `addBuff` 时检查，如果目标先中 debuff 再获得免疫，旧 debuff 不会自动移除
- 没有"霸体"这类通用免疫系统——免疫基于 tag 精确匹配，不基于"控制类型自动免疫"
- 没有 `excludeTags` 字段——无法表达"排除带 undispellable 标记的 Buff"

---

### 7. 性能优化与对象池

**结论：▲ 部分能处理**

**已有的：**

- `BuffContextPool`（对象池，最大 200 实例，`borrow` / `reset` / `return` 完整实现，`BuffContextPool.ts`）
- `BuffErrorBoundary`——脚本执行错误边界，出错回滚施加（`BuffSystem.ts:673-682`）
- `ModifierEffect.onStackChange` 只重算受影响的修饰符，而非整体重建

**不足：**

- `getModifiers()` 每次返回新数组——没有缓存。`shouldReapplyOnUpdate` 的 Buff 每帧都重新构造
- 没有脏标记——脚本层 `applyModifiers(context, true)` 仍可能暴力 remove + re-add，不检查 value 是否变化
- `ModifierStack` 是"每次增删实体"模式，不是"声明式数据块 + 延迟计算"
- 没有 value hash 比对——无法判断动态计算的 value 前后是否有变化

---

## 各模块改动量预估

| #   | 主题              | 改动范围                                     | 预估工作量   |
| --- | ----------------- | -------------------------------------------- | ------------ |
| 1   | 条件性属性        | 战斗系统血量事件 emit + 状态重算链路闭合     | 中           |
| 2   | 来源追踪 UI       | `addModifier()` 签名扩展 + UI 层连通         | 小           |
| 3   | 死亡复活 Buff     | BuffConfig 字段 + BuffSystem 死亡监听        | 中           |
| 4   | 驱散净化          | DispelFilter 类型 + cleanseByFilter API      | 小-中        |
| 5   | 层数边界          | onMaxStacksStrategy + setStacks() 入口       | 小           |
| 6   | 驱散优先级博弈    | excludeTags + 免疫/净化分离                  | 小-中        |
| 7   | 性能优化          | getModifiers 缓存 + 脏标记                   | 中           |
