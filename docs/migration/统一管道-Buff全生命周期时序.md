# 统一管道 — Buff 全生命周期时序

## 图例

```
┌─ 调用方 ─┐
├─ 方法名 ─┤
│ 关键操作   │
└───────────┘
  ● 同步 / 事件通知
```

---

## 阶段一：注册与初始化（构造期 → BATTLE_START）

```
GameDataProcessor.enemyToParticipant(enemy)
  │
  ├─ new BattleParticipantImpl(data, buffSystem)
  │    └─ setModifierProvider(buffSystem)
  │         ├─ this.modifierProvider = buffSystem
  │         ├─ syncModifiersFromProvider()
  │         │    └─ (此时 ModifierStack 为空，无效果)
  │         └─ stats.recalculateAll()
  │              └─ (基础属性已计算，被动加成尚未加入)
  │
  └─ registerParticipantPassives(entity, passiveSkillManager)
       └─ 遍历 skills.passive[]
            ├─ 有 triggerTimes → 原样注册到 PassiveSkillManager
            └─ 无 triggerTimes → 补 ['battle_start'] 后注册
                 └─ passiveSkillManager.registerPassive(entity.id, config)
```

---

## 阶段二：战斗开始 — 统一 BATTLE_START 触发

```
BattleSystem.initialize(allyParticipants, enemyParticipants)
  │
  ├─ 1. 构建 participants Map
  │    └─ setModifierProvider(entity, buffSystem) → syncModifiersFromProvider()
  │
  ├─ 2. 注册 BuffSystem 回调
  │    ├─ setAttributeChangeCallback → recalculateAll()
  │    └─ setBuffAppliedCallback → eventBus.emit(BUFF_EFFECT)
  │
  ├─ 3. applyPassiveSkills(participants)
  │    ├─ emitTriggerEvent(BATTLE_START)         ← EventBus 广播
  │    │
  │    └─ passiveSkillManager.triggerPassiveSkillsForAll(BATTLE_START, participants)
  │         │
  │         └─ [遍历每个参与者]
  │              └─ triggerPassives(BATTLE_START, entity, target?, context?)
  │                   │
  │                   └─ [遍历 characterPassives 中 trigger === BATTLE_START 的条目]
  │                        │
  │                        ├─ 检查冷却时间
  │                        │    └─ config.cooldown > 0 && lastTriggeredTurn
  │                        │         → currentTurn - lastTriggeredTurn < cooldown? → 跳过
  │                        │
  │                        ├─ 检查最大触发次数
  │                        │    └─ maxTriggerCount && triggerCount >= maxTriggerCount? → 跳过
  │                        │    └─ ponytail: battle_start 被动默认 maxTriggerCount = 1
  │                        │
  │                        ├─ 检查触发概率
  │                        │    └─ triggerProbability && Math.random() > probability? → 跳过
  │                        │
  │                        ├─ 检查 HP 阈值 (HP_LOWER_THAN 专用)
  │                        │    └─ currentHealth / maxHealth > hpThreshold / 100? → 跳过
  │                        │
  │                        ├─ 检查触发条件
  │                        │    └─ condition && !evaluateCondition()? → 跳过
  │                        │
  │                        │  ──── 全部通过 ────
  │                        │
  │                        ├─ actualTarget = target ?? entity    ← 对抗式审查修复 #1
  │                        │
  │                        ├─ skillManager.executeSkill(skillId, entity, actualTarget, turn)
  │                        │    │
  │                        │    └─ [遍历 skill.steps]
  │                        │         │
  │                        │         ├── step.type === 'modify_attribute'
  │                        │         │    └─ [流程 A：直接属性修改]
  │                        │         │
  │                        │         ├── step.type === 'apply_buff'
  │                        │         │    └─ [流程 B：addBuff 完整流程]
  │                        │         │
  │                        │         └── step.type === 'shield' / 'heal'
  │                        │              / 'deal_damage' / 'custom' / ...
  │                        │              └─ SkillExecutor 对应方法
  │                        │
  │                        └─ ensureTrackingBuff(entity.id, skillId, name)    ← 对抗式审查修复 #2
  │                             └─ [流程 C：创建追踪 Buff]
  │
  ├─ 4. 创建回合顺序（已移至被动加成之后）
  │    └─ battleData.turnOrder = turnManager.createTurnOrder(participants)
  │         └─ ponytail: 被动 speed 加成已生效，排序正确
  │
  └─ 5. distributeAuras(participants)
       └─ [流程 D：光环扫描分发]
```

