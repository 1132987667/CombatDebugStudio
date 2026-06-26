/**
 * 文件：LogSampling.ts
 * 功能：日志采样机制 - 避免日志爆炸
 * 描述：实现基于频率、优先级和上下文的日志采样策略
 */

import type { LogEntry, LogLevel } from '@/shared/types/battle-log'
import { LogLevel as LogLevelEnum } from '@/shared/types/battle-log'

/**
 * 采样策略类型
 */
export type SamplingStrategy = 
  | 'always'           // 总是记录
  | 'never'            // 从不记录
  | 'random'           // 随机采样
  | 'rate_limit'       // 频率限制
  | 'priority_based'   // 基于优先级
  | 'context_aware'    // 上下文感知

/**
 * 采样配置接口
 */
export interface SamplingConfig {
  /** 采样策略 */
  strategy: SamplingStrategy
  /** 采样率 (0-1)，仅 random 策略使用 */
  sampleRate?: number
  /** 每秒最大日志数，仅 rate_limit 策略使用 */
  maxPerSecond?: number
  /** 高优先级日志级别，高于此级别的日志总是记录 */
  priorityLevel?: LogLevel
  /** 上下文键值对匹配，仅 context_aware 策略使用 */
  contextMatchers?: Record<string, RegExp | string | boolean>
  /** 是否允许突发（短时间内超过限制） */
  allowBurst?: boolean
  /** 突发窗口大小（毫秒） */
  burstWindowMs?: number
}

/**
 * 采样器统计信息
 */
export interface SamplingStats {
  totalLogs: number
  sampledLogs: number
  droppedLogs: number
  sampleRate: number
  currentRate: number
}

/**
 * 日志采样器
 * 实现多种采样策略，避免日志爆炸
 */
export class LogSampler {
  private config: SamplingConfig
  private timestampBuffer: number[] = []
  private totalLogs = 0
  private sampledLogs = 0
  private droppedLogs = 0
  private lastResetTime = Date.now()

  constructor(config: SamplingConfig) {
    this.config = config
  }

  /**
   * 判断日志是否应该被记录
   */
  shouldSample(entry: LogEntry): boolean {
    this.totalLogs++

    const shouldRecord = this.evaluate(entry)

    if (shouldRecord) {
      this.sampledLogs++
    } else {
      this.droppedLogs++
    }

    return shouldRecord
  }

  /**
   * 根据配置评估日志
   */
  private evaluate(entry: LogEntry): boolean {
    switch (this.config.strategy) {
      case 'always':
        return true

      case 'never':
        return false

      case 'random':
        return this.evaluateRandom()

      case 'rate_limit':
        return this.evaluateRateLimit()

      case 'priority_based':
        return this.evaluatePriorityBased(entry)

      case 'context_aware':
        return this.evaluateContextAware(entry)

      default:
        return true
    }
  }

  /**
   * 随机采样评估
   */
  private evaluateRandom(): boolean {
    const rate = this.config.sampleRate ?? 0.1
    return Math.random() < rate
  }

  /**
   * 频率限制评估
   */
  private evaluateRateLimit(): boolean {
    const now = Date.now()
    const maxPerSecond = this.config.maxPerSecond ?? 10
    const windowMs = 1000

    // 清理过期时间戳
    this.timestampBuffer = this.timestampBuffer.filter(
      (ts) => now - ts < windowMs
    )

    // 检查是否允许突发
    if (this.config.allowBurst && this.config.burstWindowMs) {
      const burstCount = this.timestampBuffer.filter(
        (ts) => now - ts < this.config.burstWindowMs!
      ).length
      
      if (burstCount < (this.config.maxPerSecond ?? 10) * 2) {
        this.timestampBuffer.push(now)
        return true
      }
    }

    // 正常频率限制
    if (this.timestampBuffer.length >= maxPerSecond) {
      return false
    }

    this.timestampBuffer.push(now)
    return true
  }

  /**
   * 基于优先级的评估
   */
  private evaluatePriorityBased(entry: LogEntry): boolean {
    const priorityLevel = this.config.priorityLevel ?? LogLevelEnum.ERROR
    const entryLevel = entry.level ?? LogLevelEnum.INFO

    // 高于优先级的一律记录
    if (entryLevel < priorityLevel) {
      return true
    }

    // 等于优先级的按采样率记录
    if (entryLevel === priorityLevel) {
      return this.evaluateRandom()
    }

    // 低于优先级的一律不记录
    return false
  }

  /**
   * 上下文感知评估
   */
  private evaluateContextAware(entry: LogEntry): boolean {
    const matchers = this.config.contextMatchers
    if (!matchers || !entry.context) {
      return this.evaluateRandom()
    }

    // 检查是否匹配任何上下文条件
    for (const [key, pattern] of Object.entries(matchers)) {
      const value = entry.context[key]
      
      if (value === undefined) {
        continue
      }

      if (typeof pattern === 'boolean') {
        if (value === pattern) {
          return true
        }
      } else if (pattern instanceof RegExp) {
        if (pattern.test(String(value))) {
          return true
        }
      } else if (String(value) === pattern) {
        return true
      }
    }

    // 没有匹配则使用默认采样率
    return this.evaluateRandom()
  }

  /**
   * 获取采样统计信息
   */
  getStats(): SamplingStats {
    const actualSampleRate = this.totalLogs > 0 
      ? this.sampledLogs / this.totalLogs 
      : 0

    const now = Date.now()
    // 计算当前速率（每秒日志数）
    this.timestampBuffer = this.timestampBuffer.filter(
      (ts) => now - ts < 1000
    )
    const currentRate = this.timestampBuffer.length

    return {
      totalLogs: this.totalLogs,
      sampledLogs: this.sampledLogs,
      droppedLogs: this.droppedLogs,
      sampleRate: actualSampleRate,
      currentRate,
    }
  }

  /**
   * 重置统计信息
   */
  reset(): void {
    this.totalLogs = 0
    this.sampledLogs = 0
    this.droppedLogs = 0
    this.timestampBuffer = []
    this.lastResetTime = Date.now()
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SamplingConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

/**
 * 预定义的采样配置
 */
export const PresetSamplingConfigs: Record<string, SamplingConfig> = {
  /** 生产环境配置 - 严格采样 */
  production: {
    strategy: 'priority_based',
    priorityLevel: LogLevelEnum.WARN,
    sampleRate: 0.01,
  },

  /** 开发环境配置 - 宽松采样 */
  development: {
    strategy: 'rate_limit',
    maxPerSecond: 50,
    allowBurst: true,
    burstWindowMs: 100,
  },

  /** 调试模式配置 - 几乎全量 */
  debug: {
    strategy: 'rate_limit',
    maxPerSecond: 200,
    allowBurst: true,
    burstWindowMs: 50,
  },

  /** 错误专用配置 - 只记录错误 */
  errorOnly: {
    strategy: 'priority_based',
    priorityLevel: LogLevelEnum.ERROR,
  },

  /** 随机采样配置 - 10% 采样率 */
  random10: {
    strategy: 'random',
    sampleRate: 0.1,
  },

  /** 频率限制配置 - 每秒最多 5 条 */
  rateLimit5: {
    strategy: 'rate_limit',
    maxPerSecond: 5,
  },
}
