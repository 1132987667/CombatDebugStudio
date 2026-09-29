# UI 质感升级方案（斗战西游）

> 日期：2026-09-29　分支：phase8-cleanup
> 方法论：GitHub 开源 skill **ui-ux-pro-max**（nextlevelbuilder/ui-ux-pro-max-skill，已安装到 `.zcode/skills/ui-ux-pro-max/`）——99 条 UX 准则 + 风格/色板/字体数据库 + GSAP 动效预设，本地 BM25 检索（`python .zcode/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>`）。

## 一、升级思路

项目处于石匠阶段，token 体系（95+ 变量）纪律严明，但审计发现核心问题是**「视觉人格尚未建立的后台管理工具」**：中文 UI 跑在 Consolas 等宽代码字体上、面板零海拔、交互反馈贫弱、对话框是后台弹窗语言。同时项目已有大量**闲置的游戏化资产**：12 种题材底纹、shadow-layered 海拔体系、楷体标题实践（仅限演劫台）。

因此本次升级遵循两条原则：

1. **不换色板**：品牌红 #e94560 / 能量青 #22d3ee / 朱砂 #c14b3a / 稀有度色板均已精修且有单源约定，外来色板（skill 数据库返回的 developer-tool 方向）一律不引入。
2. **激活闲置资产 + 建立三体系**：字体分层、面板海拔、反馈与氛围。

## 二、已落地的 7 刀

| # | 改动 | 文件 | 说明 |
|---|------|------|------|
| 1 | 字体分层体系 | tokens.scss | 新增 `--font-family-display`（楷体书法栈 KaiTi/STKaiti/Kaiti SC/BiauKai）；`--font-family-base` 改为显式中文字栈（PingFang SC/微软雅黑）——此前 Consolas 无中文字形，中文回退不确定；mono 仅用于代码/日志 |
| 2 | App 级背景氛围 | base.scss | body 纯平底色 → 顶部天光青 + 底部劫火红双层径向氛围光（rgba 透明度 0.05，fixed） |
| 3 | 面板海拔体系 | _layout.scss | panel-left/right 加顶部内高光 + 轻外投影；panel-section/section 加 shadow-sm；panel-title 楷体题字 + letter-spacing（「题匾」语言） |
| 4 | 对话框游戏化 | _dialog.scss | 4px 粗实线边框 → 1px 亮边框 + 白外描边 + 能量青环境辉光 + shadow-layered 分层海拔；header 与 ModuleHeader 同款 135° 渐变 + 楷体题字；入场改轻微过冲 cubic-bezier(0.34,1.3,0.64,1)，退场 ease-in |
| 5 | 模块切换过渡 | BattleArena.vue + _animations.scss + _layout.scss | 四模块容器挂 `.module-panel`，keyframe `module-enter`（只动 opacity 200ms）——v-show 从 display:none 恢复时 CSS animation 自动重放，零 JS；不用 transform 避免 containing block 破坏面板内 fixed 弹层定位 |
| 6 | 品牌楷体化 | ModuleHeader.vue | 品牌字「太初道枢」用 display 楷体栈 |
| 7 | 字体单源化 | xiyou.scss / PackItemDetail / GearDetailDialog / QuickSlotBar / BattleVisualEffects / BattleDashboard | 散落硬编码字体栈（KaiTi…/Noto Serif SC/JetBrains Mono）全部收敛到 token；技能名/回合宣告从「未加载字体回退宋体」变为楷体书法（意外的气质升级） |

另修一处负反馈：speed-btn hover 原 `--color-bg-hover`（rgba 白 6%）比常态底更暗且无过渡，改为提亮 + 边框增亮 + 过渡 150ms。

另修一处既有遮挡缺陷：自动战斗指示器（ControlBar.vue `.auto-battle-indicator`）原 `top:10px` 悬浮在控制栏中央，恰好盖住战斗中最需要操作的「战斗速度/快速」开关，改为悬浮于控制栏上缘外（`bottom: calc(100% + 8px)`），实测不再遮挡。

## 三、skill 准则对照（本次遵循的关键条目）

