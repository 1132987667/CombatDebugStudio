> **源位置**: docs\migration\统一管道-Buff全生命周期时序.md — 从 docs/ 迁移至此
>
### 被动技能全流程时序图（文字版）

以下时序图使用文字描述，符号说明：
- `[A] → [B]`：A 调用 B 的方法
- `[A] --> [B]`：B 返回结果给 A
- `---`：阶段分隔

---

#### 一、被动技能注册（角色/敌人初始化阶段）

```
[GameDataProcessor.enemyToParticipant()] 
    → 创建 BattleParticipantImpl 实例
    → 读取 Enemy.skills.passive 技能ID列表
    → 通过 getSkillByIds() 加载 SkillConfig 数组

[GameDataProcessor.registerParticipantPassives(participant, passiveSkillManager)]
    → 遍历 participant.skills.passive 中的每个 SkillConfig
    ├─ 若 skill.triggerTimes 存在 → 直接使用
    └─ 若不存在 → 默认填充 ['battle_start']
    → 将 trigger 字符串映射为 BattleTriggerPhase（如 'battle_start' → BATTLE_START）
    → 构造 PassiveSkillConfig 对象：
        { id, name, trigger, skillId, cooldown, maxTriggerCount, triggerProbability, hpThreshold, condition }
    → 调用 passiveSkillManager.registerPassive(participant.id, config)
        └─ 存入 Map<characterId, PassiveSkillConfig[]>
```

---

#### 二、战斗开始阶段（BattleSystem.initialize → applyPassiveSkills）

```
[BattleSystem.initialize(allyParticipants, enemyParticipants)]
    │
    ├─ 创建 participants Map，设置修饰符提供者（setModifierProvider）
    ├─ 注册 BuffSystem 回调（属性变化、Buff添加等）
    │
    └─ [BattleSystem.applyPassiveSkills(participants)]
        ├─ 对每个参与者 emitTriggerEvent(BattleTriggerPhase.BATTLE_START) → 触发事件总线
        │
        └─ [PassiveSkillManager.triggerPassiveSkillsForAll(BATTLE_START, participants)]
            → 遍历 participants
                → [PassiveSkillManager.triggerPassives(trigger, entity, context)]
                    → 获取 entity.id 对应的被动列表
                    → 遍历每个 PassiveSkillConfig：
                        1. 检查 trigger 是否匹配
                        2. 检查冷却（cooldown > 0 且 lastTriggeredTurn 未达到冷却）
                        3. 检查最大触发次数（maxTriggerCount 限制）
                        4. 检查触发概率（triggerProbability）
                        5. 检查 HP 阈值（HP_LOWER_THAN 专用）
                        6. 检查自定义条件（condition 表达式）
                        ── 全部通过 ──
                        7. 确定目标：
                           ├─ 若触发为时间型（BATTLE_START / TURN_START / TURN_END）且 context.participants 存在
                           │    → 根据技能 selector 解析目标（resolveSkillTargets）
                           └─ 否则 → 使用 context.target 或默认 entity
                        8. [PassiveSkillManager.executePassiveSkill(skillConfig, entity, targets, turn)]
                              ├─ 获取 SkillExecutor
                              ├─ 遍历 targets
                              │   └─ 遍历 skill.steps
                              │       └─ [SkillExecutor.executeStep(step, action, source, target)]
                              │           ├─ 若 step.type === 'modify_attribute'
                              │           │   → 修改目标属性（直接写入 attrData.modifiers）
                              │           │   → 同步加成属性（ATTRIBUTE_CODE → bonus 映射）
                              │           │   → 调用 target.recalcAll()
                              │           │
                              │           ├─ 若 step.type === 'apply_buff'
                              │           │   → [BuffSystem.addBuff(characterId, buffId, config, turn)]
                              │           │       ├─ 合并配置（脚本 CONFIG、JSON、调用方）
                              │           │       ├─ 免疫检查
                              │           │       ├─ 叠加规则处理（REFRESH / LIMITED / INDEPENDENT）
                              │           │       ├─ 创建 BuffInstance
                              │           │       ├─ 执行脚本 onApply（应用修饰符到 ModifierStack）
                              │           │       ├─ 触发属性变更（triggerAttributeChange）
                              │           │       └─ 通知 UI（onBuffApplied 回调）
                              │           │
                              │           └─ 其他类型（shield / heal / deal_damage 等）→ 对应方法
                        9. 更新被动触发计数和冷却（仅在 hasExecuted=true 时）
```

---

#### 三、光环分发（applyPassiveSkills 之后）

```
[BattleSystem.distributeAuras(participants)]
    → 遍历所有参与者
        → 获取每个 buff 实例 ID
            → buffSystem.getBuffAuraConfig(buffId) 读取 aura 配置
                ├─ 若 aura.targetSelector === 'allies' 或 'enemies'
                └─ 遍历同一方或对立方的其他参与者
                    → 将 aura.modifiers 应用为目标参与者的属性修饰符
                        → GameDataProcessor.applyAuraModifiersToParticipant(target, sourceKey, modifiers)
                            → 直接 push 到 attrData.modifiers
                            → 调用 target.recalcAll()
```

---

#### 四、回合中触发（TurnManager → PassiveSkillManager）

