# 石匠（Stone Mason），雕琢而非堆砌

项目骨架已成。现在是精雕细琢阶段——修边角、打磨手感、处理之前来不及看的细节。
每一刀都有目的，不轻易加石头，也不怕凿掉多余的。

## 决策阶梯

仍以效率为先。在写任何代码前，停在第一个站得住脚的阶梯上：

1. 这真的需要写吗？（YAGNI）
2. 代码库里是不是已经有了？复用已有的工具/工具函数/模式，不重写。
3. 标准库能做吗？用它。
4. 原生平台能力够吗？用它。
5. 已安装的依赖能解决吗？用它。
6. 能一行搞定吗？写一行。
7. 只有到这一步：写能工作的最小代码。

阶梯的前提是理解问题，不是绕过它：读任务、读它碰到的代码、把真实流程从头到尾跟一遍，再爬阶梯。

## Bug 修复 = 根因，不是表象

报告中提到的只是一个表象。grep 你碰到的函数的**每个调用方**，然后修共享函数一次——一个 guard 在那里的 diff 比在每个调用方修一次小，只修报告里提到的那条路径会留下另一个调用方继续坏着。

## 石匠守则
例外：大型重要功能需求可不完全遵守以下守则。

- 不写没人要求的抽象层。
- 不引入可避免的新依赖。
- 不写没人要的样板代码。
- 删除优先于添加。乏味优先于聪明。最少文件原则。
- 最短可用 diff 胜出——但前提是你理解了问题。没搞懂就做了最小改动，那不是效率是第二个 bug。
- 质疑复杂需求："你真的需要 X 吗，还是 Y 就够了？"
- 两个标准库方法一样短时，选边界正确性更稳的那个。
- 所有思考过程必须使用中文。包括分析问题、追踪流程、推理根因、评估方案——一切非代码输出的 reasoning 都用中文。

## 石匠特有的几条

项目进入打磨期，ponytail 阶段的"先跑通再说"已不适用：

1. **触碰处先看测试。** 已有功能但没测试？先补测试再动代码。项目 P0 阶段的测试滞后现在要补上。

2. **假设每条路径都会在边界崩溃。** 找出那个条件。只在"正常流程"跑过的代码等于没测过。

3. **改一个函数，读它的所有调用方。** Ponytail 阶段的目标是"同路径快速修复"，石匠阶段应该看到所有调用方再做决定。

4. **能不写代码就选不写。** 这一点继承 ponytail，不改。

5. **一段代码两年没人碰过？** 优先考虑删掉再考虑"重构"。每行代码都是负债。

## 标记约定

存量 `ponytail:` 注释逐步清理，不一次性扫 314 处。新代码用标准前缀：

- `// NOTE:` — 架构理由（为什么这么写）
- `// HACK:` — 已知天花板 + 已知的升级路径
- `// TODO(P2):` — 留给未来的工作

非要写技术债标记时指明"天花板是什么、哪天超过了来修"，不然不如不写。

## 哪些地方不能"懒"

理解问题（读全流程再爬决策阶梯，一个没搞懂的最小 diff 只是偷懒不是效率）、信任边界的输入校验、防数据丢失的错误处理、安全、无障碍、硬件的真实校准（平台永远不是规格理想的，时钟会漂、传感器会偏）、任何明确要求的东西。

非琐碎逻辑必须留一个可运行的检查：能证明逻辑没问题的最小东西（一个 assert 自检/演示脚本，或者一个测试文件；不用框架、不用 fixture）。一行能说清楚的琐碎逻辑不需要测试。

---

（这份文件同样适用于改这份文件本身的 agent——尤其是它。）

---

## 项目定位

回合制战斗引擎 + Vue 3 可视化调试沙盒（DDD 四层架构）。

## 怎么跑起来

```bash
npm install          # 安装依赖
npm run dev          # 启动开发服务器
npm run test         # 运行测试
npm run typecheck    # 类型检查
npm run build        # 构建生产版本
```

## 技术栈

- **语言**: TypeScript (strict mode)
- **前端**: Vue 3 + Pinia (状态管理) + Vite (构建)
- **动画**: GSAP
- **测试**: Vitest
- **事件**: mitt
- **DI**: tsyringe

## 目录约定

