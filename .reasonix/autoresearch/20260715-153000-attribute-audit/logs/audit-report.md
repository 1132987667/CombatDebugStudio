# 审计发现 — 技能拓展属性管理方案核查

## 核查日期
2026-07-17

## 核查方法
逐条对照两份文档主张，在代码库中查找直接证据。共读取12+文件，交叉验证伤害公式全流程。

---

## 主张核查结果表

| # | 文档主张 | 结论 | 证据摘要 |
|---|---------|------|----------|
| 1 | `ATTRIBUTE_CODE` 有 40+ 属性，其中 22 个为"拓展属性" | ✅ **基本正确** | 实际 46 个属性。文档分类合理 |
| 2 | `BattleDashboard.vue` 仅展示 14 个属性，20+ 拓展属性黑盒 | ✅ **正确** | 面板仅展示 14 行属性，30+ 属性未在面板单独展示 |
| 3 | 缺少 `displayTier`/`group` 元数据分类 | ✅ **正确** | `AttributeMeta` 接口中无这两个字段 |
| 4 | `shield` 作为属性存在但不该是"属性" | ✅ **正确** | shield 在 ATTRIBUTE_CODE 中定义(isRuntimeState:true)，但 BattleParticipantImpl 无 shield 字段，DamageCalculator 不读取，Shield逻辑全在BuffContext变量中——是**幽灵属性** |
| 5 | `reflectDamagePercent` 作为属性存在但不该是"属性" | ✅ **正确** | 已注册但 DamageCalculator 不读取。实际反弹逻辑由 `buff/triggers/index.ts` 的 `reflectDamage` 函数实现 |
| 6 | 连击/蓄力计数器作为运行时状态被当作属性管理 | ⚠️ **部分正确** | combo/charge 未注册为 ATTRIBUTE_CODE（好）。但 `SkillExecutor` 的 combo system 直接操作 `damageBoost` 的 modifiers 数组绕过 ModifierStack（脆弱的模式） |
| 7 | 缺少情境化展示（situational）和能力 | ✅ **正确** | 代码库中无 `situational`/`displayTier`/`group`概念，无 `useSituationalAttributes` composable |

---

## 文档未提及的重要发现（额外问题）

### 🔴 P0 Bug: `damageBoost` 已被使用但 DamageCalculator 不读取

这是文档**没有提到**但代码中真实存在的重大设计缺陷：

```
damageBoost 状态：
  ✅ 在 ATTRIBUTE_CODE 中已注册（types.ts:268）
  ✅ 有完整 AttributeMeta 元数据（types.ts:717-725）
  ✅ GuardianBuffs 中 4 个 Buff 向 damageBoost 添加 modifier
  ✅ SkillExecutor.handleThirdStrike() 读取并修改 damageBoost
  ✅ SkillExecutor.handleComboMaster() 读取并修改 damageBoost
  ❌ DamageCalculator.calculateDamage() 从未读取 damageBoost
  → 结论：所有对 damageBoost 的修饰符毫无效果！
```

### 🟡 `critDmgTakenReduction` 等 8 个属性定义后未在任何路径被读取

| 完全未使用的属性 | 文件 |
|-----------------|------|
| `critDmgTakenReduction` | types.ts:235 |
| `poisonRes` | types.ts:274 |
| `physicalDmgReduction` | types.ts:277 |
| `magicalDmgReduction` | types.ts:278 |
| `fireSkillDmgBonus` | types.ts:281 |
| `physicalSkillDmgBonus` | types.ts:282 |
| `damageToDemon` | types.ts:283 |
| `damageToLowHp` | types.ts:284 |

这些属性的元数据已完整，但 **DamageCalculator 中不存在对应的乘区计算代码**。

### 🟡 五行攻击力(metalAtk~earthAtk)已定义但从未使用

五行抗性 (metalRes~earthRes) 已在 DamageCalculator 中被元素伤害路径读取。但五行攻击力从未在任何代码中被读取。这意味着角色配置了"火属性攻击力+50"这样的属性，但伤害完全不受其影响。

### 🟡 Shield 完全脱离属性系统

shield 即使标记了 `isRuntimeState: true`，仍存在于 `ATTRIBUTE_CODE` 中。但实际 ShieldBuff 通过 `context.variables` 管理护盾值，`BattleParticipantImpl.takeDamage()` 不检查 shield 属性。护盾吸收伤害的能力**不存在于正式伤害流程**中——这是一个半成品状态。

---

## 文档方案的可执行性评估

| 文档建议 | 当前代码基础 | 评价 |
|---------|------------|------|
| 增加 `displayTier`/`group` 到 AttributeMeta | 无冲突，可增量添加 | ✅ 可行，建议 P0 执行 |
| BattleDashboard.vue 新增进阶属性折叠区块 | 只读分析中找到了合适插入位置 | ✅ 可行 |
| 实现 `useSituationalAttributes` | 类似的 `useParticipantStats` 已存在 | ✅ 可参考其模式新建 |
| 剥离 shield 为独立运行时状态 | 实际上已经以 BuffContext 变量形式独立了，只需移除 ATTRIBUTE_CODE 定义 | ✅ 删除定义即可 |
| 剥离 reflectDamagePercent 为触发器 | 触发器已存在（reflectDamage/reflectFireDamage），只需移除 ATTRIBUTE_CODE 定义 | ✅ 删除定义即可 |
| 防御性校验 SkillExecutor 中的 modifier | 当前无此类校验 | ✅ 需要实现 |

---

## 总结

**文档指出的所有问题确实都存在，而且实际情况比文档描述的更严重：**

1. **展示盲区**: 30+ 属性在调试面板不可见 ✅ 文档正确
2. **分类缺失**: 确实没有 displayTier/group 分类 ✅ 文档正确
3. **伪属性**: shield/reflectDamagePercent 确实是"幽灵属性" ✅ 文档正确
4. **情境缺失**: 确实没有任何情境化展示机制 ✅ 文档正确

**但文档漏掉了更严重的 bug：** `damageBoost` 作为已被 GuardBuffs 和连击系统活跃使用的属性，DamageCalculator 完全不读取——意味着部分 Buff 和连击机制**实际无效**。这是优先于文档所有建议的修复项。

此外，`critDmgTakenReduction` 等 8 个属性和 5 个五行攻击力属性注册后从未被任何计算路径读取，建议在文档的分级展示之外，同时梳理伤害公式、将这些属性正式接入乘区。
