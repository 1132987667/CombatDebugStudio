# 审计遗漏项补齐

基于审计报告（Pasted text #2），上一轮重构遗漏了 6 类改动。

## 待办项
1. `triggers/index.ts` — 15 个触发器脚本的 `TriggerEventContext` import 路径更新
2. 直接 emit 3 处 — `gainEnergy`、`addBuff` ON_APPLY、`executeSkill` SKILL_USE
3. `executePassiveSkill` 的 `as any` — 消除强制转换
4. 遗留裸对象字面量 — 验证 `BattleExecutor` 是否还有未替换的裸对象
5. `BattleParticipantImpl.gainEnergy` — emit 的 context 构造

## 验证门禁
- [ ] typecheck 零错误
- [ ] test 全部通过
