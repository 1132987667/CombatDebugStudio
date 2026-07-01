你是一个极致的代码侦探。

**任务：** 找出战斗系统「实际上」的所有问题和隐患。不是「看起来奇怪」，而是「导致数据错误」的问题。

**规则：** 
1. 不要读概要，不要凭印象。**每个文件必须逐行读完**。
2. 每一条结论必须带着 **file:行号** 的实证链，格式：`A.ts:行 → B.ts:行 → C.ts:行`。
3. 找不到实证链的结论视为幻觉。

---

## 分析步骤（严格按顺序执行，不可跳过）

### 第一步：建立数据模型地图

先找到以下**每个节点**的实际数据定义：

1. **伤害计算的输入**：`buildNormalAttackStep()` 返回的 `ExtendedSkillStep` 对象里，`calculation` 和 `formula` 和 `attackType` 和 `targetModifiers` 各是什么含义？哪个字段是必填的，哪个是可选回退？

2. **伤害计算的处理链**：`DamageCalculator.calculateDamage()` 读完每一行，画出完整的数据流图。特别标出：
   - `calculateBaseDamage()` 的每个分支进入条件（`formula` / `calculation` / `else`）
   - `extraValues` 的处理循环
   - `targetModifiers` 的处理循环
   - 每个减速/加成环节的数学公式

3. **参与者的属性存储**：
   - 敌人 JSON 的属性键名是什么？（去 `configs/enemies/enemies.json` 看实据）
   - 角色/玩家的属性键名又是什么？
   - `BattleParticipantImpl.getAttribute()` 的实际调用链：`getAttribute` → `normalizeAttributeCode` → `ParticipantStats.getAttributeValue` → `recalcAttribute` 每一步做了什么？
   - `LEGACY_ATTR_MAP` 里有哪些条目？它的 `normalizeAttributeCode` 对不存在的键返回什么？

4. **技能的完整执行路径**：
   - `SkillManager.executeSkill()` 返回 `null` 的**全部**条件（逐一列举）
   - 每个调用方是否处理了 `null`？没处理的就是 bug
   - `SkillManager.executeSkill()` 内部会不会**重复消耗能量**？调用了 `source.spendEnergy` 吗？

### 第二步：逐条追踪数据流动

对以下**每条路径**，用 `file:行号 → file:行号` 链条追踪，不得跳过中间步骤：

**路径 A — AI/自动战斗流程：**
```
BattleSystem.processTurnInternal (行?)
  → BattleExecutor.executeParticipantAction (行?)
    → BattleExecutor.selectAndExecuteSkill / selectAndExecuteAttack (行?)
      → 返回的 BattleAction 去哪了？谁读取了它的 .damage 字段？
```

**路径 B — executeAction 流程：**
```
谁调用了 BattleExecutor.executeAction()？
executeAction() 内部的 try-catch 在什么条件下触发？
executeAction() 内部：技能伤害已经被 SkillManager 应用过了，然后行 623 又调用了 target.takeDamage() 吗？
```

**路径 C — 技能执行流程：**
```
SkillManager.executeSkill() (行108-190)
  → executeStep() → SkillExecutor.executeStep()
    → executeDamage() / executeHeal()
      → DamageCalculator.calculateDamage() / applyDamage()
        → 最终调用了 target.takeDamage()
      → skillAction (返回值) 的 damage 字段在此过程中被设置了哪里？
```

### 第三步：数值一致性检查

这是最关键的一步，**90% 的 bug 发生在这里**。

1. **「ATK」这个键到底有没有被写入？**
   ```
   敌人 JSON → GameDataProcessor → new BattleParticipantImpl(initData)
     → ParticipantStats.initAttributes(attributeValues)
       → attributeValues 里有 'attack' 这个键吗？
         → 如果没有，getAttributeDefaultValue('attack') 返回什么？
           → getAttribute('attack') 返回什么？
   ```

2. **skillStep.calculation 的有无决定了什么？**
   ```
   calculateBaseDamage() 中：
   if (skillStep.formula) → 分支 A
   else if (skillStep.calculation) → 分支 B → 取 baseValue（不读 minAttack/maxAttack）
   else → 分支 C → 读 minAttack/maxAttack
   
   buildNormalAttackStep() 现在返回的 step 有 calculation 吗？
   如果有，走分支 B，baseValue 是多少？
   如果没有，走分支 C，但 attackType === 'normal' 吗？
   ```

3. **targetModifiers: { DEF: 1 } 的实际数学效果是什么？**
   ```
   object.entries → damage *= 1 + (1 * defValue)/100
   → 所以 defValue 是 50 时，damage 乘 1.5
   → 而前面行 116-120 的防御递减公式让 damage 乘约 0.95
   → 两者叠加后是增加还是减少？
   ```

4. **applyDamage() 与外部调用会不会导致重复扣血？**
   ```
   SkillManager.executeSkill 内部 → executeStep → 调用了 applyDamage → target.takeDamage()
   然后 executeAction 行 623 又调用了 target.takeDamage(action.damage)？
   ```

### 第四步：边界条件枚举

对以下每种情况，追踪执行路径并确认「会不会 crash」或「会不会数据错误」：

- 目标被眩晕时，技能返回 null，所有调用方怎么处理？
- 能量不足时，技能返回 null，怎么办？
- 技能配置不存在时，技能返回 null，怎么办？
- 没有有效目标时，技能返回 null，怎么办？
- `getAttribute('attack')` 返回 0 时，伤害计算会不会崩？
- `getAttribute('ATK')` 和 `getAttribute('attack')` 是不是同一个值？

---

## 输出格式

每发现一个问题，按以下格式输出：

```
【问题 N：标题】
严重度：crash / wrong-value / double-apply / dead-code
链条：fileA.ts:行 → fileB.ts:行 → fileC.ts:行
描述：（一句话说清）
复现条件：（什么情况下触发）
代码现场：（相关代码片段）
修复方案：（具体改什么，不改什么）
```

不允许的输出：「看起来有点奇怪」「这个设计不太好」「可能有问题」
只允许的输出：「数据流证实了 bug」「从 JSON 到屏幕的值链如下」

---

完成全部四个步骤后，输出：
1. 完整的数据流图（文字描述）
2. 所有已确认的问题列表
3. 建议的修复优先级
