# 战斗 UI 响应式链路分析

## 问题概述

当前架构中，UI（`ParticipantCard`）只在 `syncTeams()` 执行的瞬间刷新数据。  
回合内的所有中间状态变化（掉血、回能、属性变更）Vue 的响应式系统无法感知。  
数据在内存中已经变了，但 UI 停留在上回合末的快照。

---

## 1. 数据流全景图

```
BattleManager (领域层)
  │
  ├─ BattleManager.allyTeam: BattleEntity[]          ← 原始 BattleParticipantImpl 实例
  │     （takeDamage/gainEnergy/recalcAll 直接修改这些对象）
  │
  ├─ emitTeamChanged()
  │     → eventBus.emit(TEAM_DATA_CHANGED)
  │        → battleStore.syncTeams()
  │
  └─ BattleManager.getEnabledAllyTeam()
        → return [...this.allyTeam.filter(e => e.enabled)]   ← 返回原始对象引用
```

```
battleStore (Pinia)
  │
  syncTeams() {
    allyTeam.value = battleService.getEnabledAllyTeam()
      .map(p => shallowReactive(p))    ← 用 Proxy 包裹，但只做浅层
  }
  │
  allyTeam = shallowRef<BattleEntity[]>([])   ← 只有 .value 整体替换才触发更新
```

```
BattleField.vue (父组件)
  │
  const allyTeam = computed(() => store.allyTeam)
  │
  <ParticipantCard
    v-for="member in allyTeam"
    :participant="member"    ← member = shallowReactive(BattleParticipantImpl)
  />
```

```
ParticipantCard.vue (子组件)
  │
  props.participant: BattleEntity         ← 就是那个 shallowReactive 对象
  │
  // 方案 A（当前 hpText 的写法）：
  const hpText = computed(() => {
    const data = props.participant        ← 依赖 props.participant
    data.currentHealth                    ← BattleParticipantImpl 的 getter
    data.maxHealth                        ← BattleParticipantImpl 的 getter
  })
  │
  // 方案 B（通过 useBattleParticipant 的写法）：
  const { stats } = useBattleParticipant(toRef(props, 'participant'))
  //   stats = computed(() => ({
  //     currentHealth: p.getAttributeValue(ATTRIBUTE_CODE.currentHealth)!,  // AttributeValue 引用
  //     ...
  //   }))
  const energyText = computed(() => {
    const data = stats.value              ← 依赖 stats computed
    data.energy.value                     ← AttributeValue.value
  })
```

---

## 2. 核心缺陷一：回合粒度快照

`syncTeams()` 只在以下时机被调用：

| 触发时机                              | 代码位置                        |
| ------------------------------------- | ------------------------------- |
| `BattleManager.initializeTeams()`     | `BattleManager.ts:230`          |
| `BattleManager.setCharacterEnabled()` | `BattleManager.ts:308`          |
| `BattleManager.addCharacterToTeam()`  | `BattleManager.ts:331`          |
| `BattleManager.removeCharacter()`     | `BattleManager.ts:342`          |
| `BattleManager.startBattle()`         | `BattleManager.ts:567`          |
| `BattleManager.endBattle()`           | `BattleManager.ts:625`          |
| `BattleManager.resetBattle()`         | `BattleManager.ts:636`          |
| 自动战斗每回合结束                    | `BattleLifecycleManager.ts:122` |
| `BattleArena.vue` 手动干预操作        | `BattleArena.vue:521/552/581`   |

**唯一覆盖回合内变化的事件**是 `PARTICIPANT_ATTRIBUTE_CHANGED`，但它通过 `handleAttributeChanged` 调 `proxy.recalculateAll()`，下面会说明为什么这条路也断了。

典型场景的时间线：

