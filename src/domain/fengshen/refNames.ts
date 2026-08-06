/**
 * refNames.ts — 封神榜引用字段中文名解析（纯函数，可测）
 *
 * 封神榜"优先中文"展示：详情面板 / 列表列 / 悬浮预览对引用字段（roleId → 角色名、
 * formationId → 阵型名、skillIds → 技能名、lineupId → 阵容名等）优先展示中文名，
 * 原始英文 id 保留在 title 悬浮提示（由组件负责，不在此丢失）。
 *
 * 约定：
 * - 索引构建与翻译分离：buildNameIndex/buildElementIndex 产出 id→中文 字典，
 *   resolveRefName/resolveRefNames 消费字典（有字典就翻，无字典回退原 id，向后兼容）。
 * - 跨表引用（REFERENCE_RULES 中 roles[].roleId → ['actors','enemies']）由调用方
 *   用对象展开合并两表索引后翻译，单表翻译会漏 enemy_*，本文件不假设单表。
 */

/** 行级索引：{ id: name }，name 缺失时回退 id（保证键存在，翻译永不输出空串） */
export function buildNameIndex(
  rows: ReadonlyArray<{ id?: unknown; name?: unknown }>,
): Record<string, string> {
  const index: Record<string, string> = {}
  for (const row of rows) {
    if (row.id === undefined || row.id === null) continue
    const id = String(row.id)
    if (!id) continue
    index[id] = String(row.name ?? row.id)
  }
  return index
}

/** elements 单文档的元素索引（元素定义在 elements[].id/name，行级 id='elements' 无意义） */
export function buildElementIndex(
  doc: { elements?: ReadonlyArray<{ id?: unknown; name?: unknown }> } | null | undefined,
): Record<string, string> {
  return buildNameIndex(doc?.elements ?? [])
}

/** 单值翻译：命中返回中文名，未命中回退原 id（保留调试语义） */
export function resolveRefName(id: string, index: Record<string, string>): string {
  return index[id] ?? id
}

/** 批量翻译：顺序保持，逐项回退 */
export function resolveRefNames(
  ids: readonly string[],
  index: Record<string, string>,
): string[] {
  return ids.map((id) => resolveRefName(id, index))
}
