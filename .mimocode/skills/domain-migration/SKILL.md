---
name: domain-migration
description: >
  Reference for CombatDebugStudio's DDD domain structure: import rules,
  strict-mode type fixes, directory conventions, and verification commands.
  The migration from src/core/ to src/domain/ is complete.
---

# Domain Module Reference

The project's DDD + Hexagonal refactoring is complete. All domain logic lives
in `src/domain/`. Use this skill to find correct import paths for domain modules
and apply strict-mode type fixes when working in the domain layer.

## Import Paths

### Domain modules — use these paths, NOT @/core/

| Module | Import path |
|---|---|
| BuffSystem | `@/domain/buff/BuffSystem` |
| BuffScriptRegistry | `@/domain/buff/BuffScriptRegistry` |
| BuffContext | `@/domain/buff/BuffContext` |
| BuffErrorBoundary | `@/domain/buff/BuffErrorBoundary` |
| ModifierStack | `@/domain/buff/ModifierStack` |
| BuffScriptLoader | `@/domain/buff/BuffScriptLoader` |
| BuffContextPool | `@/domain/buff/BuffContextPool` |
| DamageCalculator | `@/domain/skill/DamageCalculator` |
| HealCalculator | `@/domain/skill/HealCalculator` |
| SkillExecutor | `@/domain/skill/SkillExecutor` |
| SkillManager | `@/domain/skill/SkillManager` |
| PassiveSkillManager | `@/domain/skill/PassiveSkillManager` |
| AttributeEngine | `@/domain/attribute/AttributeEngine` |
| Battle*(any) | `@/domain/battle/*` |

### Infrastructure / Shared — these stay as-is

| Layer | Import rule |
|---|---|
| Infrastructure | `@/infrastructure/...` |
| Shared types | `@/shared/...` or `@/types/...` |
| Utils | `@/shared/utils/...` or `@/utils/...` |
| Stores (Pinia) | `@/stores/...` (migrate later to `@/presentation/stores/...`) |
| main.ts | `@/main` (test: `vi.mock('@/main')`) |

### Domain directory layout

```
src/domain/<subdomain>/
├── entity/        # Domain entities & interfaces
├── aggregate/     # Aggregate roots
├── service/       # Domain services
├── events/        # Domain events
├── types.ts       # Domain types
└── index.ts       # (optional) barrel exports
```

Battle subdomain has additional subdirectories: `ai/`, `auto/`, `intervention/`,
`logs/`, `replay/`, `state/`, `type/`, `debug/`.

## Strict-Mode Type Fixes

Domain files are checked with `tsconfig.strict.json`. When you encounter a
strict-mode error, apply the appropriate pattern:

### ExtendedSkillStep runtime properties
Properties exist at runtime but not in the type declaration. Use `as any`:
```ts
(skillStep as any).attackType
(skillStep as any).baseValue
(skillStep as any).bonusValue
// also: attackBonus, defenseBonus, levelBonus, maxHpPercent,
//       lostHpPercent, attributeCode, etc.
```

### BattleAction lacks `targets`
Construct actions as `any`:
```ts
const action = { type: BATTLE_ACTION, targets: [...] } as any
```

### validateSkillConfigs return type mismatch
Returns `ValidationResult`, caller expects `SkillConfig[]`:
```ts
return result as any as SkillConfig[]
```

### CalculationLog import conflict
Type exists in both `@/shared/types/skill` and locally in
`DamageCalculator.ts`. Remove the type import and keep only the local
declaration. Other files import `CalculationLog` from `@/domain/skill/DamageCalculator`.

### Error.captureStackTrace guard
```ts
if ('captureStackTrace' in Error) {
  (Error as any).captureStackTrace(this, this.constructor)
}
```

### @/main module-level side effect blocks test imports
Any test importing a domain module that transitively touches `@/main`:
```ts
vi.mock('@/main', () => ({
  eventBus: { emit: () => {}, on: () => {}, off: () => {} }
}))
```

## Verification

```powershell
npm run build 2>$null; if ($LASTEXITCODE -eq 0) { "BUILD: PASS" } else { "BUILD: FAIL" }
npm test 2>&1 | Select-String -Pattern "Test Files|Tests|FAIL|PASS"
npm run typecheck 2>&1 | Select-String "src/domain/"
```

- **Build** must pass (0 errors).
- **Tests** must pass (5 suites, 38 tests).
- **Typecheck**: 0 errors in domain/. Pre-existing errors (e.g.,
  `import.meta.glob` in `BuffScriptLoader.ts`) are acceptable — they originate
  from legacy patterns and will be fixed in later phases.

## Migration History (for context)

The DDD migration was executed incrementally across these phases:

| Phase | What | Key work |
|---|---|---|
| 3 | Domain kernel & value objects | Health, Energy, Speed, Side; BattleError hierarchy |
| 4.1 | domain/buff/ | 8 files (ModifierStack, BuffScriptRegistry, TriggerEventBus, etc.) |
| 4.2 | domain/skill/ | 5 files (DamageCalculator, HealCalculator, SkillExecutor, etc.) |
| 4.3 | domain/battle/ | 22+ files (all battle entities, services, AI, replay, etc.) |
| 5 | Infrastructure | Container, event adapters, logging |
| 6+ | Presentation & cleanup | Store migration, re-export cleanup |
