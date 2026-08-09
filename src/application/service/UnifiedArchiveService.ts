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
import { roundStepVal } from '@/domain/battle/replay/unified/unified-steps'
import { TracePhase, type TraceEvent } from '@/shared/types/trace-event'
import type { RecordedBattle } from '@/domain/battle/service/BattleRecorder'

/** 真实 TraceEvent → 统一事件：字段归一化 + HP 快照累减 */
function normalizeTraceEvent(te: TraceEvent, hpSim: Map<string, number>): UnifiedEvent {
  const payload: Record<string, unknown> = { ...(te.payload ?? {}) }

  // ⓪ turn_flow action 归一化：真实发射端用枚举 TURN_START/TURN_END，
  //   统一事件流契约（demo/deriveDebugTree/currentTurnAt）用 start/end——
  //   不归一化则真实录制时间线建不出回合分组（节点平铺顶层）。
  if (te.phase === TracePhase.TURN_FLOW) {
    if (payload.action === 'TURN_START') payload.action = 'start'
    else if (payload.action === 'TURN_END') payload.action = 'end'
  }

  // ① final → result（检视器公式结算取 result）
  if (typeof payload.final === 'number' && payload.result == null) payload.result = payload.final

  // ② crit {rate, triggered} → rolls（真实无 roll 值，从 verdict 反推可判定区间）
  if (payload.crit && !payload.rolls) {
    const c = payload.crit as { rate?: number; triggered?: boolean }
    const raw = typeof c.rate === 'number' && Number.isFinite(c.rate) ? c.rate : 0
    // NOTE: 真实发射端（TraceDamageLogger）crit.rate 为百分比（10=10%），
    //       统一事件流契约 rolls[].rate 为 0~1 小数（demo 存档同规），此处归一化，否则回推 roll 越界
    const rate = raw >= 0 && raw <= 1 ? raw : raw / 100
    const triggered = !!c.triggered
    payload.rolls = [
      {
        kind: 'crit',
        rate,
        roll: triggered
          ? Math.max(0, Math.min(0.999, rate - 0.001))
          : Math.min(0.999, rate + (1 - rate) * 0.5),
        derived: true,
      },
    ]
  }

  // ③ DamageStep[] → CalcStep[]（真实 steps 为 {stepName,value,before,after,sourceType}）
  if (Array.isArray(payload.steps)) {
    const first = payload.steps[0] as Record<string, unknown> | undefined
    if (first && typeof first.value === 'number') {
      const list = payload.steps as Array<Record<string, unknown>>
      let prev = 0
      payload.steps = list.map((s, i) => {
        // NOTE: DamageStep.value 是每步之后的累计绝对值（=after），单步贡献 = 与上一步的差值。
        //       不能直接用 before/after 差：preCrit 步骤 before 取 baseDamage（非前一步累计），
        //       会与 extra 重复计数。HealCalculationStep 无累计语义（step/value 各自独立），保持原样。
        //       先 round 消除浮点尾差（extraValues 累加如 50.830000000000005），
        //       差值运算本身也会产生尾差（60.83 − 50 = 10.829999999999998），故对差值再 round。
        const cur = roundStepVal(typeof s.value === 'number' ? s.value : 0)
        if (typeof s.stepName !== 'string') {
          return { n: String(s.step ?? '步骤'), op: cur >= 0 ? '+' : '−', v: Math.abs(cur), src: String(s.step ?? '') }
        }
        const delta = roundStepVal(cur - prev)
        prev = cur
        return {
          n: String(s.stepName),
          op: i === 0 ? '' : delta > 0 ? '+' : delta < 0 ? '−' : '+',
          v: i === 0 ? cur : Math.abs(delta),
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
    attributes: p.attributes,
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

/** 从 saveKey 尾缀解析保存时间戳（saveKey = battle_recording_${battleId}_${Date.now()}） */
function saveTimeOf(key: string): number {
  const i = key.lastIndexOf('_')
  const t = i >= 0 ? Number(key.slice(i + 1)) : NaN
  return Number.isFinite(t) ? t : 0
}

/** 从战斗系统取最新录制（内存优先，其次 IndexedDB 按保存时间最新） */
export async function loadLatestArchive(battleSystem: BattleSystem): Promise<UnifiedArchive | null> {
  try {
    const inMemory = battleSystem.getAllBattleRecordings()
    if (inMemory.length) return fromRecordedBattle(inMemory[inMemory.length - 1])
    const keys = await battleSystem.getSavedBattleRecordingsList()
    if (!keys.length) return null
    // saveKey 含 battleId 前缀，IndexedDB 主键字典序≠保存时间，须按尾缀时间戳取最新
    const last = [...keys].sort((a, b) => saveTimeOf(b) - saveTimeOf(a))[0]
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

/** 列出 IndexedDB 中全部已保存录制（按保存时间倒序，最新的在前） */
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
  // 按保存时间倒序——saveKey 含 battleId 前缀，IndexedDB 主键字典序（先 battleId 后时间戳）与保存时间无关
  return metas.sort((a, b) => saveTimeOf(b.saveKey) - saveTimeOf(a.saveKey))
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