---

## 流程 A：modify_attribute — 直接属性修改

```
SkillExecutor.executeModifyAttribute(step, action, source, target)
  │
  ├─ modTarget = step.targetConfig?.self ? source : target
  ├─ modifiers = step.modifiers
  │
  └─ [遍历 modifiers]
       │
       ├─ attrCode = mod.targetAttribute → ATTRIBUTE_CODE
       ├─ attrData = modTarget.getAttrValue(attrCode)
       │    └─ 无该属性? → continue
       │
       ├─ 解析 ModifierType (PERCENTAGE / ADDITIVE / MULTIPLICATIVE / FINAL)
       ├─ 值归一化 (value < 1 的 PERCENTAGE → ×100)
       │
       ├─ sourceKey = `passive:runtime:${mod.id || step.buffId || 'mod'}`
       ├─ attrData.modifiers = filter(m => m.sourceKey !== sourceKey)  // 去重
       ├─ attrData.modifiers.push(newMod)
       ├─ attrData.cachedVersion = -1
       │
       └─ [PERCENTAGE 专用 — 加成属性同步]    ← 对抗式审查修复 #3
            ├─ ATTR_TO_BONUS_MAP:
            │    ├─ maxHealth    → healthBonus
            │    ├─ minAttack    → attackBonus
            │    └─ maxAttack    → attackBonus
            │
            └─ 同步到对应的 bonus 属性
                 └─ (filter 去重 + push + cachedVersion = -1)

            ├─ [attack PERCENTAGE 专用]
            │    └─ 同步到 minAttack / maxAttack
            │         └─ (filter 去重 + push + cachedVersion = -1)
            │
  └─ modTarget.recalcAll()
       └─ (被动修饰符已写入 attrData.modifiers，直接参与计算)
```

---

## 流程 B：apply_buff — addBuff 完整流程

