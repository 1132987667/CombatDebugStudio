/**
 * 文件: unified-validator.ts
 * 功能: 统一事件流存档校验器（纯函数，可注入 Web Worker 执行）
 * 描述: 依据《调试日志UI-V4.html》validateUnified 移植为 TS 纯函数。
 *       - 版本号 / 首事件 battle_start 根事件（时基零点 + randomSeed）
 *       - 时基单调性 / correlationId 缺失 / parentId 悬空
 *       - 随机判定次数统计 + 随机值越界检查
 *       - 锚点体系统计（事件级增量 + 回合级全量）
 *       仅字符串拼接与计数，无外部依赖，可跨线程执行。
 */

import type { UnifiedArchive, UnifiedEvent } from './unified-archive'

export const ARCHIVE_VERSION = '2.0.0'

export interface ValidationStats {
  events: number
  chains: number
  anchorsEv: number
  anchorsTurn: number
  checks: number
  debugOnly: number
}

export interface ValidationResult {
  errors: string[]
  warnings: string[]
  infos: string[]
  stats: ValidationStats
}

/**
 * 校验统一存档；debugPhases 为回放投影默认隐藏的调试专属阶段集合。
 * NOTE: 函数体必须完全自包含（不引用任何模块级标识符），
 * 以便 toString() 序列化后注入 Web Worker 独立执行（见 shared/utils/unified-worker.ts）。
 */
export function validateUnified(
  log: UnifiedArchive,
  debugPhases: readonly string[] = ['ai_decision', 'attribute_recalc', 'config_load', 'config_validation'],
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const infos: string[] = []
  const evs = log.events ?? []
  const stats: ValidationStats = {
    events: evs.length,
    chains: 0,
    anchorsEv: 0,
    anchorsTurn: 0,
    checks: 0,
    debugOnly: 0,
  }

  const isBattleLifecycle = (e: UnifiedEvent): boolean => e.phase === 'battle_lifecycle'
  const actionOf = (e: UnifiedEvent): string => String((e.payload as Record<string, unknown>)?.action ?? '')

  if (log.version !== '2.0.0') errors.push(`版本号异常: ${log.version}`)

  const first = evs[0]
  if (!first || !isBattleLifecycle(first) || actionOf(first) !== 'battle_start') {
    errors.push('首事件必须为 战斗开始 根事件')
  } else {
    if (first.timestamp !== 0) errors.push(`战斗开始 时基零点偏移: ${first.timestamp}`)
    if (!first.randomSeed) errors.push('战斗开始 未携带随机种子')
  }

  const ids = new Map<string, UnifiedEvent>()
  for (const e of evs) ids.set(e.id, e)

  const corr = new Set<string>()
  let lastTs = -1
  for (const e of evs) {
    if (e.timestamp < lastTs) errors.push(`时基非单调: ${e.id} (${e.timestamp} < ${lastTs})`)
    lastTs = e.timestamp
    if (!e.correlationId) errors.push(`事件缺少 因果链标识: ${e.id}`)
    else corr.add(e.correlationId)
    if (e.parentId && !ids.has(e.parentId)) errors.push(`父引用悬空: ${e.id} → ${e.parentId}`)
    if (debugPhases.includes(e.phase)) stats.debugOnly++
    if (e.phase === 'turn_flow' && (e.payload as Record<string, unknown>)?.anchor) stats.anchorsTurn++
    if (e.snapshot) stats.anchorsEv++
    const rolls = (e.payload as Record<string, unknown>)?.rolls
    if (Array.isArray(rolls)) {
      for (const r of rolls as Array<{ roll?: number }>) {
        stats.checks++
        const roll = r?.roll
        if (typeof roll !== 'number' || roll < 0 || roll > 1) errors.push(`随机值越界: ${e.id}`)
      }
    }
  }

  stats.chains = corr.size

  const hasEnd = evs.some((e) => isBattleLifecycle(e) && actionOf(e) === 'battle_end')
  if (!hasEnd) warnings.push('缺少 战斗结束 根事件')

  if (stats.debugOnly > 0) {
    warnings.push(
      `${stats.debugOnly} 个调试专属事件（${debugPhases.join('/')}）— 回放投影默认隐藏，调试投影始终可见（按分类表）`,
    )
  }

  infos.push(`随机判定 ${stats.checks} 次 · 因果链 ${stats.chains} 条`)
  infos.push(`锚点体系：事件级增量 ×${stats.anchorsEv} + 回合级全量 ×${stats.anchorsTurn}（+ 初始状态）`)

  return { errors, warnings, infos, stats }
}
