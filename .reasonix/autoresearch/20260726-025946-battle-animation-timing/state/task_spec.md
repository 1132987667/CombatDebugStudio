# 战斗动画固定时长改造

## 目标
将三套各自为政的时长体系（领域层等待、GSAP、DOM特效）收敛为唯一时间源：每个行动消耗固定预算T；T = 1200ms ÷ 速度。

## 实施阶段
1. 新增 animation-timing.ts（唯一时间源）
2. 领域层改造（BattleAnimationManager + BattleSystem + BattleEventType + BattleExecutor）
3. 表现层改造（battleStore + BattleField + BattleVisualEffects + BattleAnimationService + ParticipantCard）

## 关键修正项（文档核实）
1. executeAction 漏改 ✅ 已确认
2. 治疗不需要飞行阶段 ✅ 已确认
3. 被动特效约束进入预算 ✅ 已确认
4. 多目标仅主目标数字 ✅ 已标注
5. 定时器清除竞态 → ANIMATION_COMPLETE 事件 ✅ 已确认
