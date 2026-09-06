/**
 * 文件: trace-event.ts
 * 功能: 结构化调试追踪事件类型定义
 * 描述: 领域运行时状态的结构化投影（见 documents/需求文档/调试日志改造.md v2）。
 *       TraceEvent 是 TraceLogEntry 的替代者——一次行动的全链路事件共享同一个
 *       correlationId，树状嵌套由 parentId 表达，结构化数据进 payload，
 *       人类可读文本只进 summary。
 * 版本: 1.0.0
 */

/** 追踪阶段枚举 — 只描述"正在发生的领域阶段"，错误/警告不属于任何 phase（走 IBattleLogManager 错误通道） */
export const TracePhase = {
  // 战斗流程
  BATTLE_LIFECYCLE: 'battle_lifecycle',
  TURN_FLOW: 'turn_flow',
  ACTION_EXECUTION: 'action_execution',

  // 计算链路
  DAMAGE_CALCULATION: 'damage_calculation',
  HEAL_CALCULATION: 'heal_calculation',
  ATTRIBUTE_RECALC: 'attribute_recalc',

  // Buff 系统
  BUFF_LIFECYCLE: 'buff_lifecycle',
  BUFF_TRIGGER: 'buff_trigger',
  PASSIVE_TRIGGER: 'passive_trigger',

  // AI 决策
  AI_DECISION: 'ai_decision',

  // 配置与校验
  CONFIG_LOAD: 'config_load',
  CONFIG_VALIDATION: 'config_validation',
} as const

export type TracePhase = (typeof TracePhase)[keyof typeof TracePhase]

/** 追踪事件级别 — 独立于数值型 LogLevel，字符串值便于 JSON 序列化与 UI 过滤 */
export const TraceLevel = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const

export type TraceLevel = (typeof TraceLevel)[keyof typeof TraceLevel]

/** PASSIVE_TRIGGER 事件 verdict（文档 §5 示例 3） */
export const PassiveVerdict = {
  TRIGGERED: 'TRIGGERED',
  SKIPPED: 'SKIPPED',
} as const
export type PassiveVerdict = (typeof PassiveVerdict)[keyof typeof PassiveVerdict]

/** PASSIVE_TRIGGER 事件 skipReason 枚举（文档 §5 示例 3：COOLDOWN | PROBABILITY | CONDITION | MAX_TRIGGERS | DEAD | PHASE_MISMATCH） */
export const PassiveSkipReason = {
  COOLDOWN: 'COOLDOWN',
  PROBABILITY: 'PROBABILITY',
  CONDITION: 'CONDITION',
  MAX_TRIGGERS: 'MAX_TRIGGERS',
  MAX_TRIGGERS_PER_ROUND: 'MAX_TRIGGERS_PER_ROUND',
  DEAD: 'DEAD',
  PHASE_MISMATCH: 'PHASE_MISMATCH',
} as const
export type PassiveSkipReason = (typeof PassiveSkipReason)[keyof typeof PassiveSkipReason]

/** BUFF_LIFECYCLE 事件 action（文档 §5 示例 4） */
export const BuffAction = {
  APPLY: 'APPLY',
  REMOVE: 'REMOVE',
  UPDATE: 'UPDATE',
  MODIFIER: 'MODIFIER',
} as const
export type BuffAction = (typeof BuffAction)[keyof typeof BuffAction]

/** TURN_FLOW 事件 action（文档 §5 示例 5） */
export const TurnFlowAction = {
  TURN_START: 'TURN_START',
  TURN_END: 'TURN_END',
} as const
export type TurnFlowAction = (typeof TurnFlowAction)[keyof typeof TurnFlowAction]

/** ATTRIBUTE_RECALC 事件 triggeredBy 已知触发源（文档 §5 示例 4；未知调用方为 undefined） */
export const TraceTriggerSource = {
  FIELD_EFFECT: 'field_effect',
  FORMATION: 'formation',
} as const
export type TraceTriggerSource = (typeof TraceTriggerSource)[keyof typeof TraceTriggerSource]

/** 作用域元信息 */
export interface TraceScopeMeta {
  battleId?: string
  turn?: number
}

/**
 * correlationId 作用域 — 一次行动的因果链根（文档 §4.5）
 * 同一因果链上 correlationId 保持不变，树的嵌套关系由每个事件的 parentId 表达。
 */
export interface TraceScope {
  readonly correlationId: string
  readonly phase: TracePhase
  /** 本 scope 事件的挂载点（根 scope 为 undefined；由调用链显式传入，供 emit 时作 parentId） */
  readonly parentId?: string
  readonly meta?: TraceScopeMeta
  /** 派生子 scope：correlationId/meta 不变，phase 与 parentId 可覆盖 */
  child(phase: TracePhase, parentId?: string): TraceScope
}

/** 结构化追踪事件 */
export interface TraceEvent {
  /** 事件唯一 ID（createTraceEvent 自动生成） */
  id: string
  /** 关联 ID — 同一因果链的所有事件共享此 ID */
  correlationId: string
  /** 父事件 ID — 构成树状嵌套 */
  parentId?: string
  /** 追踪阶段 */
  phase: TracePhase
  /** 战斗实例 ID — 隔离多场战斗 */
  battleId?: string
  /** 回合号 */
  turn?: number
  /** 来源实体 ID（供 actorId 过滤索引） */
  sourceId?: string
  /** 目标实体 ID（供 actorId 过滤索引） */
  targetId?: string
  /** 时间戳（performance.now()，非 Date.now()） */
  timestamp: number
  /** 结构化 payload — 按 phase 不同而不同 */
  payload: Record<string, unknown>
  /** 人类可读摘要（仅用于快速扫读，不作为程序输入） */
  summary: string
  /** 级别 */
  level: TraceLevel
}

/** 树形追踪节点 — TraceEventCollector.getTree/getRootsByTurn 构建，UI 消费 */
export interface TraceEventNode extends TraceEvent {
  children?: TraceEventNode[]
}

/** createTraceEvent 输入（timestamp 由工厂生成；id 默认自动生成，可显式指定） */
export interface TraceEventInput {
  /** 事件唯一 ID（默认自动生成 `evt_N`） */
  id?: string
  correlationId: string
  phase: TracePhase
  summary: string
  payload?: Record<string, unknown>
  level?: TraceLevel
  parentId?: string
  battleId?: string
  turn?: number
  sourceId?: string
  targetId?: string
}

let eventSeq = 0

/** 创建 TraceEvent — 自动生成 id（可覆盖）与 timestamp */
export function createTraceEvent(input: TraceEventInput): TraceEvent {
  return {
    ...input,
    payload: input.payload ?? {},
    level: input.level ?? TraceLevel.DEBUG,
    id: input.id ?? `evt_${++eventSeq}`,
    timestamp: performance.now(),
  }
}
