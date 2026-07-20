# 代码审查 RCA 合并报告

> 基于 `documents/审查-V1.md` 四份评审报告（架构、Buff系统、技能系统、属性系统）约 52 个具体问题的根因分析
> 合并原则：结构性重复 → 合并；数据流断裂 → 合并；执行管道混乱 → 合并；删除 P3/代码风格噪音

---

## 核心缺陷全景图

| 编号 | 缺陷名称 | 涉及原问题数 | 严重程度 |
|------|---------|------------|---------|
| **A** | 分层架构彻底崩溃 | ~8 个 | P0 — 架构级 |
| **B** | 配置-运行时-状态不同步 | ~12 个 | P0 — 功能性 |
| **C** | 核心执行链路缺乏统一契约 | ~14 个 | P0/P1 |
| **D** | 数据流与响应式链路断裂 | ~8 个 | P0/P1 |
| **E** | 领域模型贫血与职责爆炸 | ~6 个 | P1/P2 |

---

## 【核心缺陷 A】分层架构彻底崩溃

**涉及原问题**：架构评审 #1(反向穿透表全部5项)、#4(DI容器硬编码)、#7(presentation过度耦合)；Buff评审 #1.2(领域层反向依赖infra)；属性评审 #3.7(AttributeMetaMap含UI概念)

### 根本原因

`AGENTS.md` 声明 DDD 四层架构和六边形架构原则，但 `domain/port/` 下仅有 `ILogger` 和 `IStorage` 两个端口接口，远未覆盖实际依赖面——领域层没有让基础设施"适配"的端口，就只能直接 import 基础设施。

### 具体症状（合并后）

1. **领域层 → 基础设施**：`BuffSystem.ts` / `PassiveSkillManager.ts` 直接 import `battleLogManager`；`BuffSystem.ts` 直接 import `TriggerEventBus`
2. **领域层 → 表现层**：`BattleAI.ts` import `useBattleStore`；`BattleEventManager.ts` import `useBattleStore`
3. **领域层 → 应用入口**：多处 import `eventBus from '@/main'`
4. **表现层 → DI 容器**：`BattleArena.vue` 直接 `container.resolve<BuffSystem>('BuffSystem')`，绕过应用层门面

### 修复策略（一拳到底）

**在 `domain/port/` 中补齐缺失的端口接口**：

- `IDomainEventBus`（替换领域层对 `eventBus` 和 `TriggerEventBus` 的直接依赖）
- `IBattleLogManager`（替换领域层对 `battleLogManager` 的直接依赖）
- `IBattleQueryService`（替换 `BattleAI` 对 `useBattleStore` 的依赖）

所有基础设施模块改为实现这些端口，领域层只依赖端口接口（依赖倒置）。DI 容器注册改为接口 token（`Symbol`）+ 实现类的绑定。

---

## 【核心缺陷 B】配置-运行时-状态不同步

**涉及原问题**：架构评审 #6(配置三来源/四文件混乱)；Buff评审 #2.1(aura字段缺失)、#2.7(isDebuff硬编码false)、#3.3(executeShield shieldValue丢失)、#3.4(灼烧引爆硬编码)；技能评审 #3(重复ID)、#11(isDebuff硬编码)、#13(loadSkillConfigs无验证)、#14(getSkillConfig返回可变引用)、#19(skillType语义不匹配)、#20(attackType默认SKILL)；属性评审 #2.1(PERCENTAGE单位不一致)、#3.5(pushModifier不对称)

### 根本原因

配置数据从 JSON / 脚本静态 CONFIG / effects.json 三个源头出发，经过 `GameDataProcessor` / `BuffScriptRegistry.resolve()` / `SkillManager.loadSkillConfigs` 三条不同的解析路径到达运行时，中途没有任何 schema 校验、字段完整性检查、单位约定强制或 ID 去重。

### 具体症状（合并后）

1. **字段丢失**：`BuffConfig` 类型定义没有 `aura` 字段→脚本 Buff 的光环永远不会分发；`executeShield` 的 `shieldValue` 参数不被 `ShieldBuff` 读取→护盾值与配置不符；`isDebuff` 硬编码为 `false`→所有技能施加的 debuff 被标记为 buff
2. **单位分裂**：`calculateFinalValue`（公共导出 API）的 PERCENTAGE value 约定是**小数**（0.2=20%），而 `ParticipantStats.recalcAttribute` 约定是**百分比点**（20=20%）——同样的数值在两个函数中含义完全不同
3. **静默数据丢失**：`skills.json` 中 7 组重复 ID，JSON 解析静默覆盖后无运行时告警；`loadSkillConfigs` 无 schema 校验，配置错误静默通过
4. **同步不对称**：`pushModifier` 中 `minAttack` 的 PERCENTAGE 修改同步到 `attackBonus` 但不同步到 `maxAttack`

### 修复策略（一拳到底）