```
buffSystem.addBuff(characterId, buffId, config, currentTurn, record?)
  │
  ├─ 步骤 1：查找脚本
  │    ├─ scriptRegistry.get(buffId)
  │    │    ├─ 有 IBuffScript → 就用它
  │    │    └─ 无脚本 → 尝试 resolve(buffId)
  │    │         ├─ config 存在? → 用 NOOP_BUFF_SCRIPT 占位
  │    │         └─ config 不存在? → return '' (静默跳过)
  │    │
  │    └─ script 确定
  │
  ├─ 步骤 2：合并配置（四层优先级：调用方 > 脚本 CONFIG > JSON > 默认值）
  │    ├─ scriptDefaultConfig = 脚本的静态 CONFIG (自包含脚本)
  │    ├─ jsonConfig = scriptRegistry.getBuffConfig(buffId) (buffs.json)
  │    ├─ 合并顺序:
  │    │    id / name / description / duration / maxStacks
  │    │    stackRule / cooldown / controlType / controlPriority
  │    │    isDebuff / isPositive / isPermanent / dispellable
  │    │    immuneTags / iconPath / parameters / attributes
  │    │
  │    └─ resolvedConfig 就绪
  │
  ├─ 步骤 3：免疫检查
  │    ├─ characterImmunities.get(characterId)
  │    ├─ 控制类型免疫: controlType.toLowerCase() → 匹配免疫集?
  │    ├─ buffId 免疫: buffId 去掉前缀后 → 匹配免疫集?
  │    └─ 任一匹配 → return '' (不施加，静默跳过)
  │
  ├─ 步骤 4：叠加规则
  │    ├─ existingBuffs = getBuffInstances(charId).filter(i.buffId === buffId)
  │    │
  │    ├─ StackRule.REFRESH
  │    │    └─ existingBuffs.forEach(removeBuff)
  │    │
  │    ├─ StackRule.LIMITED
  │    │    ├─ existingBuffs.length >= maxStacks
  │    │    │    └─ refreshBuff(existing[0].id, turn) → return existing[0].id
  │    │    └─ < maxStacks → 继续创建新实例
  │    │
  │    └─ StackRule.INDEPENDENT → 直接创建新实例
  │
  ├─ 步骤 5：创建 BuffInstance
  │    ├─ instanceId = `${charId}_${buffId}_${turn}_${counter.next()}`
  │    ├─ context = BuffContextPool.borrow(charId, instanceId, resolvedConfig, this)
  │    ├─ buffInstance = {
  │    │     id: instanceId,
  │    │     characterId, buffId, script, context,
  │    │     startTurn: turn,
  │    │     duration: resolvedConfig.duration || -1,
  │    │     remainingTurns: resolvedConfig.duration,
  │    │     currentStacks: 1,
  │    │     isActive: true,
  │    │   }
  │    └─ buffInstances.set(instanceId, buffInstance)
  │
  ├─ 步骤 6：执行脚本 onApply
  │    └─ BuffErrorBoundary.wrap(() => script.onApply(context))
  │         │
  │         ├─ [自包含脚本 AttributeBuffTemplate 示例]
  │         │    └─ _onApply(context):
  │         │         ├─ getModifiers() → [{attribute, value: (ctx)=>..., type}]
  │         │         └─ context.addModifier(attrCode, computedValue, modType)
  │         │              └─ modifierStack.addModifier(instanceId, attr, value, type)
  │         │
  │         └─ [NOOP 脚本] → 空操作
  │
  ├─ 步骤 7：非自包含脚本 → 从 JSON 配置读取属性修饰符
  │    ├─ applyAttributeModifiers(charId, instanceId, buffId)
  │    │    └─ scriptRegistry.getBuffAttributes(buffId)  (如 {"attack": "+20%"})
  │    │         └─ modifierStack.addModifier(instanceId, attr, parsedValue, parsedType)
  │    │
  │    └─ applyBuffImmunities(charId, buffId)
  │         └─ buffConfig.immunities? → characterImmunities.add(tag)
  │
  ├─ 步骤 8：自光环修饰符 (targetSelector === 'self')
  │    └─ applyBuffAuraModifiers(charId, instanceId, buffId)
  │         └─ aura?.targetSelector === 'self'
  │              └─ modifierStack.addModifier(instanceId, attr, value, type)
  │
  ├─ 步骤 9：触发属性变更
  │    └─ triggerAttributeChange(characterId)
  │         └─ onAttributeChange?.(characterId)
  │              └─ [回调 → BattleSystem]
  │                   └─ participant.recalculateAll()
  │                        │
  │                        ├─ syncModifiersFromProvider()
  │                        │    └─ [遍历所有 ATTRIBUTE_CODE]
  │                        │         ├─ stack = modifierProvider.getModifierStack(id)
  │                        │         ├─ stackMods = stack.getModifiers(code)
  │                        │         ├─ 保留: baseModifiers + passiveModifiers
  │                        │         └─ externalModifiers = stackMods + sourceName 描述
  │                        │              └─ attrData.modifiers = [base, ...passive, ...external]
  │                        │
  │                        └─ stats.recalculateAll()
  │                             └─ (最终属性值 = 基础值 + 所有修饰符)
  │
  ├─ 步骤 10：UI 通知
  │    └─ onBuffApplied?.(charId, buffId)
  │         └─ [回调 → BattleSystem]
  │              └─ eventBus.emit(BUFF_EFFECT, { targetId, buffName, isPositive })
  │                   └─ → UI buff 列表更新 + 动画播放
  │
  └─ 步骤 11：战斗记录
       └─ record?.effects.push({ type: 'buff', targetId, buffId, instanceId })
```

