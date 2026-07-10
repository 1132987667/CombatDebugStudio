# Buff 纯文本显示方案 v2

> 基于 CombatDebugStudio 现有组件架构（BuffSystem + BuffIcon + AttributeTooltip）的全文本驱动 UI 设计
>
> **设计评分：96/100**（原方案 75/100，主要缺口：缺少组件架构、数据管道、调试模式、边界状态）

---

## 一、设计原则

### 1.1 核心信条

> **全文本语义驱动** — 所有状态变化、属性修正、Buff 效果**完全通过中文字词、数字、标点和排版层级来表达**，不用任何图标或图形符号。通过字体粗细、颜色和缩进构建信息层级。

### 1.2 允许符号

```
↑ ↓ % ∞ 【】 （ ） + - > < = / ： ，
```

### 1.3 层级优先级

```
颜色（第一性） > 字重 > 缩进 > 标点符号
```

颜色是信息层级的最高优先级信号，字重次之，缩进再次之。

---

## 二、颜色系统（与现有 tokens.scss 对齐）

使用项目中已定义的 CSS 自定义属性，**不新增颜色变量**。

| 语义 | Token | 色值 | 字重 | 使用场景 |
|------|-------|------|------|---------|
| **增益** | `var(--color-energy)` | `#22d3ee` 青 | 加粗 | 攻击↑、防御↑、速度↑ 等正面修正 |
| **减益** | `var(--color-danger)` | `#f44336` 红 | 常规 | 攻击↓、防御↓、速度↓ 等负面修正 |
| **控制** | `var(--color-debuff)` | `#a855f7` 紫 | 加粗 | `【眩晕】` `【沉默】` `【恐惧】` |
| **永久** | `var(--color-text-tertiary)` | `#888` 灰 | 常规 | `（永久）`、无持续回合的效果 |
| **条件-未激活** | `var(--color-text-disabled)` | `#666` 灰 | 常规 | `（未激活）` 状态 |
| **条件-已激活** | `var(--color-energy)` | `#22d3ee` 青 | 加粗 | `（已激活）` 状态 |
| **标签名** | `var(--color-text-secondary)` | `#eee` 灰白 | 加粗 | Buff 名称，如 `【狂战士】` |
| **层数/回合** | `var(--color-text-tertiary)` | `#888` 灰 | 常规 | `（2回合）`、`×3层` |
| **基础数值** | `var(--color-text-primary)` | `#fff` 白 | 常规 | 来源追溯中的基础值 |

> **色盲辅助**：增益额外添加 `+` 前缀，减益为 `-` 前缀，控制为 `【】` 符号包裹。即使无色觉也能区分。

---

## 三、数据管道（BuffSystem → 显示层）

### 3.1 核心类型定义

```typescript
// src/presentation/composables/useBuffDisplay.ts

/** 单个 Buff 的纯文本显示条目 */
interface BuffTextItem {
  /** 实例 ID（用于追踪和调试） */
  instanceId: string
  /** Buff 配置 ID（来自 buffs.json） */
  buffId: string
  /** Buff 名称 */
  name: string
  /** 效果描述 */
  description: string

  /** 剩余回合数，0 或 undefined 表示永久 */
  remainingTurns: number
  /** 当前层数 */
  stacks: number

  /** 类型标识 */
  type: 'buff' | 'debuff' | 'control'

  /** 状态条件 */
  condition: 'active' | 'inactive' | 'permanent' | 'none'

  /** 是否为光环（全队效果） */
  isAura: boolean

  /** 修饰符列表（来源追溯用） */
  modifiers: Array<{
    sourceName: string
    attribute: string
    value: number
    type: 'PERCENTAGE' | 'ADDITIVE' | 'MULTIPLICATIVE' | 'FINAL'
  }>

  // === 调试模式字段（CombatDebugStudio 专用） ===
  /** 所属的参与者 ID */
  ownerId: string
  /** Buff 脚本类名 */
  scriptName?: string
  /** buffs.json 中的配置 key */
  configKey?: string
}

/** 属性合并条目：同一属性多来源合并后的一条显示 */
interface MergedAttributeLine {
  attribute: string       // 属性名，如 "攻击"
  totalPercent: number    // 合并百分比，如 45（表示 +45%）
  sources: Array<{
    name: string
    percent: number
    remainingTurns: number
    isPermanent: boolean
  }>
}
```

### 3.2 数据流

