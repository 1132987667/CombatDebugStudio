import fs from "fs";

// 1. AutoBattleManager
let c = fs.readFileSync("src/domain/battle/auto/AutoBattleManager.ts", "utf-8");
c = c.replace("private LoggerProvider = LoggerProvider", "private logger = LoggerProvider.logger");
c = c.replace(/this\.LoggerProvider\.logger/g, "this.logger");
fs.writeFileSync("src/domain/battle/auto/AutoBattleManager.ts", c, "utf-8");
console.log("✅ AutoBattleManager.ts");

// 2. InterventionManager
c = fs.readFileSync("src/domain/battle/intervention/InterventionManager.ts", "utf-8");
c = c.replace("private LoggerProvider = LoggerProvider", "private logger = LoggerProvider.logger");
c = c.replace(/this\.LoggerProvider\.logger/g, "this.logger");
fs.writeFileSync("src/domain/battle/intervention/InterventionManager.ts", c, "utf-8");
console.log("✅ InterventionManager.ts");

// 3. BattleReplayManager
c = fs.readFileSync("src/domain/battle/replay/BattleReplayManager.ts", "utf-8");
c = c.replace("private LoggerProvider = LoggerProvider", "private logger = LoggerProvider.logger");
c = c.replace(/this\.LoggerProvider\.logger/g, "this.logger");
fs.writeFileSync("src/domain/battle/replay/BattleReplayManager.ts", c, "utf-8");
console.log("✅ BattleReplayManager.ts");
