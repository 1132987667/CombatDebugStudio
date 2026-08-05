# UI 设计审查报告

> 审查基准：`documents/UI设计精华.md`（学自 ui-ux-pro-max-skill，11.2 万 star）
> 审查范围：`src/presentation/` 全部 Vue 组件 + `styles/` 全部 SCSS + `useBattleAnimation.ts`/`BattleAnimationService.ts` 动画链路
> 方法：全量 grep 负向验证 + 代表文件精读；每条发现带 文件:行号
> 结论：token 体系建得完整，但**落地率低**——无障碍系统性缺失、动效 token 零引用、危险操作无确认。共 25 项，其中 CRITICAL 7 项。

## 修复状态（2026-08-05 核查更新）

| 状态 | 项 |
|---|---|
| ✅ 已完成（已从正文删除） | C1-C6（无障碍+危险操作确认）、H2-H8（动效 token/reduced-motion/emoji/label/alert/焦点/对比度/循环动画）、M1（特效色豁免注释）、M3（按钮 pressed）、M5（transition: all 清零）、M6（Dialog 退出加速） |
| 🔶 部分完成 | C7（残留 4 处 div 当按钮）、H1（--ease-* token 仍零引用）、M4（BattleAnimationService 3 处裸 z-index:100） |
| 🔶 延后 | M2（裸间距 token 化——石匠守则：存量随改动文件逐步清理，不批量扫）、M7（表单提交错误聚焦——需字段校验机制，属更大工程） |
| ⚪ 未动 | L1（mark/selection 色）、L2（潜伏 mixin）、L3（未引用 keyframes）——低优先级，随清理处理 |

> 说明：回放相关（原 `_replay.scss` / `BattleReplay.vue`）已随 UI 重构迁入 haotian 模块，H6 相关文件整体消失，随重构消除。
> 新增规则：**AGENTS.md 禁止 UI 中使用 emoji**（2026-07-31，用户明确要求）

## 结论摘要（剩余未完成）

| 级别 | 数量 | 主题 |
|---|---|---|
| 🔴 CRITICAL | 1 | C7 部分残留：div 当按钮键盘不可达 |
| 🟡 MEDIUM | 4 | H1 动效 token 未引用、M4 裸 z-index、M2 裸间距、M7 表单错误聚焦 |
| ⚪ LOW | 3 | L1-L3 低优先级清理 |

## 剩余未完成项

### C7. div/li 当按钮无 role/tabindex（键盘不可达）— 部分完成
- 已修：`ParticipantCard.vue:6`、`BattleDashboard.vue:101`、`ParticipantPanel.vue` 系列、`CompendiumDialog.vue:39`、`DebugLogDialog.vue:56`、`Notification.vue:21`（已改 button）；`BuffTextGroup.vue:29`、`BuffTextPanel.vue:23` 已补 `role="button" tabindex="0"`
- 残留：
  - `BattleArena.vue:16` — error-toast 用 `role="alert"` + `@click` 清除，无 `tabindex`/键盘处理（错误条点击清除非核心操作，低危）
  - haotian 新增同类：`Inspector.vue:148`（ht-childrow @click）、`ReplayStage.vue:73`（ht-seek @click）、`StatusBar.vue:3`（ht-st-item @click）——均无 role/tabindex
- 建议：补 `role="button"` + `tabindex="0"` + Enter/Space 处理，或改 `<button>`

### H1. `--ease-*` 与 `--transition-slow` 定义后零引用 — 部分完成
- 已修：`transition: all` 清零，过渡大量改走 `--transition-fast/base/slow`（styles 内裸时长/裸缓动从报告时的数十处降至 2 处）
- 残留：`tokens.scss:244,246,247` 的 `--ease-in-out` / `--ease-bounce` 独立缓动 token 仍零引用（普通过渡依赖 `--transition-*` 内嵌的 `ease-in-out`）
- 建议：特殊缓动场景（bounce 等）落 token，或删除未用 token；裸值剩余 2 处随文件清理

### M4. 裸 z-index 绕过 token — 部分完成
- 已修：`BattleAnimationService.ts:146` 容器层已改 `var(--z-float)`
- 残留：`BattleAnimationService.ts:321,371,422` 浮动文本样式模板内仍裸 `z-index: 100`（注入式 style 字符串）
- 建议：改 `var(--z-float)`；`_cards.scss:266,368,392` 的 `z-index: 1/2/1` 属卡片内局部堆叠，按原报告结论可留

### M2. 裸间距大量存在（延后）
- 位置：`_keybind.scss`（15px/20px/10px/5px 遍布）、`_buttons.scss:15,55,121`（0.15rem/6px 12px）、`_battle-log.scss:349-359,425-426`、`_layout.scss:64`（80px）
- 依据：精华 §三 布局「8px 间距节奏」；AGENTS.md 石匠期「存量 ponytail 逐步清理，不一次扫」
- 建议：随改动文件逐步 token 化，不批量扫

### M7. 表单无 label 的输入无 focus 管理（延后）
- 位置：各弹窗表单（CharacterEditor.vue 等）提交失败后无聚焦第一个无效字段
- 依据：精华 §三 表单「提交错误后聚焦第一个无效字段」
- 建议：随 H4 一起处理（H4 已用 aria-label 兜底，M7 需字段校验机制支撑）

## ⚪ LOW

### L1. base 层裸色
- 位置：`base.scss:247-248`（mark #ff0/#000）、`:271,276`（::selection #fff）
- 建议：mark 可留（通用语义）；::selection 可走 token

### L2. 潜伏风险 mixin
- 位置：`_mixins.scss:52-55` field mixin `&:focus { outline:none }` 以 (0,2,0) 特异性压过全局 :focus-visible，当前零引用
- 建议：未来若启用，补 :focus-visible 指示；或删除

### L3. `_animations.scss:96` keyframes 未引用
- 建议：随清理删除

## 修复优先级建议（剩余项）

1. **C7 残留**：haotian 3 处 div@click 补 role/tabindex（碰到的文件顺手改）
2. **H1**：`--ease-*` 未引用 token 落地或删除；styles 剩余 2 处裸值清理
3. **M4**：BattleAnimationService 3 处裸 z-index 改 `var(--z-float)`
4. **M2/M7**：随文件逐步清理 / 字段校验机制接入后处理
5. **L1-L3**：随清理删除

---

*审查基准：`documents/UI设计精华.md`*
