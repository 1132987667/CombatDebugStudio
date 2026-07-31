/**
 * 文件: BuffTraceLogger.ts
 * 功能: 技术调试日志 — Buff 生命周期追踪
 * 描述: 在 Buff 施加/移除/层数变更/修饰符变更时输出 TraceEvent 到 TraceEventCollector。
 *       level 定级 debug（文档 §6.3），TRACE 只留给高频细节与"跳过"记录。
 *       correlationId 从调用链 context.trace 取（文档 §4.5），未传入时退化为自建命名。
 * 版本: 3.1.0
 */

import { createTraceEvent, TraceLevel, TracePhase, type TraceScope } from '@/shared/types/trace-event'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'

/**
 * Buff 生命周期追踪器
 * 纯静态方法，在 BuffSystem 的关键路径上调用。
 */
export class BuffTraceLogger {
  private static counter = 0

  /** 可选的 IDebugTracePort（由 BattleSystem 注入） */
  private static tracePort: IDebugTracePort | null = null

  /** 设置 IDebugTracePort 实例 */
  static setTracePort(port: IDebugTracePort | null): void {
    this.tracePort = port
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
    trace?: TraceScope,
  ): void {
    const id = ++this.counter

    if (this.tracePort && this.tracePort.isEnabled(TracePhase.BUFF_LIFECYCLE)) {
      this.tracePort.emit(
        createTraceEvent({
          correlationId: trace?.correlationId ?? `buff_apply_${id}`,
          phase: TracePhase.BUFF_LIFECYCLE,
          parentId: trace?.parentId ?? parentTraceId,
          battleId: trace?.meta?.battleId,
          turn: trace?.meta?.turn,
          sourceId: characterId,
          targetId: characterId,
          level: TraceLevel.DEBUG,
          summary:
            `施加 【${buffName}】 (层数 ${stacks}, 持续 ${duration >= 0 ? duration + '回合' : '永久'})`,
          payload: {
            buffName,
            instanceId,
            action: 'APPLY',
            stacks,
            duration,
          },
        }),
      )
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
    trace?: TraceScope,
  ): void {
    const id = ++this.counter

    if (this.tracePort && this.tracePort.isEnabled(TracePhase.BUFF_LIFECYCLE)) {
      this.tracePort.emit(
        createTraceEvent({
          correlationId: trace?.correlationId ?? `buff_remove_${id}`,
          phase: TracePhase.BUFF_LIFECYCLE,
          parentId: trace?.parentId ?? parentTraceId,
          battleId: trace?.meta?.battleId,
          turn: trace?.meta?.turn,
          sourceId: characterId,
          targetId: characterId,
          level: TraceLevel.DEBUG,
          summary: `移除 【${buffName}】`,
          payload: {
            buffName,
            instanceId,
            action: 'REMOVE',
          },
        }),
      )
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
    trace?: TraceScope,
  ): void {
    const id = ++this.counter

    if (this.tracePort && this.tracePort.isEnabled(TracePhase.BUFF_LIFECYCLE)) {
      this.tracePort.emit(
        createTraceEvent({
          correlationId: trace?.correlationId ?? `buff_update_${id}`,
          phase: TracePhase.BUFF_LIFECYCLE,
          parentId: trace?.parentId ?? parentTraceId,
          battleId: trace?.meta?.battleId,
          turn: trace?.meta?.turn,
          sourceId: characterId,
          targetId: characterId,
          level: TraceLevel.DEBUG,
          summary: `【${buffName}】 层数 ${oldStacks}→${newStacks}`,
          payload: {
            buffName,
            instanceId,
            action: 'UPDATE',
            oldStacks,
            newStacks,
            remainingTurns,
          },
        }),
      )
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
    trace?: TraceScope,
  ): void {
    const id = ++this.counter

    if (this.tracePort && this.tracePort.isEnabled(TracePhase.BUFF_LIFECYCLE)) {
      this.tracePort.emit(
        createTraceEvent({
          correlationId: trace?.correlationId ?? `buff_mod_${id}`,
          phase: TracePhase.BUFF_LIFECYCLE,
          parentId: trace?.parentId ?? parentTraceId,
          battleId: trace?.meta?.battleId,
          turn: trace?.meta?.turn,
          sourceId: characterId,
          targetId: characterId,
          level: TraceLevel.DEBUG,
          summary: `【${buffName}】 ${attribute} ${valueStr}`,
          payload: {
            buffName,
            action: 'MODIFIER',
            attribute,
            value: valueStr,
            currentTotal,
          },
        }),
      )
    }
  }
}
