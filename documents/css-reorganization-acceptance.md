# CSS 重构验收方案

> 对应重构方案: `css-reorganization-plan.md`  
> 验收性质: **功能回归 + 视觉一致 + 代码质量**

---

## 验收清单总表

| # | 验收项 | 类型 | 工具/方法 | 优先级 |
|:-:|:-------|:----:|:----------|:------:|
| 1 | 设计令牌完整性 | 代码审查 | 手动对照 template-css | P0 |
| 2 | 引入顺序正确性 | 构建验证 | `npm run build` | P0 |
| 3 | 无硬编码颜色/间距 | 代码静态检查 | grep + 指令审查 | P0 |
| 4 | 视觉回归 | 截图对比 | 人工目测 | P0 |
| 5 | Vue SFC 变量引用 | 代码审查 | grep + diff | P1 |
| 6 | 组件 class 命名规范 | 代码审查 | lint | P1 |
| 7 | 主题切换 | 功能测试 | 人工操作 | P2 |
| 8 | 渐进迁移兼容性 | 功能测试 | 手动操作 | P1 |

---

## 1. 设计令牌完整性验证（P0）

### 1.1 验证内容

确认 `_tokens.scss` 覆盖了所有当前项目中使用的视觉值。

### 1.2 操作步骤

1. 提取 `main.scss` 和所有 Vue SFC 中的硬编码值：

```shell
# 在项目根目录执行
grep -ohP '#[0-9a-fA-F]{3,6}' src/presentation/ | sort -u > /tmp/current-colors.txt
```

2. 与 `_tokens.scss` 中定义的变量值做交集对比。

3. 未匹配的色值判断是否为合理"漏网之鱼"（如第三方库引入的色值），否则标记为缺陷。

### 1.3 通过标准

- 95% 以上的项目硬编码色值可在 `_tokens.scss` 中找到对应变量
- 剩余 5% 有注释说明原因（如：第三方库内联色值无法覆盖）

### 1.4 变量覆盖矩阵

```markdown
| 类别       | 预期变量数 | 实际定义数 | 通过? |
|-----------|:----------:|:----------:|:----:|
| 品牌色     | ≥ 7        |            |      |
| 中性色     | ≥ 9        |            |      |
| 字体       | ≥ 5        |            |      |
| 间距       | ≥ 7        |            |      |
| 圆角       | ≥ 5        |            |      |
| 阴影       | ≥ 4        |            |      |
| 层级(z)   | ≥ 5        |            |      |
| 过渡       | ≥ 3        |            |      |
```

---

## 2. 构建与引入顺序验证（P0）

### 2.1 构建验证

```shell
cd D:\4-softworkspace\java\CombatDebugStudio
npm run build    # 或对应构建命令
```

**通过标准**: 构建无报错、无警告。

### 2.2 引入顺序验证

确认 HTML 入口文件（或 Vite 入口 `main.ts`）中 CSS 引入顺序为:

```
_tokens.scss  →  _reset.scss  →  _base.scss  →  components/*  →  _utilities.scss  →  main.scss
```

**通过标准**: `tokens` 和 `reset` 在最前，`utilities` 在组件之后。

---

## 3. 无硬编码颜色/间距验证（P0）

### 3.1 静态检查命令

```shell
# 检查重构后的 SCSS 文件中是否还有硬编码色值（除 _tokens.scss 外）
grep -rnP '#[0-9a-fA-F]{3,6}|rgba?\(|hsla?\(' src/presentation/styles/ \
  --include='*.scss' --exclude='_tokens.scss' \
  || echo "无硬编码色值"

# 检查硬编码间距（非 var() 引用的 rem/px 值）
grep -rnP '(padding|margin|gap)\s*:\s*[0-9.]+(rem|px)' src/presentation/styles/ \
  --include='*.scss' \
  || echo "无硬编码间距"
```

### 3.2 通过标准

- `_tokens.scss` 以外的新建 SCSS 文件零硬编码色值
- 间距值必须通过 `var(--space-*)` 引用，禁止直接 `0.5rem` / `8px`
- **例外**: `@keyframes` 动画中的颜色/位移可接受硬编码
- **例外**: `_utilities.scss` 的原子类可直接使用像素值（但须注释说明）

---

## 4. 视觉回归验证（P0）

### 4.1 页面截图点

