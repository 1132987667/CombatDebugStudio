# Buff 系统架构能力评估

> 针对 12 项典型架构挑战，逐项评估当前系统能处理、部分能处理、不能处理及原因。
> 评估基准：代码库当前 HEAD，基于领域层 `src/domain/buff/` 的实际实现。

---

## 评估总览

| #   | 主题                          | 结论           |
| --- | ----------------------------- | -------------- |
| 1   | 光环/跨实体修饰符             | ❌ 不能处理    |
| 2   | 条件性属性（残血增伤）        | ▲ 部分能处理   |
| 3   | 修饰符来源追踪（UI 碎片展示） | ▲ 部分能处理   |
| 4   | 死亡与复活的 Buff 保留        | ❌ 不能处理    |
| 5   | 驱散与净化（基础）            | ▲ 部分能处理   |
| 6   | Buff 间依赖与级联失效         | ❌ 不能处理    |
| 7   | 层数边界与溢出                | ▲ 部分能处理   |
| 8   | 驱散优先级博弈（霸体/免疫）   | ▲ 部分能处理   |
| 9   | 即时效果 vs 持续效果          | ▲ 部分能处理   |
| 10  | Buff 与技能双向交互           | ✅ 能处理      |
| 11  | 网络同步/确定性               | — 不在项目范围 |
| 12  | 性能优化与对象池              | ▲ 部分能处理   |

---

## 逐项详评

### 1. 跨实体修饰符（光环 / 伤害链接）

**结论：❌ 不能处理**

**现状：**

- `BuffContext.addModifier()` 和 `ModifierStack` 的写入目标固定为调用 `context` 时持有的 `characterId`，没有跨角色写入机制。
- 没有 `AuraSystem`，没有"父 Buff → 子 Buff"的级联跟踪。
- `BuffInstance` 和 `BuffConfig` 均无 `parentInstanceId` / `sourceInstanceId` / `cascadeRemove` 字段。
- `BuffSystem.removeBuff()` 只清理自己的 modifier 和 trigger listener，不递归移除派生 Buff。

**要支持需要的改动：**

- 新增 AuraSystem / 级联 Buff 管理
- BuffInstance 加父引用字段
- removeBuff 加级联遍历
- 范围内目标变化的监听机制

**近似替代方案：**

- `share_damage` trigger script 提供了"伤害分摊"模式，但它通过 `requestDamage` / `requestHeal` 手动传递伤害值，不涉及修饰符转移，也不是"50% 修饰符转移"。

---

### 2. 条件性属性（血量 < 30% 增伤）

**结论：▲ 部分能处理**

**已有的基础设施：**

- `BuffInstance.conditionState`（`'active' | 'inactive'`）已定义
- `BuffSystem.setBuffConditionState()` 方法已实现，会 emit `CONDITION_CHANGED` 事件
- `BattleTriggerPhase.HP_LOWER_THAN` 事件阶段已定义
- `BattleTriggerPhase.CONDITION_CHANGED` 事件阶段已定义

**未闭合的链路：**

- `conditionState` 变更**不会自动触发 modifier 重算**——脚本需要在 `_onUpdate` 或监听 `CONDITION_CHANGED` 后手动调用 `applyModifiers(context, true)`
- `HP_LOWER_THAN` 事件目前**没有调用者**——战斗系统血量变化处没有 emit 它
- 没有惰性求值/响应式依赖追踪——`getModifiers()` 每次都全量计算

**推荐实现方向：**

- 战斗系统在血量变化处 emit `HP_LOWER_THAN`
- 配置 `triggers` 响应此事件 → `setBuffConditionState` → 脚本 `getModifiers()` 检查 `conditionState`

---

### 3. 修饰符来源追踪（UI 碎片展示）

**结论：▲ 部分能处理**

**已有的：**

- `Modifier` 接口包含 `sourceKey`（= `buffInstanceId`）、`sourceType`、`attribute`、`value`、`type`、`description`
- `AttributeValue.modifiers: Modifier[]` 可供 UI 层遍历
- `IModifierProvider.getSourceName(sourceId)` 提供 instanceId → 名称的映射入口

**不足：**

- `AttributeBuffTemplate.applyModifiers()` 调 `context.addModifier(attribute, value, type)` 时**不传递 `description`**，`addModifier()` 签名也不接受 description
- `getSourceName` 实现依赖 `BuffSystem.buffInstances` → `BuffConfig.name` 链路，UI 侧连通性未验证
- Modifier 的 `sourceKey` 是 instanceId（如 `"buff_17"`），UI 需要额外映射到人类可读名

