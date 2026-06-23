/**
 * 文件: AsyncLogWriter.ts
 * 创建日期: 2026-02-09
 * 功能：异步日志写入器 - 非阻塞日志处理
 * 描述：使用消息队列和批量处理实现高性能异步日志写入
 */

import type { LogEntry, LogHandler } from '@/types/battle-log'

/**
 * 异步写入器配置
 */
export interface AsyncWriterConfig {
  /** 队列最大长度 */
  maxQueueSize?: number
  /** 批量处理大小 */
  batchSize?: number
  /** 批量处理延迟（毫秒） */
  batchDelayMs?: number
  /** 是否立即刷新（调试用） */
  flushImmediately?: boolean
  /** 错误重试次数 */
  retryCount?: number
  /** 重试间隔（毫秒） */
  retryDelayMs?: number
}

/**
 * 队列项
 */
interface QueueItem {
  entry: LogEntry
  timestamp: number
  retryCount: number
}

/**
 * 异步日志写入器
 * 使用消息队列和批量处理机制，避免日志写入阻塞主线程
 */
export class AsyncLogWriter {
  private queue: QueueItem[] = []
  private handlers: LogHandler[] = []
  private config: Required<AsyncWriterConfig>
  private isProcessing = false
  private flushTimer: number | null = null
  private droppedCount = 0
  private processedCount = 0

  constructor(config?: AsyncWriterConfig) {
    this.config = {
      maxQueueSize: config?.maxQueueSize ?? 1000,
      batchSize: config?.batchSize ?? 10,
      batchDelayMs: config?.batchDelayMs ?? 100,
      flushImmediately: config?.flushImmediately ?? false,
      retryCount: config?.retryCount ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
    }
  }

  /**
   * 添加日志处理器
   */
  addHandler(handler: LogHandler): void {
    this.handlers.push(handler)
  }

  /**
   * 移除日志处理器
   */
  removeHandler(handler: LogHandler): void {
    const index = this.handlers.indexOf(handler)
    if (index !== -1) {
      this.handlers.splice(index, 1)
    }
  }

  /**
   * 写入日志（异步非阻塞）
   */
  write(entry: LogEntry): void {
    // 检查队列是否已满
    if (this.queue.length >= this.config.maxQueueSize) {
      this.droppedCount++
      console.warn(`AsyncLogWriter: Queue full, dropped log entry`, entry)
      
      // 队列满时自动触发一次刷新
      this.flush()
      return
    }

    const item: QueueItem = {
      entry,
      timestamp: Date.now(),
      retryCount: 0,
    }

    this.queue.push(item)

    // 如果配置为立即刷新，则立即处理
    if (this.config.flushImmediately) {
      this.processQueue()
      return
    }

    // 启动定时器进行批量处理
    if (!this.flushTimer && this.queue.length < this.config.batchSize) {
      this.flushTimer = window.setTimeout(() => {
        this.flushTimer = null
        this.processQueue()
      }, this.config.batchDelayMs)
    }

    // 如果达到批量大小，立即处理
    if (this.queue.length >= this.config.batchSize) {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer)
        this.flushTimer = null
      }
      this.processQueue()
    }
  }

  /**
   * 立即刷新队列
   */
  flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    return this.processQueue()
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    // 防止重入
    if (this.isProcessing || this.queue.length === 0) {
      return
    }

    this.isProcessing = true

    try {
      // 取出一批日志
      const batch = this.queue.splice(0, this.config.batchSize)

      // 批量处理
      for (const item of batch) {
        try {
          for (const handler of this.handlers) {
            handler.handle(item.entry)
          }
          this.processedCount++
        } catch (error) {
          console.error('AsyncLogWriter: Handler error', error, item.entry)
          
          // 重试逻辑
          if (item.retryCount < this.config.retryCount) {
            item.retryCount++
            setTimeout(() => {
              this.queue.unshift(item)
            }, this.config.retryDelayMs)
          }
        }
      }
    } finally {
      this.isProcessing = false

      // 如果还有剩余日志，继续处理
      if (this.queue.length > 0) {
        this.processQueue()
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    queueLength: number
    processedCount: number
    droppedCount: number
    isProcessing: boolean
  } {
    return {
      queueLength: this.queue.length,
      processedCount: this.processedCount,
      droppedCount: this.droppedCount,
      isProcessing: this.isProcessing,
    }
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue = []
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  /**
   * 销毁写入器
   */
  destroy(): Promise<void> {
    // 先刷新所有待处理日志
    return this.flush().then(() => {
      this.handlers = []
      this.clear()
    })
  }
}

/**
 * 环形缓冲区实现 - 用于高性能日志存储
 */
export class RingBuffer<T> {
  private buffer: (T | null)[]
  private size: number
  private head = 0
  private tail = 0
  private count = 0

  constructor(capacity: number) {
    this.size = capacity
    this.buffer = new Array(capacity).fill(null)
  }

  /**
   * 推入元素
   */
  push(item: T): T | null {
    let evicted: T | null = null

    if (this.count === this.size) {
      // 缓冲区满，移除最老的元素
      evicted = this.buffer[this.head] as T
      this.head = (this.head + 1) % this.size
      this.count--
    }

    this.buffer[this.tail] = item
    this.tail = (this.tail + 1) % this.size
    this.count++

    return evicted
  }

  /**
   * 弹出元素
   */
  pop(): T | null {
    if (this.count === 0) {
      return null
    }

    const item = this.buffer[this.head] as T
    this.buffer[this.head] = null
    this.head = (this.head + 1) % this.size
    this.count--

    return item
  }

  /**
   * 获取指定索引的元素（从最新开始）
   */
  get(index: number): T | null {
    if (index < 0 || index >= this.count) {
      return null
    }

    const actualIndex = (this.tail - 1 - index + this.size) % this.size
    return this.buffer[actualIndex] as T
  }

  /**
   * 转换为数组（从新到旧）
   */
  toArray(): T[] {
    const result: T[] = []
    for (let i = 0; i < this.count; i++) {
      const item = this.get(i)
      if (item !== null) {
        result.push(item)
      }
    }
    return result
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.buffer.fill(null)
    this.head = 0
    this.tail = 0
    this.count = 0
  }

  /**
   * 获取当前元素数量
   */
  length(): number {
    return this.count
  }

  /**
   * 获取容量
   */
  capacity(): number {
    return this.size
  }

  /**
   * 判断是否为空
   */
  isEmpty(): boolean {
    return this.count === 0
  }

  /**
   * 判断是否已满
   */
  isFull(): boolean {
    return this.count === this.size
  }
}
