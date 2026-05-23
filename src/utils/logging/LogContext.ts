/**
 * 文件：LogContext.ts
 * 功能：日志上下文追踪 - TraceID/RequestID 管理
 * 描述：实现分布式链路追踪的上下文管理，支持嵌套上下文
 */

import { reactive, readonly } from 'vue'

/**
 * 日志上下文接口
 */
export interface LogContext {
  /** 全局追踪 ID（一次完整请求/战斗的唯一标识） */
  traceId: string
  /** 跨度 ID（当前操作/步骤的唯一标识） */
  spanId: string
  /** 父跨度 ID（用于构建调用链） */
  parentSpanId?: string
  /** 请求 ID（HTTP 请求等场景使用） */
  requestId?: string
  /** 用户 ID */
  userId?: string
  /** 会话 ID */
  sessionId?: string
  /** 战斗 ID（战斗场景专用） */
  battleId?: string
  /** 回合号（战斗场景专用） */
  turnNumber?: number
  /** 动作 ID（战斗动作唯一标识） */
  actionId?: string
  /** 自定义键值对 */
  customFields?: Record<string, any>
}

/**
 * 上下文栈帧
 */
interface ContextStackFrame {
  context: LogContext
  createdAt: number
}

/**
 * 上下文管理器配置
 */
export interface ContextManagerConfig {
  /** 是否启用自动清理过期上下文 */
  autoCleanup?: boolean
  /** 上下文过期时间（毫秒） */
  expirationMs?: number
  /** 最大上下文栈深度 */
  maxStackDepth?: number
  /** TraceID 生成器 */
  traceIdGenerator?: () => string
  /** SpanID 生成器 */
  spanIdGenerator?: () => string
}

/**
 * 生成 UUID
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  
  // 降级方案
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * 日志上下文管理器
 * 支持上下文栈、自动继承、超时清理等功能
 */
export class LogContextManager {
  private stack: ContextStackFrame[] = []
  private config: Required<ContextManagerConfig>
  private globalContext: Partial<LogContext> = {}

  constructor(config?: ContextManagerConfig) {
    this.config = {
      autoCleanup: config?.autoCleanup ?? true,
      expirationMs: config?.expirationMs ?? 300000, // 5 分钟
      maxStackDepth: config?.maxStackDepth ?? 20,
      traceIdGenerator: config?.traceIdGenerator ?? generateUUID,
      spanIdGenerator: config?.spanIdGenerator ?? generateUUID,
    }

    // 启动自动清理
    if (this.config.autoCleanup) {
      this.startAutoCleanup()
    }
  }

  /**
   * 创建新的上下文
   */
  create(options?: Partial<LogContext>): LogContext {
    const parent = this.current()
    
    const context: LogContext = {
      traceId: options?.traceId || parent?.traceId || this.config.traceIdGenerator(),
      spanId: this.config.spanIdGenerator(),
      parentSpanId: parent?.spanId || options?.parentSpanId,
      requestId: options?.requestId,
      userId: options?.userId || this.globalContext.userId,
      sessionId: options?.sessionId || this.globalContext.sessionId,
      battleId: options?.battleId || this.globalContext.battleId,
      turnNumber: options?.turnNumber,
      actionId: options?.actionId,
      customFields: options?.customFields,
    }

    return context
  }

  /**
   * 推入上下文栈（开始一个新的作用域）
   */
  push(context?: Partial<LogContext>): LogContext {
    const newContext = this.create(context)
    
    // 限制栈深度
    if (this.stack.length >= this.config.maxStackDepth) {
      this.stack.shift() // 移除最老的上下文
    }

    const frame: ContextStackFrame = {
      context: newContext,
      createdAt: Date.now(),
    }

    this.stack.push(frame)
    return newContext
  }

  /**
   * 弹出上下文栈（结束当前作用域）
   */
  pop(): LogContext | undefined {
    const frame = this.stack.pop()
    return frame?.context
  }

  /**
   * 获取当前上下文
   */
  current(): LogContext | null {
    if (this.stack.length === 0) {
      return null
    }
    return this.stack[this.stack.length - 1].context
  }

  /**
   * 获取当前 TraceID
   */
  getCurrentTraceId(): string | null {
    return this.current()?.traceId || null
  }

  /**
   * 获取当前 SpanID
   */
  getCurrentSpanId(): string | null {
    return this.current()?.spanId || null
  }

