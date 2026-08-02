# UI 设计审查报告

> 审查基准：`documents/UI设计精华.md`（学自 ui-ux-pro-max-skill，11.2 万 star）
> 审查范围：`src/presentation/` 全部 Vue 组件 + `styles/` 全部 SCSS + `useBattleAnimation.ts`/`BattleAnimationService.ts` 动画链路
> 方法：全量 grep 负向验证 + 代表文件精读；每条发现带 文件:行号
> 结论：token 体系建得完整，但**落地率低**——无障碍系统性缺失、动效 token 零引用、危险操作无确认。共 25 项，其中 CRITICAL 7 项。

## 修复状态（2026-07-31 更新）

| 状态 | 项 |
|---|---|
| ✅ 已修复 | C1-C7（无障碍+危险操作确认）、H1（动效 token）、H2（GSAP reduced-motion）、H3（UI emoji 清零）、H4（表单 aria-label）、H5（alert 替换）、H6（frame-slider 焦点）、H7（浅色对比度）、H8（随 H2 兜底）、M1（ToggleSwitch/BattleField 收编+特效色注释豁免）、M3（按钮 pressed 态）、M4（z-index token 化）、M5（transition: all 明确化）、M6（Dialog 退出加速，第一批已做） |
| 🔶 延后 | M2（裸间距 token 化——石匠守则：存量随改动文件逐步清理，不批量扫）、M7（表单提交错误聚焦——需字段校验机制，属更大工程） |
| ⚪ 未动 | L1（mark/selection 色）、L2（潜伏 mixin）、L3（未引用 keyframes）——低优先级，随清理处理 |

> 新增规则：**AGENTS.md 禁止 UI 中使用 emoji**（2026-07-31，用户明确要求）

## 结论摘要

| 级别 | 数量 | 主题 |
|---|---|---|
| 🔴 CRITICAL | 7 | 无障碍系统性缺失（aria-live/tabular/ESC/焦点/键盘可达）、危险操作无确认 |
| 🟠 HIGH | 8 | emoji 图标、动效 token 零引用、reduced-motion 缺失、表单 label、错误反馈方式 |
| 🟡 MEDIUM | 7 | 硬编码色、裸间距、hover 无 pressed 态、裸 z-index、对比度 |
| ⚪ LOW | 3 | mark/selection 色、潜伏 mixin、过渡小尾巴 |

## 🔴 CRITICAL（无障碍 / 数据安全，优先修）

### C1. 全库无 `aria-live` — 读屏用户听不到任何实时信息
- 位置：`src/presentation/` 全量 grep `aria-live|aria-atomic` 零命中；受影响：`BattleLog.vue:27-28`（战斗日志）、`Notification.vue:11`（toast）、`BattleArena.vue:16-18`（错误条）
- 依据：精华 §三 无障碍「实时内容用 aria-live」
- 建议：日志区加 `aria-live="polite"`；toast 容器加 `aria-live="polite"`；错误条加 `role="alert"`

### C2. 全库无 `tabular-nums` — 战斗数字跳动引发布局抖动
- 位置：整个 `src/` grep `tabular-nums|font-variant-numeric|font-feature-settings` 零命中；受影响：`ParticipantCard.vue` 属性区、`BattleLog.vue` 日志数字、`BattleReplay.vue:7-8,37` 帧/事件计数、`BattleDashboard.vue` 统计
- 依据：精华 §三 排版颜色「数字列用 tabular-nums」；本项目战斗数值变化极频繁，抖动肉眼可见
- 建议：`base.scss` 对含数字的类（.stat-value、.log 数字、.event-time、.count 等）统一加 `font-variant-numeric: tabular-nums;` 或抽 mixin

### C3. Dialog 无 ESC 关闭、无焦点管理（初始聚焦/陷阱/还原）
- 位置：`Dialog.vue:13-81`（watch 只锁 body overflow，无 keydown）；所有子对话框继承
- 依据：精华 §三 无障碍「ESC 可关闭、打开聚焦、焦点陷阱、关闭还原」；§三 弹窗「逃生口」
- 建议：`Dialog.vue` 统一补：ESC 监听、打开时 focus 到弹窗（如 .dialog-container 或首个可聚焦元素）、Tab 焦点陷阱、关闭后还原焦点。一处修改全部子对话框受益（共享组件原则）

