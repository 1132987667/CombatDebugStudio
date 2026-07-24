/**
 * 投影层类型定义
 *
 * 投影层（Projection）是领域层到表现层的桥接。
 * UIParticipantSnapshot 是纯数据快照，不引用任何领域对象。
 * Vue reactive() 对此结构的追踪是零成本的（所有字段都是原始值或纯数组）。
 */

/**
 * Buff 显示条目 — 纯数据，无方法引用
 */
export interface BuffDisplayItem {
  readonly instanceId: string
  readonly name: string
  readonly isDebuff: boolean
  /** 剩余回合数，0 = 永久 */
  readonly remainingTurns: number
  /** 当前层数 */
  readonly stacks: number
  /** 合并后的属性修正摘要，如 "攻击+15%" */
  readonly summary: string
}

/**
 * 参与者 UI 快照 — 纯数据，无方法，无 getter 链
 * 这是 Vue 响应式系统唯一需要追踪的对象
 *
 * 关键设计原则：
 * - 所有字段是原始值或纯数组
 * - 没有 getter，没有嵌套对象引用
 * - 没有函数方法
 */
export interface UIParticipantSnapshot {
  // === 身份（不变） ===
  readonly id: string
  readonly name: string
  readonly level: number
  readonly team: 'ally' | 'enemy'

  // === 核心数值（每次投影更新，与领域层 BattleEntity 字段名统一） ===
  currentHealth: number
  maxHealth: number
  currentEnergy: number
  maxEnergy: number
  attack: number
  defense: number
  speed: number
  critRate: number
  critDamage: number

  // === 派生状态 ===
  isAlive: boolean
  /** 预计算百分比，避免模板中重复除法 */
  healthPercent: number
  energyPercent: number

  // === Buff 显示数据 ===
  buffs: BuffDisplayItem[]

  // === 版本戳（调试用） ===
  version: number
}
