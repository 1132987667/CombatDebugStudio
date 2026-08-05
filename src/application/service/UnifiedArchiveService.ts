/**
 * 文件: UnifiedArchiveService.ts
 * 功能: 统一存档装配服务（昊天镜数据源适配）
 * 描述: 双工作台消费的 UnifiedArchive 有三个来源：
 *       1. 演示存档（离线全功能自检，见 domain/replay/unified/demo-archive.ts）
 *       2. 真实录制映射（RecordedBattle → UnifiedArchive）
 *       3. 实时战斗流（见 LiveBattleStream）
 *       P0 归一化：真实 TraceDamageLogger 发射字段与统一检视器契约不同（final/result、
 *       crit/rolls、DamageStep/CalcStep），此处做适配；并用伤害/治疗累减生成 HP 快照，
 *       让真实录制的回放舞台与检视器富 sections 可用。
 */

import type { BattleSystem } from '@/domain/battle/BattleSystem'
import { createDemoArchive } from '@/domain/battle/replay/unified/demo-archive'
import type { UnifiedArchive, UnifiedEvent } from '@/domain/battle/replay/unified/unified-archive'
import { TracePhase, type TraceEvent } from '@/shared/types/trace-event'
import type { RecordedBattle } from '@/domain/battle/service/BattleRecorder'

/** 真实 TraceEvent → 统一事件：字段归一化 + HP 快照累减 */
function normalizeTraceEvent(te: TraceEvent, hpSim: Map<string, number>): UnifiedEvent {
  const payload: Record<string, unknown> = { ...(te.payload ?? {}) }

  // ① final → result（检视器公式结算取 result）
  if (typeof payload.final === 'number' && payload.result == null) payload.result = payload.final

  // ② crit {rate, triggered} → rolls（真实无 roll 值，从 verdict 反推可判定区间）
  if (payload.crit && !payload.rolls) {
    const c = payload.crit as { rate?: number; triggered?: boolean }
    const rate = typeof c.rate === 'number' ? c.rate : 0
    const triggered = !!c.triggered
    payload.rolls = [
      {
        kind: 'crit',
        rate,
        roll: triggered ? Math.max(0, rate - 0.001) : Math.min(0.999, rate + (1 - rate) * 0.5),
        derived: true,
      },
    ]
  }

  // ③ DamageStep[] → CalcStep[]（真实 steps 为 {stepName,value,...}）
  if (Array.isArray(payload.steps)) {
    const first = payload.steps[0] as Record<string, unknown> | undefined
    if (first && typeof first.value === 'number') {
      payload.steps = (payload.steps as Array<Record<string, unknown>>).map((s) => {
        const v = typeof s.value === 'number' ? s.value : 0
        return {
          n: String(s.stepName ?? '步骤'),
          op: v >= 0 ? '+' : '−',
          v: Math.abs(v),
          src: String(s.sourceType ?? ''),
        }
      })
    }
  }

  const ev: UnifiedEvent = {
    id: te.id,
    phase: te.phase,
    correlationId: te.correlationId,
    parentId: te.parentId,
    timestamp: te.timestamp,
    level: te.level,
    turn: te.turn,
    sourceId: te.sourceId,
    targetId: te.targetId,
    payload,
    summary: te.summary,
  }

  // ④ HP 快照：伤害/治疗按 target 累减（近似：未计护盾/过量/多层，HACK）
  const isDamage = te.phase === TracePhase.DAMAGE_CALCULATION
  const isHeal = te.phase === TracePhase.HEAL_CALCULATION
  if (te.targetId && (isDamage || isHeal) && typeof payload.final === 'number') {
    const cur = hpSim.get(te.targetId) ?? 0
    const next = Math.max(0, Math.round(cur + (isHeal ? payload.final : -payload.final)))
    hpSim.set(te.targetId, next)
    ev.snapshot = { participants: [{ id: te.targetId, hp: next }] }
  }

  return ev
}