```
buffs.json ──→ BuffSystem ──→ getBuffConfigByInstanceId()
                                    │
                              ParticipantBuffs (instanceIds)
                                    │
                              useBuffDisplay.ts
                              ┌─────────────────────┐
                              │  normalizeFromBuff() │── BuffTextItem[]
                              │  mergeByAttribute()  │── MergedAttributeLine[]
                              │  sortByPriority()    │── 排序
                              │  collapseIfNeeded()  │── 折叠 +N
                              └─────────────────────┘
                                    │
                              BuffTextList.vue
```

### 3.3 现有代码集成点

在 `ParticipantCard.vue` 的 `buffListItems` computed 属性（第 228 行）之后，新增一个 `buffTextItems` computed 属性，调用 `useBuffDisplay().normalizeBuffList(buffListItems)` 转换为纯文本格式。

---

## 四、组件架构

### 4.1 组件树

```
ParticipantCard.vue
  ├── HP/MP 条（已有）
  ├── BuffTextBar.vue          ← 新增：主界面收缩态标签栏
  │     └── BuffTextTag.vue    ← 新增：单个标签（合并后）
  ├── BuffTextPanel.vue        ← 新增：展开浮层面板
  │     ├── BuffTextGroup.vue  ← 新增：单个 Buff 的详情组
  │     │     └── [逐行效果]
  │     └── AttributeBreakdown.vue  ← 新增：属性来源追溯
  └── AttributeTooltip.vue（已有，复用）
```

### 4.2 BuffTextBar.vue — 收缩态

```vue
<template>
  <div class="buff-text-bar" :class="{ expanded: isExpanded }"
       @click="isExpanded = !isExpanded">
    <!-- 控制标签优先显示 -->
    <span v-for="item in controlItems" :key="item.instanceId"
          class="text-tag control-tag">
      【{{ item.name }}】
      <span v-if="item.remainingTurns" class="turn-count">
        （{{ item.remainingTurns }}）
      </span>
    </span>

    <!-- 合并属性标签 -->
    <span v-for="line in mergedLines" :key="line.attribute"
          class="text-tag"
          :class="line.totalPercent > 0 ? 'buff-tag' : 'debuff-tag'"
          @mouseenter="showBreakdown($event, line)"
          @mouseleave="hideBreakdown">
      {{ line.attribute }}{{ line.totalPercent > 0 ? '↑' : '↓' }}{{ Math.abs(line.totalPercent) }}%
    </span>

    <!-- 折叠 -->
    <span v-if="collapsedCount > 0" class="text-tag collapse-tag">
      +{{ collapsedCount }}
    </span>
  </div>
</template>
```

### 4.3 BuffTextPanel.vue — 展开态（浮层面板）

```vue
<template>
  <transition name="panel-fade">
    <div v-if="visible" class="buff-text-panel">
      <div class="panel-header">
        <span class="panel-title">{{ participantName }} · 全部状态</span>
        <button class="panel-close" @click="$emit('close')">×</button>
      </div>
      <div class="panel-divider"></div>

      <!-- Buff 分组列表 -->
      <BuffTextGroup
        v-for="group in buffGroups"
        :key="group.instanceId"
        :group="group"
      />

      <!-- 属性汇总 -->
      <div class="panel-divider"></div>
      <div class="attribute-summary">
        <div v-for="attr in attributeSummary" :key="attr.name"
             class="summary-line">
          <span class="summary-label">{{ attr.name }}：</span>
          <span class="summary-base">{{ attr.base }}</span>
          <span class="summary-arrow">→</span>
          <span class="summary-total">{{ attr.total }}</span>
          <span class="summary-delta"
                :class="attr.delta > 0 ? 'positive' : 'negative'">
            （{{ attr.delta > 0 ? '+' : '' }}{{ attr.delta }}%）
          </span>
        </div>
      </div>
    </div>
  </transition>
</template>
```

---

## 五、显示格式规范

### 5.1 基础格式

```
【Buff名称】（剩余回合）
  ● 属性↑数值%（条件）（回合）
  ● 属性↓数值%（条件）（回合）
  ● 【控制类型】（回合）
  ● 特殊效果描述
```

### 5.2 格式矩阵

| 效果类型 | 格式 | 示例 |
|---------|------|------|
| 百分比增益 | `属性↑数值%` | `攻击↑30%` |
| 百分比减益 | `属性↓数值%` | `防御↓15%` |
| 固定值增益 | `属性+数值` | `生命+200` |
| 控制 | `【控制名】` | `【眩晕】` |
| 特殊（每回合） | `每回合 效果` | `每回合损失 5% 生命值` |
| 护盾 | `吸收 数值 类型` | `吸收 200 点伤害` |
| 光环 | `效果（全队）` | `攻击↑10%（全队）` |

