/**
 * 文件：RemoteLogHandler.ts
 * 功能：远程日志处理器 - 支持发送日志到远程服务器
 * 描述：实现 HTTP/WebSocket 方式发送日志到远程日志服务
 */

import type { LogEntry, LogHandler } from '@/types/battle-log'
import { AsyncLogWriter } from './AsyncLogWriter'
import { LogContextManager } from './LogContext'

/**
 * 远程日志配置
 */
export interface RemoteLogConfig {
  /** 服务端点 URL */
  endpoint: string
  /** 认证令牌 */
  authToken?: string
  /** 应用标识 */
  applicationId?: string
  /** 环境标识 (dev/staging/prod) */
  environment?: string
  /** 是否启用 */
  enabled?: boolean
  /** 发送超时（毫秒） */
  timeoutMs?: number
  /** 最大重试次数 */
  maxRetries?: number
  /** 重试间隔（毫秒） */
  retryIntervalMs?: number
  /** 是否使用异步写入器 */
  useAsyncWriter?: boolean
  /** 异步写入器配置 */
  asyncWriterConfig?: {
    maxQueueSize?: number
    batchSize?: number
    batchDelayMs?: number
  }
}

/**
 * 日志传输载体
 */
interface LogPayload {
  timestamp: string
  logs: LogEntry[]
  context?: Record<string, any>
  metadata: {
    applicationId?: string
    environment?: string
    userAgent?: string
    url?: string
  }
}

/**
 * 远程日志处理器
 * 支持 HTTP POST 和 WebSocket 两种方式发送日志
 */
export class RemoteLogHandler implements LogHandler {
  private config: Required<RemoteLogConfig>
  private buffer: LogEntry[] = []
  private contextManager: LogContextManager
  private asyncWriter?: AsyncLogWriter
  private isSending = false
  private sendFailureCount = 0
  private websocket?: WebSocket
  private isConnected = false

  constructor(config: RemoteLogConfig, contextManager?: LogContextManager) {
    this.config = {
      endpoint: config.endpoint,
      authToken: config.authToken || '',
      applicationId: config.applicationId || '',
      environment: config.environment || 'development',
      enabled: config.enabled ?? true,
      timeoutMs: config.timeoutMs ?? 5000,
      maxRetries: config.maxRetries ?? 3,
      retryIntervalMs: config.retryIntervalMs ?? 1000,
      useAsyncWriter: config.useAsyncWriter ?? true,
      asyncWriterConfig: {
        maxQueueSize: config.asyncWriterConfig?.maxQueueSize ?? 500,
        batchSize: config.asyncWriterConfig?.batchSize ?? 20,
        batchDelayMs: config.asyncWriterConfig?.batchDelayMs ?? 200,
      },
    }

    this.contextManager = contextManager || new LogContextManager()

    // 如果启用异步写入器，创建实例
    if (this.config.useAsyncWriter) {
      this.asyncWriter = new AsyncLogWriter({
        maxQueueSize: this.config.asyncWriterConfig.maxQueueSize,
        batchSize: this.config.asyncWriterConfig.batchSize,
        batchDelayMs: this.config.asyncWriterConfig.batchDelayMs,
      })
      
      // 创建内部处理器来处理队列中的日志
      this.asyncWriter.addHandler({
        handle: (entry: LogEntry) => {
          this.buffer.push(entry)
          this.trySend()
        },
      })
    }
  }

  /**
   * 处理日志条目
   */
  handle(entry: LogEntry): void {
    if (!this.config.enabled) {
      return
    }

    // 注入上下文信息
    const enrichedEntry = this.contextManager.injectToLog(entry)

    // 使用异步写入器或直接处理
    if (this.asyncWriter) {
      this.asyncWriter.write(enrichedEntry)
    } else {
      this.buffer.push(enrichedEntry)
      this.trySend()
    }
  }

  /**
   * 尝试发送日志
   */
  private async trySend(): Promise<void> {
    if (this.isSending || this.buffer.length === 0) {
      return
    }

    this.isSending = true

    try {
      await this.sendWithRetry()
      this.sendFailureCount = 0
    } catch (error) {
      console.error('RemoteLogHandler: Failed to send logs', error)
      this.sendFailureCount++

      // 失败次数过多时暂停发送
      if (this.sendFailureCount >= 10) {
        console.warn('RemoteLogHandler: Too many failures, pausing')
        this.config.enabled = false
      }
    } finally {
      this.isSending = false
    }
  }

