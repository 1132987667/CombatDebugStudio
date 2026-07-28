---
description: >
  Run project verification commands: build, test, typecheck. Optionally
  filter by scope (all, build, test, typecheck, domain). Usage:
  "verify all" (default), "verify build", "verify test", "verify typecheck",
  "verify domain".
---

Run the requested verification command(s) for the CombatDebugStudio project.

## verify all (default)

```powershell
npm run build 2>$null
if ($LASTEXITCODE -eq 0) { "BUILD: PASS" } else { "BUILD: FAIL" }

npm test 2>&1 | Select-String -Pattern "Test Files|Tests|FAIL|PASS"

npm run typecheck 2>&1 | Select-String "src/domain/"
```

## verify build

```powershell
npm run build 2>$null
if ($LASTEXITCODE -eq 0) { "BUILD: PASS" } else { "BUILD: FAIL" }
```

## verify test

```powershell
npm test 2>&1 | Select-String -Pattern "Test Files|Tests|FAIL|PASS"
```

## verify typecheck

```powershell
npm run typecheck 2>&1 | Select-String "src/domain/"
```
