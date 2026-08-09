/**
 * entity-diff.ts — 实体字段级差异计算（操作日志「那一次改了什么」）
 *
 * 保存 update 时对比旧/新实体，输出字段级 before/after，供操作日志展开追溯。
 * 纯函数，无副作用，可独立测试。
 */

export interface FieldDiff {
  key: string
  before: string
  after: string
}

/** 值是否变化：引用相等或 JSON 序列化相等视为未变（对象/数组按内容比较） */
function differs(a: unknown, b: unknown): boolean {
  if (a === b) return false
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)
}

/** diff 展示用值字符串化：对象/数组 JSON、空值占位符、其余直出 */
export function diffValueText(v: unknown): string {
  if (v === undefined || v === null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * 计算字段级 diff。before 为空（新增）时返回空列表；
 * 排除 updatedAt（存储层时间戳，非业务字段）。
 */
export function computeFieldDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): FieldDiff[] {
  if (!after) return []
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)])
  keys.delete('updatedAt')

  const diffs: FieldDiff[] = []
  for (const key of keys) {
    const oldVal = before?.[key]
    const newVal = after[key]
    if (!differs(oldVal, newVal)) continue
    diffs.push({ key, before: diffValueText(oldVal), after: diffValueText(newVal) })
  }
  return diffs
}
