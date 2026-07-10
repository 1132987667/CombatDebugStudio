# Combat Log System Redesign — Task Spec

## Goal
Design a comprehensive combat log system (>95/100 quality) that combines the best of 12 game styles (A-L) with the existing codebase's logging and battle action systems. Write the design document to `documents/`.

## Scope
- Survey existing log system (log levels, format, appender, loggers)
- Survey BattleAction, ActionLog, battle flow
- Design "三层架构" (Three-Layer Architecture):
  1. **底层/技术日志**: Debug/TRACE level - full damage calc, buff changes, attr recalc (ref: F+H)
  2. **中间层/玩家界面**: INFO level - clean, icon-rich action logs (ref: G+I)
  3. **顶层/战报**: Battle summary - natural language report (ref: L)
- Write `documents/combat-log-system-design.md`

## Non-goals
- Actual implementation / code changes
- UI mockups
- Database schema for logs

## Success criteria
- Cover all 3 layers explicitly
- Reference existing codebase classes/packages by name
- Concrete format templates for each layer
- Rated >95/100 by user review
