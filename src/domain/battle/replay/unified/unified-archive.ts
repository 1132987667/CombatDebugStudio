/**
 * 文件: unified-archive.ts
 * 功能: 统一战斗事件流存档模型（RecordedBattle v2.0.0 形态）
 * 描述: 依据《调试日志UI-V4.html》ARCHIVE 契约与《统一战斗事件流方案.md》ADR v1.1：
 *       - events: TraceEvent[] 是唯一事实来源（phase + correlationId + parentId + timestamp）
 *       - snapshot: 事件级状态增量（变更后绝对值）；payload.anchor: 回合级全量锚点
 *       - payload.steps（结算步骤）/ payload.rolls（随机判定）/ payload.chain（因果链）为富 payload 字段
 *       回放与调试（双工作台）消费同一份存档 + 同一索引，无第二份事件序列。
 */

import type { TraceLevel, TracePhase } from '@/shared/types/trace-event'

/** 存档参与者初始状态（V4 ARCHIVE initialState.participants） */
export interface ArchiveParticipant {
  id: string
  name: string
  maxHp: number
  hp: number
  maxEnergy: number
  energy: number
  buffs?: ArchiveBuff[]
  /** 阵营（可选）：实时流 / 演示存档标注；老档迁移缺省时回放舞台按人数均分 fallback */
  side?: 'ally' | 'enemy'
  /**
   * 初始属性快照（键为 ATTRIBUTE_CODE，如 attack/defense/critRate）。可选：老档迁移/导入无此字段，
   * 面板降级为"无属性数据"。BattleRecorder 冻结时从领域实体提取（省略 0 值与运行时状态 hp/energy）。
   */
  attributes?: Record<string, number>
}

/** 存档 Buff（初始状态 / 锚点 / buff 生命周期） */
export interface ArchiveBuff {
  name: string
  stacks: number
  turns: number
}

/** 状态快照条目（snapshot / payload.anchor.participants 成员；缺省字段表示不变） */
export interface ArchiveStateEntry {
  id: string
  hp?: number
  energy?: number
  buffs?: ArchiveBuff[]
}

/** 事件级状态增量快照（变更后绝对值） */
export interface ArchiveSnapshot {
  turn?: number
  participants: ArchiveStateEntry[]
}

/** 结算步骤（PAYLOAD.STEPS）：伤害计算模型 · Modifier Chain 的一环 */
export interface CalcStep {
  n: string
  op: '' | '+' | '−' | '×'
  v: number
  src: string
}

/** 随机判定（PAYLOAD.ROLLS）：RNG Proof 的一环；idx 由索引构建期按序注入 */
export interface RngRoll {
  kind: string
  rate: number
  roll: number
  buff?: string
  idx?: number
}

/** 因果链节点（PAYLOAD.CHAIN） */
export interface ChainNode {
  t: string
  d: string
}

/** 索引构建期注入的数值增量（HP/EN 相对前一状态的差值，供检视器"状态增量"渲染） */
export interface ArchiveDelta {
  id: string
  fields: Array<{ k: 'HP' | 'EN'; before: number; after: number }>
}

/** 统一事件：TraceEvent + snapshot（双工作台消费的最小结构） */
export interface UnifiedEvent {
  id: string
  phase: TracePhase
  correlationId: string
  parentId?: string
  /** 相对时基零点（battle_start = 0），单调递增 */
  timestamp: number
  randomSeed?: string
  level?: TraceLevel
  turn?: number
  sourceId?: string
  targetId?: string
  payload: Record<string, unknown>
  /** 事件级状态增量（变更后绝对值） */
  snapshot?: ArchiveSnapshot
  summary: string
  /** 索引构建期注入：本事件引起的 HP/EN 数值增量 */
  _delta?: ArchiveDelta[]
}

/** 统一存档 v2.0.0 */
export interface UnifiedArchive {
  battleId: string
  replayId: string
  version: string
  randomSeed: string
  startTime: number
  winner?: string
  checksum?: string
  initialState: { participants: ArchiveParticipant[] }
  events: UnifiedEvent[]
}

/** 参与者 id → 名字 解析函数（映射表未命中回退 id） */
export type ParticipantNameResolver = (id: string) => string

/**
 * phase → 显示分类映射（唯一一张表，§5.2）。
 * 仅含展示元数据（label/icon/cls/tick），debugOnly 为回放投影默认隐藏标记。
 * cls/tick 供视图 scoped 样式选择器使用（见 haotian.scss 中对应 class）。
 */
export const PHASE_META: Record<
  TracePhase,
  { label: string; icon: string; cls: string; tick: string; debugOnly?: boolean }
> = {
  battle_lifecycle: { label: '生命周期', icon: '◉', cls: 'c-amber', tick: 'tc-amber' },
  turn_flow: { label: '回合流转', icon: '◇', cls: 'c-slate', tick: 'tc-slate' },
  action_execution: { label: '行动', icon: '行', cls: 'c-blue', tick: 'tc-blue' },
  damage_calculation: { label: '伤害', icon: '✦', cls: 'c-red', tick: 'tc-red' },
  heal_calculation: { label: '治疗', icon: '✚', cls: 'c-green', tick: 'tc-green' },
  buff_lifecycle: { label: 'Buff', icon: '❖', cls: 'c-orange', tick: 'tc-orange' },
  buff_trigger: { label: 'Buff 触发', icon: '❖', cls: 'c-orange', tick: 'tc-orange' },
  passive_trigger: { label: '被动', icon: '被', cls: 'c-cyan', tick: 'tc-cyan' },
  ai_decision: { label: 'AI决策', icon: '◈', cls: 'c-dbg', tick: 'tc-dbg', debugOnly: true },
  attribute_recalc: { label: '属性重算', icon: '∑', cls: 'c-dbg', tick: 'tc-dbg', debugOnly: true },
  config_load: { label: '配置', icon: '配', cls: 'c-dbg', tick: 'tc-dbg', debugOnly: true },
  config_validation: { label: '配置校验', icon: '配', cls: 'c-dbg', tick: 'tc-dbg', debugOnly: true },
}

/** 回放投影默认隐藏的调试专属阶段（调试系统始终可见） */
export const DEBUG_PHASES: readonly TracePhase[] = ['ai_decision', 'attribute_recalc', 'config_load']