/** 从 RecordedBattle 映射为统一存档；缺根事件时合成；时基归零。无法映射返回 null */
export function fromRecordedBattle(rec: RecordedBattle | undefined | null): UnifiedArchive | null {
  if (!rec || !rec.battleId) return null

  const initialParticipants = (rec.initialState?.participants ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    maxHp: p.maxHealth,
    hp: p.currentHealth,
    maxEnergy: p.maxEnergy,
    energy: p.currentEnergy,
    side: p.team,
    buffs: [],
  }))

  // HP 游标（从 initialState 出发，按伤害/治疗累减）
  const hpSim = new Map<string, number>()
  for (const p of initialParticipants) hpSim.set(p.id, p.hp)

  const raw = (rec.traceEvents ?? []).map((te) => ({
    ...te,
    timestamp: te.timestamp,
  }))

  // 时基归零：首事件为相对零点（V4 契约 battle_start = 0）
  const base = raw.length ? raw[0].timestamp : 0
  for (const te of raw) te.timestamp = Math.max(0, te.timestamp - base)
  raw.sort((a, b) => a.timestamp - b.timestamp)

  const events: UnifiedEvent[] = []
  const hasStart = raw.some((e) => e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_start')
  if (!hasStart) {
    events.push({
      id: 'evt_bs',
      phase: 'battle_lifecycle',
      correlationId: 'corr_root',
      timestamp: 0,
      randomSeed: rec.randomSeed,
      level: 'info',
      payload: { action: 'battle_start' },
      summary: '战斗开始',
    })
  }
  events.push(...raw.map((te) => normalizeTraceEvent(te, hpSim)))
  if (!events.some((e) => e.phase === 'battle_lifecycle' && (e.payload as Record<string, unknown>)?.action === 'battle_end')) {
    const lastTs = events.length ? Math.max(...events.map((e) => e.timestamp)) : 0
    const winner = rec.winner ?? rec.result?.winner
    events.push({
      id: 'evt_be',
      phase: 'battle_lifecycle',
      correlationId: 'corr_end',
      timestamp: lastTs + 1,
      level: 'info',
      payload: { action: 'battle_end', winner: winner ? String(winner) : undefined },
      summary: '战斗结束',
    })
  }

  return {
    battleId: rec.battleId,
    replayId: rec.replayId,
    version: '2.0.0',
    randomSeed: rec.randomSeed || '0',
    startTime: rec.startTime,
    winner: rec.winner ? String(rec.winner) : undefined,
    checksum: rec.checksum,
    initialState: { participants: initialParticipants },
    events,
  }
}

/** 从战斗系统取最新录制（内存优先，其次 IndexedDB） */
export async function loadLatestArchive(battleSystem: BattleSystem): Promise<UnifiedArchive | null> {
  try {
    const inMemory = battleSystem.getAllBattleRecordings()
    if (inMemory.length) return fromRecordedBattle(inMemory[inMemory.length - 1])
    const keys = await battleSystem.getSavedBattleRecordingsList()
    if (!keys.length) return null
    const last = keys[keys.length - 1]
    const rec = await battleSystem.loadBattleRecording(last)
    return fromRecordedBattle(rec)
  } catch {
    return null
  }
}

/** 录制列表元信息（供多场选择） */
export interface RecordingMeta {
  saveKey: string
  battleId: string
  name: string
  startTime: number
  eventCount: number
}

/** 列出 IndexedDB 中全部已保存录制（按保存时间倒序） */
export async function listRecordings(battleSystem: BattleSystem): Promise<RecordingMeta[]> {
  const keys = await battleSystem.getSavedBattleRecordingsList()
  const metas: RecordingMeta[] = []
  for (const key of keys) {
    try {
      const rec = await battleSystem.loadBattleRecording(key)
      if (!rec) continue
      metas.push({
        saveKey: key,
        battleId: rec.battleId,
        name: rec.name ?? `战斗记录_${rec.battleId}`,
        startTime: rec.startTime,
        eventCount: rec.traceEvents?.length ?? rec.events?.length ?? 0,
      })
    } catch {
      /* 单条读取失败跳过 */
    }
  }
  // 按保存时间倒序（keys 含时间戳后缀）
  return metas.reverse()
}

/** 统一存档服务：演示 / 录制装配 */
export class UnifiedArchiveService {
  loadDemo(): UnifiedArchive {
    return createDemoArchive()
  }

  fromRecordedBattle(rec: RecordedBattle | undefined | null): UnifiedArchive | null {
    return fromRecordedBattle(rec)
  }

  async loadLatest(battleSystem: BattleSystem): Promise<UnifiedArchive | null> {
    return loadLatestArchive(battleSystem)
  }

  async listRecordings(battleSystem: BattleSystem): Promise<RecordingMeta[]> {
    return listRecordings(battleSystem)
  }

  async loadRecording(battleSystem: BattleSystem, saveKey: string): Promise<UnifiedArchive | null> {
    const rec = await battleSystem.loadBattleRecording(saveKey)
    return fromRecordedBattle(rec)
  }
}
