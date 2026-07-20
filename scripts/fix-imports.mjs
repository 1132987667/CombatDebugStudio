// fix-imports.mjs — fix the 3 files with broken imports
import fs from "fs";

// 1. BattleAI.ts
let c = fs.readFileSync("src/domain/battle/ai/BattleAI.ts", "utf-8");
c = c.replace(
  'import {\nimport { LoggerProvider } from \u0027@/domain/port/LoggerProvider\u0027',
  'import { LoggerProvider } from \u0027@/domain/port/LoggerProvider\u0027'
);
c = c.replace("import { useBattleStore } from '@/presentation/stores/battleStore'\n", "");
fs.writeFileSync("src/domain/battle/ai/BattleAI.ts", c, "utf-8");
console.log("✅ BattleAI.ts");

// 2. BattleReplayManager.ts
c = fs.readFileSync("src/domain/battle/replay/BattleReplayManager.ts", "utf-8");
c = c.replace(
  'import {\nimport { LoggerProvider } from \u0027@/domain/port/LoggerProvider\u0027 BattleEventType',
  "import { LoggerProvider } from '@/domain/port/LoggerProvider'\nimport { BattleEventType"
);
fs.writeFileSync("src/domain/battle/replay/BattleReplayManager.ts", c, "utf-8");
console.log("✅ BattleReplayManager.ts");

// 3. BattleExecutor.ts
c = fs.readFileSync("src/domain/battle/service/BattleExecutor.ts", "utf-8");
c = c.replace(
  'import {\nimport { LoggerProvider } from \u0027@/domain/port/LoggerProvider\u0027 convertToBattleState',
  "import { LoggerProvider } from '@/domain/port/LoggerProvider'\nimport { convertToBattleState"
);
fs.writeFileSync("src/domain/battle/service/BattleExecutor.ts", c, "utf-8");
console.log("✅ BattleExecutor.ts");
