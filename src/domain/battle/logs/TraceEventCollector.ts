/**
 * 文件: TraceEventCollector.ts
 * 功能: 结构化调试追踪事件收集器（IDebugTracePort 实现 + 查询能力）
 * 描述: 唯一 trace 收集管道（替换式迁移，无新旧并存）。
 *       - 发射侧：实现 IDebugTracePort（emit/isEnabled/beginScope）
 *       - 查询侧：id/correlationId/phase/battleId/turn 索引，树重建，UI 消费
 *       emit 永不抛异常（调试日志的失败绝不能中断战斗）。
 *       P3：内存上限（环形缓冲，默认每收集器 5000 条）+ 细粒度 phase 门控（默认全开，可配置）。
 * 使用方式（由 BattleSystem 初始化时创建并注入）：
 *   const collector = new TraceEventCollector(eventBus?, { maxEntries: 5000 })
 *   collector.emit(event)
 *   const roots = collector.getRootsByTurn(turn)
 *   const results = collector.query({ phase: 'damage_calculation' })
 */

import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'
import type {
  TraceEvent,
  TraceEventNode,
  TracePhase,
  TraceScope,
  TraceScopeMeta,
} from '@/shared/types/trace-event'

/** TRACE_EVENT_ADDED 事件名称常量 */
export const TRACE_EVENT_ADDED = 'TRACE_EVENT_ADDED'

export interface TraceQuery {
  turn?: number
  phase?: string
  battleId?: string
  actorId?: string
  level?: string
  limit?: number
}

/** 收集器选项（P3 性能生产化） */
export interface TraceCollectorOptions {
  /** 内存上限（环形缓冲，超出时淘汰最旧条目；默认 5000，0 = 不限制） */
  maxEntries?: number
}

export class TraceEventCollector implements IDebugTracePort {
  /** 所有条目按 id 索引 */
  private entries = new Map<string, TraceEvent>()

  /** 按回合索引（turn → id[]） */
  private byTurn = new Map<number, string[]>()

  /** 按 phase 索引（phase → id[]） */
  private byPhase = new Map<string, string[]>()

  /** 按 battleId 索引（battleId → id[]） */
  private byBattle = new Map<string, string[]>()

  /** 事件总线（用于实时推送） */
  private eventBus?: IDomainEventBus

  /** 内存上限（环形缓冲） */
  private readonly maxEntries: number

  /** 细粒度 phase 门控（P3）— 默认全开，setPhaseEnabled 可按 phase 关闭 */
  private readonly phaseGates = new Map<TracePhase, boolean>()

  private counter = 0

  constructor(eventBus?: IDomainEventBus, options?: TraceCollectorOptions) {
    this.eventBus = eventBus
    this.maxEntries = options?.maxEntries ?? 5000
  }

  // ───────────────────────── IDebugTracePort ─────────────────────────

  /**
   * 该 phase 是否开启追踪
   * P3 细粒度门控：默认全开，setPhaseEnabled 关闭的 phase 返回 false（发射点据此跳过 payload 构建）
   */
  isEnabled(phase: TracePhase): boolean {
    return this.phaseGates.get(phase) ?? true
  }

  /** 按 phase 细粒度门控（P3）：设为 false 后该 phase 的发射点跳过 */
  setPhaseEnabled(phase: TracePhase, enabled: boolean): void {
    this.phaseGates.set(phase, enabled)
  }

  /** 批量门控（P3）：例如生产环境按需关闭高频 trace 级 phase；非 boolean 值（undefined）保持默认不覆盖 */
  setPhasesEnabled(gates: Partial<Record<TracePhase, boolean>>): void {
    for (const [phase, enabled] of Object.entries(gates)) {
      if (typeof enabled === 'boolean') {
        this.phaseGates.set(phase as TracePhase, enabled)
      }
    }
  }

