// fix-loglevel-imports.mjs
import fs from "fs";

const files = [
  "src/domain/battle/auto/AutoBattleManager.ts",
  "src/domain/battle/logs/BuffTraceLogger.ts",
  "src/domain/battle/logs/TraceDamageLogger.ts",
  "src/domain/battle/replay/BattleReplayManager.ts",
  "src/domain/battle/service/BattleRecorder.ts",
  "src/domain/skill/DamageCalculator.ts",
  "src/domain/skill/HealCalculator.ts",
  "src/domain/skill/PassiveSkillManager.ts",
  "src/domain/skill/SkillExecutor.ts",
  "src/domain/skill/SkillManager.ts",
];

const NEW_IMPORT = "import { LogLevel } from '@/shared/types/battle-log'";

let count = 0;
for (const f of files) {
  let c = fs.readFileSync(f, "utf-8");
  const lines = c.split("\n");
  let changed = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      line.includes("LogLevel") &&
      (line.includes("@/infrastructure/adapters/logging/BattleLogManager") ||
       line.includes("@/infrastructure/adapters/logging'"))
    ) {
      lines[i] = NEW_IMPORT;
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(f, lines.join("\n"), "utf-8");
    count++;
    console.log("OK " + f);
  }
}
console.log("Total: " + count);
