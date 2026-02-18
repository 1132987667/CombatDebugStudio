/**
 * 文件: perf-monitor.ts
 * 创建日期: 2026-02-09
 * 作者: CombatDebugStudio
 * 功能: 性能监控器
 * 描述: 提供性能监控功能，记录和报告代码执行时间和性能指标
 * 版本: 1.0.0
 */

import { battleLogManager } from '@/utils/logging'

interface PerformanceMetric {
  name: string
  calls: number
  totalTime: number
  avgTime: number
  maxTime: number
  minTime: number
}

class PerformanceMonitor {
  private metrics = new Map<string, PerformanceMetric>()
  private enabled = false

  public enable(): void {
    this.enabled = true
    battleLogManager.addSystemBattleLog('Performance monitoring enabled')
  }

  public disable(): void {
    this.enabled = false
    battleLogManager.addSystemBattleLog('Performance monitoring disabled')
  }

  public measure<T>(name: string, fn: () => T): T {
    if (!this.enabled) {
      return fn()
    }

    const start = performance.now()
    const result = fn()
    const end = performance.now()
    const duration = end - start

    this.recordMetric(name, duration)

    return result
  }

  private recordMetric(name: string, duration: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        name,
        calls: 0,
        totalTime: 0,
        avgTime: 0,
        maxTime: 0,
        minTime: Infinity
      })
    }

    const metric = this.metrics.get(name)!
    metric.calls++
    metric.totalTime += duration
    metric.avgTime = metric.totalTime / metric.calls
    metric.maxTime = Math.max(metric.maxTime, duration)
    metric.minTime = Math.min(metric.minTime, duration)
  }

  public getMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values())
  }

  public getMetric(name: string): PerformanceMetric | undefined {
    return this.metrics.get(name)
  }

  public reset(): void {
    this.metrics.clear()
    battleLogManager.addSystemBattleLog('Performance metrics reset')
  }

  public printReport(): void {
    if (!this.enabled || this.metrics.size === 0) {
      battleLogManager.addSystemBattleLog('No performance metrics to report')
      return
    }

    battleLogManager.addSystemBattleLog('=== Performance Report ===')
    this.getMetrics().forEach((metric) => {
      battleLogManager.addSystemBattleLog(`${metric.name}: calls=${metric.calls}, avg=${metric.avgTime.toFixed(2)}ms, max=${metric.maxTime.toFixed(2)}ms, min=${metric.minTime.toFixed(2)}ms, total=${metric.totalTime.toFixed(2)}ms`)
    })
    battleLogManager.addSystemBattleLog('========================')
  }
}

export const perfMonitor = new PerformanceMonitor()
export const measure = (name: string, fn: () => any) => {
  return perfMonitor.measure(name, fn)
}