  /**
   * 开启一个因果链作用域（文档 §4.5）
   */
  beginScope(
    correlationId: string,
    phase: TracePhase,
    meta?: TraceScopeMeta,
    parentId?: string,
  ): TraceScope {
    const scope: TraceScope = {
      correlationId,
      phase,
      parentId,
      meta,
      child: (childPhase: TracePhase, childParentId?: string): TraceScope => ({
        ...scope,
        phase: childPhase,
        parentId: childParentId ?? scope.parentId,
      }),
    }
    return scope
  }

  /**
   * 发射一条追踪事件 — 永不抛异常，返回事件 id（供子事件挂 parentId）
   */
  emit(event: TraceEvent): string {
    try {
      // P3 门控兜底：phase 被关闭时直接跳过（发射点按 §6.1 规范先查 isEnabled，此分支仅防御）
      // 返回 event.id（createTraceEvent 总生成 id）；正常流程不会走到这里，返回值不用于挂接 parentId
      if (!this.isEnabled(event.phase)) return event.id ?? ''

      const id = event.id || `evt_${++this.counter}`
      // 防御：重复 id 静默跳过，避免静默覆盖破坏已有树（正常流程 id 由 createTraceEvent 唯一生成）
      if (this.entries.has(id)) return id
      const indexed: TraceEvent = { ...event, id }

      this.entries.set(id, indexed)

      // 按回合索引
      const turn = typeof indexed.turn === 'number' ? indexed.turn : 0
      if (!this.byTurn.has(turn)) this.byTurn.set(turn, [])
      this.byTurn.get(turn)!.push(id)

      // 按 phase 索引
      if (!this.byPhase.has(indexed.phase)) this.byPhase.set(indexed.phase, [])
      this.byPhase.get(indexed.phase)!.push(id)

      // 按 battleId 索引
      if (indexed.battleId) {
        if (!this.byBattle.has(indexed.battleId)) {
          this.byBattle.set(indexed.battleId, [])
        }
        this.byBattle.get(indexed.battleId)!.push(id)
      }

      // P3 环形缓冲：超出内存上限时淘汰最旧条目（Map 迭代序 = 插入序）
      this.evictIfNeeded()

      // 实时推送（无 eventBus 时为 no-op）
      if (this.eventBus) {
        this.eventBus.emit(TRACE_EVENT_ADDED, indexed)
      }
      return id
    } catch {
      // 调试日志的失败绝不能中断战斗（文档 §7 关键约束）
      return event.id ?? ''
    }
  }

  /** P3 环形缓冲：超出 maxEntries 时淘汰最旧条目并同步清理索引 */
  private evictIfNeeded(): void {
    while (this.maxEntries > 0 && this.entries.size > this.maxEntries) {
      const oldestId = this.entries.keys().next().value as string
      const oldest = this.entries.get(oldestId)
      this.entries.delete(oldestId)
      if (!oldest) continue

      const turn = typeof oldest.turn === 'number' ? oldest.turn : 0
      this.removeFromIndex(this.byTurn, turn, oldestId)
      this.removeFromIndex(this.byPhase, oldest.phase, oldestId)
      if (oldest.battleId) this.removeFromIndex(this.byBattle, oldest.battleId, oldestId)
    }
  }

  private removeFromIndex(
    index: Map<string | number, string[]>,
    key: string | number,
    id: string,
  ): void {
    const list = index.get(key)
    if (!list) return
    const i = list.indexOf(id)
    if (i >= 0) list.splice(i, 1)
    if (list.length === 0) index.delete(key)
  }

  // ───────────────────────── 查询能力 ─────────────────────────

  /**
   * 根据根事件 id 重建树（递归）
   */
  getTree(rootId: string): TraceEventNode | null {
    const root = this.entries.get(rootId)
    if (!root) return null

    const buildChildren = (parentId: string): TraceEventNode[] => {
      const children: TraceEventNode[] = []
      for (const entry of this.entries.values()) {
        if (entry.parentId === parentId) {
          children.push({
            ...entry,
            children: buildChildren(entry.id),
          })
        }
      }
      return children
    }

    return { ...root, children: buildChildren(rootId) }
  }

