/**
 * csv.ts — CSV 导出最小工具（Blob 下载，无依赖）
 *
 * 单一入口 downloadCsv：字段含逗号/引号/换行时按 RFC 4180 包引号转义；
 * 文件名建议调用方自带 .csv 后缀。
 */

/** 单字段转义：含 逗号/引号/换行 时包裹双引号并把内部引号翻倍 */
function escapeField(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** 二维表转 CSV 文本（首行为表头；\r\n 行尾对齐 Excel 直开） */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeField).join(',')]
  for (const row of rows) lines.push(row.map(escapeField).join(','))
  return lines.join('\r\n')
}

/** 生成 CSV 并触发浏览器下载（BOM 头保证 Excel 识别 UTF-8 中文） */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const blob = new Blob([`\uFEFF${toCsv(headers, rows)}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
