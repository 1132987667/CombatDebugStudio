import { logger } from './logger'

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
    logger.info('Performance monitoring enabled')
  }

  public disable(): void {
    this.enabled = false
    logger.info('Performance monitoring disabled')
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
    logger.info('Performance metrics reset')
  }

  public printReport(): void {
    if (!this.enabled || this.metrics.size === 0) {
      logger.info('No performance metrics to report')
      return
    }

    logger.info('=== Performance Report ===')
    this.getMetrics().forEach((metric) => {
      logger.info(`${metric.name}:`, {
        calls: metric.calls,
        avgTime: `${metric.avgTime.toFixed(2)}ms`,
        maxTime: `${metric.maxTime.toFixed(2)}ms`,
        minTime: `${metric.minTime.toFixed(2)}ms`,
        totalTime: `${metric.totalTime.toFixed(2)}ms`
      })
    })
    logger.info('========================')
  }
}

export const perfMonitor = new PerformanceMonitor()
export const measure = (name: string, fn: () => any) => {
  return perfMonitor.measure(name, fn)
}