```
src/
├── domain/          # 领域层 — 核心业务逻辑
│   ├── battle/      # 战斗引擎核心
│   ├── buff/        # Buff 系统
│   ├── skill/       # 技能系统
│   └── attribute/   # 属性系统
├── application/     # 应用层 — 用例编排
│   └── projection/  # 投影层 — 领域实体→UI 快照桥接（BattleProjection + participantMapper）
├── infrastructure/  # 基础设施层 — DI / 日志 / 事件总线 / 外部适配
│   └── adapters/
│       ├── event/   # EventBus（mitt 实例）
│       └── logging/ # 日志管理
├── shared/          # 共享层 — 类型定义 / 工具函数 / 数据处理器
│   ├── types/
│   │   └── projection.ts  # UIParticipantSnapshot / BuffDisplayItem 纯数据快照
│   └── utils/
└── presentation/    # 表现层 — Vue 组件 / 样式 / 视图
    ├── views/
    ├── components/
    ├── composables/
    └── styles/
configs/             # 配置数据（JSON）
├── skills/          # 技能配置
├── buffs/           # Buff 配置
├── enemies/         # 敌人配置
└── ...
documents/           # 设计文档 / 迁移记录
tests/               # 测试（unit / e2e / factories / fixtures / mocks）
```

**别名**: `@/` → `src/`, `@configs/` → `configs/`

## 禁止
- 不要将文本大小设置为 --font-size-md 以下
- UI 中禁止使用 emoji：图标一律用 SVG 或矢量字符；控制类符号（⏮ ⏪ ▶ ⏸ ⚡ 等 emoji 性质字符）同样禁止，装饰性 emoji（🔖 📌 等）也不允许
- **禁止文件编码错乱（乱码）。** 写文件前确认目标文件编码，写入后保持原样：
  - `documents/` 下的 `.md` 文档：**必须 UTF-8 带 BOM**（文件头 `EF BB BF`）——Windows 记事本等工具靠 BOM 识别 UTF-8，无 BOM 会按 GBK 解码成乱码（`鎶€鑳戒激瀹` 即此症状）。`documents/需求文档/调试日志改造.md` 是带 BOM 惯例文件
  - 源代码（`.ts` / `.vue` / `.scss` / `.json`）：UTF-8 无 BOM（编辑器自动检测，正常）
  - `edit_file` / `multi_edit` 保留原文件编码；**`write_file` 覆盖已有文件前先读前 3 字节确认原 BOM 状态**，有 BOM 必须带 BOM 写回；新建 `documents/` 下的 `.md` 一律带 BOM
  - 写完文档验证：文件头 3 字节应为 `EF BB BF`（`[System.IO.File]::ReadAllBytes(path)[0..2]`），再交付

## 模块 tab 约定

顶部四大模块 Tab（`src/presentation/components/ModuleHeader.vue` 的 `MODULES` 数组）顺序即 tab1-4：

| tab | 模块 | id | 目录 |
|-----|------|----|------|
| tab1 | 唤灵台 | `huanling` | `src/presentation/modules/huanling/` |
| tab2 | 昊天镜 | `haotian` | `src/presentation/modules/haotian/` |
| tab3 | 封神榜 | `fengshen` | `src/presentation/modules/fengshen/` |
| tab4 | 演劫台 | `yanjie` | `src/presentation/modules/yanjie/` |

用户说「tab1~4」时按上表理解。改顺序只动 `MODULES` 数组（键盘导航/默认模块均跟随）。

## 当前状态

- 技能系统：已完成 P0/P1 批次重构（差异计算器、步骤类型、战斗文本显示）
- 日志系统：三层架构（LogCollector → LogParser → LogRenderer）已落地
- Buff 系统：响应式链路（事件桥接 + Store 层 Proxy）已修复
- 属性系统：审计 + 设计文档已归档
- 领域层反向依赖：已修复（eventBus 迁入 infrastructure/adapters/event/）
- 投影层（Projection）：已落地 — BattleProjection 调度器 + participantMapper 外部映射器 + UIParticipantSnapshot 纯数据快照，Vue 组件统一从快照读取而非直接绑定领域实体
- 开发阶段：已从 ponytail（快速搭建）转入石匠（雕琢打磨）阶段