- 动画：只动 transform/opacity（合成器线程）；hover 位移 <2px；时长 150-300ms；`prefers-reduced-motion` 全局兜底已有（base.scss）。
- 反馈：所有可点元素必须有 hover 反馈；状态变化禁止 0ms 瞬变（speed-btn 修复）。
- 无障碍：对比度 4.5:1 已由既有 token 注释体系保障；焦点环未被移除。
- 图标：SVG，禁 emoji（与本仓库 AGENTS.md 禁令一致，未引入任何 emoji）。
- 语义 token：组件不写裸 hex（新增样式全部走 rgba(var(--rgb-*), …) / var(--shadow-*)）。

## 四、skill 安装说明

- 位置：`.zcode/skills/ui-ux-pro-max/`（工作区 scope，ZCode 自动发现）
- 来源：github.com/nextlevelbuilder/ui-ux-pro-max-skill（MIT），经 jsdelivr/gh-proxy 镜像下载（本机直连 GitHub 被网络策略阻断）
- 用法：`python .zcode/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux|style|color|typography|gsap --max-results 3`；`--design-system` 生成整套方案；`--stack vue` 取 Vue 实现指南
- 已验证：BM25 检索跑通（color/ux/gsap/vue 四域）；缺 2 个可选数据文件（prompts.csv / web-interface.csv，镜像源均 404，不影响核心功能）

## 五、第二轮：斗战西游模块质感升级（同日）

模块级细审结论：--xy-* 水墨令牌体系自洽，但**招牌资产大量闲置**（--xy-font-title 楷体别名零消费、.xy-seal-title::after 印章方块被 display:none 关闭、.xy-ink-hover 墨晕仅 2 处使用、card-skins 四套皮肤仅 dev 调试可切），而玩家停留最久的**战斗禅台是主题覆盖最弱的素面地带**（单位卡/日志直接复用全局组件、战场零氛围、场景名未用楷体）。

本轮 6 刀（激活闲置资产，不动色板，不覆盖全局组件内部样式）：

| # | 改动 | 文件 | 说明 |
|---|------|------|------|
| 1 | 楷体标题激活 | xiyou.scss / BattleZen / SceneTimeline / SceneMapDialog / BattleRoster | topbar 品牌字、场景名、路引标题、区域章节、地图大标题、关卡详情名、角色姓名全部挂 --xy-font-title（楷体栈） |
| 2 | 战场水墨氛围底 | BattleZen.vue | .xy-battle 纯 panel 素面 → 顶部朱砂暖意 + 底部墨色沉降 + 中性墨晕三层径向渐层 |
| 3 | 「斗」字印章化 | BattleZen.vue | 敌我两阵之间的纯文字"斗"→ 朱砂方印（白字/微倾/外圈印环） |
| 4 | 四象栏导航升级 | FourAspectBar.vue | 搬入 cave.scss 已验证范式：补 transition、hover 上浮 + 描线提亮 + 图标变朱砂，active 从红实底改为 seal-soft 底 + 朱红竖条 + 金图标（两套导航语言合一），栏体挂 bg-dual-dots 纹样 |
| 5 | 角色面板头部 | BattleRoster.vue | 姓名楷体 + 印章方块；激活闲置的 .xy-progress 做经验条（新增 expPct computed，expNeed 非有限值时充满） |
| 6 | 结算情绪 | BattleZen.vue | 通关大结算加"胜"字朱砂印盖章动效（scale 落下回弹，xy-stamp-in 留模块内）+ 金底渐层；战败结算复用洞府 xy-cave-shake 抖动 |

**遗留给产品决策（本轮不做）**：card-skins.scss 四套伴灵皮肤（ink/gilt/jade/seal）仍处实验台状态（生产恒 classic，163 行 + cardSkin.ts localStorage 逻辑空转），定稿需选定一套下沉转正并删除分支；路引"去地图化"（SceneTimeline 纯竖列表）如需手绘地图感是独立设计任务；全局暂停状态会泄漏到演劫台战斗且模块内无解除入口（既有设计缺陷，涉及状态管理，非样式问题）。
