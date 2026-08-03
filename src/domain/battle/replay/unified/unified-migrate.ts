/**
 * 文件: unified-migrate.ts
 * 功能: 旧格式存档升级为统一事件流 v2.0.0（纯函数）
 * 描述: 依据《调试日志UI-调试系统示例.html》migrateLog 契约移植。
 *       当前支持 v0.9（timeline 树：round → phase/action → events）→ v2.0.0（events: TraceEvent[]）。
 *       - calc → payload.steps（伤害计算模型 · Modifier Chain）
 *       - rolls → payload.rolls（随机判定凭证）
 *       - hp → snapshot（状态快照，变更后绝对值）
 *       - chain → payload.chain（事件因果链）
 *       保留 v2.0.0 原样返回；未知 schema 报错。
 */

import type { UnifiedArchive, UnifiedEvent } from './unified-archive'

export interface MigrationReport {
  converted: number
  warnings: string[]
  errors: string[]
  from?: string
}

export interface MigrateResult {
  archive: UnifiedArchive | null
  report: MigrationReport
}

/** 伤害计算模型修饰链标签（v0.9 CALC_SPEC） */
const CALC_SPEC: Record<string, { label: string; op: '' | '+' | '−' | '×' }> = {
  base: { label: '技能基础值', op: '' },
  atk: { label: '攻击力', op: '+' },
  def: { label: '防御减免', op: '−' },
  crit: { label: '暴击倍率', op: '×' },
  ele: { label: '属性克制', op: '×' },
  shield: { label: '护盾吸收', op: '−' },
  vuln: { label: '易伤加成', op: '×' },
}

interface LegacyLog {
  schema?: string
  version?: string
  meta?: { battleId?: string; seed?: string | number; rng?: string; engine?: string; recordedAt?: string }
  units?: Array<{ id: string; name: string; maxHp?: number; side?: 'ally' | 'enemy' }>
  timeline?: LegacyRound[]
}

interface LegacyRound {
  type?: string
  id?: string
  name?: string
  children?: LegacyNode[]
}

interface LegacyNode {
  type?: string
  id?: string
  name?: string
  events?: LegacyEvent[]
}

interface LegacyEvent {
  id?: string
  type?: string
  title?: string
  calc?: Record<string, number>
  rolls?: Array<{ kind: string; rate: number; roll: number; buff?: string }>
  hp?: { target: string; before: number; after: number }
  chain?: Array<{ t: string; d: string }>
}

function phaseOf(type: string | undefined): UnifiedEvent['phase'] {
  if (type === 'debuff') return 'buff_lifecycle'
  if (type === 'crit' || type === 'damage' || type === 'miss') return 'damage_calculation'
  return 'action_execution'
}

/** 从 v0.9 timeline 树转换出事件序列 + 因果链 */
function convertTimeline(log: LegacyLog, report: MigrationReport): UnifiedEvent[] {
  const events: UnifiedEvent[] = []
  let ts = 0
  let corrSeq = 0
  const nodeEvents = (log.timeline ?? []).flatMap((r) => r.children ?? [])

  for (const node of nodeEvents) {
    const nodeEvs = node.events ?? []
    if (!nodeEvs.length) continue
    // 行动节点 = 一条因果链（correlationId 共享）
    const corrId = `corr_${++corrSeq}`
    let parentId: string | undefined
    const stepBase = ts
    nodeEvs.forEach((le, i) => {
      const id = le.id ?? `evt_${events.length + 1}`
      const phase = phaseOf(le.type)
      const payload: Record<string, unknown> = {}
      if (le.calc) {
        const steps: Array<{ n: string; op: string; v: number; src: string }> = []
        for (const k of Object.keys(le.calc)) {
          if (k === 'final') continue
          const spec = CALC_SPEC[k]
          if (!spec) {
            report.warnings.push(`事件 ${id} 含未登记修正项 "${k}"`)
          } else {
            steps.push({ n: spec.label, op: spec.op, v: le.calc[k], src: 'calc.' + k })
          }
        }
        payload.steps = steps
        if (typeof le.calc.final === 'number') payload.result = le.calc.final
      }
      if (le.rolls?.length) payload.rolls = le.rolls
      if (le.chain?.length) payload.chain = le.chain
      const ev: UnifiedEvent = {
        id,
        phase,
        correlationId: corrId,
        parentId,
        timestamp: stepBase + i * 10,
        level: 'info',
        payload,
        summary: le.title ?? '',
      }
      if (le.hp) ev.snapshot = { participants: [{ id: le.hp.target, hp: le.hp.after }] }
      events.push(ev)
      if (!parentId) parentId = id
      report.converted++
    })
    ts = stepBase + nodeEvs.length * 10 + 10
  }
  return events
}

/** 旧格式存档 → v2.0.0 统一事件流 */
export function migrateUnifiedLog(raw: unknown): MigrateResult {
  const report: MigrationReport = { converted: 0, warnings: [], errors: [] }
  if (!raw || typeof raw !== 'object') {
    report.errors.push('存档为空或非对象')
    return { archive: null, report }
  }

  // v2.0.0 直接通过
  const version = (raw as { version?: string }).version
  if (version === '2.0.0') {
    report.from = '2.0.0'
    return { archive: raw as UnifiedArchive, report }
  }

  // v0.9 / v1.0.0 走迁移
  const log = raw as LegacyLog
  const legacySchema = log.schema ?? (version === '1.0.0' ? '0.9' : undefined)
  if (legacySchema !== '0.9') {
    report.errors.push(`未知 schema 版本: ${version ?? log.schema ?? '无'}`)
    return { archive: null, report }
  }
  report.from = '0.9'

  const units = log.units ?? []
  const events: UnifiedEvent[] = []
  // 根事件：battle_start（时基零点）
  events.push({
    id: 'evt_bs',
    phase: 'battle_lifecycle',
    correlationId: 'corr_root',
    timestamp: 0,
    randomSeed: String(log.meta?.seed ?? 0),
    level: 'info',
    payload: { action: 'battle_start', engine: log.meta?.engine },
    summary: '战斗开始',
  })
  events.push(...convertTimeline(log, report))
  // 根事件：battle_end
  const lastTs = events.length ? Math.max(...events.map((e) => e.timestamp)) : 0
  events.push({
    id: 'evt_be',
    phase: 'battle_lifecycle',
    correlationId: 'corr_end',
    timestamp: lastTs + 10,
    level: 'info',
    payload: { action: 'battle_end' },
    summary: '战斗结束',
  })

  const archive: UnifiedArchive = {
    battleId: log.meta?.battleId ?? `BT-${Date.now().toString(36).toUpperCase()}`,
    replayId: 'migrated-0001',
    version: '2.0.0',
    randomSeed: String(log.meta?.seed ?? 0),
    startTime: Date.parse(log.meta?.recordedAt ?? '') || Date.now(),
    initialState: {
      participants: units.map((u) => ({
        id: u.id,
        name: u.name,
        maxHp: u.maxHp ?? 0,
        hp: u.maxHp ?? 0,
        maxEnergy: 100,
        energy: 0,
        buffs: [],
        side: u.side,
      })),
    },
    events,
  }
  return { archive, report }
}