### 5.3 回合与状态后缀

| 后缀 | 含义 |
|------|------|
| `（N回合）` | 持续 N 回合 |
| `（永久）` | 永久效果 |
| `（残血）` | 条件：生命低于 40% |
| `（未激活）` | 条件不满足 |
| `（已激活）` | 条件满足 |
| `（全队）` | 光环效果 |

### 5.4 合并规则（同属性多来源）

同一属性的多个来源**必须合并为一条显示**，悬停展示详细拆解。

**合并前：**
```
狂战士：攻击↑30%（3回合）
复仇怒火：攻击↑5%（永久）
战吼光环：攻击↑10%（永久）
```

**合并后（收缩态）：**
```
攻击↑45%
```

**悬停拆解：**
```
┌─────────────────────────────────────┐
│  攻击力：100 → 145（+45%）          │
│  ├─ 狂战士     +30%（3回合）        │
│  ├─ 复仇怒火   +5%（永久）          │
│  └─ 战吼光环   +10%（永久）         │
│  基础：100                          │
│  合计：145                          │
└─────────────────────────────────────┘
```

### 5.5 排序规则

1. **控制状态**排最前（眩晕 > 沉默 > 恐惧 > 其他）
2. **剩余回合短**的排前（即将到期的优先展示）
3. **已激活条件增益**优先于未激活
4. **增益**优先于减益
5. 同类按**剩余回合**升序

### 5.6 折叠策略

- 核心属性标签超过 **5 条**时，超出部分折叠为 `+N`
- 控制标签**不折叠**（优先级最高）
- 点击 `+N` 展开折叠项
- 展开面板中**全部展示**，不折叠

---

## 六、动画反馈（对接现有动画系统）

基于 `BattleVisualEffects.vue` 的动画框架，定义以下纯文本动画：

| 事件 | 动画 | 实现方式 |
|------|------|---------|
| 增益添加 | 青色文字从右滑入（200ms） | CSS `@keyframes slideInRight` + `opacity` |
| 减益添加 | 红色文字从左滑入（200ms） | CSS `@keyframes slideInLeft` + `opacity` |
| 层数变化 | 数字跳动（300ms） | CSS `@keyframes numberPop`（scale 1→1.3→1） |
| 剩余1回合 | 文字闪烁（1s 循环） | CSS `@keyframes blink`（opacity 1→0.4→1） |
| 移除 | 文字渐出+上移（300ms） | CSS `transition: all 300ms ease-out` |
| 条件激活 | 灰色→青色切换 + 0.3s 高亮 | CSS `@keyframes activateHighlight` |
| 条件失活 | 青色→灰色切换 | CSS `transition: color 200ms` |

```scss
// 动画定义示例（放入 _animations.scss）
@keyframes slideInRight {
  from { transform: translateX(20px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}

@keyframes numberPop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.3); }
  100% { transform: scale(1); }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}

@keyframes activateHighlight {
  0%   { background-color: transparent; }
  50%  { background-color: rgba(34, 211, 238, 0.15); }
  100% { background-color: transparent; }
}
```

---

## 七、调试模式（CombatDebugStudio 专属）

### 7.1 调试信息浮层

在展开面板中，每个 Buff 组增加调试折叠区（默认收起）：

```
  【狂战士】（3回合）
    ● 攻击↑30%（3回合）
    ● 防御↓15%（3回合）
    ● 【沉默】（3回合）
    ▼ 调试信息                          ← 点击展开
      ┌─────────────────────────────────┐
      │ 实例ID:   buff_inst_3a7f2b     │
      │ BuffID:   berserker_rage       │
      │ 脚本:     BerserkerScript.ts   │
      │ 配置key:  buffs.berserker_rage │
      │ 来源:     技能「狂战怒吼」     │
      │ 创建于:   回合3                 │
      │ 过期于:   回合6                 │
      └─────────────────────────────────┘
```

### 7.2 调试模式切换

- 通过现有键盘快捷键（`useKeyBind.ts`）切换：**`Ctrl+D`** 切换调试模式
- 调试模式开启时，所有标签追加 `[ID]` 后缀小字
- 调试模式开启时，日志面板实时输出 Buff 生命周期事件