```
回合 1 开始
  participantRef = proxy(A)     ← syncTeams 创建的
  气血 显示 100/100                  ✓

  takeDamage(70)
  → proxy(A).currentHealth = 30  ← 内存变了
  → proxy(A).stats.attributes.get('currentHealth').value = 30
  → participantRef.value 没变     ← 还是同一个 proxy(A)
  → stats computed 不重算
  → hpText 不重算
  → UI 还是显示 100/100           ✗

回合 1 结束
  emitTeamChanged()
  → syncTeams()
  → allyTeam.value = [proxy(B), ...]  ← 新对象
  → participantRef.value = proxy(B)
  → stats computed 重算
  → hpText 重算
  → UI 显示 30/100               ✓   但已经迟了一个回合
```

---

## 3. 核心缺陷二：`shallowReactive` 不追踪深层嵌套

`syncTeams()` 中：

```ts
allyTeam.value = battleService
  .value!.getEnabledAllyTeam()
  .map((p) => shallowReactive(p)) // src/presentation/stores/battleStore.ts:155
```

`shallowReactive` 只拦截**一级属性**的 get/set。而 `BattleParticipantImpl` 的 `currentHealth` 是 getter：

```ts
// BattleParticipantImpl.ts:267
get currentHealth(): number {
  return this.getAttribute(ATTRIBUTE_CODE.currentHealth)
}
```

它通过 `getAttribute()` 最终读到 `ParticipantStats.attributes` Map 中 `AttributeValue` 对象的 `.value` 属性：

```ts
// ParticipantStats.ts
reCalAttributeValue(attr) {
  this.recalcAttribute(attr)
  return this.attributes.get(attr)   // → AttributeValue { value: 30, ... }
}
```

当 `takeDamage` 修改 `currentHealth` 时，它走的是：

```ts
// BattleParticipantImpl.ts:274-281
set currentHealth(value: number) {
  this.stats.setAttributeValue(ATTRIBUTE_CODE.currentHealth, Math.max(0, Math.min(value, maxHp)))
  // → stats.attributes.get('currentHealth')!.value = 30
}
```

**这是一个普通对象属性的赋值，不走 `shallowReactive` proxy 的 set trap**（因为它在 proxy 的 `this.stats` 内部，是深层嵌套）。Vue 完全感知不到。

---

## 4. 核心缺陷三：`toRef(props, 'participant')` + `stats` computed 的依赖陷阱

### 4.1 方案的依赖链

```
toRef(props, 'participant')
  → .value 指向 props.participant

stats = computed(() => {
  const p = participantRef.value     // ← 唯一依赖
  return {
    currentHealth: p.getAttributeValue(ATTRIBUTE_CODE.currentHealth)!,
    // ↑ 返回 AttributeValue 对象的引用
  }
})
  → .value 存的是 { currentHealth: AttributeValue 引用, ... }
  → 这个 computed 只在 participantRef.value 变化时才重算

hpText = computed(() => {
  const data = stats.value
  data.currentHealth.value          // ← 读引用内部的 .value
})
```

### 4.2 为什么是陷阱

`stats` computed 在 participantRef 换对象时才重算，但它返回的对象里存的 `currentHealth` 是 `AttributeValue`**引用**。

引用指向的对象在回合内 `.value` 属性确实会变成 30——但 **Vue 不知道**，因为：

- `participantRef.value` 没变 → `stats` 不重算
- `stats` 不重算 → `stats.value` 返回的是旧的缓存结果（虽然它内部的 `currentHealth.value` 在内存中悄悄变成了 30）
- `hpText` 依赖 `stats` → `hpText` 不重算
- 模板不刷新

**注意**：`hpText` 如果直接读 `props.participant.currentHealth`（即 `BattleParticipantImpl` 的 getter），而不是走 `stats.value` 中转，表现是一样的——因为 `props.participant` 本身也是 `shallowReactive` 对象，而 `currentHealth` getter 内部走的是 `this.getAttribute()` 这条深链，同样不触发 Vue 更新。

### 4.3 代码证据

#### ParticipantCard.vue 当前混合了两种读取方式

