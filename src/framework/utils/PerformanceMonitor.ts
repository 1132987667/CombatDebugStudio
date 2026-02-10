/**
 * 文件: PerformanceMonitor.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 性能监控器
 * 描述: 性能指标收集和统计，内存使用监控，性能瓶颈分析，资源使用报告
 * 版本: 1.0.0
 */

/**
 * 通用战斗框架 - 性能监控器
 *
 * 功能：
 * 1. 性能指标收集和统计
 * 2. 内存使用监控
 * 3. 性能瓶颈分析
 * 4. 资源使用报告
 */

import { FrameworkLogger } from '@/utils/logging'
import { raf } from '@/utils/RAF'

/**
 * 性能指标接口
 */
export interface PerformanceMetric {
  name: string
  value: number
  unit: string
  timestamp: number
  context?: Record<string, any>
}

/**
 * 性能统计接口
 */
export interface PerformanceStats {
  avg: number
  min: number
  max: number
  count: number
  total: number
  lastUpdated: number
}

/**
 * 内存使用信息
 */
export interface MemoryUsage {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
  timestamp: number
}

/**
 * 性能监控器类
 */
export class PerformanceMonitor {
  private logger: Logger
  private isEnabled = false
  private startTime = 0
  private metrics: Map<string, PerformanceMetric[]> = new Map()
  private stats: Map<string, PerformanceStats> = new Map()
  private memoryHistory: MemoryUsage[] = []
  private maxHistorySize = 1000
  private memoryMonitorInterval?: symbol

  constructor() {
    this.logger = new Logger('PerformanceMonitor')
  }

  /**
   * 启动性能监控
   */
  public start(): void {
    if (this.isEnabled) {
      this.logger.warn('Performance monitor already started')
      return
    }

    this.isEnabled = true
    this.startTime = Date.now()

    // 启动内存监控
    this.startMemoryMonitoring()

    this.logger.info('Performance monitor started')
  }

  /**
   * 停止性能监控
   */
  public stop(): void {
    if (!this.isEnabled) {
      return
    }

    this.isEnabled = false

    // 停止内存监控
    this.stopMemoryMonitoring()

    this.logger.info('Performance monitor stopped')
  }