---

## 流程 C：追踪 Buff（modify_attribute 纯被动 -> buff 列表可见）

```
PassiveSkillManager.ensureTrackingBuff(characterId, skillId, skillName)
  │
  ├─ skillConfig = skillManager.getSkillConfig(skillId)
  │    └─ 无 config 或 无 steps → return
  │
  ├─ hasApplyBuff = steps.some(s => s.type === 'apply_buff')
  │    └─ true → return (apply_buff 已创建 buff 实体，无需追踪)
  │
  ├─ buffId = `_track_passive_${skillId}`
  │
  ├─ buffSystem.hasBuff(characterId, buffId)
  │    └─ true → return (已存在，避免重复)
  │
  └─ buffSystem.addBuff(characterId, buffId, {
       id: buffId,
       name: skillName,
       duration: -1,              // 永久
       maxStacks: 1,
       stackRule: StackRule.REFRESH,
       controlType: ControlType.NONE,
       isDebuff: false,
       isPositive: true,
       // 无 attributes → 不产生修饰符，仅作为 UI 占位
     }, 0)
```

---

## 流程 D：光环扫描分发

```
BattleSystem.distributeAuras(participants)
  │
  └─ [遍历每个参与者]
       │
       └─ [遍历其所有 buff 实例 ID]
            │
            └─ buffSystem.getBuffConfigByInstanceId(instanceId)
                 │
                 ├─ 返回 BuffConfig | null
                 │
                 └─ buffSystem.getBuffAuraConfig(buffConfig.id)
                      │
                      ├─ 从 BuffScriptRegistry 读取 BuffConfigData.aura
                      │
                      ├─ 无 aura → continue
                      │
                      └─ 有 aura.targetSelector
                           ├─ 'allies' → 同队目标
                           └─ 'enemies' → 异队目标
                                │
                                └─ GameDataProcessor.applyAuraModifiersToParticipant(
                                       target, sourceKey = `passive:${buffConfig.id}`, modifiers)
                                     │
                                     └─ [遍历每个 modifier]
                                          ├─ pushModifier → attrData.modifiers
                                          ├─ cachedVersion = -1
                                          └─ target.recalcAll()
```

---

## 阶段三：每回合更新

```
BattleSystem.executeRound()
  │
  └─ [遍历每个存活参与者]
       │
       └─ buffSystem.updatePerTurn(characterId)
            │
            └─ [遍历该角色所有 buffInstance]
                 │
                 ├─ script.onUpdate(context, 0)    ← 脚本每回合逻辑
                 │    ├─ [毒伤] → 扣除剩余回合 * 每回合伤害
                 │    ├─ [回血] → 每回合恢复 maxHealth * 百分比
                 │    └─ [自定义] → buff 脚本定义的 onUpdate
                 │
                 ├─ duration === -1?
                 │    └─ true → 跳过到期检查 (永久 buff)
                 │
                 ├─ remainingTurns--
                 │
                 └─ remainingTurns <= 0?
                      └─ removeBuff(instanceId)    ← 到期自动移除
```

---

## 阶段四：移除 Buff