### C4. ToggleSwitch 键盘完全不可达
- 位置：`ToggleSwitch.vue:38-40` — input `display:none`，无 tabindex/role
- 依据：精华 §三 无障碍「键盘全可达」
- 建议：改为视觉隐藏但可聚焦（`position:absolute; opacity:0` + tabindex），或 label 包裹 + role="switch"

### C5. 纯图标按钮无 aria-label/title
- 位置：`Dialog.vue:20`（×）、`DebugControlDialog.vue:17`（×）、`CompendiumDialog.vue:17`（×）、`Notification.vue:21`（div 关闭按钮）
- 依据：精华 §四 反模式「纯图标按钮无 label」
- 建议：Dialog 关闭按钮统一加 `aria-label="关闭"`；Notification 关闭改 button

### C6. 危险操作无确认，直接执行（防数据丢失）
- 位置：`BattleReplay.vue:287`（删除记录）、`ParticipantPanel.vue:478`（清空）/`:471`（移除角色）、`SceneManagementDialog.vue:108`（删除场景）、`BattleArena.vue:720`（重置战斗）、`CharacterEditor.vue:110`（完全重置）、`DebugControlDialog.vue:156,177,205`（杀死选中/重置/清动画）
- 依据：精华 §三 表单「危险操作先确认」；AGENTS.md「防数据丢失的错误处理」是硬要求
- 建议：删除/清空/重置统一二次确认（本项目 Dialog 体系现成，加 confirm 弹窗）

### C7. div/li 当按钮无 role/tabindex（键盘不可达）
- 位置：`Notification.vue:21`、`BattleArena.vue:16`、`BattleDashboard.vue:101`、`ParticipantPanel.vue:31,57,104,112`、`CompendiumDialog.vue:39`、`BuffTextGroup.vue:29`、`BuffTextPanel.vue:23`、`DebugLogDialog.vue:56`、`ParticipantCard.vue:6`
- 依据：精华 §三 无障碍「div/li 当按钮要有 role + tabindex + 键盘处理」
- 建议：改 `<button>` 或补 role="button" + tabindex="0" + Enter/Space 处理

## 🟠 HIGH（专业度 / 动效一致性）

### H1. `--ease-*` 与 `--transition-slow` 定义后零引用，全部裸时长/裸缓动
- 位置：grep `--ease-|--transition-slow` 仅命中 `tokens.scss:240,242-243` 定义处；实际用法全为裸值：`_battle-log.scss:466,486`、`_cards.scss:127-136,394`、`_dialog.scss:76,86`、`_keybind.scss:24`、`_notification.scss:30-31`、`_replay.scss` 多处
- 依据：精华 §三 动画「统一 duration/easing 到 token」；§四 反模式「散落随机时长」
- 建议：过渡统一走 `--transition-fast/base/slow` + `--ease-*`；这是纯 token 替换，可批量做

### H2. prefers-reduced-motion 覆盖不全，GSAP 链路完全无检测
- 位置：styles 仅 `_battle-log.scss:484` 一处；组件 3 处（BuffTextTag.vue:128、Tabs.vue:285、TacticalSelect.vue:731）；`BattleAnimationService.ts`（含 1s/1.5s/2s 循环动画）无任何检测
- 依据：精华 §三 无障碍「尊重 prefers-reduced-motion：全局兜底」
- 建议：SCSS 加全局 `@media (prefers-reduced-motion: reduce)` 关动画/过渡；GSAP 链路入口处检测并降级

### H3. Emoji 当图标（结构/控制用途）
- 位置：`ControlBar.vue:5,28,34,41`（⚡⏸）、`BattleReplay.vue:14-32`（⏮⏪⏸▶⏩⏭ 回放按钮）、`:64,117,120`（🔖📌🔍）、`DebugControlDialog.vue:142-199`（⚔️👤🎯🔧📝📊🎬 模块图标）、`useParticipantStats.ts:218-223`（❤️⚡⚔️🛡️🎯）、`BattleDashboard.vue:330-334`（🛡️⚔️🔥✨）、`Notification.vue:46`（⚠✓✗ℹ）、`_battle-log.scss:212`（CSS `content:'🔥 '`）
- 依据：精华 §四 反模式第一条「emoji 当结构图标」
- 建议：控制类图标换 SVG（项目无图标库依赖，可用内联 SVG 或 Phosphor 风格单色路径）；装饰类（🔖📌 等有文字的）可留但标注