  /**
   * 记录性能指标
   */
  public recordMetric(
    name: string,
    value: number,
    unit: string = 'ms',
    context?: Record<string, any>,
  ): void {
    if (!this.isEnabled) {
      return
    }

    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: Date.now(),
      context,
    }

    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }

    const metrics = this.metrics.get(name)!
    metrics.push(metric)

    // 限制历史记录大小
    if (metrics.length > this.maxHistorySize) {
      this.metrics.set(name, metrics.slice(-this.maxHistorySize))
    }

    // 更新统计信息
    this.updateStats(name, value)

    // 记录调试日志
    this.logger.debug('Performance metric recorded', { name, value, unit })
  }

  /**
   * 测量函数执行时间
   */
  public measure<T>(
    name: string,
    fn: () => T,
    context?: Record<string, any>,
  ): T {
    const startTime = performance.now()

    try {
      const result = fn()

      if (result instanceof Promise) {
        return result.then((asyncResult) => {
          const endTime = performance.now()
          this.recordMetric(name, endTime - startTime, 'ms', context)
          return asyncResult
        }) as T
      } else {
        const endTime = performance.now()
        this.recordMetric(name, endTime - startTime, 'ms', context)
        return result
      }
    } catch (error) {
      const endTime = performance.now()
      this.recordMetric(name, endTime - startTime, 'ms', {
        ...context,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * 获取性能指标
   */
  public getMetrics(name?: string): PerformanceMetric[] {
    if (name) {
      return this.metrics.get(name) || []
    } else {
      const allMetrics: PerformanceMetric[] = []
      for (const metrics of this.metrics.values()) {
        allMetrics.push(...metrics)
      }
      return allMetrics
    }
  }

  /**
   * 获取性能统计
   */
  public getStats(
    name?: string,
  ): PerformanceStats | Record<string, PerformanceStats> {
    if (name) {
      return this.stats.get(name) || this.createEmptyStats()
    } else {
      const allStats: Record<string, PerformanceStats> = {}
      for (const [metricName, stats] of this.stats.entries()) {
        allStats[metricName] = stats
      }
      return allStats
    }
  }

  /**
   * 获取内存使用历史
   */
  public getMemoryHistory(limit?: number): MemoryUsage[] {
    const history = [...this.memoryHistory]
    if (limit && limit > 0) {
      return history.slice(-limit)
    }
    return history
  }

  /**
   * 获取运行时间
   */
  public getUptime(): number {
    return this.isEnabled ? Date.now() - this.startTime : 0
  }

  /**
   * 生成性能报告
   */
  public generateReport(): PerformanceReport {
    const report: PerformanceReport = {
      uptime: this.getUptime(),
      metrics: {},
      memoryUsage: this.getCurrentMemoryUsage(),
      timestamp: Date.now(),
    }

    for (const [name, stats] of this.stats.entries()) {
      report.metrics[name] = stats
    }

    return report
  }

  /**
   * 清理性能数据
   */
  public clearData(name?: string): void {
    if (name) {
      this.metrics.delete(name)
      this.stats.delete(name)
    } else {
      this.metrics.clear()
      this.stats.clear()
      this.memoryHistory = []
    }

    this.logger.info('Performance data cleared', { name: name || 'all' })
  }

  /**
   * 检查性能监控是否启用
   */
  public isMonitoringEnabled(): boolean {
    return this.isEnabled
  }

  /**
   * 启动内存监控
   */
  private startMemoryMonitoring(): void {
    this.memoryMonitorInterval = raf.setInterval(() => {
      const memoryUsage = this.getCurrentMemoryUsage()
      this.memoryHistory.push(memoryUsage)

      // 限制历史记录大小
      if (this.memoryHistory.length > this.maxHistorySize) {
        this.memoryHistory = this.memoryHistory.slice(-this.maxHistorySize)
      }

      // 检查内存使用警告
      this.checkMemoryWarnings(memoryUsage)
    }, 5000) // 每5秒检查一次内存使用
  }

  /**
   * 停止内存监控
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryMonitorInterval) {
      raf.clearInterval(this.memoryMonitorInterval)
      this.memoryMonitorInterval = undefined
    }
  }

  /**
   * 获取当前内存使用情况
   */
  private getCurrentMemoryUsage(): MemoryUsage {
    const memory = process.memoryUsage()
    return {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      external: memory.external,
      rss: memory.rss,
      timestamp: Date.now(),
    }
  }

  /**
   * 检查内存使用警告
   */
  private checkMemoryWarnings(memoryUsage: MemoryUsage): void {
    const heapUsageRatio = memoryUsage.heapUsed / memoryUsage.heapTotal

    if (heapUsageRatio > 0.8) {
      this.logger.warn('High memory usage detected', {
        heapUsed: this.formatBytes(memoryUsage.heapUsed),
        heapTotal: this.formatBytes(memoryUsage.heapTotal),
        usageRatio: Math.round(heapUsageRatio * 100) + '%',
      })
    }

    if (memoryUsage.rss > 500 * 1024 * 1024) {
      // 500MB
      this.logger.warn('High RSS memory usage', {
        rss: this.formatBytes(memoryUsage.rss),
      })
    }
  }

  /**
   * 更新统计信息
   */
  private updateStats(name: string, value: number): void {
    const existingStats = this.stats.get(name)

    if (!existingStats) {
      this.stats.set(name, {
        avg: value,
        min: value,
        max: value,
        count: 1,
        total: value,
        lastUpdated: Date.now(),
      })
    } else {
      const newCount = existingStats.count + 1
      const newTotal = existingStats.total + value

      this.stats.set(name, {
        avg: newTotal / newCount,
        min: Math.min(existingStats.min, value),
        max: Math.max(existingStats.max, value),
        count: newCount,
        total: newTotal,
        lastUpdated: Date.now(),
      })
    }
  }

  /**
   * 创建空的统计信息
   */
  private createEmptyStats(): PerformanceStats {
    return {
      avg: 0,
      min: 0,
      max: 0,
      count: 0,
      total: 0,
      lastUpdated: 0,
    }
  }

  /**
   * 格式化字节大小
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}

/**
 * 性能报告接口
 */
export interface PerformanceReport {
  uptime: number
  metrics: Record<string, PerformanceStats>
  memoryUsage: MemoryUsage
  timestamp: number
}

/**
 * 全局性能监控器实例
 */
export const performanceMonitor = new PerformanceMonitor()

/**
 * 性能测量装饰器
 */
export function measurePerformance(name: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value

    descriptor.value = function (...args: any[]) {
      return performanceMonitor.measure(
        name,
        () => originalMethod.apply(this, args),
        {
          method: propertyKey,
          class: target.constructor.name,
        },
      )
    }

    return descriptor
  }
}
