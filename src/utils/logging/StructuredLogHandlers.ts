/**
 * 文件：StructuredLogHandlers.ts
 * 功能：结构化日志处理器 - JSON/CSV 格式输出
 * 描述：实现 JSON 和 CSV 格式的日志导出功能
 */

import type { LogEntry, LogHandler } from '@/types/battle-log'
import { LogType, LogLevelLabel } from '@/types/battle-log'

/**
 * JSON 日志处理器
 * 将日志格式化为 JSON 字符串，支持Pretty Print和Compact两种模式
 */
export class JsonLogHandler implements LogHandler {
  private prettyPrint: boolean
  private includeTimestamp: boolean
  private outputBuffer: LogEntry[] = []
  private maxBufferSize: number

  constructor(options?: {
    prettyPrint?: boolean
    includeTimestamp?: boolean
    maxBufferSize?: number
    onOutput?: (json: string) => void
  }) {
    this.prettyPrint = options?.prettyPrint ?? true
    this.includeTimestamp = options?.includeTimestamp ?? true
    this.maxBufferSize = options?.maxBufferSize ?? 100
    this.onOutput = options?.onOutput
  }

  private onOutput?: (json: string) => void

  handle(entry: LogEntry): void {
    this.outputBuffer.push(entry)

    // 达到缓冲区大小时输出
    if (this.outputBuffer.length >= this.maxBufferSize) {
      this.flush()
    }
  }

  /**
   * 立即输出所有缓冲的日志
   */
  flush(): string {
    if (this.outputBuffer.length === 0) {
      return '[]'
    }

    const logs = this.outputBuffer.map((entry) => this.formatEntry(entry))
    const json = this.prettyPrint
      ? JSON.stringify(logs, null, 2)
      : JSON.stringify(logs)

    this.outputBuffer = []

    if (this.onOutput) {
      this.onOutput(json)
    }

    return json
  }

  /**
   * 格式化单个日志条目为 JSON 对象
   */
  private formatEntry(entry: LogEntry): Record<string, any> {
    const result: Record<string, any> = {
      index: entry.index,
      type: entry.type,
      level: entry.level !== undefined ? LogLevelLabel[entry.level] : undefined,
      message: entry.message,
      segments: entry.segments,
      source: entry.source,
      target: entry.target,
      action: entry.action,
      turn: entry.turn,
      category: entry.category,
      detailCategory: entry.detailCategory,
      context: entry.context,
      error: entry.error
        ? {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack,
          }
        : undefined,
    }

    if (this.includeTimestamp) {
      ;(result as any).timestamp = new Date().toISOString()
    }

    // 移除 undefined 字段
    Object.keys(result).forEach((key) => {
      if (result[key] === undefined) {
        delete result[key]
      }
    })

    return result
  }

  /**
   * 导出为 JSON 文件
   */
  exportToFile(filename: string = 'battle-logs.json'): void {
    const json = this.flush()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}

/**
 * CSV 日志处理器
 * 将日志格式化为 CSV 格式，适合导入 Excel 等工具分析
 */
export class CsvLogHandler implements LogHandler {
  private delimiter: string
  private includeHeader: boolean
  private outputBuffer: LogEntry[] = []
  private maxBufferSize: number
  private headers: string[]

  constructor(options?: {
    delimiter?: string
    includeHeader?: boolean
    maxBufferSize?: number
    onOutput?: (csv: string) => void
  }) {
    this.delimiter = options?.delimiter ?? ','
    this.includeHeader = options?.includeHeader ?? true
    this.maxBufferSize = options?.maxBufferSize ?? 100
    this.onOutput = options?.onOutput

    this.headers = [
      'index',
      'type',
      'level',
      'message',
      'source',
      'target',
      'action',
      'turn',
      'category',
      'context',
      'error',
      'timestamp',
    ]
  }

  private onOutput?: (csv: string) => void

  handle(entry: LogEntry): void {
    this.outputBuffer.push(entry)

    if (this.outputBuffer.length >= this.maxBufferSize) {
      this.flush()
    }
  }

  /**
   * 立即输出所有缓冲的日志
   */
  flush(): string {
    if (this.outputBuffer.length === 0) {
      return this.includeHeader ? this.headers.join(this.delimiter) : ''
    }

    const lines: string[] = []

    if (this.includeHeader && this.outputBuffer.length === this.maxBufferSize) {
      lines.push(this.headers.join(this.delimiter))
    }

    this.outputBuffer.forEach((entry) => {
      lines.push(this.formatEntry(entry))
    })

    const csv = lines.join('\n')
    this.outputBuffer = []

    if (this.onOutput) {
      this.onOutput(csv)
    }

    return csv
  }

  /**
   * 格式化单个日志条目为 CSV 行
   */
  private formatEntry(entry: LogEntry): string {
    const values = [
      entry.index.toString(),
      entry.type,
      entry.level !== undefined ? LogLevelLabel[entry.level] : '',
      this.escapeCsvField(entry.message || ''),
      this.escapeCsvField(entry.source || ''),
      this.escapeCsvField(entry.target || ''),
      this.escapeCsvField(entry.action || ''),
      this.escapeCsvField(String(entry.turn ?? '')),
      entry.category || '',
      entry.context ? this.escapeCsvField(JSON.stringify(entry.context)) : '',
      entry.error ? this.escapeCsvField(entry.error.message) : '',
      new Date().toISOString(),
    ]

    return values.join(this.delimiter)
  }

  /**
   * 转义 CSV 字段
   */
  private escapeCsvField(field: string): string {
    // 如果字段包含分隔符、引号或换行符，需要用引号包裹并转义内部引号
    if (
      field.includes(this.delimiter) ||
      field.includes('"') ||
      field.includes('\n') ||
      field.includes('\r')
    ) {
      return `"${field.replace(/"/g, '""')}"`
    }
    return field
  }

  /**
   * 导出为 CSV 文件
   */
  exportToFile(filename: string = 'battle-logs.csv'): void {
    const csv = this.flush()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}