**建立统一的「配置加载 → 校验 → 分发」管道**：

1. 所有配置加载入口（`GameDataProcessor.getSkillsData`、`BuffScriptRegistry.resolve`、`loadSkillConfigs`）增加 **Zod schema 校验** + **重复 ID 检测日志**
2. `BuffConfig` / `ScriptBuffConfig` 类型补全所有字段（`aura`, `isDebuff`, `shieldValue` 等），脚本静态 `CONFIG` 与 JSON 配置走同一份 schema
3. **统一 PERCENTAGE 单位约定**：全项目采用一种单位（建议百分比点 `20 = 20%`），删除 `calculateFinalValue` 的公共导出（统一走 `ParticipantStats.recalcAttribute`）
4. `pushModifier` 的 `minAttack`/`maxAttack` 对称性修复：修改 `minAttack` 时同步修改 `maxAttack`

---

## 【核心缺陷 C】核心执行链路缺乏统一契约

**涉及原问题**：架构评审 #3(三套事件系统并行)、#2(BattleSystem回调注册)；Buff评审 #2.3(onRefresh无ErrorBoundary)、#2.5(免疫检查不匹配immuneTags)、#3.2(executeBuff硬编码isDebuff)、#3.4(handleBurnDetonate硬编码)、#3.5(BurnBuff._onApply重复BurnScript)；技能评审 #4(被动不写CombatRecord)、#5(ADJACENT永远空)、#6(控制检查仅STUN)、#8(executeModifyAttribute绕过ModifierStack)、#15(加成属性同步重复)、#16(executeCustom中文文本匹配)、#17(comboStates无上限)、#18(10/22步骤类型未实现)

### 根本原因

技能、Buff、被动三套"执行路径"各自独立实现，没有共享的**执行上下文契约**（错误边界、CombatRecord 写入、事件通知、修饰符管理），也没有统一的**步骤路由表**——22 个步骤类型中 10 个未实现、1 个靠中文文本匹配分发。

### 具体症状（合并后）

1. **三套事件系统并行无契约**：`eventBus`（mitt，UI 层动画）、`TriggerEventBus`（Buff 阶段事件）、`BattleEventManager`（战报事件）三套独立，`BattleEventCodes` 和 `BattleTriggerPhase` 语义重叠但无映射
2. **错误边界不一致**：`addBuff` 中 `onApply` 有 `BuffErrorBoundary.wrap()` 保护，但 `onRefresh` 直接调用无保护——如果 `onRefresh` 抛异常，实例已部分修改，进入不一致状态
3. **执行路径绕过**：被动技能调用 `executeStep` 时不传 `record` 和 `token`→不写入 CombatRecord、不触发伤害动画、直接扣血/加血；`executeModifyAttribute` 直接操作 `attrData.modifiers` 而非通过 `ModifierStack`→修饰符清理不一致
4. **策略失效**：`ADJACENT`/`RANDOM_ADJACENT` 因 `seatIndex` 全为 0 永远返回空；`FIRST` 智能默认不区分 buff/debuff→AOE debuff 选最低血量目标

### 修复策略（一拳到底）

**抽象 `ExecutionContext` 契约，统一三条执行路径**：

1. 定义 `ExecutionContext` 接口，包含 `combatRecord`、`errorBoundary`、`eventBus`、`modifierStack`
2. `SkillExecutor.executeStep`、`PassiveSkillManager.executePassiveSkill`、`BuffSystem` 的回调触发都接受 `ExecutionContext` 参数
3. **统一步骤路由**：将 22 个步骤类型映射表从 `switch-case` 重构为 `Map<SkillStepType, StepHandler>`，未实现的步骤类型注册 Fallback handler（告警而非静默跳过）
4. **统一事件系统**：`TriggerEventBus` 作为 `IDomainEventBus` 的实现，`eventBus`（mitt）仅用于 presentation 层内部通信，`BattleEventManager` 改为消费 `IDomainEventBus` 事件

---

## 【核心缺陷 D】数据流与响应式链路断裂

**涉及原问题**：属性评审 #2.3(BattleDashboard不响应Buff变化)、#3.1(双重修饰符存储)、#3.2(recalcAll/recalculateAll重复)、#3.3(三个属性访问方法命名混淆)、#3.4(两个独立版本号)、#3.6(useParticipantStats computed死值)

### 根本原因

属性变化通知链路跨越三个系统（`ParticipantStats` 的脏标记缓存 → `BattleParticipantImpl._statsVersion` 的 Vue 响应式 → 事件总线 → Vue Store），每一步都依赖开发者在正确的地方调用正确的方法，没有**编译期强制**的数据流契约。

### 具体症状（合并后）

