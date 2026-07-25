/**
 * 文件: BuffTraceLogger.ts
 * 功能: 技术调试日志 — Buff 变更追踪
 * 描述: 在 Buff 施加/移除/属性变更时输出 TraceLogEntry 到 TraceLogCollector，
 *       同时保留 TRACE 级别文本日志。
 * 版本: 2.0.0
 */

import { LogLevel } from '@/shared/types/battle-log'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { createTraceLogEntry } from '@/shared/types/trace-log'
import type { TraceLogCollector } from '@/domain/battle/logs/TraceLogCollector'

/**
 * Buff 变更追踪器
 * 纯静态方法，在 BuffSystem 的关键路径上调用。
 */
export class BuffTraceLogger {
  private static counter = 0

  /** 可选的 TraceLogCollector（由 BattleSystem 注入） */
  private static collector: TraceLogCollector | null = null

  /** 设置 TraceLogCollector 实例 */
  static setCollector(c: TraceLogCollector | null): void {
    this.collector = c
  }

  /**
   * Buff 施加时调用
   */
  static onApply(
    characterId: string,
    buffName: string,
    instanceId: string,
    stacks: number,
    duration: number,
    parentTraceId?: string,
  ): void {
    const id = ++this.counter
    const traceId = `buff_apply_${id}`
    LoggerProvider.logger.addDebugLog(
      `[${id}] BUFF_APPLY ${buffName}→${characterId} |` +
      ` instance=${instanceId} stack=${stacks} duration=${duration}`,
      { level: LogLevel.TRACE },
    )

    if (this.collector) {
      this.collector.add({
        ...createTraceLogEntry(
          traceId,
          parentTraceId,
          'buff_apply',
          stacks,
          `施加 【${buffName}】 (层数 ${stacks}, 持续 ${duration >= 0 ? duration + '回合' : '永久'})`,
          1,
        ),
        source: characterId,
        target: characterId,
      })
    }
  }

  /**
   * Buff 移除时调用
   */
  static onRemove(
    characterId: string,
    buffName: string,
    instanceId: string,
    parentTraceId?: string,
  ): void {
    const id = ++this.counter
    const traceId = `buff_remove_${id}`
    LoggerProvider.logger.addDebugLog(
      `[${id}] BUFF_REMOVE ${buffName}→${characterId} | instance=${instanceId}`,
      { level: LogLevel.TRACE },
    )

    if (this.collector) {
      this.collector.add({
        ...createTraceLogEntry(
          traceId,
          parentTraceId,
          'buff_remove',
          0,
          `移除 【${buffName}】`,
          1,
        ),
        source: characterId,
        target: characterId,
      })
    }
  }

  /**
   * Buff 层数更新/刷新时调用
   */
  static onUpdate(
    characterId: string,
    buffName: string,
    instanceId: string,
    oldStacks: number,
    newStacks: number,
    remainingTurns: number,
    parentTraceId?: string,
  ): void {
    const id = ++this.counter
    const traceId = `buff_update_${id}`
    LoggerProvider.logger.addDebugLog(
      `[${id}] BUFF_UPDATE ${buffName}→${characterId} |` +
      ` instance=${instanceId} stack=${oldStacks}→${newStacks} remain=${remainingTurns}`,
      { level: LogLevel.TRACE },
    )

    if (this.collector) {
      this.collector.add({
        ...createTraceLogEntry(
          traceId,
          parentTraceId,
          'buff_update',
          newStacks - oldStacks,
          `【${buffName}】 层数 ${oldStacks}→${newStacks}`,
          1,
        ),
        source: characterId,
        target: characterId,
      })
    }
  }

  /**
   * 属性修饰符变更时调用
   */
  static onModifier(
    characterId: string,
    buffName: string,
    attribute: string,
    valueStr: string,
    currentTotal: number,
    parentTraceId?: string,
  ): void {
    const id = ++this.counter
    const traceId = `buff_mod_${id}`
    LoggerProvider.logger.addDebugLog(
      `[${id}] BUFF_MOD ${buffName}→${characterId} |` +
      ` attr=${attribute} mod=${valueStr} total=${currentTotal}`,
      { level: LogLevel.TRACE },
    )

    if (this.collector) {
      this.collector.add({
        ...createTraceLogEntry(
          traceId,
          parentTraceId,
          'buff_modifier',
          currentTotal,
          `【${buffName}】 ${attribute} ${valueStr}`,
          1,
        ),
        source: characterId,
        target: characterId,
      })
    }
  }
}
