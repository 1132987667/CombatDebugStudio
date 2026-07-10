# 战斗日志系统重构设计方案

> 版本: 1.0 | 日期: 2026-07-10 | 状态: 草案
>
> 本文档参考了 12 种游戏日志风格（暗黑地牢、杀戮尖塔、女神异闻录5、火焰纹章、神界：原罪2、
> 技术调试、宝可梦/DQ、博德之门3 CRPG、WoW MMO统计、XCOM风险概率、异度神剑连携、AI战报），
> 结合项目现有代码结构（BattleLogManager、BattleLogFormatter、CombatRecord、BattleRecorder
> 等），设计一套三层的战斗日志"三明治架构"。

---

## 目录

1. [设计目标与原则](#1-设计目标与原则)
2. [三层架构总览](#2-三层架构总览)
3. [现有系统分析](#3-现有系统分析)
4. [底层：技术调试日志 (DEBUG/TRACE)](#4-底层技术调试日志-debugtrace)
5. [中间层：玩家战斗日志 (INFO)](#5-中间层玩家战斗日志-info)
6. [顶层：战报与复盘 (SUMMARY)](#6-顶层战报与复盘-summary)
7. [核心数据模型](#7-核心数据模型)
8. [格式模板库（参考 12 种风格）](#8-格式模板库)
9. [事件流集成方案](#9-事件流集成方案)
10. [UI 改造建议](#10-ui-改造建议)
11. [迁移路线图](#11-迁移路线图)

---

## 1. 设计目标与原则

### 1.1 目标

| 编号 | 目标 | 说明 |
|------|------|------|
| G1 | 三层分离 | 玩家层 / 调试层 / 战报层互不干扰，但共享同一套事件源 |
| G2 | 零侵入 | 不改动 BattleSystem 核心战斗循环，通过事件和装饰器模式接入 |
| G3 | 可配置格式 | 每种日志级别可切换不同模板风格（极简/叙事/战术等） |
| G4 | 全链路可追溯 | 从「基础威力 → 属性加成 → 暴击判定 → 防御减免 → 最终伤害」完整记录 |
| G5 | 战报自动生成 | 战斗结束后生成结构化的 JSON 和自然语言摘要 |

### 1.2 核心原则

- **排版优先（Typography-First）**：战斗 UI 严格遵循文字信息架构，所有状态变化、属性修正及战斗反馈完全通过格式化文本来表达（颜色、字重、字号变化），而非依赖图形符号。这是本项目的核心设计哲学。
- **纯文本信息架构（Plain-Text Information Architecture）**：回归文字本质，用精准的词汇和排版代替图标，打造极致的文字沉浸感。友方名称绿色、敌方名称红色、伤害红色、治疗绿色、暴击金色——全部通过 CSS 类名而非 Emoji/图标实现。
- **YAGNI**：不新增日志框架或第三方依赖，充分利用现有的 LogLevel、LogSegment、LogEntry 体系
- **复用优先**：`battleActionToLogEntry()`、`BattleLogFormatter`、`CombatRecord`、`BattleRecorder` 全部保留并扩展
- **最小改动**：不重构 BattleLogManager 的核心存储，只在其上添加层级的门控逻辑和格式化管线

---

## 2. 三层架构总览

```
┌────────────────────────────────────────────────────────────────┐
│  顶层：战报 (SUMMARY)                                          │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • 人口统计数据：总回合、总伤害、总治疗、最高单次、被动触发  │  │
│  │ • 自然语言摘要（可配置模板：宝可梦/暗黑地牢/XCOM风格）     │  │
│  │ • JSON 结构化导出（BattleResultSummary）                  │  │
│  │ • 触发时机：battle_end 事件                               │  │
│  └──────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│  中间层：玩家战斗日志 (INFO)                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • LogSegment 富文本渲染（角色名着色、数值着色）            │  │
│  │ • CSS 着色区分：伤害红 治疗绿 暴击金 友方绿 敌方红    │  │
│  │ • 可切换模板风格（极简/叙事/宝可梦/火焰纹章）              │  │
│  │ • 实时推送到 BattleLog.vue                                │  │
│  │ • 筛选：战斗/系统/物品/动作                              │  │
│  └──────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│  底层：技术调试日志 (DEBUG/TRACE)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ • 伤害计算全链路（CombatRecord.damageBreakdown）           │  │
│  │ • TRACE 级别：完整的 DAG 调用树（进入/退出/参数）          │  │
│  │ • DEBUG 级别：摘要计算行（"防御减免: 13.04%, 最终: 87"） │  │
│  │ • 结构化为 JSON/CSV，通过 DebugLogDialog 查看             │  │
│  │ • 导出接口：JsonLogHandler / CsvLogHandler 扩展           │  │
│  └──────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│  底层：日志存储层                                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ BattleLogManager (单例):                                  │  │
│  │   battleLogs[] | systemLogs[] | itemLogs[]               │  │
│  │   actionLogs[] | debugLogs[]                              │  │
│  │   LogLevel: ERROR(0) WARN(1) INFO(2) DEBUG(3) TRACE(4)   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. 现有系统分析

### 3.1 已有能力（复用清单）

| 组件 | 路径 | 能力 | 保留/改造 |
|------|------|------|-----------|
| BattleLogManager | `infrastructure/adapters/logging/` | 日志存储、分类、索引、过滤器、监听器 | 保留，增加层级路由 |
| BattleLogFormatter | `infrastructure/adapters/logging/` | 16 种格式化函数生成 LogSegment[] | 保留，扩展模板变体 |
| battleActionToLogEntry | `shared/types/battle-log.ts` | BattleAction → BattleLogEntry | 保留，增加详细模式 |
| CombatRecord | `domain/battle/combat-record.ts` | 含 damageBreakdown 的细化记录 | 保留，作为技术日志数据源 |
| DamageBreakdown | `domain/battle/combat-record.ts` | 完整伤害计算链路 | 保留 |
| BattleRecorder | `domain/battle/service/` | 战斗事件录制、回放 | 保留，增加 Summary 收集 |
| JsonLogHandler / CsvLogHandler | `infrastructure/adapters/logging/` | JSON/CSV 格式输出 | 保留，扩展 TRACE 支持 |
| BattleLog.vue | `presentation/views/` | 玩家日志面板 | 改造，增加模板切换 |
| DebugLogDialog.vue | `presentation/views/components/` | 调试日志面板 | 改造，增加树状展开 |
| ILogger | `domain/port/logging/` | 4 方法端口接口 | 保留 |

### 3.2 当前不足

| 不足 | 说明 | 本方案解决方式 |
|------|------|----------------|
| 玩家/调试日志未分离 | 全混在同一个 BattleLogManager 中 | 通过 LogLevel 门控 + 独立订阅通道 |
| 缺少 TRACE 级别计算日志 | DamageBreakdown 存在但未被记录为日志 | 新增 TraceDamageLogger 提取链路到 debugLogs |
| 缺少战报/摘要 | 战斗结束没有结构化总结 | 新增 BattleSummaryGenerator 监听 battle_end |
| 模板风格单一 | 只有一种 LogSegment 格式 | 引入 TemplateStyle 枚举和 StyleRenderer |
| 日志条目缺乏符号标识 | 纯文字，无图标/Emoji | 扩展 LogSegment（classStr 着色） |

---

## 4. 底层：技术调试日志 (DEBUG/TRACE)

### 4.1 设计目标

在 DEBUG 级别输出「精简计算行」，在 TRACE 级别输出「完整调用树」，形成类似 **版本F（技术调试）+ 版本H（CRPG）** 的调试日志。

### 4.2 数据流

```
DamageCalculator.calculate()
  → CombatRecord (含 DamageBreakdown)
  → TraceDamageLogger (新增)
    → DEBUG: 单行摘要 "[剑士]攻击[史莱姆] 原始104→减免13.04%→最终87"
    → TRACE: 多行树状结构 (见下方)
  → battleLogManager.addDebugLog() 以 LogLevel.DEBUG/TRACE 写入
```

### 4.3 TRACE 树状格式

```
├─ BaseDamage: 100 (MIN=80, MAX=120, roll=100)
├─ ExtraContributions:
├─ DefenseValue: 15
├─ DefenseReduction: 15/(15+100) = 13.04%
├─ FinalDamage: 100*(1-0.1304) = 87 (clamp 1~9999)
└─ RESULT: 87
```

### 4.4 新增类型

```typescript
// 新增：技术日志条目（扩展自 LogEntry）
export interface TraceLogEntry extends LogEntry {
  /** 计算链标识 */
  traceId: string
  /** 父 trace ID（用于树状嵌套） */
  parentTraceId?: string
  /** 计算步骤名 */
  stepName: string
  /** 步骤值 */
  stepValue: number
  /** 步骤描述 */
  description: string
}
```

### 4.5 关键新增类：TraceDamageLogger

```typescript
// 位置: src/domain/battle/logs/TraceDamageLogger.ts
// 职责: 将 DamageBreakdown 结构化为 DEBUG/TRACE 日志行

export class TraceDamageLogger {

  logDamageBreakdown(
    record: CombatRecord,
    breakdown: DamageBreakdown,
  ): void {
    const turn = record.turn
    const source = record.actorName
    const target = record.targetName ?? 'unknown'

    // 始终输出 DEBUG 摘要行
    battleLogManager.addDebugLog(
      `DMG_SUMMARY ${source}→${target} | raw=${breakdown.baseDamage}→final=${breakdown.finalDamage} ` +
      `defReduction=${((1 - (breakdown.defenseMultiplier ?? 1)) * 100).toFixed(2)}% ` +
      LogLevel.DEBUG,
    )

    // 仅在 TRACE 级别开启时输出详细树
    if (this.shouldTrace()) {
      this.logTraceTree(traceId, source, target, breakdown, turn)
    }
  }
}
```

### 4.6 与 CombatRecord 的集成

现有 `CombatRecord.damageBreakdown` 已包含完整链路，只需在 `BattleExecutor` 执行动作后调用 TraceDamageLogger：

```
// BattleExecutor.executeAction() 末尾 --- 新增
if (record.damageBreakdown) {
  traceDamageLogger.logDamageBreakdown(record, record.damageBreakdown)
}
```


```typescript
//
//   ├─ Conditions: phase=ON_DAMAGE_TAKEN, isOnHit=true
//   ├─ Cooldown: 0, Prob: 1.0, MaxUses: 5
//
```

---

## 5. 中间层：玩家战斗日志 (INFO)

### 5.1 设计目标

参考 **排版优先（Typography-First）** 原则，在 `BattleLog.vue` 中展示简洁、清晰、纯中文格式的动作日志。所有视觉区分通过**文字颜色**（友方绿/敌方红/伤害红/治疗绿/暴击金）、**字重**和**排版**实现，不依赖 Emoji 或图标。支持模板风格切换。

### 5.2 文本化 LogSegment 扩展

```typescript
// 扩展 LogSegment，增加 style 字段（行内样式覆盖）
  /** 片段CSS类名 */
  classStr?: string
}
```


```typescript
} as const
```

### 5.3 玩家日志模板风格

每种风格是一个实现了 `PlayerLogRenderer` 接口的渲染器：

```typescript
export interface PlayerLogRenderer {
  /** 渲染器唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 将 BattleLogEntry 渲染为 LogSegment[] */
  render(entry: BattleLogEntry, participants: ParticipantMap): LogSegment[]
}
```

#### 风格 A：宝可梦/亲和（默认）

```
[攻击] 剑士 对 史莱姆 发起了攻击！
  造成 104 点伤害！ 史莱姆 HP 下降了！
[增益] 【复仇怒火】发动了！ 剑士 的攻击提升了 5%！
[受击] 史莱姆 对 剑士 反击！
  造成 45 点伤害！
```

实现了「教科书般」的事件叙述，强调"谁对谁做了什么"，每行一个自然句。

#### 风格 B：杀戮尖塔/极简

```
T1  [攻击]剑士→史莱姆: 104 复仇怒火+5%
    [受击]史莱姆→剑士: 45
T2  [治疗]牧师→剑士: 180(满)
    [暴击]剑士→史莱姆: 110 暴击!
    复仇怒火 1→2 (+10%)
```

单行一条事件，数据密集，适合快速浏览。中文标记区分动作类型。

#### 风格 C：火焰纹章/战术

```
▶ 剑士 HP:500/500 → 史莱姆 HP:500/500
  命中率: 95% | 暴击率: 20% | 伤害: 100-108
  ├─ 命中判定: 75<95 ✅
  └─ 伤害: 104
  复仇怒火 触发! 攻击+5%
◀ 史莱姆 反击!
  命中率: 80% | 伤害: 45
```

强调战斗前的概率预测，适合策略向玩家。

#### 风格 D：暗黑地牢/叙事

```
剑士的呼吸沉重，剑刃反射着浑浊的光芒…
  他挥剑斩向史莱姆！
  命中！剑刃切入粘稠的躯体…
  造成 104 点伤害！
  眼中燃起怒火——复仇怒火被唤醒！（攻击力+5%）
```

沉浸式叙述，适合剧情向游戏。

### 5.4 模板切换机制

```typescript
// 在 BattleLogManager 中新增
export class BattleLogManager {
  // ... 现有代码 ...

  /** 当前玩家的日志渲染器 */
  private playerRenderer: PlayerLogRenderer = PokemonStyleRenderer

  /** 切换渲染器 */
  setPlayerRenderer(renderer: PlayerLogRenderer): void {
    this.playerRenderer = renderer
  }

  /** 添加玩家日志（使用当前渲染器） */
  addPlayerLog(action: BattleAction): void {
    const logEntry = battleActionToLogEntry(action, this.participantMap)
    const segments = this.playerRenderer.render(logEntry, this.participantMap)
    this.addBattleLog({
      turn: logEntry.turn,
      segments,
      level: LogLevel.INFO,
    })
  }
}
```

### 5.5 连续事件合并

参考 `documents/日志管理.md` 第 3.1 节的合并需求，在 `BattleLogManager` 中添加合并逻辑：

```typescript
// 合并配置（可开关）
interface MergeConfig {
  enabled: boolean
  // 相同的来源+目标+动作类型，且中间无其他类型事件打断时合并
  mergeWindowMs: number // 时间窗口，默认 3000ms
}

// 合并后的特殊 BattleLogEntry
interface MergedBattleLogEntry extends BattleLogEntry {
  mergeCount: number      // 合并次数
  totalDamage: number     // 累积值
  subEntries: BattleLogEntry[] // 展开后的明细
}
```

---

## 6. 顶层：战报与复盘 (SUMMARY)

### 6.1 设计目标

战斗结束后自动生成多维度战报，参考 **版本L（AI摘要）+ 版本I（MMO统计）**。

### 6.2 战报数据结构

```typescript
// 新增: 战斗摘要
export interface BattleSummary {
  battleId: string
  totalRounds: number
  winner: string
  duration: number // ms

  // 伤害统计
  totalDamageDealt: number
  totalDamageTaken: number

  passiveTriggers: Array<{
    passiveId: string
    passiveName: string
    owner: string
    triggerCount: number
  }>

  // 参与者状态
  participants: Array<{
    id: string
    name: string
    team: string
    hpEnd: number
    hpMax: number
    totalDamageDealt: number
    totalDamageTaken: number
  }>

  // 自然语言摘要（按模板生成）
  narrative: string

  // 最终状态快照
  finalSnapshot: {
    participants: Array<{
      id: string
      name: string
      hp: number
      maxHp: number
    }>
  }

  // 动作时间线（精简版，用于复盘回放）
  actionTimeline: Array<{
    turn: number
    actor: string
    action: string
    target: string
    damage?: number
  }>
}
```

### 6.3 战报刊文模板

与玩家日志共用 `PlayerLogRenderer` 体系，但输出为纯文本段落：

```
// 宝可梦风格（默认）:
// "战斗持续了3回合。剑士造成了214点伤害（含1次暴击），
//  牧师提供了180点治疗。最终，我方取得了胜利！"

// 暗黑地牢风格:
// "历经3个回合的苦战，史莱姆终于在剑士的剑下化为粘液。
//  剑士的伤口仍未愈合（HP 283/500），但眼中怒火未熄……"

// 极简风格:
// "R3 | 胜利 | 输出: 214 | 治疗: 180 | 最高: 110"
```

### 6.4 事件流集成

```typescript
// 新增：BattleSummaryGenerator
// 位置: src/domain/battle/logs/BattleSummaryGenerator.ts

export class BattleSummaryGenerator {
  private summaryData = new Map<string, BattleSummaryAccumulator>()

  // 战斗开始时初始化累加器
  onBattleStart(battleId: string): void { /* ... */ }

  // 每回合/动作更新累加器
  onAction(battleId: string, action: BattleAction): void {
    const acc = this.summaryData.get(battleId)
    if (!acc) return
    acc.totalDamageDealt += action.damage ?? 0
    if ((action.damage ?? 0) > acc.highestDamage.value) {
    }
    // ... 更多统计
  }

  // 战斗结束时生成摘要
  onBattleEnd(battleId: string): BattleSummary {
    const acc = this.summaryData.get(battleId)
    if (!acc) return this.emptySummary()
    const summary = this.buildSummary(acc)
    this.summaryData.delete(battleId)
    return summary
  }
}
```

BattleSummaryGenerator 通过事件总线订阅 `BATTLE_LOG` 和 `BATTLE_ENDED` 事件，零侵入地接入现有系统。

---

## 7. 核心数据模型

### 7.1 类型文件变更

**新增文件**：
- `src/shared/types/battle-summary.ts` — BattleSummary 及其相关类型
- `src/shared/types/trace-log.ts` — TraceLogEntry 等调试日志类型
- `src/shared/types/log-renderer.ts` — PlayerLogRenderer 接口

**现有文件修改**：
- `src/shared/types/battle-log.ts` — 扩展 LogSegment

### 7.2 LogSegment 最终形态

```typescript
export interface LogSegment {
  text: string
  classStr?: string
}
}
```

### 7.3 层级与日志级别的映射

| 层级 | LogLevel | 存储目标 | 展示目标 | 是否默认开启 |
|------|----------|----------|----------|-------------|
| 玩家日志 | INFO | battleLogs[] | BattleLog.vue | ✅ |
| 系统/物品 | INFO | systemLogs[] / itemLogs[] | BattleLog.vue（筛选） | ✅ |
| 计算摘要 | DEBUG | debugLogs[] | DebugLogDialog.vue | ❌（手动开启） |
| 完整链路 | TRACE | debugLogs[] | DebugLogDialog.vue（树状视图） | ❌（手动开启） |
| 战报摘要 | — | 独立对象 | BattleSummaryDialog.vue | 战斗结束自动 |

---

## 8. 格式模板库

### 8.1 模板索引

参考 12 种游戏日志风格，整理为两种用途的模板：

| 模板 ID | 来源风格 | 用途 | 实现复杂度 |
|---------|---------|------|-----------|
| `pokemon` | 版本G 宝可梦 | 玩家日志默认 | ⭐⭐ |
| `slay-the-spire` | 版本B 杀戮尖塔 | 玩家日志可选 | ⭐⭐ |
| `fire-emblem` | 版本D 火焰纹章 | 玩家日志可选 | ⭐⭐⭐ |
| `darkest-dungeon` | 版本A 暗黑地牢 | 玩家日志可选 | ⭐⭐⭐⭐ |
| `persona` | 版本C 女神异闻录 | 玩家日志可选 | ⭐⭐⭐⭐⭐ |
| `xcom` | 版本J XCOM | 玩家日志可选 | ⭐⭐⭐ |
| `mmo` | 版本I WoW | 顶部仪表盘 | ⭐⭐⭐ |
| `crpg` | 版本H 博德之门3 | 调试日志默认 | ⭐⭐⭐⭐ |
| `debug-tech` | 版本F 技术调试 | 调试日志可选 | ⭐⭐⭐⭐⭐ |
| `ai-narrative` | 版本L AI摘要 | 战报默认 | ⭐⭐⭐⭐ |

### 8.2 模板优先级（ponytail 懒人实现建议）

1. **先实现 `pokemon` 和 `slay-the-spire`** — 这两个覆盖了 90% 的玩家场景
2. **DEBUG/TRACE 先用 `crpg`** — 计算行输出快，直接复用现有 DamageBreakdown
3. **战报先用极简格式** — 一段字符串加几个数字，不急着上 AI 摘要
4. 其余模板标记为「后续扩展」，不阻塞本次重构

---

## 9. 事件流集成方案

### 9.1 当前事件流

```
BattleSystem
  → BattleExecutor.executeAction()
    → BattleRecorder.recordAction() // 存 CombatRecord
    → eventBus.emit('battle-log')   // 送 BattleLogEntry
      → BattleEventManager.handleBattleLogEvent()
        → battleLogManager.addBattleLog()
```

### 9.2 改造后的事件流

```
BattleSystem
  → BattleExecutor.executeAction()
    → BattleRecorder.recordAction()               // 保留：录 CombatRecord
    → [新增] TraceDamageLogger.logDamageBreakdown() // DEBUG/TRACE
    → [新增] BattleSummaryGenerator.onAction()     // 战报累加
    → eventBus.emit('battle-log')
      → BattleEventManager.handleBattleLogEvent()
        → battleLogManager.addPlayerLog()           // 改造：用当前渲染器
        → battleLogManager.addBattleLog()           // 保留：原始数据

Battle结束
  → eventBus.emit('battle-ended')
    → BattleSummaryGenerator.onBattleEnd()          // 生成战报
    → eventBus.emit('battle-summary', summary)      // 新事件
      → BattleSummaryDialog 展示
```

**核心原则**：改造后的代码只是**在现有流程上增加旁路**，不修改任何 BattleSystem/BattleExecutor 的内部逻辑。

### 9.3 不需要改动的文件

| 文件 | 原因 |
|------|------|
| BattleSystem.ts | 战斗主循环逻辑不变 |
| BattleExecutor.ts | 只增加调用后钩子，不修改执行逻辑 |
| BattleRecorder.ts | 录制逻辑完整，不需要改动 |
| BattleLogManager.ts | 只增加方法，不修改已有方法签名 |
| BattleEventManager.ts | 增加监听新事件的逻辑，不修改已有逻辑 |

### 9.4 需要改动的文件清单

| 文件 | 改动内容 | 工作量 |
|------|----------|--------|
| `shared/types/battle-log.ts` | LogSegment classStr 增强 | 极小 |
| `infrastructure/adapters/logging/BattleLogFormatter.ts` | 保留现有格式化函数 | 极小 |
| `infrastructure/adapters/logging/BattleLogManager.ts` | 增加 setPlayerRenderer/addPlayerLog/addTraceLog | 中 |
| `presentation/views/BattleLog.vue` | 增加模板切换 | 中 |
| `presentation/views/components/DebugLogDialog.vue` | 增加 TRACE 树状展开 | 中 |

### 9.5 新增文件清单

| 文件 | 职责 | 工作量 |
|------|------|--------|
| `domain/battle/logs/TraceDamageLogger.ts` | DamageBreakdown → DEBUG/TRACE 日志 | 小 |
| `domain/battle/logs/BattleSummaryGenerator.ts` | 战报累加和生成 | 中 |
| `domain/battle/logs/PlayerLogRenderer.ts` | 玩家日志渲染器接口 | 极小 |
| `domain/battle/logs/renderers/PokemonStyleRenderer.ts` | 宝可梦风格实现 | 中 |
| `domain/battle/logs/renderers/SlayTheSpireRenderer.ts` | 极简风格实现 | 中 |
| `domain/battle/logs/renderers/FireEmblemRenderer.ts` | 战术风格实现 | 中 |
| `shared/types/battle-summary.ts` | 战报类型定义 | 小 |
| `shared/types/trace-log.ts` | 调试追踪类型定义 | 小 |
| `shared/types/log-renderer.ts` | 渲染器接口+符号表 | 极小 |
| `presentation/views/components/BattleSummaryDialog.vue` | 战报展示弹窗 | 中 |

---

## 10. UI 改造建议

### 10.1 BattleLog.vue 改造

```
# 当前：
  [复选框] 战斗 | 系统 | 操作 | 调试   [关键字] [F]过滤
  列表：index | type | segments

# 改造后：
  [下拉选择: 日志风格] 宝可梦 | 极简 | 战术     ← 新增
  [复选框] 战斗 | 系统 | 物品 | 动作           ← 保留
  [关键字输入]                               ← 保留
  [清空] [导出JSON]                          ← 新增导出按钮
  ────────────────────────────────────────
  列表：text (着色 + 中文排版)
  ────────────────────────────────────────
  底部：实时统计条 (总伤害/总治疗/回合数)       ← 新增
```

### 10.2 DebugLogDialog.vue 改造

```
# 改造后：
  [日志级别筛选] ERROR | WARN | INFO | DEBUG | TRACE   ← 新增级别标签
  [搜索]                                ← 保留
  [清空] [导出JSON] [导出CSV]           ← 保留并扩展
  ────────────────────────────────────────
  列表（TRACE 级别可展开树状）:
  ▶ DMG_CALC 剑士→史莱姆 | turn=1     ← 可展开
    ├─ BaseDamage: 100
    └─ RESULT: 87
```

### 10.3 新增 BattleSummaryDialog.vue

战斗结束时自动弹出，或在右上角显示"查看战报"按钮。

```
┌──────────────────────────────────────────────────┐
│  战斗战报                                      │
│  ─────────────────────────────────────────────────  │
│  胜利！剑士 & 牧师                            │
│  3 回合 · 8.0s                                │
│  ─────────────────────────────────────────────────  │
│  总伤害: 214  |  最高: 110 (剑士·暴击)          │
│  总治疗: 180  |  最高: 180 (牧师)                │
│  被动触发: 2 次 (复仇怒火)                        │
│  ─────────────────────────────────────────────────  │
│  [复制摘要] [详细数据] [导出JSON]       │
└──────────────────────────────────────────────────┘
```

---

## 11. 迁移路线图

### 第一阶段：底层基础设施（1-2 天）

```
Step 1: 扩展类型系统
  创建: shared/types/log-renderer.ts
  创建: shared/types/trace-log.ts
  修改: shared/types/battle-log.ts → LogSegment classStr 增强

Step 2: 实现 TraceDamageLogger
  创建: domain/battle/logs/TraceDamageLogger.ts
  在 BattleExecutor 中集成（增加 ~3 行调用）

```

### 第二阶段：玩家日志模板（2-3 天）

```
Step 4: 实现 PlayerLogRenderer 接口
  创建: domain/battle/logs/PlayerLogRenderer.ts
  创建: domain/battle/logs/renderers/PokemonStyleRenderer.ts
  创建: domain/battle/logs/renderers/SlayTheSpireRenderer.ts

Step 5: 改造 BattleLogManager
  增加 setPlayerRenderer / addPlayerLog 方法

Step 6: 改造 BattleLog.vue
  增加模板切换下拉菜单
  
  增加底部统计条
```

### 第三阶段：战报系统（1-2 天）

```
Step 7: 实现 BattleSummaryGenerator
  创建: domain/battle/logs/BattleSummaryGenerator.ts
  注册到 eventBus（battle-log / battle-ended）

Step 8: 创建 BattleSummaryDialog.vue
  展示摘要数据
  导出功能
```

### 第四阶段：打磨与收尾（1 天）

```
Step 9: DebugLogDialog.vue TRACE 树状展开
Step 10: 集成测试
Step 11: 补充 JSDoc 和 ponytail 注释
```

**总计工作量：约 5-8 人天**

---

## 附录

### A. 与现有文件的对应关系

```
现有文件                                   本方案新增/改造
────────────────────────────────────────────────────────────
domain/battle/types.ts                   ← 无改动
  (BattleAction)

domain/battle/combat-record.ts           ← 无改动
  (CombatRecord, DamageBreakdown)

infrastructure/adapters/logging/         ← 改造: 增加方法
  BattleLogManager.ts                    ← 改造: 增加方法

domain/battle/logs/                     ← 全部新增
  (空目录)

shared/types/battle-log.ts              ← 改造: LogSegment 扩展
```

### B. 参考风格对照表

| 层级 | 参考版 | 关键特性 |
|------|--------|----------|
| 玩家日志 INFO | 版本G 宝可梦、版本B 杀戮尖塔 | CSS 着色、中文排版、模板切换 |
| 技术调试 DEBUG | 版本F 技术调试 | 单行计算摘要 |
| 技术调试 TRACE | 版本H CRPG 博德之门3 | 树状展开、完整链路 |
| 战报 SUMMARY | 版本L AI摘要、版本I MMO | 统计数据+自然语言 |

### C. 不纳入本次设计的范围

- **战斗回放系统**：已有 BattleRecorder/Replay 模块，日志系统只提供数据源
- **AI 摘要生成**：版本L 的 AI 叙述作为未来扩展，第一阶段用模板字符串替代
- **性能指标日志**：DPS/HPS 实时仪表盘（版本I 部分功能）标记为第二阶段
- **元素地表互动**：版本E 神界：原罪2 风格依赖尚未实现的元素系统

---

> 文档完成。本方案基于 12 种游戏日志风格的研究和项目现有代码的全面分析，
> 以惰性工程（ponytail）为原则，优先复用已有基础，最小化代码改动。
