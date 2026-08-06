/**
 * 文件: LiveBattleStream.ts
 * 功能: 实时战斗流（昊天镜 P2）
 * 描述: 订阅唤灵台战斗的 TRACE_EVENT_ADDED，将实时 TraceEvent 累计为统一存档 v2.0.0，
 *       供回放/调试双投影实时消费。
 *       - 启动时补捞 TraceEventCollector 既有历史（时基归零）
 *       - 每个事件附加"观察者快照"（实时读取 participants 投影的 HP/EN），
 *         让回放舞台随事件实时反映状态 —— 不改引擎发射点，观测式富化（HACK: 近似值，见下）
 *       - battle_end 自动收尾
 */

import type { TraceEvent } from '@/shared/types/trace-event'
import { TRACE_EVENT_ADDED } from '@/domain/battle/logs/TraceEventCollector'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import type { UnifiedArchive, UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'

/** 实时参与者投影（来自 battleStore.participants） */
export interface LiveParticipant {
  id: string
  name: string
  maxHp: number
  hp: number
  maxEnergy: number
  energy: number
  /** 阵营（来自 UIParticipantSnapshot.team），用于回放舞台按阵营布局 */
  side?: 'ally' | 'enemy'
}

export interface LiveBattleStreamDeps {
  eventBus: IDomainEventBus
  /** 历史事件源（补捞）；可为 null */
  collector: { getAll(): TraceEvent[] } | null
  getParticipants: () => LiveParticipant[]
  onUpdate?: () => void
  onEnd?: () => void
}

function isBattleEnd(te: TraceEvent): boolean {
  return te.phase === 'battle_lifecycle' && (te.payload as Record<string, unknown>)?.action === 'battle_end'
}

export class LiveBattleStream {
  private events: UnifiedEvent[] = []
  private baseTs = 0
  private battleId = `live-${Date.now().toString(36)}`
  private state: 'idle' | 'active' | 'ended' = 'idle'
  private initialParticipants: LiveParticipant[] = []

  constructor(private readonly deps: LiveBattleStreamDeps) {}

  isActive(): boolean {
    return this.state === 'active'
  }

  /** 启动：补捞历史 + 订阅实时事件 */
  start(): void {
    if (this.state !== 'idle') return
    this.initialParticipants = this.deps.getParticipants()
    const history = this.deps.collector?.getAll() ?? []
    this.baseTs = history.length ? history[0].timestamp : performance.now()
    // 历史事件附加当前观察快照（近似）：回放推到末态与实时状态一致（HACK: 中间态为近似，见文件头）
    for (const te of history) this.append(te, true)
    this.state = 'active'
    this.deps.eventBus.on(TRACE_EVENT_ADDED, this.onTrace)
    if (this.events.length) this.deps.onUpdate?.()
  }

  private onTrace = (msg: unknown): void => {
    if (this.state !== 'active') return
    const te = msg as TraceEvent
    if (isBattleEnd(te)) {
      this.append(te, true)
      this.finalize()
      return
    }
    this.append(te, true)
    this.deps.onUpdate?.()
  }

  private append(te: TraceEvent, observeSnapshot: boolean): void {
    // 真实发射端（TraceDamageLogger / HealCalculator）发 final 字段，与录制路径
    // normalizeTraceEvent 的 final→result 归一化同口径——否则 summarizeBattle 读
    // result 时实时源战报输出/治疗恒为 0（实时与录制必须同一统计源）。
    // 浅拷贝后再归一化，避免改动 TraceEvent 原引用。
    const payload: Record<string, unknown> = { ...(te.payload ?? {}) }
    if (typeof payload.final === 'number' && payload.result == null) payload.result = payload.final
    const ev: UnifiedEvent = {
      id: te.id,
      phase: te.phase,
      correlationId: te.correlationId,
      parentId: te.parentId,
      timestamp: Math.max(0, te.timestamp - this.baseTs),
      level: te.level,
      turn: te.turn,
      sourceId: te.sourceId,
      targetId: te.targetId,
      payload,
      summary: te.summary,
    }
    if (observeSnapshot && te.phase !== 'battle_lifecycle') {
      const participants = this.deps.getParticipants().map((p) => ({ id: p.id, hp: p.hp, energy: p.energy }))
      if (participants.length) ev.snapshot = { participants }
    }
    this.events.push(ev)
  }

  private finalize(): void {
    this.state = 'ended'
    this.deps.eventBus.off(TRACE_EVENT_ADDED, this.onTrace)
    this.deps.onEnd?.()
  }

  dispose(): void {
    this.state = 'ended'
    this.deps.eventBus.off(TRACE_EVENT_ADDED, this.onTrace)
  }

  /** 当前累计的统一存档（含合成 battle_start 根事件；战斗结束由真实事件表达） */
  currentArchive(): UnifiedArchive {
    // winner 从 battle_end 生命周期事件提取（真实发射端 finalizeBattleTrace 发 payload.winner）；
    // 否则实时源战报摘要胜方恒"未分胜负"，与实时弹窗/录制路径（rec.winner 补齐）口径不一致。
    let winner: string | undefined
    for (const e of this.events) {
      if (e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end') {
        const w = (e.payload as Record<string, unknown>)?.winner
        if (typeof w === 'string') winner = w
      }
    }
    const events: UnifiedEvent[] = [
      {
        id: 'evt_live_start',
        phase: 'battle_lifecycle',
        correlationId: 'corr_root',
        timestamp: 0,
        randomSeed: 'live',
        level: 'info',
        payload: { action: 'battle_start', engine: 'Aegis（实时流）' },
        summary: '战斗开始 · 实时投影',
      },
      ...this.events,
    ]

    return {
      battleId: this.battleId,
      replayId: 'rp-live',
      version: '2.0.0',
      randomSeed: 'live',
      startTime: Date.now(),
      winner,
      initialState: {
        participants: this.initialParticipants.map((p) => ({
          id: p.id,
          name: p.name,
          maxHp: p.maxHp,
          hp: p.hp,
          maxEnergy: p.maxEnergy,
          energy: p.energy,
          buffs: [],
          side: p.side,
        })),
      },
      events,
    }
  }

  /** 当前 battleId（供 store 判断是否同一实时场次） */
  getBattleId(): string {
    return this.battleId
  }

  /** 已累计的实时事件序列（不含合成根事件），供增量追加 */
  getEvents(): UnifiedEvent[] {
    return this.events
  }
}
