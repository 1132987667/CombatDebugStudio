# 大改缺陷修复路线图

以下缺陷已验证存在但**需要较大改动**，无法在一次小修改中修复。

---

## 1.1 架构违规：Domain 层反向依赖 Presentation 层

**当前状况**：`BattleAI.ts` 和 `BattleEventManager.ts` 直接导入 `useBattleStore`。

**修复方案**：

1. **在 `domain/port/` 中定义状态读取接口**：
   ```typescript
   // src/domain/port/IBattleStateReader.ts
   export interface IBattleStateReader {
     getBattlePhase(): BattlePhase
     getSelectedActionTarget(): string | null
     getBattleStatus(): BattleStatus
     // ... 只暴露 Domain 需要的只读方法
   }
   ```

2. **在 BattleAI / BattleEventManager 中通过构造函数注入 `IBattleStateReader`**：
   ```typescript
   // BattleAI.ts
   constructor(private stateReader: IBattleStateReader) {}
   // 替换 this.battleStore.getBattlePhase() → this.stateReader.getBattlePhase()
   ```

3. **在 Presentation 层实现接口**：
   ```typescript
   // presentation/composables/useBattleStateReader.ts
   export function useBattleStateReader(): IBattleStateReader {
     const store = useBattleStore()
     return {
       getBattlePhase: () => store.getBattlePhase(),
       // ...
     }
   }
   ```

4. **在 DI 容器中注册**，Domain 代码不再 import presentation 路径。

**预估工作量**：L（2-3天）
**风险点**：需要理清 BattleAI 和 BattleEventManager 到底使用了 store 的哪些方法

---

## 1.2 回放确定性失效：全局 `Math.random()` 替换

**当前状况**：27处 `Math.random()` 调用，`SeededRandom` 实例未被使用。

**修复方案**：

1. **创建随机数上下文**（注入方式）：
   ```typescript
   // domain/port/IRandomProvider.ts
   export interface IRandomProvider {
     next(): number
     nextInt(max: number): number
   }
   ```

2. **`SeededRandom` 实现该接口**，`Math.random()` 也适配该接口（用于非回放模式）。

3. **将 `IRandomProvider` 注入到**：
   - `BattleSystem`（传递给 `TurnManager`、`DamageCalculator`）
   - `BattleAI` 
   - `BuffSystem`（某些随机触发的 Buff）

4. **全局替换** `Math.random()` → `this.randomProvider.next()`。

**预估工作量**：M（1-2天）
**风险点**：27处调用点需逐一审查确保语义不变；需要确保 SeededRandom 实例在回放时使用相同的种子初始化。

**验收标准**：连续回放 10 次，战斗日志与原始记录 100% 一致。

---

## 1.6 上帝类拆分

**当前状况**：`BattleSystem.ts` 872行，`BattleManager.ts` 645行。

**修复方案（分阶段）**：

### 阶段 1：下沉业务逻辑（小步快跑）
- 从 `BattleManager` 抽出 `validateTeams` → 放入 `TeamValidator` 或留在 `initializeTeams` 内联
- 从 `BattleManager` 抽出 `assignSeatIndices` → 放入座位管理职责类

### 阶段 2：拆分 `BattleSystem.processTurnInternal`
- 创建 `TurnPhaseExecutor` 策略类处理回合内各阶段（行动选择、伤害结算、被动触发、死亡判定）
- `BattleSystem` 只负责编排

### 阶段 3：抽取 `DamageResolutionService`
- 将 `BattleExecutor` 中重复的 4 行被动触发调用（ON_HIT → DAMAGE_TAKEN → ON_DEATH → ON_KILL）封装为单一方法
- 同时解决缺陷 2.2（重复被动触发链路）

**预估工作量**：XL（1-2周）
**风险点**：拆分容易引入回归，必须有充分测试覆盖。

---

## 2.2 重复被动触发链路（可作为 1.6 的先决步骤单独做）

**当前状况**：`BattleExecutor.ts` 中 4 处重复的 4 行被动触发调用。

**修复方案**（可在上帝类拆分前独立完成）：

```typescript
// 在 BattleExecutor 或新类 DamageResolutionService 中添加：
private triggerHitPassives(source: BattleEntity, target: BattleEntity, damage: DamageResult) {
  this.triggerPassiveTrigger(BattleTriggerPhase.ON_HIT, source, target, damage)
  this.triggerPassiveTrigger(BattleTriggerPhase.DAMAGE_TAKEN, target, source, damage)
  if (!target.isAlive()) {
    this.triggerPassiveTrigger(BattleTriggerPhase.ON_DEATH, target, source, damage)
    this.triggerPassiveTrigger(BattleTriggerPhase.ON_KILL, source, target, damage)
  }
}
```

然后将 `applyDamageToTarget`、`selectAndExecuteSkill`、`executeAction` 中的重复调用替换为 `this.triggerHitPassives(...)`。

**预估工作量**：M（半天）
**风险点**：需验证所有 4 处调用点的上下文参数一致

---

## 总结：建议执行顺序

| 顺序 | 事项 | 依赖 | 工作量 |
|:----:|:----|:----:|:----:|
| 1 | ✅ **2.2 封装被动触发**（可快速单独完成） | 无 | M |
| 2 | ⬜ **1.2 随机数注入** | 无 | M |
| 3 | ⬜ **1.6 阶段1（下沉简单逻辑）** | 无 | S |
| 4 | ⬜ **1.6 阶段3 + 2.2 合并** | 阶段1 | M |
| 5 | ⬜ **1.1 Domain 层依赖切断** | 无 | L |
| 6 | ⬜ **1.6 阶段2（TurnPhaseExecutor）** | 阶段1+3 | L |

**注意**：1.1 和 1.2 是架构级改动，建议在添加新功能前优先完成。
