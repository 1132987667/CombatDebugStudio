/**
 * 文件: unified-diff.ts
 * 功能: 同一场战斗两份存档的分支对比（纯函数）
 * 描述: 依据《调试日志UI示例.html》"分支对比"能力：两份事件记录按链路逐节点对齐后 diff。
 *       对齐键 = correlationId + phase + seg（同一因果链同一阶段同一段的两次记录对齐），
 *       差异集中在被修改的判定/数值一步。
 */

import type { UnifiedArchive, UnifiedEvent } from './unified-archive'

export type DiffFieldKind = 'summary' | 'step' | 'roll' | 'result' | 'kv'

export interface DiffField {
  kind: DiffFieldKind
  key: string
  before: string
  after: string
}

export interface DiffRow {
  eventId: string
  phase: string
  summary: string
  changed: boolean
  fields: DiffField[]
  /** 对齐侧：both / base-only（删除）/ branch-only（新增） */
  side: 'both' | 'base-only' | 'branch-only'
}

function alignKey(e: UnifiedEvent): string {
  const seg = (e.payload as Record<string, unknown>)?.seg
  // parentId 区分同一因果链同一阶段内无 seg 的多个结算（如多段反击）
  return `${e.correlationId}:${e.phase}:${seg ?? ''}:${e.parentId ?? ''}`
}

function numStr(v: unknown): string {
  return typeof v === 'number' ? String(v) : v == null ? '' : String(v)
}

/** 对比单个事件对，产出字段级差异 */
function diffPair(base: UnifiedEvent, branch: UnifiedEvent): DiffRow {
  const fields: DiffField[] = []

  if (base.summary !== branch.summary) {
    fields.push({ kind: 'summary', key: '摘要', before: base.summary, after: branch.summary })
  }

  const bSteps = (base.payload.steps ?? []) as Array<{ n: string; v: number }>
  const aSteps = (branch.payload.steps ?? []) as Array<{ n: string; v: number }>
  const stepLen = Math.max(bSteps.length, aSteps.length)
  for (let i = 0; i < stepLen; i++) {
    const bs = bSteps[i]
    const as = aSteps[i]
    const bv = bs ? `${bs.n}=${bs.v}` : ''
    const av = as ? `${as.n}=${as.v}` : ''
    if (bv !== av) {
      fields.push({ kind: 'step', key: `步骤 ${i + 1}（${as?.n ?? bs?.n ?? '—'}）`, before: bv, after: av })
    }
  }

  const bRolls = (base.payload.rolls ?? []) as Array<{ kind: string; rate: number; roll: number }>
  const aRolls = (branch.payload.rolls ?? []) as Array<{ kind: string; rate: number; roll: number }>
  const rollLen = Math.max(bRolls.length, aRolls.length)
  for (let i = 0; i < rollLen; i++) {
    const br = bRolls[i]
    const ar = aRolls[i]
    if (!br || !ar || br.rate !== ar.rate || br.roll !== ar.roll) {
      const fmt = (r: { kind: string; rate: number; roll: number } | undefined): string =>
        r ? `阈值 ${r.rate} / 随机 ${r.roll}` : '—'
      fields.push({
        kind: 'roll',
        key: `判定 ${i + 1}（${ar?.kind ?? br?.kind ?? '—'}）`,
        before: fmt(br),
        after: fmt(ar),
      })
    }
  }

  const bResult = (base.payload as Record<string, unknown>)?.result
  const aResult = (branch.payload as Record<string, unknown>)?.result
  if (numStr(bResult) !== numStr(aResult)) {
    fields.push({ kind: 'result', key: '结算结果', before: numStr(bResult), after: numStr(aResult) })
  }

  return {
    eventId: base.id,
    phase: base.phase,
    summary: base.summary,
    changed: fields.length > 0,
    fields,
    side: 'both',
  }
}

/** 对比两份存档，返回对齐后的差异行 */
export function diffArchives(base: UnifiedArchive, branch: UnifiedArchive): DiffRow[] {
  const baseByKey = new Map<string, UnifiedEvent>()
  for (const e of base.events) {
    const k = alignKey(e)
    if (!baseByKey.has(k)) baseByKey.set(k, e)
  }
  const branchByKey = new Map<string, UnifiedEvent>()
  for (const e of branch.events) {
    const k = alignKey(e)
    if (!branchByKey.has(k)) branchByKey.set(k, e)
  }

  const rows: DiffRow[] = []
  const usedBranch = new Set<string>()

  for (const e of base.events) {
    const k = alignKey(e)
    const mate = branchByKey.get(k)
    if (mate) {
      usedBranch.add(k)
      rows.push(diffPair(e, mate))
    } else {
      rows.push({
        eventId: e.id,
        phase: e.phase,
        summary: e.summary,
        changed: true,
        fields: [],
        side: 'base-only',
      })
    }
  }
  for (const e of branch.events) {
    const k = alignKey(e)
    if (usedBranch.has(k)) continue
    rows.push({
      eventId: e.id,
      phase: e.phase,
      summary: e.summary,
      changed: true,
      fields: [],
      side: 'branch-only',
    })
  }
  return rows
}

/**
 * 生成分支变体：克隆存档并改写指定事件的随机判定阈值（rate）。
 * 用于"分支对比"的示例分支（如暴击率 0.25 → 0.30）。
 */
export function createRateVariant(archive: UnifiedArchive, eventId: string, rollIndex: number, rate: number): UnifiedArchive {
  const next = structuredClone(archive)
  const ev = next.events.find((e) => e.id === eventId)
  const rolls = (ev?.payload as Record<string, unknown>)?.rolls
  if (ev && Array.isArray(rolls) && rolls[rollIndex]) {
    ;(rolls[rollIndex] as { rate: number }).rate = rate
  }
  return next
}

/**
 * 生成分支变体：改写指定事件的随机判定结果（roll）。
 * 用于检视器"重掷该判定"——把重掷后的 roll 写入一个真实分支，
 * 载入分支对比即可看到该判定翻转与否，而非本地假模拟。
 */
export function createRollVariant(archive: UnifiedArchive, eventId: string, rollIndex: number, roll: number): UnifiedArchive {
  const next = structuredClone(archive)
  const ev = next.events.find((e) => e.id === eventId)
  const rolls = (ev?.payload as Record<string, unknown>)?.rolls
  if (ev && Array.isArray(rolls) && rolls[rollIndex]) {
    ;(rolls[rollIndex] as { roll: number }).roll = roll
  }
  return next
}

/** 汇总差异统计 */
export function diffSummary(rows: DiffRow[]): { changed: number; total: number } {
  return {
    changed: rows.filter((r) => r.changed).length,
    total: rows.length,
  }
}
