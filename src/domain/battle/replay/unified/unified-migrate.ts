/**
 * 文件: unified-migrate.ts
 * 功能: 统一存档结构迁移（纯函数，可注入 Worker / 单测）
 * 描述: 导入/加载统一存档时识别旧版本结构并迁移到当前 ARCHIVE_VERSION（2.0.0）：
 *       - v1.0.0 RecordedBattle 形态（traceEvents/combatRecords，无 unified events）→ 返回 null，
 *         由调用方（application 层）经 fromRecordedBattle 映射
 *       - UnifiedArchive 但 version 缺失/过旧 → 结构达标则仅补 version，否则返回 null
 *       validateUnified 保持「只校验不迁移」（自包含 Worker 前提），迁移在此前置执行。
 */

import type { UnifiedArchive, UnifiedEvent } from './unified-archive'
import { ARCHIVE_VERSION } from './unified-validator'

/** 识别 1.0.0 RecordedBattle 形态（有 traceEvents / combatRecords，无 unified events） */
export function isLegacyRecordedBattle(raw: unknown): raw is { battleId: string } & Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  const first = Array.isArray(r.events) ? (r.events[0] as { phase?: unknown } | undefined) : undefined
  const hasUnified = !!first?.phase
  const hasLegacy = Array.isArray(r.traceEvents) || Array.isArray(r.combatRecords)
  return !!r.battleId && hasLegacy && !hasUnified
}

/**
 * 迁移 UnifiedArchive 形态到当前版本。
 * - 结构达标（events 非空 + initialState.participants）→ 补 version 为当前版本返回
 * - 无法识别 / 结构不达标 → 返回 null（调用方提示「格式不合法」而非吞掉）
 */
export function migrateUnifiedArchive(raw: unknown): UnifiedArchive | null {
  if (!raw || typeof raw !== 'object') return null

  const arch = raw as Partial<UnifiedArchive>
  if (!Array.isArray(arch.events) || !arch.events.length || !arch.initialState?.participants) {
    return null
  }

  return {
    battleId: String(arch.battleId ?? ''),
    replayId: String(arch.replayId ?? ''),
    version: ARCHIVE_VERSION,
    randomSeed: arch.randomSeed ?? '0',
    startTime: arch.startTime ?? 0,
    winner: arch.winner,
    checksum: arch.checksum,
    initialState: arch.initialState as UnifiedArchive['initialState'],
    events: arch.events as UnifiedEvent[],
  }
}