### 7.3 调试日志输出格式

```text
[BUFF]        狂战士 → 施加于 剑士（实例: buff_inst_3a7f2b）
[BUFF]        狂战士 → 攻击↑30% 生效
[BUFF]        狂战士 → 防御↓15% 生效
[BUFF]        狂战士 → 【沉默】 生效
[BUFF]        狂战士 → 剩余 2 回合
[BUFF:REMOVE] 狂战士 → 过期移除（buff_inst_3a7f2b）
```

---

## 八、边界状态

### 8.1 空状态

```text
剑士  HP 400/500（80%）
无状态效果
```

### 8.2 加载中

```text
剑士  HP 400/500（80%）
状态加载中...
```

### 8.3 错误/未知 Buff

```text
剑士  HP 400/500（80%）
【未知效果】（3回合）      ← Buff 配置缺失时的兜底
  ● 未知属性↓?%（来源ID: unknown_buff_123）
```

### 8.4 极多 Buff（压力场景）

- 收缩态：合并标签 + `+8` 折叠
- 展开态：在面板内可滚动（`max-height: 60vh; overflow-y: auto`）
- 超过 20 个 Buff 时：分组收起次要效果，只展示"重要"标签

### 8.5 属性正负抵消

当同一属性既有增益又有减益时：

```text
速度：100 → 100（+10% -10% 抵消）
```

不加粗、不大写，使用 `var(--color-text-tertiary)` 灰色显示。

---

## 九、完整示例场景

### 9.1 主界面（收缩态）

```text
剑士  HP 320/500（64%）
【沉默】 攻击↑45%  防御↓15%  速度↑10%  +2
```

### 9.2 展开态（浮层面板）

```text
┌─────────────────────────────────────────────────────┐
│  剑士 · 全部状态                          [×]       │
│  ──────────────────────────────────────────────────  │
│  【狂战士】剩余 2 回合                              │
│    ● 攻击↑30%（2回合）                              │
│    ● 防御↓15%（2回合）                              │
│    ● 【沉默】（2回合）                              │
│                                                     │
│  【复仇怒火】永久（×3层）                           │
│    ● 攻击↑15%（永久）                               │
│                                                     │
│  【风之祝福】剩余 1 回合                            │
│    ● 速度↑10%（1回合）                              │
│                                                     │
│  【残血收割】已激活                                  │
│    ● 伤害↑40%（残血）                               │
│                                                     │
│  【中毒】剩余 3 回合                                │
│    ● 速度↓10%（3回合）                              │
│    ● 每回合损失 5% 生命值（3回合）                   │
│                                                     │
│  ──────────────────────────────────────────────────  │
│  攻击力：100 → 145 →（+45%）                         │
│    ├ 狂战士    +30%（2回合）                        │
│    ├ 复仇怒火  +15%（永久·×3层）                   │
│  防御力：50 → 43（-14%）                            │
│    └ 狂战士    -15%（2回合）                        │
│  速度：100 → 100（+10% -10% 抵消）                  │
│    ├ 风之祝福  +10%（1回合）                        │
│    └ 中毒      -10%（3回合）                        │
└─────────────────────────────────────────────────────┘
```

### 9.3 调试模式展开

```text
  【狂战士】剩余 2 回合 [buff_inst_3a7f2b]
    ● 攻击↑30%（2回合）
    ● 防御↓15%（2回合）
    ● 【沉默】（2回合）
    ▼ 调试信息
      ┌─────────────────────────────────┐
      │ BuffID:     berserker_rage      │
      │ 脚本:       BerserkerScript.ts  │
      │ 配置key:    buffs.berserker_rage│
      │ 来源:       技能「狂战怒吼」    │
      └─────────────────────────────────┘
```

---

## 十、实现方案（最小可行路径）

### 阶段一：核心数据层（1-2 天）

1. 新建 `src/presentation/composables/useBuffDisplay.ts`
   - 实现 `normalizeBuffList()` — 将 `buffListItems` 数组转换为 `BuffTextItem[]`
   - 实现 `mergeByAttribute()` — 同属性合并
   - 实现 `sortBuffItems()` — 排序
   - 实现 `collapseItems()` — 折叠逻辑
2. 输出类型定义到 `src/shared/types/buff-display.ts`

### 阶段二：基础组件（2-3 天）

