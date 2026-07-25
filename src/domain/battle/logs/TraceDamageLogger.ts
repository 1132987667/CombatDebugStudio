/**
 * 文件: TraceDamageLogger.ts
 * 功能: 技术调试日志 — 伤害计算链路追踪
 * 描述: 将 CombatRecord.damageBreakdown 结构化为 TraceLogEntry 树。
 *       输出到 TraceLogCollector 供 UI 树状展示。
 *       保留 DEBUG 摘要行作为快速参考。
 * 版本: 2.0.0
 */

import type { CombatRecord, DamageBreakdown, DamageStep } from '@/domain/battle/combat-record'
import { LogLevel } from '@/shared/types/battle-log'
import { LoggerProvider } from '@/domain/port/LoggerProvider'
import { createTraceLogEntry } from '@/shared/types/trace-log'
import type { TraceLogCollector } from '@/domain/battle/logs/TraceLogCollector'

/**
 * 伤害计算链路追踪器
 * 将伤害拆解信息输出到 TraceLogCollector 和调试日志
 */
export class TraceDamageLogger {
  private static traceCounter = 0

  /**
   * 记录伤害计算链路到 TraceLogCollector（树状）
   * 同时输出 DEBUG 摘要行到传统日志
   *
   * @param record - 战斗记录（含 damageBreakdown）
   * @param collector - TraceLogCollector 实例
   * @param rootTraceId - 父攻击动作的 traceId（可选，不传则自建根 traceId）
   * @param parentTraceId - 父节点的 traceId（可选，用于挂到攻击树）
   */
  static log(
    record: CombatRecord,
    collector?: TraceLogCollector,
    rootTraceId?: string,
    parentTraceId?: string,
  ): void {
    const breakdown = record.damageBreakdown
    if (!breakdown) return

    const source = record.actorName
    const target = record.targetName ?? 'unknown'
    const turn = record.turn

    // === DEBUG 摘要行（始终输出） ===
    const defMul = breakdown.defenseMultiplier ?? 1
    const defReduction = ((1 - defMul) * 100).toFixed(2)
    const skillInfo = record.skillName ? ` skill=${record.skillName}` : ''
    LoggerProvider.logger.addDebugLog(
      `DMG_SUM ${source}→${target} |` +
      ` base=${breakdown.baseDamage} final=${breakdown.finalDamage}` +
      ` crit=${breakdown.isCritical} defRed=${defReduction}%${skillInfo}`,
      { level: LogLevel.DEBUG },
    )

    // 没有 collector 时跳过树输出
    if (!collector) return

    // === 树状 TraceLogEntry ===
    const dmgTraceId = rootTraceId ?? `trace_dmg_${++this.traceCounter}`
    const actionName = record.skillName || '普通攻击'

    // 根节点：伤害计算
    collector.add({
      ...createTraceLogEntry(dmgTraceId, parentTraceId, actionName, breakdown.finalDamage, `${source}→${target} 伤害计算`, 0),
      turn,
      source: record.actorId,
      target: record.targetId,
    })

    // 步骤：从 DamageBreakdown.steps 生成子节点
    if (breakdown.steps && breakdown.steps.length > 0) {
      for (let i = 0; i < breakdown.steps.length; i++) {
        const step = breakdown.steps[i]
        const stepTraceId = `${dmgTraceId}_${step.stepName}_${i}`
        collector.add({
          ...createTraceLogEntry(
            stepTraceId,
            dmgTraceId,
            step.stepName,
            step.value,
            step.description,
            1,
          ),
          turn,
          source: record.actorId,
          target: record.targetId,
        })
      }
    }

    // 防御减免详情（步骤未覆盖时补充）
    if (!breakdown.steps?.some((s) => s.stepName === 'defense' || s.stepName === 'Defense')) {
      const defTraceId = `${dmgTraceId}_defense`
      const defRedPct = ((1 - defMul) * 100).toFixed(2)
      collector.add({
        ...createTraceLogEntry(
          defTraceId,
          dmgTraceId,
          'defense',
          breakdown.effectiveDefense ?? breakdown.defenseValue,
          `防御减免 ${defRedPct}% (def=${breakdown.defenseValue})`,
          1,
        ),
        turn,
        source: record.actorId,
        target: record.targetId,
      })
    }

    // 结果行
    const resultTraceId = `${dmgTraceId}_result`
    collector.add({
      ...createTraceLogEntry(
        resultTraceId,
        dmgTraceId,
        'result',
        breakdown.finalDamage,
        `★ 最终伤害: ${breakdown.finalDamage}`,
        1,
      ),
      turn,
      source: record.actorId,
      target: record.targetId,
    })
  }
}
