# 合理 API 设计和扩展点

审计过程中确认的"合理 API 设计"，即当前未被使用的代码，但接口本身有存在价值，可作为未来扩展点保留。

| # | 函数 | 文件 | 保留理由 |
|---|------|------|----------|
| 4 | passiveSegment | log-segment-factory.ts | 与 skillSegment 对称设计。当前被动日志在 PassiveSkillManager 中硬编码拼接，未来若被动日志也走结构化工厂管道，此函数直接可用 |
| 16 | setSkillConfig / removeSkill / getSkillNames / clearSkills / reloadAllSkills | SkillManager.ts | 技能配置的完整 CRUD API。当前启动时一次性加载，但热重载、运行时技能编辑等场景合理存在 |
| 17 | getEffectPlan / hasEffectPlan / getBuffAttributes / parseAttributeValue | BuffScriptRegistry.ts | 对 getResolvedBuffConfig 的便捷访问器。API 表面积合理，调用方按需取用比每次解构 resolved.effectPlan 更清晰 |
| 21 | onTurnExecuted | BattleSystem.ts | IBattleSystem 接口声明了此方法。删除需同步改接口，且作为回合完成回调钩子有扩展价值 |
| 22–23 | exportBattleRecord / getBattleStats | BattleManager.ts | 合理的导出/统计 API。BattleFacade 未暴露，但 UI 层未来"战斗统计面板"可直接使用 |
| 24 | exportAttributes | BattleParticipantImpl.ts | 完整的属性拆解导出（含公式、修饰符来源、计算过程）。调试面板当前逐属性读取，但"一键导出角色属性报告"场景直接可用 |
