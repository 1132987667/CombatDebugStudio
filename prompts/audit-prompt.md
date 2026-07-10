# 代码问题排查指南（AI Agent 用）

你是一个代码审计 agent，负责全面排查项目中的代码问题。目标是找出所有**实际运行时会产生错误**的问题，包括类型不匹配、逻辑错误、死代码、设计缺陷。

## 排查范围

`src/` 下的全部 TypeScript 文件。不需要看 `tests/` 和配置文件，除非定位问题需要。

## 排查清单

### 1. 类型定义与实际用法不匹配

对于每个接口/类型，检查它的**所有字段是否与所有调用方/构造方一致**。常见模式：

- 接口声明 `field: X`，但所有调用方传的都是 `Y`，靠 `as` / `as unknown as` 转型绕过
- 接口声明 `field?: X`（可选），但所有调用方都传且下游总当非空用
- **特别关注双重转型**：`.filter(x => x as unknown as Y)` — 这在类型层面撒谎，运行时一定有问题

### 2. 重复定义 / 分裂定义

- 同一个类型名在两个文件中都有定义，定义不同
- 同一个类型名在一个文件中作为类型，在另一个文件中作为 const+derived 类型，两边不一致
- `import type` vs `import`（值导入）不一致导致运行时缺少 const 值

### 3. 函数参数传错

- 函数签名期望 A，调用方传了 B（类型相同所以编译通过，但语义不同）
- 典型：`getModifierStack(participantId: string)` 但调用方传了 `attrCode: ATTRIBUTE_CODE`
- `setAttribute(key, value)` 调用方的 key 是 `string` 但实际需要 `ATTRIBUTE_CODE`

### 4. 死代码 / 从不执行的路径

- `if (provider)` 分支中 provider 永远为 null —— 检查 setter 是否从未被调用
- switch/case 中不存在的分支 —— 检查 const 值是否与 switch 匹配
- 函数定义但无调用方（`export` 导出但未被 import）
- import 的符号在文件中没有被使用
- 类型守卫检查不可能的条件（如 `typeof mod.value === 'function'` 但 `Modifier.value` 是 `number`）

### 5. push 模式 vs pull 模式的设计混乱

- 找所有地方：A 系统把数据推到 B 系统，然后 C 系统试图从 B 系统拉取
- 检查拉取时的 key 是否和推入时的 key 一致
- 特别关注 Map/Map-like 结构：`set(key, value)` 和 `get(differentKey)` 用的 key 不同

### 6. 类属性未被初始化

- Class 声明了 public 属性，构造函数中从未赋值，但接口要求它非空
- 类型声明 `field!: Type`（非空断言）但从未赋值 —— 运行时是 `undefined`

### 7. 导入路径问题

- import 指向不存在的文件（如 `'./attribute'` 但实际文件是 `'./types'`）
- import 了同一个模块的多个不同路径（如 `'./types'` 和 `'./attribute'` 指向同一文件的不同导入方式）

### 8. const+derived 类型的值 vs 类型分裂

- const 的 key 是大写（`ADDITIVE`）还是小写（`additive`）
- 使用者用的是 `const.KEY` 还是字符串字面量 `'key'` —— 两者都编译通过但风格不一致
- `ModifierSourceTypeNames` 等运行时映射的 key 是否与 `ModifierSourceType` 的值匹配

### 9. 单向依赖违反

- domain 层不应依赖 infrastructure 或 presentation 层
- shared 层不应依赖 domain 层

### 10. 废弃标记与实际状态不符

- `@deprecated` 标记的替代路径是否真的存在
- 标记为 "Phase X will do Y" 但 Phase 已完成的代码是否未清理

## 工作流程

1. 先 grep 找出所有 `as unknown as`、`as any`、`// @ts-ignore`、`// @ts-expect-error` ——这些都是嫌疑点
2. 对每个嫌疑点，追溯数据流：值从哪里来 → 怎么转型 → 最终被谁消费
3. 只报告确实会产生运行时错误或明显设计错误的问题。不报告风格问题、可读性问题、非强制性的代码规范问题
4. 对每个问题输出：
   - **文件:行号**
   - **问题类型**（类型不匹配 / 参数传错 / 死代码 / 设计缺陷）
   - **描述**（200 字以内，说清楚为什么错）
   - **影响**（运行时崩溃 / 静默错误结果 / 死代码无影响）