  /**
   * 设置全局上下文字段（会影响所有新创建的上下文）
   */
  setGlobal(field: keyof LogContext, value: any): void {
    ;(this.globalContext as any)[field] = value
  }

  /**
   * 清除全局上下文字段
   */
  clearGlobal(field: keyof LogContext): void {
    delete (this.globalContext as any)[field]
  }

  /**
   * 在当前上下文中添加/更新自定义字段
   */
  addCustomField(key: string, value: any): void {
    const context = this.current()
    if (context) {
      if (!context.customFields) {
        context.customFields = {}
      }
      context.customFields[key] = value
    }
  }

  /**
   * 获取上下文的纯对象表示（用于日志记录）
   */
  toObject(context?: LogContext | null): Record<string, any> {
    const ctx = context || this.current()
    if (!ctx) {
      return {}
    }

    const result: Record<string, any> = {
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
    }

    if (ctx.parentSpanId) {
      result.parent_span_id = ctx.parentSpanId
    }
    if (ctx.requestId) {
      result.request_id = ctx.requestId
    }
    if (ctx.userId) {
      result.user_id = ctx.userId
    }
    if (ctx.sessionId) {
      result.session_id = ctx.sessionId
    }
    if (ctx.battleId) {
      result.battle_id = ctx.battleId
    }
    if (ctx.turnNumber !== undefined) {
      result.turn_number = ctx.turnNumber
    }
    if (ctx.actionId) {
      result.action_id = ctx.actionId
    }
    if (ctx.customFields) {
      Object.assign(result, ctx.customFields)
    }

    return result
  }

  /**
   * 将上下文注入到日志条目中
   */
  injectToLog(logEntry: any): any {
    const context = this.current()
    if (!context) {
      return logEntry
    }

    return {
      ...logEntry,
      ...this.toObject(context),
    }
  }

  /**
   * 执行带上下文的异步操作
   */
  async runWithContext<T>(
    context: Partial<LogContext>,
    fn: () => Promise<T>
  ): Promise<T> {
    this.push(context)
    try {
      return await fn()
    } finally {
      this.pop()
    }
  }

  /**
   * 执行带上下文的同步操作
   */
  runWithSyncContext<T>(context: Partial<LogContext>, fn: () => T): T {
    this.push(context)
    try {
      return fn()
    } finally {
      this.pop()
    }
  }

  /**
   * 获取当前栈深度
   */
  getStackDepth(): number {
    return this.stack.length
  }

  /**
   * 清空上下文栈
   */
  clear(): void {
    this.stack = []
  }

  /**
   * 启动自动清理
   */
  private startAutoCleanup(): void {
    setInterval(() => {
      this.cleanup()
    }, 60000) // 每分钟清理一次
  }

  /**
   * 清理过期上下文
   */
  cleanup(): void {
    const now = Date.now()
    const expirationMs = this.config.expirationMs

    this.stack = this.stack.filter((frame) => {
      return now - frame.createdAt < expirationMs
    })
  }

  /**
   * 导出当前上下文用于序列化
   */
  export(): string {
    const context = this.current()
    if (!context) {
      return '{}'
    }
    return JSON.stringify(context)
  }

  /**
   * 从序列化数据导入上下文
   */
  import(data: string): LogContext | null {
    try {
      const parsed = JSON.parse(data) as LogContext
      return this.create(parsed)
    } catch {
      return null
    }
  }
}

/**
 * 创建响应式上下文管理器（用于 Vue 组件）
 */
export function createReactiveContextManager(
  config?: ContextManagerConfig
): {
  manager: LogContextManager
  currentContext: Readonly<LogContext | null>
} {
  const manager = new LogContextManager(config)
  const state = reactive({
    context: manager.current(),
  })

  // 代理 push/pop 方法以更新响应式状态
  const originalPush = manager.push.bind(manager)
  const originalPop = manager.pop.bind(manager)

  manager.push = function (context?: Partial<LogContext>) {
    const result = originalPush(context)
    state.context = manager.current()
    return result
  }

  manager.pop = function () {
    const result = originalPop()
    state.context = manager.current()
    return result
  }

  return {
    manager,
    currentContext: readonly(state) as Readonly<LogContext | null>,
  }
}

// 默认实例
export const defaultContextManager = new LogContextManager()