```ts
// 方式一：直接读 props.participant（hpText, hpPct）
const hpText = computed(() => {
  const data = props.participant // 依赖 props.participant
  data.currentHealth // BattleParticipantImpl getter
  // → this.getAttribute(ATTRIBUTE_CODE.currentHealth)
  // → this.stats.reCalAttributeValue('currentHealth')
  // → this.attributes.get('currentHealth').value
  // → 不在 Vue 响应式追踪范围内
})

// 方式二：通过 stats computed（energyText）
const { stats } = useBattleParticipant(toRef(props, 'participant'))
const energyText = computed(() => {
  const data = stats.value // 依赖 stats computed
  data.energy.value // AttributeValue.value
  // stats 只依赖 participantRef.value（= props.participant）
  // participantRef 不变 → stats 不重算 → UI 不刷新
})
```

两种方式都无法感知回合内的数据变化。

---

## 5. 核心缺陷四：`getAttributeValue` 可能返回 `undefined`

### 5.1 问题路径

```ts
// BattleParticipantImpl.ts:141-143
constructor(data: BattleParticipantData, ...) {
  if (data.attributeValues) {
    this.stats.initAttributes(data.attributeValues)   // ← 条件执行
  }
  // 如果 data.attributeValues 不存在，stats.attributes Map 是空的
}
```

如果构造时 `data.attributeValues` 为 falsy（`undefined` / `null`），`initAttributes` 不被调用，内部 `attributes` Map 为空。

后续所有 `getAttributeValue()` 调用返回 `undefined`：

```ts
// BattleParticipantImpl.ts:221-222
getAttributeValue(attr: ATTRIBUTE_CODE): AttributeValue | undefined {
  return this.stats.reCalAttributeValue(attr)
  // → this.attributes.get(attr)  → undefined
}
```

### 5.2 崩溃链

```ts
// useBattleParticipant.ts
const stats = computed(() => {
  return {
    currentHealth: p.getAttributeValue(ATTRIBUTE_CODE.currentHealth)!, // ! 是 TS 断言，运行时无效
    // 实际值是 undefined
  }
})

// ParticipantCard.vue
const hpText = computed(() => {
  const data = stats.value // { currentHealth: undefined, ... }
  data.currentHealth.value // TypeError: Cannot read properties of undefined
  // console.log 在这之前但 data.currentHealth 已经是 undefined，
  // 表达式 data.currentHealth.value 还没执行到 console.log 就崩了
  // Vue 3 模式下不会有未捕获的 error 弹窗，但 console 会有 Vue warning
})
```

### 5.3 当前实际路径

`GameDataProcessor.enemyToParticipant()` 传了 `attributeValues: stats`（`GameDataProcessor.ts:150`），所以正常的构造路径不会触发这个 bug。  
但当初遗留的"先改造 `stats` computed 再用 `!` 掩盖"的设计隐患还在——如果某天有别处构造 `BattleParticipantImpl` 没传 `attributeValues`，同样的崩溃会再现。

---

## 6. 缺陷五：`handleAttributeChanged` 补救路径也断了

```ts
// battleStore.ts:257-267
const handleAttributeChanged = (data: { characterId: string }) => {
  const proxy = allyTeam.value.find(p => p.id === id)
    ?? enemyTeam.value.find(p => p.id === id)
    ?? ...
  proxy?.recalculateAll()
}
```

`recalculateAll()` 内部：

```ts
// BattleParticipantImpl.ts:241-246
recalcAll(): void {
  this.syncModifiersFromProvider()    // 从 ModifierStack 同步修饰符
  this.stats.recalculateAll()         // 重算所有 AttributeValue.value
  this.clampCurrentHealth()
}
```

`stats.recalculateAll()` 修改的是 `attributes` Map 中 `AttributeValue.value`——依然是深层嵌套的普通属性赋值，`shallowReactive` proxy 拦截不到。  
所以即使 `PARTICIPANT_ATTRIBUTE_CHANGED` 事件触发了，UI 也不会刷新——除非某个属性修改碰巧走了 proxy 的直接 setter（比如 `this.currentHealth = x` 触发了 `set currentHealth` getter/setter）。