1. **UI 显示数据**：`BattleDashboard.vue` 的 `attrVal()` 和 `attackRange` computed 不依赖 `statsVersion`→Buff 添加/移除后调试面板攻击力/防御力不更新；`useParticipantStats` 的 computed 也是"死"的
2. **版本号双轨制**：`_statsVersion`（Vue 响应式）和 `stats.version`（脏标记缓存）独立递增，没有关联——如果属性通过非 `recalcAll` 路径变化，`_statsVersion` 不递增，Vue 不检测
3. **全量遍历浪费**：`syncModifiersFromProvider` 每次遍历 60+ 个属性，即使只有一个属性的 Buff 变化；同时 `notifyModifiersChanged` 使所有属性过期，下次重算全部 60+ 个
4. **API 混淆**：`recalcAll()` 和 `recalculateAll()` 完全重复；`getAttribute` / `getAttributeValue` / `getAttrValue` 三个方法命名几乎相同但重算行为不同

### 修复策略（一拳到底）

**统一属性变更传播为单一路径**：

1. **删除 `recalculateAll()`**，只保留 `recalcAll()`（或反之），调用的地方统一
2. **将三个 getter 合并为两个**：`getAttr(code): number`（触发重算）+ `getAttrDetail(code): AttributeValue`（触发重算），内部同步用 `stats.getAttribute(code)`
3. **引入 `DirtyAttributeSet`**：`ModifierStack` 维护一个 set 记录哪些属性变了，`syncModifiersFromProvider` 只遍历 dirty 属性，然后清空 set
4. **`BattleDashboard.vue` 修复**：在 `attrVal` 和 `attackRange` 中显式 `void char?.statsVersion` 触发响应式追踪

---

## 【核心缺陷 E】领域模型贫血与职责爆炸

**涉及原问题**：架构评审 #2(BattleSystem 1000+行)、#5(BattleParticipantImpl贫血模型)；Buff评审 #1.1(BuffSystem 9职责500+行)、#1.3(双接口耦合)；技能评审 #2(BattleExecutor 600+行)

### 根本原因

项目名义上是 DDD 四层架构，但实际采用了**事务脚本模式**——业务逻辑全部集中在几个"管理器"类中，而领域实体只是数据的 getter/setter 代理。

### 具体症状（合并后）

1. **三大 God Class**：`BattleSystem.ts` (~1000+行，6 个关注点)、`BattleExecutor.ts` (~600+行，决策+执行未分离)、`BuffSystem.ts` (~500+行，9 个职责)
2. **贫血实体**：`BattleParticipantImpl` 的属性通过 `ParticipantStats`（一个 `Map<ATTRIBUTE_CODE, AttributeValue>`）管理，实体本身只是代理；伤害计算、治疗、Buff 应用全部外置到 `DamageCalculator`/`HealCalculator`/`BuffSystem`/`SkillExecutor`
3. **接口交叉耦合**：`BuffSystem` 同时实现 `IModifierProvider`（属性系统）和 `BuffQuery`（战斗查询），两个消费者不同但合并在一个类中→属性系统变更可能意外影响战斗查询

### 修复策略（一拳到底）

**对三个 God Class 进行职责拆解（增量式，非一次性重写）**：

1. **从 `BuffSystem` 开始**（最小、影响最可控）：拆出 `BuffLifecycleManager`（add/remove/update）、`BuffStackRuleEngine`（叠加规则）、`BuffConfigResolver`（配置合并）、`ImmunityRegistry`（免疫管理）
2. **拆分 `BattleSystem`**：回合流转 → `TurnCoordinator`，回调注册 → `BattleCallbackRegistry`，战斗初始化 → `BattleInitializer`（保留 `BattleSystem` 作为协调者 ~100 行）
3. **拆分 `BattleExecutor`**：决策逻辑 → `ActionDecider`，执行逻辑 → `StepExecutor`，连击/额外行动 → `ComboManager`
4. **将 `IModifierProvider` 和 `BuffQuery` 分别分配给不同的实现类**，不再合并在 `BuffSystem` 中

> ponytail: 以上拆解可以逐步进行——先拆 `BuffSystem`（~1-2 天），再拆 `BattleExecutor`（~2-3 天），最后 `BattleSystem`（~3-5 天）。每个拆解步骤之间有测试验证关卡。

---

## 修复优先级路线图

| 阶段 | 聚焦 | 核心缺陷 | 关键改动 |
|------|------|---------|---------|
| **Phase 1** | P0 功能性阻断 | B, C | 修复 isDebuff、aura 字段、PERCENTAGE 单位、ADJACENT、skills.json 重复 ID |
| **Phase 2** | 架构基础 | A | 补齐 domain/port/ 端口、消除反向依赖 |
| **Phase 3** | 响应式链路 | D | 统一版本号、修复 BattleDashboard、合并 recalcAll |
| **Phase 4** | 执行管道统一 | C | ExecutionContext 契约、统一事件系统、步骤路由表 |
| **Phase 5** | 重构演进 | E | 增量拆解 God Class |

---

*生成时间：2026-07-17 | 基于 `documents/审查-V1.md` 四份评审报告 RCA 合并*