  /**
   * 查询符合条件的条目（扁平结果，turn/phase/battleId 走索引交集）
   * 某维度有条件但索引无结果时返回空数组（不静默丢弃条件）
   */
  query(query: TraceQuery): TraceEvent[] {
    let ids: string[] | null = null

    if (query.turn != null) {
      const turnIds = this.byTurn.get(query.turn)
      if (!turnIds) return []
      ids = turnIds
    }

    if (query.phase) {
      const phaseIds = this.byPhase.get(query.phase)
      if (!phaseIds) return []
      ids = ids === null ? phaseIds : this.intersectIds(ids, phaseIds)
    }

    if (query.battleId) {
      const battleIds = this.byBattle.get(query.battleId)
      if (!battleIds) return []
      ids = ids === null ? battleIds : this.intersectIds(ids, battleIds)
    }

    if (ids === null) ids = Array.from(this.entries.keys())

    let results = ids
      .map((id) => this.entries.get(id)!)
      .filter((e): e is TraceEvent => !!e)

    if (query.actorId) {
      results = results.filter(
        (e) => e.sourceId === query.actorId || e.targetId === query.actorId,
      )
    }

    if (query.level) {
      results = results.filter((e) => e.level === query.level)
    }

    if (query.limit && results.length > query.limit) {
      results = results.slice(0, query.limit)
    }

    return results
  }

  /**
   * 获取某一回合的所有事件 id
   */
  getTraceIdsByTurn(turn: number): string[] {
    return this.byTurn.get(turn) ?? []
  }

  /**
   * 获取某一回合的所有根节点（无 parentId 的条目），并挂好子树
   */
  getRootsByTurn(turn: number): TraceEventNode[] {
    const ids = this.byTurn.get(turn)
    if (!ids) return []
    const roots = ids
      .map((id) => this.entries.get(id)!)
      .filter((e) => !!e && !e.parentId)
    return this.buildTrees(roots)
  }

  /**
   * 为根节点列表挂好 children 子树
   */
  private buildTrees(roots: TraceEvent[]): TraceEventNode[] {
    const buildChildren = (parentId: string): TraceEventNode[] => {
      const children: TraceEventNode[] = []
      for (const entry of this.entries.values()) {
        if (entry.parentId === parentId) {
          children.push({
            ...entry,
            children: buildChildren(entry.id),
          })
        }
      }
      return children
    }
    return roots.map((root) => ({
      ...root,
      children: buildChildren(root.id),
    }))
  }

  /**
   * 获取所有存储的条目
   */
  getAll(): TraceEvent[] {
    return Array.from(this.entries.values())
  }

  /**
   * 导出为序列化数据（用于持久化）
   */
  exportAll(): TraceEvent[] {
    return this.getAll()
  }

  /**
   * 导入序列化数据（从持久化恢复）
   * NOTE（P3）：导入同样受 phase 门控与环形缓冲约束——被门控 phase 的事件会被跳过，
   * 超 maxEntries 时淘汰最旧。调试场景恢复快照语义可接受；如需完整恢复可临时调大 maxEntries。
   */
  importAll(entries: TraceEvent[]): void {
    this.entries.clear()
    this.byTurn.clear()
    this.byPhase.clear()
    this.byBattle.clear()
    for (const e of entries) {
      this.emit(e)
    }
  }

  /**
   * 清空
   */
  clear(): void {
    this.entries.clear()
    this.byTurn.clear()
    this.byPhase.clear()
    this.byBattle.clear()
  }

  /**
   * 当前条目数
   */
  get size(): number {
    return this.entries.size
  }

  /**
   * 两个 id 列表取交集（索引查询用）
   */
  private intersectIds(a: string[], b: string[]): string[] {
    const set = new Set(b)
    return a.filter((id) => set.has(id))
  }
}
