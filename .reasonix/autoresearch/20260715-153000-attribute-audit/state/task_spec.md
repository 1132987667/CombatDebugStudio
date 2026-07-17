# 技能拓展属性管理审计

## 目标
审查两份玩家提交的"技能拓展属性管理方案"文档，验证以下主张在代码库中是否真实存在：

1. 当前 `ATTRIBUTE_CODE` 有 40+ 属性，其中 22 个是"拓展属性"
2. `BattleDashboard.vue` 仅展示 14 个属性，20 个拓展属性完全黑盒
3. 缺少 `displayTier` / `group` 元数据分类
4. `shield` 作为属性存在但不该是属性
5. `reflectDamagePercent` 作为属性存在但不该是属性
6. 存在"连击/蓄力计数器"等运行时状态被当作属性管理
7. 缺少情境化展示（situational）和能力

## 范围
- `src/domain/attribute/types.ts` — ATTRIBUTE_CODE, AttributeMeta, AttributeMetaMap
- `src/presentation/components/battle/BattleDashboard.vue` — 属性展示
- `src/presentation/components/battle/AttributeTooltip.vue` — 工具提示
- `src/domain/attribute/` — 属性引擎整体
- `src/domain/participant/` — 参与者实现
- `src/domain/buff/` — Buff 系统
- `src/domain/skill/` — 技能执行器

## 非目标
- 不修改任何代码
- 不构建设计方案
- 只做事实核查

## 验证门禁
- 对照文档中的每个具体主张，在代码中寻找直接证据
- 记录"真实存在"、"部分存在"、"不存在"三种结论
- 发现代码中但文档未提及的相关问题
