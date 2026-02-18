/**
 * 文件: TaskExecutor.ts
 * 创建日期: 2026-02-17
 * 作者: CombatDebugStudio
 * 功能: 任务执行管理器
 * 描述: 管理长时间自动运行的任务，包括超时设置、错误处理、进度保存与恢复、以及任务完成通知等功能
 * 版本: 1.0.0
 */

import { GameBattleSystem } from '@/core/BattleSystem'
import { RAFTimer } from '@/utils/RAF'
import { battleLogManager } from '@/utils/logging'

interface TaskConfig {
  timeout: {
    enabled: boolean
    max_execution_time: number
    grace_period: number
    heartbeat_interval: number
  }
  error_handling: {
    enabled: boolean
    max_retries: number
    retry_delay: number
    error_logging: boolean
    continue_on_error: boolean
  }
  progress: {
    enabled: boolean
    save_interval: number
    save_path: string
    auto_resume: boolean
  }
  notification: {
    enabled: boolean
    on_completion: boolean
    on_error: boolean
    on_timeout: boolean
    notification_method: string
  }
  resource_management: {
    memory_limit: string
    cpu_limit: number
    cleanup_on_finish: boolean
  }
}

interface Task {
  id: string
  name: string
  type: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout'
  startTime?: number
  endTime?: number
  progress: number
  retries: number
  config: any
  result?: any
  error?: any
}

interface TaskProgress {
  taskId: string
  progress: number
  state: any
  timestamp: number
}

export class TaskExecutor {
  private static instance: TaskExecutor
  private tasks: Map<string, Task> = new Map()
  private taskIdCounter = 0
  private timer: RAFTimer
  private heartbeats: Map<string, symbol> = new Map()
  private progressTimers: Map<string, symbol> = new Map()
  private battleSystem: GameBattleSystem = GameBattleSystem.getInstance()
  private logger = battleLogManager

  private constructor() {
    try {
      const { container } = require('@/core/di/Container')
      this.timer = container.resolve('RAFTimer')
    } catch (error) {
      // 如果依赖注入容器不可用，则使用默认实例
      console.warn('依赖注入容器不可用，使用默认实例初始化', error)
      this.timer = new RAFTimer()
    }
    this.logger = battleLogManager
    this.config = this.loadConfig()
    this.initialize()
  }

  public static getInstance(): TaskExecutor {
    if (!TaskExecutor.instance) {
      TaskExecutor.instance = new TaskExecutor()
    }
    return TaskExecutor.instance
  }

  private loadConfig(): TaskConfig {
    try {
      // 在实际环境中，这里应该读取文件系统中的配置文件
      // 由于当前环境限制，我们使用默认配置
      return {
        timeout: {
          enabled: true,
          max_execution_time: 3600000,
          grace_period: 300000,
          heartbeat_interval: 60000
        },
        error_handling: {
          enabled: true,
          max_retries: 3,
          retry_delay: 5000,
          error_logging: true,
          continue_on_error: false
        },
        progress: {
          enabled: true,
          save_interval: 300000,
          save_path: '.trae/task_progress',
          auto_resume: true
        },
        notification: {
          enabled: true,
          on_completion: true,
          on_error: true,
          on_timeout: true,
          notification_method: 'console'
        },
        resource_management: {
          memory_limit: '2GB',
          cpu_limit: 80,
          cleanup_on_finish: true
        }
      }
    } catch (error) {
      this.logger.error('加载配置文件失败:', undefined, error as Error)
      // 返回默认配置
      return this.getDefaultConfig()
    }
  }

  private getDefaultConfig(): TaskConfig {
    return {
      timeout: {
        enabled: true,
        max_execution_time: 3600000,
        grace_period: 300000,
        heartbeat_interval: 60000
      },
      error_handling: {
        enabled: true,
        max_retries: 3,
        retry_delay: 5000,
        error_logging: true,
        continue_on_error: false
      },
      progress: {
        enabled: true,
        save_interval: 300000,
        save_path: '.trae/task_progress',
        auto_resume: true
      },
      notification: {
        enabled: true,
        on_completion: true,
        on_error: true,
        on_timeout: true,
        notification_method: 'console'
      },
      resource_management: {
        memory_limit: '2GB',
        cpu_limit: 80,
        cleanup_on_finish: true
      }
    }
  }