---

### 4. 死亡与复活的 Buff 状态保留

**结论：❌ 不能处理**

**现状：**

- `BuffConfig` 没有 `persistOnDeath: boolean` 字段
- `BuffSystem` 没有监听 `ON_DEATH` 事件并遍历清理非持久 Buff 的逻辑
- 没有"复活时恢复哪些 Buff"的机制
- `ON_DEATH` 和 `ON_KILL` 事件阶段已定义，但只供 trigger 脚本使用（如"击杀回血"），不是给 BuffSystem 做气血周期管理

**要支持需要的改动：**

- `BuffConfig` 加 `persistOnDeath: boolean`
- `BuffSystem` 加死亡事件监听，遍历清理
- 复活恢复逻辑

---

### 5. 驱散与净化机制

**结论：▲ 部分能处理**

**已有的：**

- `BuffConfig.tags?: string[]` —— 多维标签已就位
- `BuffConfig.dispellable?: boolean` —— 是否可驱散标记
- `cleanse_random_debuff` trigger 脚本——按 `isDebuff && dispellable` 过滤
- 免疫检查 `immuneTags` → `characterImmunities` 在 `addBuff` 时阻断

**不足：**

- 没有 `DispelFilter` 类型（含 `tags` / `excludeTags` / `maxCount`）
- 驱散逻辑只在 trigger 脚本中实现，不是 `BuffSystem` 的公开 API
- `undispellable` 等价于 `dispellable: false`，但作为布尔字段而非 tag，不能参与 `excludeTags` 过滤

---

### 6. Buff 间依赖与级联失效

**结论：❌ 不能处理**

**现状：**

- `BuffInstance` 没有 `parentInstanceId` / `sourceInstanceId` 字段
- `BuffConfig` 没有 `cascadeRemove` 字段
- `BuffSystem.removeBuff()` 只清理自己的 modifier 和 trigger listener，不递归移除子 Buff
- 没有依赖图的环检测

**负面影响：**
如果手动实现"光环施加派生 Buff"，当光环被移除时，派生 Buff 将成为"孤儿"——永远留在目标身上，修饰符永久生效。这是当前架构的最大空缺之一。

---

### 7. 层数边界与溢出回滚

**结论：▲ 部分能处理**

**已有的：**

- `maxStacks` + `stackRule`（`LIMITED` / `REFRESH` / `INDEPENDENT`）
- `currentStacks` 存在于 `BuffInstance`

**不足：**

- `onMaxStacksStrategy`（满层策略枚举）不存在——`LIMITED` 的"拒绝施加"硬编码，没有 `REFRESH` / `IGNORE` / `EXPLODE` / `RESET` 等差化策略
- `setStacks(n)` 单一入口不存在——`currentStacks` 的修改分散在 `addBuff` 的不同分支
- 没有"驱散 N 层"和"驱散整个 Buff"的 API 区分——只有 `removeBuff(instanceId)`

---

### 8. 驱散优先级博弈（霸体/免疫）

**结论：▲ 部分能处理**

**已有的：**

- `controlType` 和 `controlPriority` 已存在，`getHighestPriorityControlEffect()` 解决多控制竞争
- 免疫检查 `immuneTags` → `characterImmunities` 在 `addBuff` 时阻断施加

**不足：**

- **"免疫阻止施加"与"净化移除已存在"没有区分**——`immuneTags` 只在 `addBuff` 时检查，如果目标先中 debuff 再获得免疫，旧 debuff 不会自动移除
- 没有"霸体"这类通用免疫系统——免疫基于 tag 精确匹配，不基于"控制类型自动免疫"
- 没有 `excludeTags` 字段——无法表达"排除带 undispellable 标记的 Buff"

---

### 9. 即时效果与持续效果的区分

**结论：▲ 部分能处理**

**已有的：**

- `DamageOverTimeTemplate`（持续伤害基类）已存在
- 触发器系统提供在特定阶段执行一次效果的能力（`TURN_START` / `ON_HIT` 等）
- `BuffEffectLine` 支持 `dot` / `hot` / `shield` 等分类

**不足：**

- 没有显式的 `InstantEffect` / `PeriodicEffect` 组件划分——所有逻辑在 `_onApply` / `_onUpdate` 中手写
- 没有组合式 Buff 架构：一个既减防又持续灼烧的 Buff 需要手写或分别配 trigger
- 周期性效果没有"首跳立即触发 vs 首跳等待一个周期"的配置

