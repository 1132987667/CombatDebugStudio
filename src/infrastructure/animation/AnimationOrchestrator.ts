/**
 * 文件: AnimationOrchestrator.ts
 * 功能：动画编排器 - 负责管理动画序列和队列
 * 描述：提供动画序列编排、优先级管理、取消机制等核心功能
 */

import type { AnimationStrategy } from './AnimationStrategy'

export interface AnimationTask {
  id: string
  strategy: AnimationStrategy
  priority: number
  timestamp: number
  cancelled: boolean
}

export interface AnimationSequence {
  id: string
  tasks: AnimationTask[]
  onComplete?: () => void
  onError?: (error: Error) => void
}

export interface OrchestratorConfig {
  maxConcurrentAnimations?: number
  defaultPriority?: number
}

export class AnimationOrchestrator {
  private queue: AnimationTask[] = []
  private activeAnimations: Map<string, AnimationTask> = new Map()
  private sequences: Map<string, AnimationSequence> = new Map()
  private maxConcurrent: number
  private defaultPriority: number

  constructor(config: OrchestratorConfig = {}) {
    this.maxConcurrent = config.maxConcurrentAnimations ?? 3
    this.defaultPriority = config.defaultPriority ?? 5
  }

  /**
   * 添加动画到队列
   */
  enqueue(
    id: string,
    strategy: AnimationStrategy,
    priority?: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const task: AnimationTask = {
        id,
        strategy,
        priority: priority ?? this.defaultPriority,
        timestamp: Date.now(),
        cancelled: false,
      }

      // 按优先级排序插入队列
      const insertIndex = this.queue.findIndex(
        (t) => t.priority < task.priority
      )
      if (insertIndex === -1) {
        this.queue.push(task)
      } else {
        this.queue.splice(insertIndex, 0, task)
      }

      this.processQueue()
      
      // 监听任务完成
      const checkComplete = setInterval(() => {
        if (!this.activeAnimations.has(id)) {
          clearInterval(checkComplete)
          if (task.cancelled) {
            reject(new Error(`Animation ${id} cancelled`))
          } else {
            resolve()
          }
        }
      }, 16)
    })
  }

  /**
   * 立即执行动画（跳过队列）
   */
  async executeImmediate(
    id: string,
    strategy: AnimationStrategy,
    priority?: number
  ): Promise<void> {
    const task: AnimationTask = {
      id,
      strategy,
      priority: priority ?? 0,
      timestamp: Date.now(),
      cancelled: false,
    }

    this.activeAnimations.set(id, task)
    
    try {
      await strategy.execute()
    } finally {
      this.activeAnimations.delete(id)
      this.processQueue()
    }
  }

  /**
   * 处理队列
   */
  private processQueue(): void {
    while (
      this.activeAnimations.size < this.maxConcurrent &&
      this.queue.length > 0
    ) {
      const task = this.queue.shift()!
      if (!task.cancelled) {
        this.executeTask(task)
      }
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(task: AnimationTask): Promise<void> {
    this.activeAnimations.set(task.id, task)

    try {
      await task.strategy.execute()
    } catch (error) {
      task.strategy.onError?.(error as Error)
    } finally {
      this.activeAnimations.delete(task.id)
      this.processQueue()
    }
  }

  /**
   * 取消动画
   */
  cancel(id: string): void {
    // 从队列中取消
    const queueIndex = this.queue.findIndex((t) => t.id === id)
    if (queueIndex !== -1) {
      this.queue[queueIndex].cancelled = true
      this.queue.splice(queueIndex, 1)
    }

    // 从活跃动画中取消
    const task = this.activeAnimations.get(id)
    if (task) {
      task.cancelled = true
      task.strategy.onCancel?.()
    }
  }

  /**
   * 创建动画序列
   */
  createSequence(id: string): AnimationSequenceBuilder {
    const sequence: AnimationSequence = {
      id,
      tasks: [],
    }
    this.sequences.set(id, sequence)
    return new AnimationSequenceBuilder(this, sequence)
  }

  /**
   * 播放序列
   */
  async playSequence(id: string): Promise<void> {
    const sequence = this.sequences.get(id)
    if (!sequence) {
      throw new Error(`Sequence ${id} not found`)
    }

    try {
      for (const task of sequence.tasks) {
        if (task.cancelled) break
        await this.executeTask(task)
      }
      sequence.onComplete?.()
    } catch (error) {
      sequence.onError?.(error as Error)
    }
  }

  /**
   * 取消序列
   */
  cancelSequence(id: string): void {
    const sequence = this.sequences.get(id)
    if (sequence) {
      sequence.tasks.forEach((task) => {
        task.cancelled = true
      })
      this.sequences.delete(id)
    }
  }

  /**
   * 停止所有动画
   */
  stopAll(): void {
    this.queue.forEach((task) => {
      task.cancelled = true
      task.strategy.onCancel?.()
    })
    this.queue = []

    this.activeAnimations.forEach((task) => {
      task.cancelled = true
      task.strategy.onCancel?.()
    })
    this.activeAnimations.clear()
  }

  /**
   * 获取活跃动画数量
   */
  getActiveCount(): number {
    return this.activeAnimations.size
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.queue.length
  }
}

/**
 * 动画序列构建器
 */
export class AnimationSequenceBuilder {
  private orchestrator: AnimationOrchestrator
  private sequence: AnimationSequence

  constructor(
    orchestrator: AnimationOrchestrator,
    sequence: AnimationSequence
  ) {
    this.orchestrator = orchestrator
    this.sequence = sequence
  }

  add(
    id: string,
    strategy: AnimationStrategy,
    priority?: number
  ): AnimationSequenceBuilder {
    this.sequence.tasks.push({
      id,
      strategy,
      priority: priority ?? 5,
      timestamp: Date.now(),
      cancelled: false,
    })
    return this
  }

  onComplete(callback: () => void): AnimationSequenceBuilder {
    this.sequence.onComplete = callback
    return this
  }

  onError(callback: (error: Error) => void): AnimationSequenceBuilder {
    this.sequence.onError = callback
    return this
  }

  build(): string {
    return this.sequence.id
  }
}
