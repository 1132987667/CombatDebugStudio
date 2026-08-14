# ONBOARDING — 30 分钟上手指南

> **最后更新**: 2026-07-29  
> **审查周期**: 超过 3 个月未更新时触发审查

---

## 目录

1. [项目概览](#1-项目概览)
2. [快速上手](#2-快速上手)
3. [架构总览：DDD 四层](#3-架构总览ddd-四层)
4. [代码组织](#4-代码组织)
5. [战斗全流程](#5-战斗全流程)
6. [关键子系统](#6-关键子系统)
7. [测试](#7-测试)
8. [调试](#8-调试)
9. [维护规则](#9-维护规则)

---

## 1. 项目概览

**CombatDebugStudio** 是一个回合制战斗引擎 + Vue 3 可视化调试沙盒。

### 能做什么

- 跑一场完整的回合制战斗：编队 → 开始 → AI 决策 → 技能执行 → 伤害计算 → Buff 生效 → 结束判定
- 在浏览器中用可视化面板控制战斗流程：开始/暂停/单步/自动/调速
- 查看每个参战角色的实时属性、Buff、护盾值
- 录制和回放战斗过程
- 调试模式下逐断点检查战斗状态
- 批量生成战斗数据用于统计分析

### 技术栈

| 领域 | 选型 | 用途 |
|------|------|------|
| 语言 | TypeScript (strict mode) | 全栈类型安全 |
| 前端 | Vue 3 + Pinia | 响应式 UI / 状态管理 |
| 构建 | Vite | 开发服务器 / 打包 |
| 动画 | GSAP | 战斗动画 |
| 测试 | Vitest | 单元/集成测试 |
| 事件 | mitt | UI 事件总线 |
| DI | tsyringe → 自制轻量容器 | 依赖注入 |

---

## 2. 快速上手

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器，浏览器打开 http://localhost:5173
npm run test         # 运行全部测试
npm run typecheck    # 类型检查（tsc --noEmit）
npm run build        # 构建生产版本 → build/dist/
```

### 项目入口

- **应用入口**: `src/main.ts` — 初始化 DI 容器 → 加载 Buff 脚本 → 挂载 Vue 应用
- **根组件**: `src/presentation/views/BattleArena.vue` — 主布局，挂载四大模块 Tab（唤灵台/昊天镜/封神榜/演劫台），`v-show` 保活
- **四大模块**（产品化「太初道枢」）：`src/presentation/modules/` 下的 `huanling`（唤灵台 · 阵容战斗）、`fengshen`（封神榜 · 后台数据管理）、`haotian`（昊天镜 · 战斗分析/回放/调试）、`yanjie`（演劫台 · 斗战西游）

---

## 3. 架构总览：DDD 四层

项目采用领域驱动设计（DDD）的四层架构。核心规则：**依赖方向由外向内，领域层不依赖任何外层代码**。

```
┌─────────────────────────────────────────────────────┐
│  presentation/  (表现层)                             │
│  Vue 组件 / Store / 样式                             │
│  依赖 application + infrastructure                    │
├─────────────────────────────────────────────────────┤
│  application/   (应用层)                             │
│  用例编排 / 投影层(BattleProjection)                  │
│  依赖 domain + infrastructure                        │
├─────────────────────────────────────────────────────┤
│  domain/        (领域层) — 核心业务逻辑               │
│  战斗引擎 / Buff系统 / 技能系统 / 属性系统             │
│  纯 TS，不依赖任何外部框架                             │
├─────────────────────────────────────────────────────┤
│  infrastructure/ (基础设施层)                         │
│  DI容器 / 事件总线 / 日志 / 动画调度器                 │
│  实现 domain/port/ 中定义的接口                        │
└─────────────────────────────────────────────────────┘
```

### 跨层通讯规则

```
UI 事件(emit) ────────→ 领域层（通过 IUIEventPort 接口）
领域层事件(emit) ──────→ 表现层（通过 TriggerEventBus / mitt）
投影层(Projection) ────→ Store（通过 setDirtyCallback 批量快照）
```

### 端口与适配器（DIP）

`domain/port/` 目录定义领域层所需的接口，`infrastructure/` 负责实现：

| 端口 | 用途 | 实现 |
|------|------|------|
| `IUIEventPort` | 领域→UI 的事件发射 | `UIEventBus.ts` |
| `IDomainEventBus` | 领域内部事件总线 | `TriggerEventBus.ts` |
| `IBattleLogManager` | 日志记录 | `BattleLogManager.ts` |
| `LoggerProvider` | 全局日志静态访问 | 各日志管理器 |

---

## 4. 代码组织

```
CombatDebugStudio/
├── src/
│   ├── domain/             # 领域层
│   │   ├── battle/         #   战斗引擎核心（15 个子模块）
│   │   ├── buff/           #   Buff 系统（声明式修饰符 + 触发器脚本）
│   │   ├── skill/          #   技能系统（步骤链 + 伤害/治疗计算器）
│   │   ├── attribute/      #   属性系统（属性代码 + 修饰符类型）
│   │   ├── character/      #   角色类型
│   │   └── port/           #   端口接口定义
│   ├── application/        # 应用层
│   │   ├── projection/     #   投影层（BattleProjection + participantMapper）
│   │   ├── service/        #   应用服务
│   │   └── facade/         #   Facade 接口
│   ├── infrastructure/     # 基础设施层
│   │   ├── di/             #   DI 容器
│   │   ├── adapters/       #   适配器
│   │   │   ├── event/      #     UIEventBus / TriggerEventBus
│   │   │   ├── logging/    #     日志管理（三层架构）
│   │   │   └── storage/    #     存储适配
│   │   ├── animation/      #   动画调度器
│   │   └── input/          #   输入处理
│   ├── shared/             # 共享层
│   │   ├── types/          #   纯类型定义（projection, battle-log, effect...）
│   │   ├── utils/          #   工具函数
│   │   └── constants/      #   常量
│   └── presentation/       # 表现层
│       ├── modules/        #   产品化四大模块（huanling 唤灵台 / fengshen 封神榜 / haotian 昊天镜 / yanjie 演劫台）
│       │   ├── huanling/   #     阵容战斗（原 views 主力界面迁入）
│       │   ├── fengshen/   #     后台数据管理（IndexedDB + 十二数据域 CRUD）
│       │   ├── haotian/    #     战斗分析（回放 ⇄ 调试双工作台，统一事件流）
│       │   └── yanjie/     #     演劫台（斗战西游）
│       ├── views/          #   页面级组件（BattleArena 等模块容器）
│       ├── components/     #   可复用组件
│       ├── stores/         #   Pinia Store（battleStore, debugStore）
│       ├── composables/    #   组合式函数
│       ├── config/         #   展示配置
│       └── styles/         #   样式
├── configs/                # JSON 配置数据
│   ├── skills/             #   技能配置
│   ├── buffs/              #   Buff 配置
│   ├── enemies/            #   敌人配置
│   └── ...
├── tests/                  # 测试
│   ├── unit/               #   单元测试
│   ├── e2e/                #   端到端测试
│   ├── factories/          #   测试工厂
│   ├── fixtures/           #   测试夹具
│   └── mocks/              #   模拟实现
├── documents/              # 设计文档 / 迁移记录
└── AGENTS.md               # AI 开发助手行为规范
```

**项目别名**（在 `vite.config.ts` 和 `tsconfig.json` 中配置）：
- `@/` → `src/`
- `@configs/` → `configs/`

---

## 5. 战斗全流程

一场战斗从开始到结束，按时间顺序经过以下类：

### 5.1 战前准备

```
BattleArena.vue（用户点击"开始战斗"）
  └→ useBattleStore().startBattle()
       └→ BattleManager.startBattle()
            ├→ 1. 获取已启用的我方/敌方队伍
            ├→ 2. 分配 seatIndex（支持阵型槽位）
            ├→ 3. 传递阵型配置到 BattleSystem.setFormations()
            ├→ 4. BattleSystem.initialize(allyTeam, enemyTeam, sceneId?)
            │      ├─ 设置伤害计算器（暴击/闪避/场地元素修正）
            │      ├─ 创建参与者 Map
            │      ├─ 创建 AI 实例
            │      ├─ 启动 BattleRecorder 录制
            │      ├─ 注册 BuffSystem 回调（伤害/治疗/能量/召唤/属性变更）
            │      ├─ 加载技能配置
            │      ├─ 注册角色被动技能和免疫
            │      ├─ 触发 BATTLE_START 被动
            │      ├─ 创建回合出手顺序（按速度排序）
            │      ├─ 分发光环 Buff 修饰符
            │      ├─ 加载场地效果
            │      └─ 应用阵型 Buff
            └→ 5. BattleSystem.setBattleState(ACTIVE)
```

### 5.2 每回合循环

```
BattleSystem.processTurnInternal()  [async]
  │
  ├─ 回合开始阶段
  │   ├─ 触发 TURN_START 事件 → TriggerEventBus → Buff 触发器
  │   ├─ 触发 TURN_START 被动 → PassiveSkillManager
  │   ├─ 复活冷却递减 + 场地周期效果
  │   ├─ 减少技能冷却 / 重置受击能量计数器 / 增加回合能量
  │   ├─ 批量预计算参与者属性（脏标记刷新）
  │   └─ 重新计算出手顺序 → TurnManager.recalculateTurnOrder()
  │
  ├─ 行动阶段（按出手顺序遍历每个参与者）
  │   │
  │   ├─ BattleExecutor.executeParticipantAction()
  │   │   ├─ AI 决策 → AISystem.selectAction() → 选技能/选目标
  │   │   ├─ SkillExecutor.executeStep() 逐个执行技能步骤链
  │   │   │   ├─ damage_step → DamageCalculator.calculate() + 应用伤害
  │   │   │   ├─ heal_step → HealCalculator.calculate() + 应用治疗
  │   │   │   ├─ add_buff_step → BuffSystem.addBuff()
  │   │   │   ├─ remove_buff_step → BuffSystem.removeBuff()
  │   │   │   ├─ extra_action_step → 请求额外行动
  │   │   │   └─ ...
  │   │   ├─ 发射战斗事件（UIEventPort → BattleEventCodes.*）
  │   │   └─ BattleRecorder 记录 CombatRecord
  │   │
  │   ├─ BuffSystem.updatePerTurn()（每回合结束后刷新）
  │   ├─ runEndConditionCheck()
  │   │   ├─ 处理待结算死亡（触发 ON_DEATH / ON_KILL 被动）
  │   │   └─ BattleRuleManager.checkBattleEndCondition()
  │   └─ 如果战斗结束 → BattleSystem.endBattle(winner)
  │
  ├─ 回合结束阶段
  │   ├─ 触发 TURN_END 事件 + 被动
  │   ├─ 场地周期效果 + 递减 + 仇恨衰减
  │   ├─ 消费 extra_action 请求（时之沙机制，每回合最多 3 次）
  │   ├─ 输出回合态势快照
  │   └─ battle.currentTurn++
  │
  └─ 下一回合 → 回到开始
```

### 5.3 战斗结束

```
BattleSystem.endBattle(winner)
  ├─ 将树状调试日志写入 BattleRecorder
  ├─ 补偿可能缺失的最后回合态势快照
  └→ BattleLifecycleManager.endBattle(winner)
      ├─ 设置 battleState = ENDED
      └→ BattleManager 发射 BATTLE_ENDED 事件
```

### 关键类速览

| 类 | 文件 | 职责摘要 |
|----|------|----------|
| `BattleSystem` | `domain/battle/BattleSystem.ts` | 战斗核心编排器，初始化/回合循环/结束判定 |
| `BattleManager` | `domain/battle/BattleManager.ts` | 对外统一接口，协调子管理器（Auto/Intervention/Replay/State） |
| `BattleExecutor` | `domain/battle/service/BattleExecutor.ts` | 参与者行动执行，技能/攻击/伤害/治疗/复活逻辑 |
| `BattleLifecycleManager` | `domain/battle/service/BattleLifecycleManager.ts` | 战斗生命周期（自动战斗循环/暂停/结束） |
| `TurnManager` | `domain/battle/service/TurnManager.ts` | 出手顺序计算（按速度排序） |
| `BattleRuleManager` | `domain/battle/service/BattleRuleManager.ts` | 战斗规则（暴击/闪避/结束条件） |
| `BattleRecorder` | `domain/battle/service/BattleRecorder.ts` | 战斗录制与回放 |
| `BattleProjection` | `application/projection/BattleProjection.ts` | 投影调度器，领域→UI 快照桥接 |
| `BattleStateManager` | `domain/battle/state/BattleStateManager.ts` | 选中角色/战斗 ID/回合计数状态管理 |

---

## 6. 关键子系统

### 6.1 战斗引擎 (`domain/battle/`)

15 个子模块，按职责分组：

| 分组 | 目录/文件 | 说明 |
|------|-----------|------|
| **编排** | `BattleSystem.ts`, `BattleManager.ts` | 战斗主循环和对外接口 |
| **服务** | `service/` | BattleExecutor / TurnManager / RuleManager / Recorder / LifecycleManager / ThreatManager / ReviveTracker / FieldEffectManager / FormationManager |
| **AI** | `ai/` | AI 决策策略（AI 系统 + 优先级策略） |
| **实体** | `entity/` | BattleParticipantImpl（参与者实现）, Buff/Participant 各特质 mixin |
| **状态** | `state/BattleStateManager.ts` | 选中角色/战斗 ID/回合计数 |
| **聚合** | `aggregate/BattleState.ts` | BattleState 创建/状态转换 |
| **类型** | `type/` | types.ts（核心类型定义）, BattleEventType.ts（事件类型） |
| **日志** | `logs/` | TraceLogCollector, BuffTraceLogger, TraceDamageLogger |
| **调试** | `debug/DebugGate.ts` | 断点暂停控制 |

### 6.2 技能系统 (`domain/skill/`)

- **技能配置驱动**: 从 `configs/skills/` JSON 加载，`GameDataProcessor` 解析
- **步骤链设计**: 每个技能由多个步骤（step）组成，`SkillExecutor` 顺序执行：
  - `damage_step` / `heal_step` / `add_buff_step` / `remove_buff_step` / `extra_action_step` / `revive_step` / `missile_step` 等
- **计算器分离**: `DamageCalculator` 和 `HealCalculator` 独立可测
- **被动技能**: `PassiveSkillManager` 管理，在 `BattleTriggerPhase.*` 阶段触发
- **目标解析**: `target-resolver.ts` 根据选择器（所有敌人/随机/生命最低/前排等）解析目标

### 6.3 Buff 系统 (`domain/buff/`)

- **声明式修饰符**: 通过 `ModifierStack` 叠加，自动同步到 `AttributeValue`
- **触发器脚本**: `scripts/` 目录下声明式脚本（如 StunDebuff, ReflectDamage），通过 `TriggerEventBus` 监听 `BattleTriggerPhase` 事件
- **生命周期**: `addBuff` → 应用修饰符 → 回合递减 → `removeBuff` → 清理修饰符
- **批处理**: `BuffContextPool` 对象池，`BuffErrorBoundary` 隔离单个 Buff 异常
- **护盾系统**: `BuffSystem.getShieldValue()` 聚合所有护盾类 Buff 的护盾值

### 6.4 日志系统

```
收集：BattleLogManager（src/infrastructure/adapters/logging/BattleLogManager.ts）
  └→ 五类日志（battle/system/item/action/debug）+ sub 日志缓冲 + 过滤 + 监听器
投影：RoundNarrativeRenderer → BattleLogProjector / EffectRenderer
  └→ BattleLogEntry[] 聚合为叙事块（round/action/settlement）+ 战斗文本投影
渲染：BattleLog.vue（src/presentation/modules/huanling/views/BattleLog.vue）
```

- `LoggerProvider.logger` 在领域层各处直接调用，不产生对基础设施层的编译时依赖
- 日志条目是结构化数据（`BattleLogEntry`），含分类、分段文本、元信息
- 结构化追踪事件（`TraceEvent`）由 `TraceEventCollector` 收集，供昊天镜（haotian 模块）回放/调试双工作台消费

### 6.5 投影层（`application/projection/`）

投影层是**领域层到表现层的单向桥接**，是石匠阶段引入的关键架构：

```
领域实体 (BattleEntity)
  │ 通过 setDirtyCallback 通知变更
  ▼
BattleProjection（调度器）
  │ queueMicrotask 批处理 / 版本号去重
  ▼
participantToSnapshot()（外部映射器）
  │ BattleEntity → UIParticipantSnapshot（纯数据）
  ▼
Pinia Store (reactive Map)
  │ Vue 响应式系统自动追踪
  ▼
Vue 组件 (BattleField / ParticipantCard...)
```

- **为什么需要投影层**: 避免 Vue 组件直接绑定领域实体（方法链、getter、mutation 不可追踪）
- **性能**: microtask 批处理 + 版本号去重，一回合内多次属性变更只触发一次重渲染
- **纯数据快照**: `UIParticipantSnapshot` 只包含原始值和纯数组，`reactive()` 零成本追踪

### 6.6 事件系统

```
UIEventPort（领域 → UI，仅 emit）
  └→ UIEventBus → mitt 实例 → Vue 组件注册监听
       ├─ BattleEventCodes.TURN_START / TURN_END
       ├─ BattleEventCodes.CURRENT_ACTOR_CHANGED
       ├─ BattleEventCodes.DAMAGE_ANIMATION
       ├─ BattleEventCodes.BUFF_EFFECT
       └─ BattleEventCodes.BATTLE_ENDED

TriggerEventBus（领域内部事件总线，emit / on / off）
  └→ Buff 触发器 / PassiveSkillManager 监听
       ├─ BattleTriggerPhase.BATTLE_START
       ├─ BattleTriggerPhase.TURN_START / TURN_END
       ├─ BattleTriggerPhase.DAMAGE_TAKEN / HEAL_RECEIVED
       └─ BattleTriggerPhase.ON_DEATH / ON_KILL
```

---

## 7. 测试

### 运行方式

```bash
npm run test           # 单次运行
npx vitest             # 交互式监听模式
```

### 测试结构

```
tests/
├── unit/               # 单元测试
│   ├── core/           #   核心领域测试
│   │   ├── buff/       #     Buff 系统测试
│   │   └── skill/      #     技能系统测试
│   ├── presentation/   #   表现层测试
│   ├── plan-b-battle.test.ts    # 战斗完整流程集成测试
│   ├── plan-b-pipeline.test.ts  # 批量生成管道测试
│   ├── TraceLogCollector.test.ts
│   └── ...
├── factories/          # ParticipantFactory — 测试用参与者工厂
├── fixtures/           # 测试夹具数据
├── mocks/              # 模拟实现
└── setup.ts            # 测试全局初始化（LoggerProvider mock）
```

### 测试原则（参照 AGENTS.md）

- 已有功能但没测试？先补测试再动代码
- 避免 mocks，测试真实的实现（setup.ts 只 mock 了 LoggerProvider）
- 测试从 `tests/` 目录运行，不包含 `node_modules` 和 `build`
- 测试环境：`happy-dom`（vitest 配置在 `vite.config.ts` 中）

---

## 8. 调试

### 昊天镜（战斗分析中心）

调试/回放集中在 **昊天镜**（`src/presentation/modules/haotian/`）：

| 能力 | 说明 |
|--------|------|
| **回放 ⇄ 调试双工作台** | 同一份 `TraceEvent[]` 两个投影：回放按时间轴播放/快照跳转，调试按因果树展开/过滤 |
| **事件流检视** | `ReplayStream`/`DebugCards` 虚拟列表 + `Inspector` 深度检视（steps/rolls/chain/delta） |
| **条件断点** | 多断点数组，按伤害/级别/随机值/单位配置，播放命中暂停定位 |
| **书签 / 会话 / 深链** | 收藏事件、导出/导入调试会话、`#m=&e=` 深链定位 |
| **导入/导出存档** | 统一存档 JSON 导入回放/调试；Markdown/CSV 摘要导出 |
| **分支对比 / 校验** | 分支 diff（unified-diff）+ Worker 校验管线（unified-validator） |

### 唤灵台战斗控制

战斗控制栏支持开始/暂停/单步执行/自动战斗/重置，调试面板（断点暂停 BATTLE_START/TURN_START/TURN_END）在唤灵台主界面。

### 关键调试模式

- **快速战斗** (`setQuickMode(true)`)：跳过动画等待
- **无头模式** (`setHeadless(true)`)：批量生成场景，抑制所有 UI 事件
- **调试断点** (`DebugGate`)：在 `BATTLE_START`/`TURN_START`/`TURN_END` 阶段暂停

---

## 9. 维护规则

1. **最后更新**标记在文件顶部，超过 3 个月未更新时触发审查
2. 仅在四层架构、领域子模块、数据流发生**结构性变更**时更新本文档
3. 不记录具体类的方法签名（那是代码的事）——关注职责、流程和数据流
4. 新子系统加入时，在关键子系统章节补充相应小节

---

*将本文档保持简短。新人 30 分钟内能回答"项目是什么、怎么组织、怎么跑、战斗怎么走、怎么调试"，就够了。*
