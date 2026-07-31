/**
 * 文件: TraceDamageLogger.ts
 * 功能: 技术调试日志 — 伤害计算链路追踪
 * 描述: 将 CombatRecord.damageBreakdown 结构化为 TraceEvent 输出到 TraceEventCollector。
 *       v2 起不再为每个步骤建树节点——steps 整体进 payload.steps（与 DamageBreakdown 同源直出），
 *       UI 展开 payload 表格查看逐步 before→after。
 *       DEBUG 摘要行（DMG_SUM）保留待 P0 迁移。
 * 版本: 3.0.0
 */

import type { CombatRecord } from '@/domain/battle/combat-record'
import { createTraceEvent, TraceLevel, TracePhase } from '@/shared/types/trace-event'
import type { IDebugTracePort } from '@/domain/port/IDebugTracePort'

/**
 * 伤害计算链路追踪器
 * 将伤害拆解信息输出到 TraceEventCollector 和调试日志
 */
export class TraceDamageLogger {
  private static traceCounter = 0

  /**
   * 记录伤害计算链路到 TraceEventCollector（结构化事件）
   * 同时输出 DEBUG 摘要行到传统日志
   *
   * @param record - 战斗记录（含 damageBreakdown）
   * @param tracePort - IDebugTracePort 实例（未注入时为 no-op）
   * @param rootTraceId - 父攻击动作的关联键（可选，不传则自建）
   * @param parentTraceId - 父事件的 id（可选，用于挂到行动树）
   */
  static log(
    record: CombatRecord,
    tracePort?: IDebugTracePort,
    rootTraceId?: string,
    parentTraceId?: string,
  ): void {
    const breakdown = record.damageBreakdown
    if (!breakdown) return

    const source = record.actorName
    const target = record.targetName ?? 'unknown'
    const turn = record.turn

    // 没有 tracePort 时跳过事件输出
    if (!tracePort) return

    // === 结构化 TraceEvent（替换树状 TraceLogEntry） ===
    // TODO(P1): scope 机制（文档 §4.5）落地后，correlationId 改从 context.trace 取
    const correlationId = rootTraceId ?? `trace_dmg_${++this.traceCounter}`
    const final = breakdown.finalDamage

    if (tracePort.isEnabled(TracePhase.DAMAGE_CALCULATION)) {
      tracePort.emit(
        createTraceEvent({
          correlationId,
          phase: TracePhase.DAMAGE_CALCULATION,
          parentId: parentTraceId,
          battleId: record.battleId,
          turn,
          sourceId: record.actorId,
          targetId: record.targetId,
          level: TraceLevel.DEBUG,
          summary:
            `伤害计算 ${source}→${target} ${breakdown.baseDamage}→${final}` +
            `${breakdown.isCritical ? ' ★暴击' : ''}`,
          payload: {
            sourceId: record.actorId,
            targetId: record.targetId,
            skillName: record.skillName,
            base: breakdown.baseDamage,
            raw: breakdown.rawDamage ?? breakdown.postCritDamage,
            final,
            crit: {
              rate: breakdown.critRate,
              multiplier: breakdown.critMultiplier,
              triggered: breakdown.isCritical,
            },
            category: breakdown.damageCategory,
            steps: breakdown.steps, // 直接复用 DamageStep[]（含 before/after）
          },
        }),
      )
    }
  }
}
