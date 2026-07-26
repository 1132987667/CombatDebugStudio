# BattleContext Refactor + Buff Log Fix

## Goal
1. Fix duplicate buff logging in passive skill triggers
2. Split monolithic BattleContext into three specialized interfaces: PassiveTriggerContext, StepExecutionContext, TriggerEventContext

## Scope
11 files across domain/skill, domain/battle, domain/buff, infrastructure/adapters/event

## Success Criteria
- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run test` passes with no regressions
- [ ] Buff log no longer duplicates (passive + executeBuff paths are mutually exclusive)
- [ ] All `BattleContext` references replaced with one of the 3 new types
