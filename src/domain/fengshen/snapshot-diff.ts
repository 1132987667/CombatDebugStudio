/**
 * snapshot-diff.ts — 表集差异计算（B2 交付闭环：快照对比 / 包 vs 包 diff 共用）
 *
 * 输入统一为「表名 → 行 id → 实体」两层映射，输出 added / removed / changed 三类，
 * changed 逐字段给出 before/after 与数值字段的 deltaPercent（|Δ| > 10% 时 UI 高亮，见路线图 §6 B2）。
 * 快照对比、包对比、漂移检查的行级字段 diff 全部走这里，对比口径单源。
 * 纯函数，无副作用，可独立测试。
 */

/** 单表行集：行 id → 实体（排除 updatedAt 后逐字段比较） */
export type TableRows = Record<string, Record<string, unknown>>

export interface DiffRowRef {
  table: string
  id: string
}

export interface DiffFieldChange extends DiffRowRef {
  field: string
  before: unknown
  after: unknown
  /** 数值字段的变化百分比 ((after-before)/|before|)×100；before=0 或非数值字段为 null（比例无意义） */
  deltaPercent: number | null
}

export interface TableSetDiffResult {
  added: DiffRowRef[]
  removed: DiffRowRef[]
  changed: DiffFieldChange[]
}

/** 与 entity-diff.computeFieldDiff 同口径：引用相等或 JSON 序列化相等视为未变 */
function differs(a: unknown, b: unknown): boolean {
  if (a === b) return false
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
}

function deltaPercent(before: unknown, after: unknown): number | null {
  if (typeof before !== 'number' || typeof after !== 'number') return null
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null
  if (before === 0) return null
  return ((after - before) / Math.abs(before)) * 100
}

/**
 * 对比两个表集。updatedAt 是存储层时间戳（种子落库/回写都会刷新），不参与比较；
 * 结果按 表名 → 行 id → 字段 字典序稳定排序，保证测试与展示可复现。
 */
export function diffTableSets(
  before: Record<string, TableRows>,
  after: Record<string, TableRows>,
): TableSetDiffResult {
  const result: TableSetDiffResult = { added: [], removed: [], changed: [] }
  const tables = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const table of tables) {
    const beforeRows = before[table] ?? {}
    const afterRows = after[table] ?? {}
    const ids = new Set([...Object.keys(beforeRows), ...Object.keys(afterRows)])
    for (const id of ids) {
      const b = beforeRows[id]
      const a = afterRows[id]
      if (!b && a) {
        result.added.push({ table, id })
        continue
      }
      if (b && !a) {
        result.removed.push({ table, id })
        continue
      }
      const fields = new Set([...Object.keys(b as object), ...Object.keys(a as object)])
      fields.delete('updatedAt')
      for (const field of fields) {
        const bv = (b as Record<string, unknown>)[field]
        const av = (a as Record<string, unknown>)[field]
        if (!differs(bv, av)) continue
        result.changed.push({
          table,
          id,
          field,
          before: bv,
          after: av,
          deltaPercent: deltaPercent(bv, av),
        })
      }
    }
  }
  result.added.sort(byTableAndId)
  result.removed.sort(byTableAndId)
  result.changed.sort((x, y) => byTableAndId(x, y) || (x.field < y.field ? -1 : x.field > y.field ? 1 : 0))
  return result
}

function byTableAndId(x: DiffRowRef, y: DiffRowRef): number {
  if (x.table !== y.table) return x.table < y.table ? -1 : 1
  if (x.id === y.id) return 0
  return x.id < y.id ? -1 : 1
}