  private initialize(): void {
    // 检查是否有未完成的任务需要恢复
    if (this.config.progress.auto_resume) {
      this.resumePendingTasks()
    }
  }

  private resumePendingTasks(): void {
    // 在实际环境中，这里应该从存储中加载未完成的任务
    // 由于当前环境限制，我们暂时不实现此功能
    this.logger.info('检查未完成的任务...')
  }

  /**
   * 创建一个新任务
   * @param name 任务名称
   * @param type 任务类型
   * @param config 任务配置
   * @returns 任务ID
   */
  public createTask(name: string, type: string, config: any): string {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
    const task: Task = {
      id: taskId,
      name,
      type,
      status: 'pending',
      progress: 0,
      retries: 0,
      config
    }
    this.tasks.set(taskId, task)
    this.logger.info(`创建任务: ${name} (${taskId})`)
    return taskId
  }

  /**
   * 开始执行任务
   * @param taskId 任务ID
   */
  public async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`)
    }

    if (task.status === 'running') {
      this.logger.warn(`任务已经在运行中: ${taskId}`)
      return
    }

    task.status = 'running'
    task.startTime = Date.now()

    // 启动心跳检测
    this.startHeartbeat(taskId)

    // 启动进度保存
    if (this.config.progress.enabled) {
      this.startProgressSaving(taskId)
    }

    try {
      switch (task.type) {
        case 'auto_battle':
          await this.executeAutoBattleTask(task)
          break
        default:
          throw new Error(`未知的任务类型: ${task.type}`)
      }
    } catch (error) {
      await this.handleTaskError(taskId, error)
    }
  }

  /**
   * 执行自动战斗任务
   * @param task 任务对象
   */
  private async executeAutoBattleTask(task: Task): Promise<void> {
    const { battleId, maxRounds = 999, speed = 3 } = task.config

    if (!battleId) {
      throw new Error('自动战斗任务需要指定battleId')
    }

    // 设置战斗速度
    this.battleSystem.setBattleSpeed(battleId, speed)

    // 开始自动战斗
    this.battleSystem.startAutoBattle(battleId)

    // 监控战斗状态
    const monitorInterval = this.timer.setInterval(async () => {
      const battleData = this.battleSystem.getBattleData(battleId)
      if (!battleData) {
        throw new Error(`战斗不存在: ${battleId}`)
      }

      // 检查战斗是否结束
      if (battleData.battleState === 'ENDED' || !battleData.isActive) {
        this.timer.clearInterval(monitorInterval)
        task.progress = 100
        task.status = 'completed'
        task.endTime = Date.now()
        task.result = {
          winner: battleData.winner,
          rounds: battleData.currentRound,
          duration: battleData.endTime ? battleData.endTime - battleData.startTime : 0
        }
        this.stopHeartbeat(task.id)
        this.stopProgressSaving(task.id)
        this.notifyTaskCompletion(task.id)
        this.cleanupTask(task.id)
      } else {
        // 更新任务进度
        task.progress = Math.min(100, (battleData.currentRound / maxRounds) * 100)
        this.saveTaskProgress(task.id, {
          battleId,
          battleState: battleData.battleState,
          currentRound: battleData.currentRound,
          currentTurn: battleData.currentTurn
        })
      }
    }, 1000)
  }

  /**
   * 停止任务
   * @param taskId 任务ID
   */
  public stopTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      this.logger.warn(`任务不存在: ${taskId}`)
      return
    }

    if (task.status !== 'running') {
      this.logger.warn(`任务不在运行中: ${taskId}`)
      return
    }

    task.status = 'completed'
    task.endTime = Date.now()
    task.progress = 100

    this.stopHeartbeat(taskId)
    this.stopProgressSaving(taskId)
    this.notifyTaskCompletion(taskId)
    this.cleanupTask(taskId)

    this.logger.info(`任务已停止: ${taskId}`)
  }

  /**
   * 暂停任务
   * @param taskId 任务ID
   */
  public pauseTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      this.logger.warn(`任务不存在: ${taskId}`)
      return
    }

    if (task.status !== 'running') {
      this.logger.warn(`任务不在运行中: ${taskId}`)
      return
    }

    // 保存当前进度
    this.saveTaskProgress(taskId, { status: 'paused' })

    this.stopHeartbeat(taskId)
    this.stopProgressSaving(taskId)

    this.logger.info(`任务已暂停: ${taskId}`)
  }

  /**
   * 恢复任务
   * @param taskId 任务ID
   */
  public resumeTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      this.logger.warn(`任务不存在: ${taskId}`)
      return
    }

    if (task.status !== 'pending') {
      this.logger.warn(`任务状态不正确: ${taskId}`)
      return
    }

    task.status = 'running'
    this.startHeartbeat(taskId)
    this.startProgressSaving(taskId)

    // 恢复任务执行
    this.startTask(taskId)

    this.logger.info(`任务已恢复: ${taskId}`)
  }

  /**
   * 启动心跳检测
   * @param taskId 任务ID
   */
  private startHeartbeat(taskId: string): void {
    if (!this.config.timeout.enabled) {
      return
    }

    const heartbeatInterval = this.timer.setInterval(() => {
      const task = this.tasks.get(taskId)
      if (!task) {
        this.stopHeartbeat(taskId)
        return
      }

      // 检查任务是否超时
      if (task.startTime) {
        const elapsed = Date.now() - task.startTime
        if (elapsed > this.config.timeout.max_execution_time) {
          this.handleTaskTimeout(taskId)
        }
      }
    }, this.config.timeout.heartbeat_interval)

    this.heartbeats.set(taskId, heartbeatInterval)
  }

  /**
   * 停止心跳检测
   * @param taskId 任务ID
   */
  private stopHeartbeat(taskId: string): void {
    const intervalId = this.heartbeats.get(taskId)
    if (intervalId) {
      this.timer.clearInterval(intervalId)
      this.heartbeats.delete(taskId)
    }
  }

  /**
   * 启动进度保存
   * @param taskId 任务ID
   */
  private startProgressSaving(taskId: string): void {
    if (!this.config.progress.enabled) {
      return
    }

    const progressInterval = this.timer.setInterval(() => {
      const task = this.tasks.get(taskId)
      if (!task) {
        this.stopProgressSaving(taskId)
        return
      }

      this.saveTaskProgress(taskId, { progress: task.progress })
    }, this.config.progress.save_interval)

    this.progressTimers.set(taskId, progressInterval)
  }

  /**
   * 停止进度保存
   * @param taskId 任务ID
   */
  private stopProgressSaving(taskId: string): void {
    const intervalId = this.progressTimers.get(taskId)
    if (intervalId) {
      this.timer.clearInterval(intervalId)
      this.progressTimers.delete(taskId)
    }
  }

  /**
   * 保存任务进度
   * @param taskId 任务ID
   * @param state 任务状态
   */
  private saveTaskProgress(taskId: string, state: any): void {
    if (!this.config.progress.enabled) {
      return
    }

    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    const progress: TaskProgress = {
      taskId,
      progress: task.progress,
      state,
      timestamp: Date.now()
    }

    try {
      // 在实际环境中，这里应该将进度保存到文件系统或数据库
      // 由于当前环境限制，我们使用localStorage
      localStorage.setItem(`task_progress_${taskId}`, JSON.stringify(progress))
      this.logger.debug(`保存任务进度: ${taskId}, ${task.progress}%`)
    } catch (error) {
      this.logger.error('保存任务进度失败:', undefined, error as Error)
    }
  }

  /**
   * 处理任务错误
   * @param taskId 任务ID
   * @param error 错误对象
   */
  private async handleTaskError(taskId: string, error: any): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    task.error = error
    task.retries++

    if (this.config.error_handling.error_logging) {
      this.logger.error(`任务执行错误: ${taskId}`, error)
    }

    if (task.retries <= this.config.error_handling.max_retries) {
      this.logger.info(`任务将在 ${this.config.error_handling.retry_delay}ms 后重试 (${task.retries}/${this.config.error_handling.max_retries})`)
      
      // 延迟后重试
      await new Promise(resolve => setTimeout(resolve, this.config.error_handling.retry_delay))
      await this.startTask(taskId)
    } else {
      task.status = 'failed'
      task.endTime = Date.now()

      this.stopHeartbeat(taskId)
      this.stopProgressSaving(taskId)
      this.notifyTaskError(taskId, error)
      this.cleanupTask(taskId)

      this.logger.error(`任务执行失败，已达到最大重试次数: ${taskId}`)
    }
  }

  /**
   * 处理任务超时
   * @param taskId 任务ID
   */
  private handleTaskTimeout(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    task.status = 'timeout'
    task.endTime = Date.now()
    task.error = new Error('任务执行超时')

    this.stopHeartbeat(taskId)
    this.stopProgressSaving(taskId)
    this.notifyTaskTimeout(taskId)
    this.cleanupTask(taskId)

    this.logger.error(`任务执行超时: ${taskId}`)
  }

  /**
   * 通知任务完成
   * @param taskId 任务ID
   */
  private notifyTaskCompletion(taskId: string): void {
    if (!this.config.notification.enabled || !this.config.notification.on_completion) {
      return
    }

    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    const notification = {
      type: 'task_completed',
      taskId,
      taskName: task.name,
      timestamp: Date.now(),
      result: task.result
    }

    this.sendNotification(notification)
  }

  /**
   * 通知任务错误
   * @param taskId 任务ID
   * @param error 错误对象
   */
  private notifyTaskError(taskId: string, error: any): void {
    if (!this.config.notification.enabled || !this.config.notification.on_error) {
      return
    }

    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    const notification = {
      type: 'task_error',
      taskId,
      taskName: task.name,
      timestamp: Date.now(),
      error: error.message || String(error)
    }

    this.sendNotification(notification)
  }

  /**
   * 通知任务超时
   * @param taskId 任务ID
   */
  private notifyTaskTimeout(taskId: string): void {
    if (!this.config.notification.enabled || !this.config.notification.on_timeout) {
      return
    }

    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    const notification = {
      type: 'task_timeout',
      taskId,
      taskName: task.name,
      timestamp: Date.now(),
      maxExecutionTime: this.config.timeout.max_execution_time
    }

    this.sendNotification(notification)
  }

  /**
   * 发送通知
   * @param notification 通知内容
   */
  private sendNotification(notification: any): void {
    switch (this.config.notification.notification_method) {
      case 'console':
        console.log('任务通知:', notification)
        break
      case 'file':
        // 在实际环境中，这里应该将通知写入文件
        this.logger.info('任务通知:', notification)
        break
      case 'webhook':
        // 在实际环境中，这里应该通过webhook发送通知
        this.logger.info('任务通知:', notification)
        break
      default:
        this.logger.warn(`未知的通知方式: ${this.config.notification.notification_method}`)
    }
  }

  /**
   * 清理任务资源
   * @param taskId 任务ID
   */
  private cleanupTask(taskId: string): void {
    if (!this.config.resource_management.cleanup_on_finish) {
      return
    }

    // 清理本地存储中的进度
    try {
      localStorage.removeItem(`task_progress_${taskId}`)
    } catch (error) {
      this.logger.error('清理任务进度失败:', undefined, error as Error)
    }

    // 从任务列表中移除
    this.tasks.delete(taskId)

    this.logger.info(`任务资源已清理: ${taskId}`)
  }

  /**
   * 获取任务状态
   * @param taskId 任务ID
   * @returns 任务对象
   */
  public getTaskStatus(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * 获取所有任务
   * @returns 任务列表
   */
  public getAllTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  /**
   * 获取运行中的任务
   * @returns 运行中的任务列表
   */
  public getRunningTasks(): Task[] {
    return Array.from(this.tasks.values()).filter(task => task.status === 'running')
  }

  /**
   * 销毁任务执行器
   */
  public destroy(): void {
    // 停止所有定时器
    this.timer.destroy()

    // 清理所有任务
    for (const taskId of this.tasks.keys()) {
      this.cleanupTask(taskId)
    }

    this.logger.info('任务执行器已销毁')
  }
}

// 导出单例实例
export const taskExecutor = TaskExecutor.getInstance()