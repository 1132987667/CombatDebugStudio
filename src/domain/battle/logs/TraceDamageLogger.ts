/**
 * 文件: TraceDamageLogger.ts
 * 功能: 技术调试日志 — 伤害计算链路追踪
 * 描述: 将 CombatRecord.damageBreakdown 结构化为 DEBUG/TRACE 级别日志。
 *       DEBUG 级别输出单行摘要，TRACE 级别输出完整树状计算链路。
 *       对应设计文档第4节"底层：技术调试日志"。
 * 版本: 1.0.0
 */

import type { CombatRecord, DamageBreakdown, DamageStep } from '@/domain/battle/combat-record'
import { battleLogManager, LogLevel } from '@/infrastructure/adapters/logging'

/**
 * 伤害计算链路追踪器
 * 将伤害拆解信息输出到调试日志系统
 */
export class TraceDamageLogger {
  private static traceCounter = 0

  /**
   * 记录伤害计算链路
   * 自动根据当前日志级别决定输出内容：
   * - 始终输出 DEBUG 摘要
   * - 仅当日志级别 >= TRACE 时输出完整树
   */
  static log(record: CombatRecord): void {
    const breakdown = record.damageBreakdown
    if (!breakdown) return

    const source = record.actorName
    const target = record.targetName ?? 'unknown'
    const skillInfo = record.skillName ? ` skill=${record.skillName}` : ''

    // === DEBUG 摘要行 ===
    const defMul = breakdown.defenseMultiplier ?? 1
    const defReduction = ((1 - defMul) * 100).toFixed(2)
    battleLogManager.addDebugLog(
      `DMG_SUM ${source}→${target} |` +
      ` base=${breakdown.baseDamage} final=${breakdown.finalDamage}` +
      ` crit=${breakdown.isCritical} defRed=${defReduction}%${skillInfo}`,
      LogLevel.DEBUG,
    )

    // === TRACE 树状链路 ===
    const traceId = `trace_dmg_${++this.traceCounter}`
    const lines = this.buildTraceLines(traceId, source, target, record, breakdown)

    for (const line of lines) {
      battleLogManager.addDebugLog(line, LogLevel.TRACE)
    }
  }

  /**
   * 构建 TRACE 树状行
   * ponytail: 使用缩进前缀模拟树状结构，不做真正的树数据结构。
   * 升级路径：如需 UI 树状展开，改用 TraceLogEntry.children。
   */
  private static buildTraceLines(
    traceId: string,
    source: string,
    target: string,
    record: CombatRecord,
    bd: DamageBreakdown,
  ): string[] {
    const lines: string[] = []
    const skillInfo = record.skillName ? ` skill=${record.skillName}` : ''

    // 根节点
    lines.push(
      `[${traceId}] DMG_CALC ${source}→${target} | turn=${record.turn}${skillInfo}`,
    )

    // 基础伤害
    lines.push(
      `  ├─ BaseDamage: ${bd.baseDamage} (MIN=${bd.minDamageThreshold ?? '?'}, MAX=${bd.maxDamageThreshold ?? '?'})`,
    )

    // 额外加成
    if (bd.extraContributions.length > 0) {
      for (const ec of bd.extraContributions) {
        lines.push(
          `  ├─ Extra: ${ec.attribute} ×${ec.ratio} = ${ec.value}`,
        )
      }
    } else {
      lines.push(`  ├─ Extra: 无加成`)
    }

    // 暴击判定
    lines.push(
      `  ├─ CritCheck: rate=${bd.critRate}% | roll=— → ${bd.isCritical ? '✓ CRIT' : 'FALSE'}`,
    )
    if (bd.isCritical) {
      lines.push(
        `  │  └─ CritMultiplier: ×${bd.critMultiplier} => pre=${bd.preCritDamage} post=${bd.postCritDamage}`,
      )
    }

    // 防御减免
    const defMul = bd.defenseMultiplier ?? 1
    const defRedPct = ((1 - defMul) * 100).toFixed(2)
    lines.push(
      `  ├─ Defense: value=${bd.defenseValue} effective=${bd.effectiveDefense ?? bd.defenseValue} mul=${defMul} (减免 ${defRedPct}%)`,
    )

    // 额外减免项
    const reductions: string[] = []
    if (bd.normalAtkReduction != null) reductions.push(`normalAtk=${bd.normalAtkReduction}%`)
    if (bd.skillDmgReduction != null) reductions.push(`skillDmg=${bd.skillDmgReduction}%`)
    if (bd.generalDamageReduction != null) reductions.push(`general=${bd.generalDamageReduction}%`)
    if (bd.damageTakenIncrease != null) reductions.push(`takenInc=${bd.damageTakenIncrease}%`)
    if (reductions.length > 0) {
      lines.push(`  ├─ Reductions: ${reductions.join(', ')}`)
    }

    // 目标修正
    if (bd.targetModifierEffects && bd.targetModifierEffects.length > 0) {
      for (const tme of bd.targetModifierEffects) {
        lines.push(
          `  ├─ TargetMod: ${tme.attribute} mul=${tme.multiplier} effect=${tme.effect}`,
        )
      }
    }

    // 步骤链
    if (bd.steps && bd.steps.length > 0) {
      lines.push(`  ├─ Steps:`)
      for (const step of bd.steps) {
        lines.push(`  │  ${step.stepName}: ${step.description} => ${step.value}`)
      }
    }

    // 结果
    lines.push(`  └─ RESULT: ${bd.finalDamage}`)

    return lines
  }
}