但 `recalculateAll()` 内部走的不是 `this.currentHealth = x`，而是 `attrData.value = x`。

---

## 7. 根因总结

| #   | 缺陷                                                                                                                               | 影响                                               | 严重度 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------ |
| 1   | **回合粒度刷新**：`syncTeams` 只在回合边界的少数时机触发，回合内所有中间变化不通知 UI                                              | 战斗中 气血/能量条不会实时变化，只在回合跳变时刷新 | 高     |
| 2   | **`shallowReactive` 不追踪深层**：`AttributeValue.value` 的修改在 `stats.attributes` Map 内部，不在 proxy 的拦截范围内             | Vue 无法感知属性值变化，computed 不重算            | 高     |
| 3   | **`stats` computed 只依赖对象引用**：`participantRef.value` 不变就不重算，返回的 `AttributeValue` 引用内部 `.value` 变了也没人知道 | 整条 computed 链断在中间层                         | 高     |
| 4   | **`getAttributeValue` 返回 `undefined` 被 `!` 掩盖**：极端情况下崩溃发生在 `console.log` 之前，且没有明确报错信息                  | 调试困难，新构造路径可能静默失败                   | 中     |
| 5   | **`handleAttributeChanged` 补救无效**：调 `recalculateAll` 但修改的还是深层属性，Vue 仍不感知                                      | 事件发了但 UI 不更新                               | 中     |

---

## 8. 关键文件 & 行号

| 文件                                                   | 行      | 内容                                                     |
| ------------------------------------------------------ | ------- | -------------------------------------------------------- |
| `src/presentation/stores/battleStore.ts`               | 151-158 | `syncTeams()` 定义                                       |
| `src/presentation/stores/battleStore.ts`               | 257-267 | `handleAttributeChanged` 补救                            |
| `src/presentation/stores/battleStore.ts`               | 270     | `TEAM_DATA_CHANGED` 事件注册                             |
| `src/presentation/composables/useBattleParticipant.ts` | 84-136  | `stats` computed，用 `!` 断言                            |
| `src/presentation/components/ParticipantCard.vue`      | 185     | `useBattleParticipant(toRef(props, 'participant'))` 调用 |
| `src/presentation/components/ParticipantCard.vue`      | 271-277 | `hpText` 直接读 `props.participant`                      |
| `src/presentation/components/ParticipantCard.vue`      | 292-296 | `energyText` 走 `stats.value`                            |
| `src/domain/battle/entity/BattleParticipantImpl.ts`    | 141-143 | 条件构造 `initAttributes`                                |
| `src/domain/battle/entity/BattleParticipantImpl.ts`    | 221-222 | `getAttributeValue` 返回 `undefined` 的可能              |
| `src/domain/battle/entity/BattleParticipantImpl.ts`    | 267-268 | `currentHealth` getter 走深层 `getAttribute`             |
| `src/domain/battle/entity/BattleParticipantImpl.ts`    | 274-281 | `currentHealth` setter 赋值到深层                        |
| `src/domain/battle/entity/ParticipantStats.ts`         | 64-67   | `reCalAttributeValue` 返回 `this.attributes.get(attr)`   |
| `src/shared/utils/GameDataProcessor.ts`                | 150     | `enemyToParticipant` 传 `attributeValues`                |

---

## 9. 一句话总结

**整个 UI 响应式建立在一个不成立的假设上：认为 `shallowReactive` + 对象引用替换（syncTeams）就能覆盖所有数据变更。实际上 `BattleParticipantImpl` 的数据模型是三层嵌套（`entity → stats.attributes Map → AttributeValue.value`），`shallowReactive` 只拦截第一层，第二层和第三层的修改 Vue 完全不知情。结果就是 UI 只在回合边界快照时刷新一次，回合内任何变化都不反应到界面上。**