| 页面 | 关键区域 | 对比指标 |
|:-----|:---------|:---------|
| BattleDashboard | 三栏布局、标题头、按钮、角色列表 | 颜色、间距、圆角、字体 |
| BattleArena | 战场区域、成员卡片、血条、状态标签 | 颜色、边框、阴影、动画 |
| BattleReplay | 时间轴、事件列表、播放按钮 | 颜色、布局、交互态颜色 |
| ControlBar | 底部按钮组、速度选择、自动播放按钮 | 颜色、尺寸、间距 |
| Dialog 弹窗 | 蒙层、标题栏、内容区、关闭按钮 | 颜色、圆角、阴影 |

### 4.2 操作步骤

1. 重构前: 截取每个页面的完整截图，命名为 `{page}-before.png`
2. 实施重构（Phase 1 + 2 部分里程碑）
3. 重构后: 在相同窗口尺寸下截取完全相同区域
4. 用 `ImageMagick compare` 或像素级对比工具比对:

```shell
# Windows PowerShell (需要安装 ImageMagick)
magick compare -metric AE battle-dashboard-before.png battle-dashboard-after.png diff.png
```

### 4.3 通过标准

- 像素差异 < 0.1%（极小的抗锯齿差异可以接受）
- 交互态（hover/active/disabled）颜色迁移正确
- 字体渲染无变化

---

## 5. Vue SFC 变量引用验证（P1）

### 5.1 检查内容

在 Vue SFC 的 `<style scoped>` 中：

```vue
<!-- ❌ 错误: 硬编码 -->
<style scoped>
.my-class { color: #e94560; }
</style>

<!-- ✅ 正确: 引用全局变量 -->
<style scoped>
.my-class { color: var(--color-accent); }
</style>
```

### 5.2 通过标准

- 所有 `scoped style` 中的颜色、间距、圆角、阴影须通过 `var(--xxx)` 引用
- 仅组件特有的**布局/定位/尺寸比例**可使用像素值，但必须用注释标注 `ponytail: 组件特有布局`

---

## 6. 组件 class 命名规范验证（P1）

### 6.1 命名规则检查

```
✅ .btn              # 基础组件
✅ .btn-primary      # 变体用修饰符
✅ .btn--hoverable   # 状态用 BEM modifier
✅ .card-header      # 子元素用 BEM element
❌ .my-custom-btn    # 不与已有 class 重复
```

### 6.2 通过标准

- 同类型组件 class 前缀一致（如所有按钮以 `.btn` 开头）
- 不与项目已有 class 名冲突
- `_utilities.scss` 的原子类使用 `!important`，其余文件禁止

---

## 7. 主题切换验证（P2 — 仅当实施了 Phase 4 时）

### 7.1 操作步骤

1. 在浏览器开发者工具中，给 `<html>` 添加 `data-theme="light"` 属性
2. 观察所有页面元素颜色变化

### 7.2 检查重点

| 检查项 | 预期行为 |
|:-------|:---------|
| 背景色 | 从深色变为浅色（如 #ffffff） |
| 文字色 | 从白色变为深色（如 #1a1b1c） |
| 边框色 | 从深色变为浅灰 |
| 阴影 | 从强变淡 |
| 图片/图标 | 不受影响 |
| 交互态颜色 | hover/active 浅色主题下正常 |

### 7.3 通过标准

- 切换 `data-theme` 后所有可读内容清晰可见
- 无"白底白字"或"黑底黑字"的不可读区域
- 切换无需刷新页面

---

## 8. 渐进迁移兼容性验证（P1）

### 8.1 每个子任务完成后

| 检查项 | 方法 |
|:-------|:-----|
| 所有页面可正常渲染 | 手动打开每个路由 |
| 原有交互正常 | 点击按钮、打开弹窗、切换 Tab |
| 浏览器控制台无 404 CSS | F12 → Console |
| 原有 class 名仍生效 | 现有 HTML 未修改 |

### 8.2 回滚方案

若某一步出现问题:

```shell
git revert <commit-hash>
# 或
git checkout -- src/presentation/styles/main.scss
```

---

## 9. 验收通过条件

```
P0 项: 100% 通过     → 可进入下一阶段
P1 项: ≥ 90% 通过    → 可进入下一阶段
P2 项: 可选不实施    → 不影响主线迁移
```

### 验收签字

```markdown
- [ ] 设计令牌完整性验证通过
- [ ] 构建无报错
- [ ] 零硬编码色值（_tokens.scss 除外）
- [ ] 视觉回归截图对比差异 < 0.1%
- [ ] Vue SFC 变量引用合规
- [ ] class 命名规范达标
- [ ] 渐进迁移无功能回退

验收人: ________    日期: ________
```