  /**
   * 带重试的发送
   */
  private async sendWithRetry(): Promise<void> {
    let lastError: Error | null = null

    for (let i = 0; i < this.config.maxRetries; i++) {
      try {
        await this.send()
        return
      } catch (error) {
        lastError = error as Error
        
        if (i < this.config.maxRetries - 1) {
          await this.wait(this.config.retryIntervalMs * (i + 1))
        }
      }
    }

    throw lastError || new Error('Failed to send logs after retries')
  }

  /**
   * 发送日志到服务器
   */
  private async send(): Promise<void> {
    if (this.buffer.length === 0) {
      return
    }

    // 取出一批日志
    const logsToSend = [...this.buffer]
    this.buffer = []

    const payload: LogPayload = {
      timestamp: new Date().toISOString(),
      logs: logsToSend,
      context: this.contextManager.current() || undefined,
      metadata: {
        applicationId: this.config.applicationId,
        environment: this.config.environment,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        url: typeof window !== 'undefined' ? window.location.href : '',
      },
    }

    // 根据协议选择发送方式
    if (this.config.endpoint.startsWith('ws://') || 
        this.config.endpoint.startsWith('wss://')) {
      await this.sendWebSocket(payload)
    } else {
      await this.sendHttp(payload)
    }
  }

  /**
   * HTTP 方式发送
   */
  private async sendHttp(payload: LogPayload): Promise<void> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.authToken && {
            'Authorization': `Bearer ${this.config.authToken}`,
          }),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
    } catch (error) {
      clearTimeout(timeoutId)
      
      // 发送失败，将日志放回队列
      this.buffer.unshift(...payload.logs)
      throw error
    }
  }

  /**
   * WebSocket 方式发送
   */
  private async sendWebSocket(payload: LogPayload): Promise<void> {
    return new Promise((resolve, reject) => {
      // 如果未连接，先建立连接
      if (!this.websocket || !this.isConnected) {
        this.connectWebSocket()
      }

      const checkConnection = setInterval(() => {
        if (this.isConnected && this.websocket) {
          clearInterval(checkConnection)
          
          try {
            this.websocket.send(JSON.stringify(payload))
            resolve()
          } catch (error) {
            reject(error)
          }
        }
      }, 100)

      // 连接超时
      setTimeout(() => {
        clearInterval(checkConnection)
        reject(new Error('WebSocket connection timeout'))
      }, this.config.timeoutMs)
    })
  }

  /**
   * 建立 WebSocket 连接
   */
  private connectWebSocket(): void {
    try {
      this.websocket = new WebSocket(this.config.endpoint)

      this.websocket.onopen = () => {
        this.isConnected = true
        console.log('RemoteLogHandler: WebSocket connected')
      }

      this.websocket.onclose = () => {
        this.isConnected = false
        console.log('RemoteLogHandler: WebSocket closed')
        
        // 自动重连
        setTimeout(() => {
          if (this.config.enabled) {
            this.connectWebSocket()
          }
        }, 5000)
      }

      this.websocket.onerror = (error) => {
        console.error('RemoteLogHandler: WebSocket error', error)
        this.isConnected = false
      }

      this.websocket.onmessage = (event) => {
        console.log('RemoteLogHandler: Received message', event.data)
      }
    } catch (error) {
      console.error('RemoteLogHandler: Failed to create WebSocket', error)
      this.isConnected = false
    }
  }

  /**
   * 等待指定时间
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 立即刷新缓冲区
   */
  async flush(): Promise<void> {
    if (this.asyncWriter) {
      await this.asyncWriter.flush()
    } else {
      await this.trySend()
    }
  }

  /**
   * 启用远程日志
   */
  enable(): void {
    this.config.enabled = true
  }

  /**
   * 禁用远程日志
   */
  disable(): void {
    this.config.enabled = false
  }

  /**
   * 销毁处理器
   */
  async destroy(): Promise<void> {
    // 先刷新所有待发送日志
    await this.flush()

    // 关闭 WebSocket
    if (this.websocket) {
      this.websocket.close()
      this.websocket = undefined
      this.isConnected = false
    }

    // 销毁异步写入器
    if (this.asyncWriter) {
      await this.asyncWriter.destroy()
      this.asyncWriter = undefined
    }

    this.buffer = []
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    bufferSize: number
    isSending: boolean
    failureCount: number
    isConnected: boolean
    asyncWriterStats?: any
  } {
    return {
      bufferSize: this.buffer.length,
      isSending: this.isSending,
      failureCount: this.sendFailureCount,
      isConnected: this.isConnected,
      asyncWriterStats: this.asyncWriter?.getStats(),
    }
  }
}
