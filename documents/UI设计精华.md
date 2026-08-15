# UI 设计精华（学自 ui-ux-pro-max-skill）

> 来源：GitHub `nextlevelbuilder/ui-ux-pro-max-skill`（11.2 万 star，AI UI/UX 设计 skill，支持 Claude Code / Cursor / Codex）。
> 本文是适配本项目的精简版——本项目是**桌面 Web 调试沙盒**，App 专属规则（safe-area、触屏目标、haptics、Dynamic Type）已剔除。

## 一、核心理念

1. **先定设计系统，再写代码。** 任何 UI 任务第一步输出设计系统（风格/配色/字体/效果/反模式），不是边写边想。
2. **设计系统要持久化。** `MASTER.md`（全局真理）+ 页面级覆盖；构建某页时先查页面文件，有则覆盖 Master。
3. **按优先级查规则，不背整本书。** CRITICAL 两条（无障碍、交互）每次必查，其余按任务类型查对应域。

## 二、十大规则域（优先级表）

| 优先级 | 域 | 必须要有 | 反模式（避免） |
|---|---|---|---|
| 1 CRITICAL | 无障碍 | 对比度 4.5:1、可见焦点环、aria-label、键盘全可达、不用颜色单独传达信息 | 删焦点环、纯图标按钮无 label、仅 hover 可达 |
| 2 CRITICAL | 交互反馈 | 按压反馈 80-150ms、加载反馈、禁用态语义清晰、触达目标 ≥44px | 0ms 状态突变、禁用控件看着可点 |
| 3 HIGH | 性能 | 图片定尺寸防 CLS、骨架屏、每帧 ≤16ms、防抖节流 | 布局抖动、长阻塞 spinner |
| 4 HIGH | 风格一致 | 匹配产品类型、全局统一、SVG 图标不用 emoji、每屏单一主 CTA | 混搭风格、emoji 当图标、组件里散落随机阴影/圆角 |
| 5 HIGH | 布局 | 断点一致、8px 间距节奏、z-index 分层、内容优先 | 横向滚动、随机间距、100vh 硬编码 |
| 6 MEDIUM | 排版颜色 | 语义色 token 不写裸 hex、数据列 tabular 数字、行高 1.5-1.75 | 正文 <12px、灰上灰、组件内硬编码 hex |
| 7 MEDIUM | 动画 | 150-300ms、只动 transform/opacity、退出比进入快（60-70%）、可打断、尊重 reduced-motion | 动 width/height、装饰性动效、enter/exit 同速 |
| 8 MEDIUM | 表单 | 可见 label、错误贴字段、提交反馈、空状态、危险操作确认 | placeholder 当 label、错误只汇总在顶部 |
| 9 HIGH | 导航 | 当前位置高亮、返回可预测、图标+文字 | 导航位置漂移、弹窗当主导航 |
| 10 LOW | 图表 | 图例、tooltip、空状态、不用颜色单通道 | 只靠颜色区分数据、空图表裸奔 |

## 三、本项目直接适用的关键规则

### 无障碍（CRITICAL，每次 UI 改动必查）
- 对比度：正文 ≥4.5:1，大文本/图形 ≥3:1（深色、浅色主题各自独立验证）
- 焦点：交互元素可见焦点环（2-4px）；**自定义控件必须有 focus 指示**
- 语义：图标按钮必须有 aria-label/title；div/li 当按钮要有 role + tabindex + 键盘处理
- **实时内容用 aria-live**：战斗日志、toast、错误条
- 弹窗：ESC 可关闭、打开聚焦到弹窗、焦点陷阱、关闭还原焦点
- 不用颜色单独传达状态（成功/失败/危险：色 + 图标/文字）
- 尊重 `prefers-reduced-motion`：全局兜底降级动画，循环/大位移动画必须被覆盖

### 交互反馈
- 按压反馈 80-150ms（opacity/transform 缩放，不位移布局）；微交互 150-300ms
- hover 要有 pressed/active 态；disabled 态清晰（降透明度 + cursor + 语义）
- 异步操作：按钮禁用 + spinner/进度；加载 >300ms 用骨架屏

### 排版与颜色
- 数字列、价格、计时器、状态统计用 `font-variant-numeric: tabular-nums`（防数字跳动位移）——**战斗数值尤其需要**
- 语义 token（primary/secondary/error/surface…）映射主题；组件不写裸 hex
- 深色模式用去饱和/提亮色阶，不是简单反色；两套主题分开验证对比度

### 动画（本项目用 GSAP，直接适用）
- 只动 transform/opacity（GSAP 的 x/y/scale/alpha）；进度类动效用 scaleX 优于动 width
- 进入 ease-out、退出 ease-in；**退出时长 = 进入的 60-70%**
- 列表 stagger 30-50ms/项；同屏重点动效 ≤2 个；动画必须可打断
- **统一 duration/easing 到 token**（本项目 `--transition-*`、`--ease-*` 已建，必须用起来）
- 循环装饰动画（blink/pulse/glow）必须有 reduced-motion 兜底

### 表单
- 每个输入有可见 label（for 关联）；不靠 placeholder 当 label
- 错误贴字段下方显示，指出原因 + 怎么修；提交错误后聚焦第一个无效字段
- 危险操作（删除/清空/重置/杀死）先确认
- 空状态：说明 + 建议动作，不裸奔

### 弹窗与导航
- 逃生口：ESC + 遮罩点击 + 明确的关闭按钮
- 当前导航位置高亮（颜色/字重/指示器）；导航位置全局一致
- 主内容不被固定栏遮挡

## 四、反模式清单（"不够专业"的高频来源）

- ❌ emoji 当结构图标（🎨 🚀 ⚙️ ⏸ ▶）——用 SVG 图标库，风格统一（同一层同描边/同填充）
- ❌ 组件里硬编码 hex / 散落随机间距、阴影、圆角
- ❌ 动画动 width/height/top/left；enter 与 exit 同速；装饰性动效
- ❌ 颜色单通道传达状态（只靠红/绿）
- ❌ placeholder 当 label；错误只在页面顶部汇总
- ❌ 危险操作无确认直接执行
- ❌ 数字列不用 tabular 导致跳动
- ❌ 循环动画不尊重 reduced-motion
- ❌ 交互元素只有 hover 态没有 pressed/disabled 态

## 五、本项目现状对照（审查结论速览）

**已达标（保持）：**
- ✅ 语义色 token 体系完整（`tokens.scss`，95+ 变量，明暗双主题）
- ✅ z-index 分层 token（--z-base/1000/1100/1300/1400/1500）
- ✅ 全局 `:focus-visible` 焦点环 + `::selection`
- ✅ 间距 4px 栅格（--space-*）+ 圆角/阴影 token
- ✅ EmptyState 组件广泛使用；btn-base 三态（hover/active/disabled）是范本
- ✅ GSAP 动画全部走 transform/opacity

**缺口（详见 `UI设计审查报告.md`）：**
- ❌ 全库无 aria-live（日志/toast/错误条）、无 tabular-nums、Dialog 无 ESC/焦点管理、ToggleSwitch 键盘不可达、危险操作无确认
- ❌ `--ease-*`/`--transition-slow` token 定义了零引用（全部裸时长/裸缓动）
- ❌ prefers-reduced-motion 覆盖不全（GSAP 链路完全无检测）
- ❌ emoji 当图标多处；硬编码颜色集中在特效/图表层
- ❌ 浅色主题 tertiary 文字对比度不足（#888 在浅底 ≈2.9:1）

---

*对应审查报告：`documents/UI设计审查报告.md`*