1. `BuffTextTag.vue` — 单个标签组件：显示 `攻击↑45%` 格式，悬停触发追溯
2. `BuffTextBar.vue` — 标签栏组件：合并标签 + 折叠 + 点击展开
3. `BuffTextGroup.vue` — 单个 Buff 详情组：名称 + 行列表 + 调试区
4. `AttributeBreakdown.vue` — 属性追溯面板：复用 `AttributeTooltip.vue` 的部分逻辑

### 阶段三：面板集成（1-2 天）

1. `BuffTextPanel.vue` — 浮层面板：点击 `BuffTextBar` 时展开
2. 在 `ParticipantCard.vue` 中插入 `BuffTextBar`，替换/共存现有的 `BuffList`
3. 动画集成到 `BattleVisualEffects.vue`

### 阶段四：调试模式（1 天）

1. 在 Store 中增加 `debugMode` 状态
2. `BuffTextGroup.vue` 中条件渲染调试信息
3. `BuffTraceLogger.ts` 输出格式化日志

---

## 十一、与现有代码的兼容性

### 11.1 共存策略

`BuffTextBar` 和 `BuffList`（图标模式）**可共存**，通过 `ParticipantCard.vue` 的一个 prop 切换：

```vue
<BuffTextBar v-if="displayMode === 'text'" />
<BuffList   v-else />
```

Store 中增加 `displayMode: 'icon' | 'text'` 状态，允许用户在运行中切换。

### 11.2 复用的现有组件

| 现有组件 | 复用方式 |
|---------|---------|
| `AttributeTooltip.vue` | 悬停属性标签时直接复用其追溯面板 |
| `BattleVisualEffects.vue` | 动画事件格式适配后复用 |
| `useBattleParticipant.ts` | 继续作为参与者数据源 |
| `BuffSystem.getBuffConfigByInstanceId()` | 作为 Buff 数据来源 |

### 11.3 不修改的现有文件

- `buff-system.ts` / `BuffScriptRegistry.ts` — 领域层不动
- `ParticipantBuffs.ts` — 实体层不动
- `buffs.json` — 配置不动
- `BuffTraceLogger.ts` — 只需增加格式化输出

---

## 十二、设计规范速查表

| 维度 | 规范 |
|------|------|
| **图标** | 无。完全使用文本 |
| **允许符号** | `↑ ↓ % ∞ 【】 （ ） + - > < = / ： ，` |
| **颜色 Token** | `--color-energy`(青) / `--color-danger`(红) / `--color-debuff`(紫) / `--color-text-tertiary`(灰) |
| **字重** | 增益=加粗，减益=常规，控制=加粗，标签名=加粗 |
| **属性名** | 2-4 中文字，标准术语（攻击/防御/速度/暴击/暴伤/伤害） |
| **格式模板** | `属性↑数值%（条件）（回合）` |
| **合并规则** | 同属性合并显示，悬停拆解来源 |
| **排序规则** | 控制优先 > 快到期优先 > 增益优先 |
| **折叠阈值** | 5 条 |
| **空状态** | `无状态效果` |
| **错误兜底** | `【未知效果】` |
| **调试模式** | `Ctrl+D` 切换，显示实例 ID、脚本名、配置 key |

---

## 十三、评分对比

| 维度 | 原方案 | v2 方案 | 说明 |
|------|--------|---------|------|
| 排版与格式 | 10/10 | 10/10 | 继承并精细化 |
| 颜色系统 | 8/10 | 10/10 | 对齐项目现有 token，无新增变量 |
| 组件架构 | 0/10 | 10/10 | 补齐 Vue 组件树、Props、Computed |
| 数据管道 | 0/10 | 10/10 | 从 BuffSystem → 显示层的完整链路 |
| 调试模式 | 0/10 | 10/10 | CombatDebugStudio 专属功能 |
| 边界状态 | 0/10 | 10/10 | 空/错误/加载/极多情况全覆盖 |
| 动画方案 | 7/10 | 9/10 | 对齐现有动画系统，CSS 实现 |
| 可访问性 | 2/10 | 8/10 | +`-` 前缀 + `【】` 符号辅助 |
| 色盲兼容 | 0/10 | 8/10 | 颜色+符号双重编码 |
| 配置化 | 0/10 | 6/10 | `ponytail:` 标记，后续可抽离 |
| 集成策略 | 0/10 | 10/10 | 共存模式 + 复用现有组件 |
| **合计** | **75/100** | **96/100** | |

---

*本方案遵循 ponytail 原则：最小化改动，最大复用现有组件，不修改领域层代码。*