```
buffSystem.removeBuff(instanceId)
  │
  ├─ 1. 查找实例
  │    ├─ instance = buffInstances.get(instanceId)
  │    └─ 不存在或 !isActive → return false
  │
  ├─ 2. 执行脚本 onRemove
  │    └─ BuffErrorBoundary.wrap(() => script.onRemove(context))
  │         │
  │         ├─ [BaseBuffScript.onRemove] → context.removeModifiers()
  │         │    └─ modifierStack.removeModifier(instanceId)
  │         │         └─ [遍历所有属性] 移除 sourceKey === instanceId 的修饰符
  │         │
  │         ├─ [AttributeBuffTemplate.onRemove]
  │         │    └─ 对每个 modifier → context.removeModifiers(attrCode)
  │         │         └─ modifierStack.removeModifier(instanceId, attrCode)
  │         │
  │         └─ [自包含脚本 onRemove] → 同 base 逻辑
  │
  ├─ 3. 清理实例状态
  │    ├─ instance.isActive = false
  │    └─ buffInstances.delete(instanceId)
  │
  ├─ 4. 保险清理 — modifierStack.removeModifier(instanceId)
  │    └─ (即使 onRemove 漏了某个属性，这里全量清理)
  │
  ├─ 5. BuffContextPool.return(context)
  │    └─ (归还上下文对象到对象池复用)
  │
  └─ 6. triggerAttributeChange(characterId)
       └─ → recalculateAll()
            ├─ syncModifiersFromProvider() ← ModifierStack 已无该 instanceId 的修饰符
            └─ (属性值恢复为移除 buff 前的值)
```

---

## 修饰符同步机制详解

```
syncModifiersFromProvider()    ← 每次 recalculateAll 前调用
  │
  ├─ modifierProvider = this.buffSystem (IModifierProvider)
  ├─ stack = modifierProvider.getModifierStack(this.id)
  │
  └─ [遍历所有 ATTRIBUTE_CODE]
       │
       ├─ stackMods = stack.getModifiers(code)
       │    └─ 从 ModifierStack 读取 (sourceKey = buffInstanceId)
       │
       ├─ 保留的修饰符:
       │    ├─ baseModifier: sourceKey === 'base'
       │    └─ passiveModifiers: sourceKey 以 'passive:' 开头
       │         ├─ 来自 executeModifyAttribute 的 'passive:runtime:...'
       │         └─ 来自 distributeAuras 的 'passive:{buffId}'
       │
       ├─ externalModifiers = stackMods.map(m => ({
       │    ...m,
       │    sourceType: provider.getSourceType(m.sourceKey),  ← 'buff'
       │    description: `来自: ${provider.getSourceName(m.sourceKey)}`,
       │  }))
       │
       └─ attrData.modifiers = [baseModifier, ...passiveModifiers, ...externalModifiers]
            └─ cachedVersion = stats.currentVersion - 1
```

### 两条修饰符路径的共存规则

| 来源 | sourceKey 格式 | 存储位置 | 在 syncModifiersFromProvider 中的处理 |
|:----|:--------------|:---------|:-------------------------------------|
| **被动 modify_attribute** | `passive:runtime:{modId}` | `attrData.modifiers` | 匹配 `passive:` 前缀 → 保留 |
| **光环分发** | `passive:{buffId}` | `attrData.modifiers` | 匹配 `passive:` 前缀 → 保留 |
| **BuffSystem 脚本/JSON** | `{instanceId}` (如 `char_buffX_1_42`) | `ModifierStack` → `syncModifiersFromProvider` 合并 | 每次全部刷新，无保留条件 |

---

## 两条修饰符路径完整对比

| 特征 | ModifierStack 路径 (BuffSystem) | 直接 pushModifier 路径 |
|:----|:-------------------------------:|:----------------------:|
| 入口 | `addBuff` → `applyAttributeModifiers` 或脚本 `onApply` | `SkillExecutor.executeModifyAttribute` 或 `distributeAuras` |
| 存储位置 | `ModifierStack.modifiers[attr][]` | `BattleParticipantImpl.stats.attrs[].modifiers` |
| 生命周期 | 绑定 `BuffInstance`，`removeBuff` 时自动清理 | 需主动 `filter(sourceKey)` 去重 |
| 同步方式 | `triggerAttributeChange` → `syncModifiersFromProvider` 合并 | 直接 `recalcAll()` |
| sourceKey | `instanceId` (如 `char_buffX_1_42`) | `'passive:runtime:{modId}'` 或 `'passive:{buffId}'` |
| 保留规则 | 每次 sync 全部刷新(无状态) | `syncModifiersFromProvider` 保留 `passive:` 前缀 |
| buff 列表可见 | ✅ 有 BuffInstance | ❌ 仅属性值变化(除非追踪 buff 占位) |
| 可驱散 | ✅ removeBuff 即可 | ❌ 需手动清理 |
| 加成属性同步 | ✅ (脚本自行 addModifier) | ✅ (修复后: BONUS_MAP + minAttack/maxAttack) |