### H4. 表单仅 placeholder 无可见 label / 无 for 关联
- 位置：`BattleLog.vue:10`、`BattleReplay.vue:96`、`ParticipantPanel.vue:100`、`CharacterEditor.vue:42,55`、`DebugLogDialog.vue:40`、`TraceLogTree.vue:17,34`、`SceneManagementDialog.vue:17`、`BattleRulesDialog.vue:32`；全库无 `<label for=…>`
- 依据：精华 §三 表单「每个输入有可见 label（for 关联）」
- 建议：抽公共 Input 组件带 label，或补 aria-label + 可见占位文字（调试工具可接受最低限度：aria-label）

### H5. 错误提示不贴字段，统一 toast/汇总条；一处用原生 alert
- 位置：`DataSnapshotDialog.vue:119,132`（`alert()`）；其余走 `Notification.vue` toast / `BattleArena.vue:16-18` 汇总条
- 依据：精华 §三 表单「错误贴字段下方、指出原因+怎么修」
- 建议：至少把 `alert()` 换掉；表单类弹窗补字段级错误展示

### H6. 焦点环被移除且无替代（.frame-slider）
- 位置：`_replay.scss:75` — `.frame-slider { outline: none }` 无替代焦点指示
- 依据：精华 §三 无障碍「自定义控件必须有 focus 指示」；§四 反模式「删焦点环」
- 建议：加 `:focus-visible` 边框/box-shadow 指示

### H7. 浅色主题对比度不达标 + 用 disabled 色显示非禁用信息
- 位置：`tokens.scss:254`（浅色 `--color-text-tertiary: #888888` 在 #f0f2f5 上 ≈2.9:1，正文不达标）；`:255`（disabled #ccc 更低）；用 disabled 色当正文：`_layout.scss:294-296`（.scene-count）、`_replay.scss:317-319`（.event-time）、`_layout.scss:328-340`（empty 提示）、`_cards.scss:461-463`（no-status）、`_dashboard.scss:353-358`（no-logs）
- 依据：精华 §三 排版颜色「正文 ≥4.5:1；两套主题分开验证」
- 建议：浅色 tertiary 加深一档（如 #6b7280）；非禁用信息别用 --color-text-disabled

### H8. 循环动画时长超标准且裸值（blink 1s / pulse 2s / neon-pulse 1.5s）
- 位置：`_cards.scss:172`（blink 1s infinite）、`:394`（neon-pulse 1.5s）、`_replay.scss:178,206,310`（pulse 2s/1.5s）、`_keybind.scss:198`（pulse 1s）
- 依据：精华 §三 动画「装饰性动效 + reduced-motion 兜底」
- 建议：并入 H2 统一处理（reduce 下关闭）

## 🟡 MEDIUM

### M1. 硬编码颜色集中在特效/图表层（可豁免但应收编）
- 位置：`BattleVisualEffects.vue`（多组 `#ffaa30/#8ee0ff/#6affd0/#a855f7/#c084fc/#7c3aed`、裸 `#fff` 渐变）、`BattleField.vue:314-318`（#ffd478 与 --vfx-skill-color 重复）、`BattleDashboard.vue:379-389`（JS 分类色映射）、`ToggleSwitch.vue:61`（裸 rgba 阴影）
- 依据：精华 §四 反模式「组件里硬编码 hex」
- 建议：特效色是视觉特效（SVG 滤镜层），可接受但建议收进 token 注释说明；分类色映射应收为 tokens 类目色板（--cat-* 已有）

### M2. 裸间距大量存在（keybind/replay 整文件裸 px）
- 位置：`_keybind.scss`（15px/20px/10px/5px 遍布）、`_replay.scss`（整文件大量裸 px）、`_buttons.scss:15,55,121`（0.15rem/6px 12px）、`_battle-log.scss:349-359,425-426`、`_layout.scss:64`（80px）
- 依据：精华 §三 布局「8px 间距节奏」；AGENTS.md 石匠期「存量 ponytail 逐步清理，不一次扫」
- 建议：随改动文件逐步 token 化，不批量扫