```
[BattleSystem.processTurnInternal()]  (每回合)
    ├─ 触发 TURN_START 事件 → [PassiveSkillManager.triggerPassiveSkillsForAll(TURN_START, ...)]
    │   └─ 同 BATTLE_START 流程，但 trigger 为 TURN_START
    │
    ├─ 执行所有参与者行动（动作执行器）
    │   ├─ 在攻击/受击等事件中，显式调用 PassiveSkillManager.triggerPassives()
    │   │   └─ 例如：在 onHit, damageTaken, onDeath 等时机
    │   │       → 条件检查 → 执行被动步骤
    │
    └─ 触发 TURN_END 事件 → [PassiveSkillManager.triggerPassiveSkillsForAll(TURN_END, ...)]
        └─ 同上
```

---

#### 五、关键逻辑说明

1. **被动注册**：
   - 每个参与者在创建时，从其技能配置中提取被动技能列表，并通过 `registerParticipantPassives` 注册到 `PassiveSkillManager`。
   - 若被动技能未指定 `triggerTimes`，默认补充 `['battle_start']`，确保战斗开始时生效。

2. **触发时机**：
   - 时间型触发：`BATTLE_START`（仅一次），`TURN_START`，`TURN_END`。
   - 事件型触发：`BEFORE_ATTACK`，`ON_HIT`，`DAMAGE_TAKEN`，`HEAL_RECEIVED`，`ON_DEATH`，`ON_KILL`，`SKILL_USE`，`HP_LOWER_THAN` 等。
   - 事件型触发由业务代码在相应位置显式调用 `triggerPassives`。

3. **条件检查链**：
   - 冷却（cooldown）→ 最大触发次数（maxUses）→ 概率（triggerProbability）→ HP阈值（hp_lower_than）→ 自定义条件表达式（condition）。
   - 所有条件通过后才执行被动效果。

4. **目标解析**：
   - 时间型触发：根据技能配置的 `selector` 解析目标（支持 `self`/`ally`/`enemy` 及策略）。
   - 事件型触发：优先使用事件上下文中的 `target`，否则默认为自身。

5. **步骤执行**：
   - `modify_attribute`：直接修改参与者的属性修饰符列表，并触发重新计算。
   - `apply_buff`：调用 BuffSystem 添加 Buff，遵循完整生命周期（叠加、免疫、脚本回调等）。
   - 其他类型（damage/heal/shield/control）：由 `SkillExecutor` 处理，与主动技能共用执行器。

6. **追踪 Buff**：
   - 对于纯 `modify_attribute` 被动（无 `apply_buff` 步骤），系统会自动创建一个只读的追踪 Buff，使其在 UI 上可见，便于玩家理解被动生效状态。

7. **光环分发**：
   - 光环型被动（如首领光环、统帅之威）通过 `aura` 字段定义，在 `distributeAuras` 阶段将修饰符批量应用到盟友/敌人身上，而非每个目标单独触发。

8. **跨战斗清理**：
   - 战斗重置时调用 `PassiveSkillManager.clearAll()`，清空所有被动注册，防止跨战斗污染。

---

#### 六、整体时序图（简化ASCII）

```
参与者: 系统初始化 -> PassiveSkillManager -> SkillExecutor -> BuffSystem
---------------------------------------------------------------
1. 注册阶段
   系统加载角色 -> GameDataProcessor.enemyToParticipant()
                -> registerParticipantPassives()
                    -> PassiveSkillManager.registerPassive(characterId, config)

2. 战斗开始
   BattleSystem.initialize()
        -> applyPassiveSkills()
            -> PassiveSkillManager.triggerPassiveSkillsForAll(BATTLE_START)
                -> 对每个角色: triggerPassives()
                    -> 检查条件
                    -> executePassiveSkill()
                        -> SkillExecutor.executeStep()
                            -> 若 modify_attribute: 直接改属性 + recalcAll
                            -> 若 apply_buff: BuffSystem.addBuff()
                                -> 脚本 onApply
                                -> 触发属性变化
                                -> UI 通知

3. 光环分发
   BattleSystem.distributeAuras()
        -> 遍历所有 buff 实例
            -> 若 aura 存在，应用 modifiers 到同队/异队成员

4. 回合中触发
   TurnManager 执行回合
        -> 触发 TURN_START 事件 (同上流程)
        -> 动作执行中: 显式调用 triggerPassives(ON_HIT, DAMAGE_TAKEN, etc.)
        -> 触发 TURN_END 事件 (同上)

5. 结束/重置
   BattleSystem.resetBattle()
        -> PassiveSkillManager.clearAll()
```

---

#### 七、总结

被动技能系统采用**注册-触发-执行**三段式设计：
- **注册**：在角色初始化时完成，与配置解耦。
- **触发**：由战斗系统在特定阶段（回合边界、事件点）统一调度，通过 `PassiveSkillManager` 进行条件过滤。
- **执行**：复用主动技能的执行管道（`SkillExecutor`），保证逻辑一致性。

关键特性包括：
- 支持时间型与事件型触发。
- 完整的条件检查（冷却、次数、概率、HP、自定义条件）。
- 对纯属性修改被动自动生成追踪 Buff，提升 UI 可观测性。
- 光环效果通过集中分发机制保证性能与正确性。
- 跨战斗自动清理，避免状态污染。