---

### 10. Buff 与技能系统的双向交互

**结论：✅ 能处理（当前最完善的部分）**

**已有的完整链路：**

- `IDomainEventBus` + 18 个 `BattleTriggerPhase` 事件阶段：
  - `BEFORE_ATTACK` / `ON_HIT` / `AFTER_ATTACK`
  - `ON_KILL` / `ON_DEATH`
  - `HEAL_RECEIVED` / `ENERGY_GAINED`
  - `SKILL_USE` / `HP_LOWER_THAN`
  - `ALLY_DAMAGE_TAKEN` / `ALLY_FATAL_DAMAGE`
  - `CONDITION_CHANGED` / `ON_APPLY`
- Buff 通过配置声明 `triggers` 挂载到事件总线，`removeBuff` 时 `offByListenerId` 自动解绑——**无内存泄漏**
- 15 个内置触发器脚本覆盖：伤害、治疗、反弹、格挡、分摊、施毒、驱散、护盾、沉默等
- `BuffSystem.requestDamage()` / `requestHeal()` 回调解耦 Buff 与伤害系统

**仍有的局限：**

- 触发器是声明式配置，不能在 Buff 脚本代码中 override 回调——`BaseBuffScript` 只有 `onApply/onRemove/onUpdate/onRefresh`，没有 `onHit/onAttacked/onKill` 等标准战斗回调
- 回调执行顺序没有 `priority` 控制——多个 trigger 监听同一 phase 时顺序不确定
- 触发器不支持"拦截并修改"模式（如减伤 Buff 修改传入的 damage 值）——目前只有"纯监听"

---

### 11. 网络同步与确定性

**结论：— 不在项目范围**

项目定位为"回合制战斗引擎 + Vue 3 可视化调试沙盒"，没有网络同步需求，没有存档/序列化系统。

**理论上的架构限制（若未来需要）：**

- `value: (context) => number` 动态计算函数不可序列化——存档只能存 `remainingTurns`、`currentStacks` 等标量，反序列化后由 `getModifiers()` 重新计算
- 当前使用毫秒计时 `getElapsedTime()` 基于 `Date.now()`，帧同步下会有漂移
- 没有定点数，没有帧数表示

---

### 12. 性能优化与对象池

**结论：▲ 部分能处理**

**已有的：**

- `BuffContextPool`（对象池，最大 200 实例，`borrow` / `reset` / `return` 完整实现）
- `applyModifiers()` 的 `replace` 参数可一次性 remove + add

**不足：**

- `getModifiers()` 每次返回新数组——没有缓存。`shouldReapplyOnUpdate: true` 的 Buff 每帧都重新构造
- 没有脏标记——每次 `applyModifiers(context, true)` 都暴力 remove + re-add，不检查 value 是否变化
- `ModifierStack` 是"每次增删实体"模式，不是"声明式数据块 + 延迟计算"
- 没有 value hash 比对——无法判断动态计算的 value 前后是否有变化

---

## 各模块改动量预估

| #   | 主题              | 改动范围                                     | 预估工作量   |
| --- | ----------------- | -------------------------------------------- | ------------ |
| 1   | 光环/跨实体修饰符 | AuraSystem + BuffInstance 级联字段           | 大（新模块） |
| 2   | 条件性属性        | 战斗系统血量事件 emit + 状态重算链路闭合     | 中           |
| 3   | 来源追踪 UI       | `addModifier()` 签名扩展 + UI 层连通         | 小           |
| 4   | 死亡复活 Buff     | BuffConfig 字段 + BuffSystem 死亡监听        | 中           |
| 5   | 驱散净化          | DispelFilter 类型 + BuffSystem.cleanse() API | 小-中        |
| 6   | 级联失效          | BuffInstance 父子字段 + removeBuff 递归      | 中-大        |
| 7   | 层数边界          | onMaxStacksStrategy + setStacks() 入口       | 小           |
| 8   | 驱散优先级博弈    | excludeTags + 免疫/净化分离                  | 小-中        |
| 9   | 即时/持续效果     | InstantEffect/PeriodicEffect 组件化          | 中           |
| 10  | 双向交互          | 基本完整，仅需优先级排序                     | 小           |
| 12  | 性能优化          | getModifiers 缓存 + 脏标记                   | 中           |