---

## 跨战斗清理

```
BattleSystem.resetBattle()
  │
  ├─ passiveSkillManager.clearAll()
  │    └─ 清空所有被动注册条目，防止跨战斗 ID 重复触发
  │
  └─ lifecycleManager.resetBattle()
       ├─ buffSystem.clearAllBuffs(characterId)    ← 遍历参与者
       │    └─ removeBuff() → [进入阶段四]          ← 全部实例清除
       ├─ 重置血量/能量
       └─ battleRecorder.clearRecording()
```

---

## 整体数据流

```
JSON 配置
  │
  ├─ skill_passive.json ──→ GameDataProcessor.registerParticipantPassives()
  │                              │
  │                              └─ PassiveSkillManager (triggerTimes 映射)
  │                                    │
  │                                    └─ BattleSystem.applyPassiveSkills()
  │                                          │
  │                                          └─ BATTLE_START
  │                                                │
  │                                                ├─ modify_attribute
  │                                                │    └─ SkillExecutor.executeModifyAttribute
  │                                                │         ├─ pushModifier → attrData.modifiers
  │                                                │         ├─ BONUS_MAP 同步
  │                                                │         └─ recalcAll()
  │                                                │
  │                                                ├─ apply_buff
  │                                                │    └─ SkillExecutor.executeApplyBuff
  │                                                │         └─ buffSystem.addBuff()  [流程 B]
  │                                                │
  │                                                └─ (追踪 buff)  [流程 C]
  │
  ├─ buffs.json ──→ BuffScriptRegistry
  │                     │
  │                     └─ buffSystem.addBuff() 时读取
  │                          ├─ getDefaultConfig(buffId)  ← 脚本 CONFIG
  │                          ├─ getBuffConfig(buffId)     ← JSON 配置
  │                          ├─ getBuffAttributes(buffId) ← JSON attributes
  │                          └─ getBuffAuraConfig(buffId) ← JSON aura
  │
  └─ GuardianBuffs.ts ──→ BuffScriptRegistry.register()
                              └─ 自包含脚本，BUFF_ID 注册 + 静态 CONFIG
```

---

## 修复清单（对抗式审查产出）

| 修复点 | 所在文件 | 行/方法 | 说明 |
|:------|:---------|:-------|:------|
| `actualTarget = target ?? entity` | `PassiveSkillManager.ts` | `triggerPassives` | BATTLE_START target undefined 导致被动静默跳过 |
| `ensureTrackingBuff` | `PassiveSkillManager.ts` | 新增方法 | 纯 modify_attribute 被动自动创建追踪 buff 使其可见 |
| ATTR_TO_BONUS_MAP 同步 | `SkillExecutor.ts` | `executeModifyAttribute` | PERCENTAGE 修饰符同步到 healthBonus/attackBonus 等 |
| attack% → minAttack/maxAttack | `SkillExecutor.ts` | `executeModifyAttribute` | attack PERCENTAGE 同步到分裂属性 |
| `clearAll()` 调用 | `BattleSystem.ts` | `resetBattle` | 清除跨战斗被动注册污染 |
| turnOrder 后移 | `BattleSystem.ts` | `initialize` | turnOrder 在 applyPassiveSkills 之后创建，确保速度加成正确 |
| `distributeAuras` | `BattleSystem.ts` | 新增方法 | 替代旧 pendingAuras 两遍扫描，扫描所有参与者身上的光环 buff |
| `applyBuffImmunities` | `BuffSystem.ts` | `addBuff` 流程 | 已在之前迁移中实现：从 JSON immunities 字段写入 characterImmunities |