### M3. hover 无 pressed/active 态
- 位置：`.action-btn`（`_buttons.scss:76-79`）、`.play-btn`（:110）、`.reset-btn`（:130）、`.tab-btn`（`_dashboard.scss:123`）、`.intervention-btn`（:243）、`.control-btn`（`_layout.scss:400`）、`.close-btn`（`_keybind.scss:66`）；`.speed-btn` 完全无 hover（`_buttons.scss:51-62`）
- 依据：精华 §三 交互反馈「hover 要有 pressed/active 态」
- 建议：复用 btn-base 三态模式（`_mixins.scss:28-42` 是范本）

### M4. 裸 z-index 绕过 token
- 位置：`_cards.scss:267,369,393`（z-index: 1/2/1）、`_replay.scss:190`（z-index: -1）、`BattleAnimationService.ts:138,308,358,409`（浮动文本 z-index: 100）
- 依据：精华 §三 布局「z-index 分层」
- 建议：浮动文本用 --z-dropdown 或新 token；卡片内层 z 属局部堆叠可留

### M5. 动 width 的属性动画（进度条场景）
- 位置：`_cards.scss:273,321-323,336`（hp/energy/shield `transition: width 0.3s`）、`_battle-log.scss:466`（snap-bar width 0.4s）；`transition: all` 共 12 处（`_buttons.scss:72,107,126`、`_cards.scss:15,113`、`_layout.scss:397,426,472`、`_keybind.scss:63,86,185`、`_replay.scss:140,250`、`_notification.scss:31`、`_dashboard.scss:240`）
- 依据：精华 §三 动画「只动 transform/opacity，进度类用 scaleX」
- 建议：进度条是常见豁免场景，保持 width 可接受；`transition: all` 改为明确属性列表

### M6. Dialog 过渡用 `--transition-base`（250ms）且 enter/leave 同速
- 位置：`Dialog.vue:143-152`（enter/leave 均 250ms，leave 应 ≈ 进入的 60-70%）
- 依据：精华 §三 动画「退出比进入快」
- 建议：leave 用 --transition-fast（150ms）

### M7. 表单无 label 的输入无 focus 管理（提交错误后不聚焦）
- 位置：各弹窗表单（CharacterEditor.vue 等）提交失败后无聚焦第一个无效字段
- 依据：精华 §三 表单「提交错误后聚焦第一个无效字段」
- 建议：随 H4 一起处理

## ⚪ LOW

### L1. base 层裸色
- 位置：`base.scss:247-248`（mark #ff0/#000）、`:271,276`（::selection #fff）
- 建议：mark 可留（通用语义）；::selection 可走 token

### L2. 潜伏风险 mixin
- 位置：`_mixins.scss:52-55` field mixin `&:focus { outline:none }` 以 (0,2,0) 特异性压过全局 :focus-visible，当前零引用
- 建议：未来若启用，补 :focus-visible 指示；或删除

### L3. `_animations.scss:96` keyframes 未引用
- 建议：随清理删除

## 修复优先级建议

**第一批（一次改动多受益）：**
1. C3 Dialog.vue 统一补 ESC + 焦点管理（一个文件改完全部弹窗受益）
2. C2 base.scss 统一加 tabular-nums（一个文件改完全部数字受益）
3. C1 日志区/toast/错误条补 aria-live + role="alert"
4. C6 危险操作统一二次确认（抽 confirm 模式）

**第二批（token 落地）：**
5. H1 全部过渡统一走 --transition-* / --ease-*（纯 token 替换）
6. H2 全局 reduced-motion 兜底 + GSAP 链路检测
7. H7 浅色主题 tertiary 加深

**第三批（随改动文件清理）：**
8. C5/C7 图标按钮 aria-label、div→button（碰到的文件顺手改）
9. H3 emoji → SVG（回放/控制栏优先）
10. H4/H5 表单 label 与字段级错误
11. M2-M4 存量裸值随文件逐步 token 化

---

*审查基准：`documents/UI设计精华.md`*
