/**
 * 类型系统架构文档
 *
 * 本文档描述了项目的类型系统架构设计和最佳实践
 *
 * ## 目录
 * 1. [类型层级结构](#类型层级结构)
 * 2. [命名规范](#命名规范)
 * 3. [类型使用指南](#类型使用指南)
 * 4. [类型测试](#类型测试)
 *
 * ## 类型层级结构
 *
 * ```
 * ┌─────────────────────────────────────────────────────────┐
 * │                    基础类型层                          │
 * │  AttributeValue, AttributeOption, Modifier, Effect     │
 * └─────────────────────────────────────────────────────────┘
 *                           │
 *                           ▼
 * ┌─────────────────────────────────────────────────────────┐
 * │                    实体类型层                          │
 * │  CharacterStats, UIBattleCharacter, Enemy, BattleEntity│
 * └─────────────────────────────────────────────────────────┘
 *                           │
 *                           ▼
 * ┌─────────────────────────────────────────────────────────┐
 * │                    业务类型层                          │
 * │  BattleState, BattleAction, BattleEffect, Skill, Buff  │
 * └─────────────────────────────────────────────────────────┘
 *                           │
 *                           ▼
 * ┌─────────────────────────────────────────────────────────┐
 * │                    接口类型层                          │
 * │  IBattleSystem, ISkillSystem, IBuffSystem             │
 * └─────────────────────────────────────────────────────────┘
 * ```
 *
 * ## 命名规范
 *
 * ### 接口命名
 * | 类型 | 命名规则 | 示例 |
 * |------|----------|------|
 * | 基础实体 | 名词单数 | Character, Enemy |
 * | 配置类 | Config后缀 | SkillConfig, BuffConfig |
 * | 实例类 | Instance后缀 | EnemyInstance, BuffInstance |
 * | UI展示类 | UI前缀 | UIBattleCharacter |
 * | 扩展类型 | Extended后缀 | ExtendedSkillStep |
 * | 组合类型 | With后缀 | SkillStepWithEffect |
 * | 抽象接口 | I前缀 | IBattleSystem |
 *
 * ### 属性命名
 * | 类型 | 命名规则 | 示例 |
 * |------|----------|------|
 * | 静态配置 | 全大写 | MAX_HP, ATK, DEF |
 * | 动态数据 | 小驼峰 | maxHp, attack, defense |
 * *注意*: 统一使用小驼峰命名以保持一致性 |
 * | 布尔属性 | is/has/can前缀 | isAlive, hasBuff, canAct |
 * | 数值属性 | 无特殊规则 | level, value, count |
 *
 * ### 枚举和常量
 * | 类型 | 命名规则 | 示例 |
 * |------|----------|------|
 * | 枚举值 | 全大写下划线分隔 | PARTICIPANT_SIDE.ALLY |
 * | 日志级别 | 小写 | 'debug', 'info', 'warning', 'error' |
 * | 日志类别 | 小写 | 'system', 'action', 'damage', 'heal' |
 *
 * ## 类型使用指南
 *
 * ### 1. 角色属性选择
 *
 * ```typescript
 * // 静态配置数据 (配置文件、数据库)
 * import { CharacterStats } from '@/types/core'
 *
 * // 战斗运行时数据 (动态变化)
 * import { UIBattleCharacter } from '@/types/core'
 *
 * // 属性值包装
 * import { AttributeValue } from '@/types/core'
 * const attack: AttributeValue = {
 *   value: 100,
 *   type: 'flat',
 *   source: 'base',
 *   overrides: false,
 * }
 * ```
 *
 * ### 2. 日志类型选择
 *
 * ```typescript
 * import {
 *   BattleLogLevel,      // 日志级别
 *   BattleLogCategory,   // 日志类别
 *   BattleLogMessageType // 联合类型
 * } from '@/types/core'
 *
 * // 日志级别 - 用于过滤和显示
 * const level: BattleLogLevel = 'info'
 *
 * // 日志类别 - 用于业务分组
 * const category: BattleLogCategory = 'damage'
 *
 * // 两者都支持的值
 * const messageType: BattleLogMessageType = 'damage'
 * ```
 *
 * ### 3. 参与者阵营
 *
 * ```typescript
 * import { ParticipantSide } from '@/types/core'
 *
 * const side: ParticipantSide = 'ally' // 或 'enemy'
 *
 * // 类型守卫
 * function isAlly(side: string): side is 'ally' {
 *   return side === 'ally'
 * }
 * ```
 *
 * ## 类型测试
 *
 * 运行类型测试:
 * ```bash
 * npx vue-tsc --noEmit
 * ```
 *
 * 测试文件位置: `src/__tests__/type-tests.ts`
 *
 * ## 最佳实践
 *
 * 1. **优先使用类型守卫**: 使用 `isXxx()` 函数进行运行时类型检查
 * 2. **避免 any**: 使用 `unknown` 配合类型守卫
 * 3. **使用联合类型**: 对于多态类型，使用联合类型而非继承
 * 4. **保持类型简洁**: 避免过深的类型嵌套
 * 5. **文档化复杂类型**: 为复杂类型添加 JSDoc 注释
 *
 * ## 常见问题
 *
 * ### Q: CharacterStats 和 UIBattleCharacter 有什么区别?
 * A: CharacterStats 用于静态配置数据，UIBattleCharacter 用于战斗中的动态数据。
 *    UIBattleCharacter 的属性使用 AttributeValue 包装以支持属性修饰符。
 *
 * ### Q: BattleLogLevel 和 BattleLogCategory 有什么区别?
 * A: BattleLogLevel 表示日志的重要程度 (debug/info/warning/error)，
 *    BattleLogCategory 表示日志的业务分类 (system/action/damage/heal/crit/status)。
 *    BattleLogMessageType 是两者的联合类型。
 *
 * ### Q: 如何选择使用哪个类型?
 * A:
 *    - 配置/数据库 -> CharacterStats
 *    - 战斗运行时 -> UIBattleCharacter
 *    - 日志重要程度 -> BattleLogLevel
 *    - 日志业务分类 -> BattleLogCategory
 *    - 通用日志值 -> BattleLogMessageType
 */

export {}
