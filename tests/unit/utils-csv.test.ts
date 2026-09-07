/**
 * CSV 导出工具测试（shared/utils/csv.ts）
 *
 * 覆盖：字段拼接 / RFC 4180 转义（逗号、引号、换行）/ 空值 / 行尾 CRLF。
 * downloadCsv 依赖 DOM Blob 触发下载，不在单测范围。
 *
 * 运行: npx vitest run tests/unit/utils-csv.test.ts
 */
import { describe, it, expect } from 'vitest'
import { toCsv } from '@/shared/utils/csv'

describe('toCsv', () => {
  it('基础拼接：首行表头 + 数据行', () => {
    expect(toCsv(['a', 'b'], [[1, 2], ['x', 'y']])).toBe('a,b\r\n1,2\r\nx,y')
  })

  it('含逗号的字段包引号', () => {
    expect(toCsv(['v'], [['a,b']])).toBe('v\r\n"a,b"')
  })

  it('内部引号翻倍并整体包引号', () => {
    expect(toCsv(['v'], [['he said "hi"']])).toBe('v\r\n"he said ""hi"""')
  })

  it('含换行的字段包引号且不破坏行结构', () => {
    const csv = toCsv(['v'], [['line1\nline2']])
    expect(csv).toBe('v\r\n"line1\nline2"')
    expect(csv.split('\r\n')).toHaveLength(2)
  })

  it('null / undefined 空值输出为空字段', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toBe('a,b\r\n,')
  })
})
