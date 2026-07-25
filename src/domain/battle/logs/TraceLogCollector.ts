/**
 * 文件: TraceLogCollector.ts
 * 功能: 树状调试日志收集器
 * 描述: 收集并索引 TraceLogEntry，按 traceId 存储、按 parentTraceId 重建树。
 *       挂在 BattleRecorder 上随 RecordedBattle 持久化，通过 eventBus 发 TRACE_LOG_ADDED 供 UI 实时追加。
 *
 * 使用方式（由 BattleSystem 在初始化时创建并注入）：
 *   const collector = new TraceLogCollector(eventBus)
 *   collector.add(entry)
 *   const tree = collector.getTree(rootTraceId)
 *   const results = collector.query({ turn: 1, phase: 'TURN_START' })
 */

import type { TraceLogEntry } from '@/shared/types/trace-log'
import type { IDomainEventBus } from '@/domain/port/IDomainEventBus'

/** TRACE_LOG_ADDED 事件名称常量 */
export const TRACE_LOG_ADDED = 'TRACE_LOG_ADDED'

export interface TraceQuery {
  turn?: number
  phase?: string
  actorId?: string
  stepName?: string
  limit?: number
}

export class TraceLogCollector {
  /** 所有条目按 traceId 索引 */
  private entries = new Map<string, TraceLogEntry>()

  /** 按回合索引（turn → traceId[]） */
  private byTurn = new Map<number, string[]>()

  /** 事件总线（用于实时推送） */
  private eventBus?: IDomainEventBus

  private counter = 0

  constructor(eventBus?: IDomainEventBus) {
    this.eventBus = eventBus
  }

  /**
   * 添加一条 TraceLogEntry
   */
  add(entry: TraceLogEntry): void {
    const traceId = entry.traceId || `trace_${++this.counter}`
    const indexed: TraceLogEntry = { ...entry, traceId }

    this.entries.set(traceId, indexed)

    // 按回合索引
    const turn = typeof entry.turn === 'number' ? entry.turn : parseInt(String(entry.turn), 10) || 0
    if (!this.byTurn.has(turn)) {
      this.byTurn.set(turn, [])
    }
    this.byTurn.get(turn)!.push(traceId)

    // 实时推送
    if (this.eventBus) {
      this.eventBus.emit(TRACE_LOG_ADDED, indexed)
    }
  }

  /**
   * 批量添加
   */
  addAll(entries: TraceLogEntry[]): void {
    for (const e of entries) {
      this.add(e)
    }
  }

  /**
   * 根据 rootTraceId 重建树（递归）
   * 返回根节点及其所有后代（children 填充）
   */
  getTree(rootTraceId: string): TraceLogEntry | null {
    const root = this.entries.get(rootTraceId)
    if (!root) return null

    const buildChildren = (parentId: string): TraceLogEntry[] => {
      const children: TraceLogEntry[] = []
      for (const entry of this.entries.values()) {
        if (entry.parentTraceId === parentId) {
          children.push({
            ...entry,
            children: buildChildren(entry.traceId),
          })
        }
      }
      // 按 indentLevel 排序
      children.sort((a, b) => a.indentLevel - b.indentLevel)
      return children
    }

    return { ...root, children: buildChildren(rootTraceId) }
  }

  /**
   * 查询符合条件的条目（扁平结果）
   */
  query(query: TraceQuery): TraceLogEntry[] {
    let results = Array.from(this.entries.values())

    if (query.turn != null) {
      const turnIds = this.byTurn.get(query.turn)
      if (!turnIds) return []
      const idSet = new Set(turnIds)
      results = results.filter((e) => idSet.has(e.traceId))
    }

    if (query.actorId) {
      results = results.filter((e) => e.source === query.actorId || e.target === query.actorId)
    }

    if (query.stepName) {
      results = results.filter((e) => e.stepName === query.stepName)
    }

    if (query.limit && results.length > query.limit) {
      results = results.slice(0, query.limit)
    }

    return results
  }

  /**
   * 获取某一回合的所有 traceId
   */
  getTraceIdsByTurn(turn: number): string[] {
    return this.byTurn.get(turn) ?? []
  }

  /**
   * 获取某一回合的所有根节点（无 parentTraceId 的条目），并挂好子树
   */
  getRootsByTurn(turn: number): TraceLogEntry[] {
    const ids = this.byTurn.get(turn)
    if (!ids) return []
    const roots = ids
      .map((id) => this.entries.get(id)!)
      .filter((e) => !e.parentTraceId)
    return this.buildTrees(roots)
  }

  /**
   * 为根节点列表挂好 children 子树
   */
  private buildTrees(roots: TraceLogEntry[]): TraceLogEntry[] {
    const buildChildren = (parentId: string): TraceLogEntry[] => {
      const children: TraceLogEntry[] = []
      for (const entry of this.entries.values()) {
        if (entry.parentTraceId === parentId) {
          children.push({
            ...entry,
            children: buildChildren(entry.traceId),
          })
        }
      }
      children.sort((a, b) => a.indentLevel - b.indentLevel)
      return children
    }
    return roots.map((root) => ({
      ...root,
      children: buildChildren(root.traceId),
    }))
  }

  /**
   * 获取所有存储的条目
   */
  getAll(): TraceLogEntry[] {
    return Array.from(this.entries.values())
  }

  /**
   * 导出为序列化数据（用于持久化）
   */
  exportAll(): TraceLogEntry[] {
    return this.getAll()
  }

  /**
   * 导入序列化数据（从持久化恢复）
   */
  importAll(entries: TraceLogEntry[]): void {
    this.entries.clear()
    this.byTurn.clear()
    this.addAll(entries)
  }

  /**
   * 清空
   */
  clear(): void {
    this.entries.clear()
    this.byTurn.clear()
  }

  /**
   * 当前条目数
   */
  get size(): number {
    return this.entries.size
  }
}
