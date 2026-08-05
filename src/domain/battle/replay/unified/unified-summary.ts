/**
 * 文件: unified-summary.ts
 * 功能: 战斗战报统计（纯函数）：按统一事件流汇总全维度指标
 * 描述: 实时战报（BattleSummaryDialog）与昊天镜摘要（SummaryDialog）共用同一统计源，不维护第二套口径。
 *       七层模型：
 *         L1 结果（胜负/回合/耗时/胜负边际）——胜方剩余血量%
 *         L2 阵营对比（双阵营输出/治疗/承伤/击杀/剩余血量）
 *         L3 单位贡献排名（含效率/MVP 标记数据）
 *         L4 判定健康度（攻击/命中/暴击率/闪避/抵抗）
 *         L5 技能使用（次数/输出占比）
 *         L6 被动触发统计
 *         L7 关键事件（首杀/击杀/最高单次）
 *       数据约定：
 *       - 闪避（dodge）、击杀（death）由 BattleExecutor 在运行时补发 DAMAGE_CALCULATION 事件；
 *       - dot 持续伤害常无 sourceId，故「承伤」按 targetId 统计，不要求与「输出」对账相等；
 *       - HP 为事件流近似模拟（护盾/过量未计），存活以 death 事件为准。
 */

import type { UnifiedArchive } from './unified-archive'

/** 单单位战报指标 */
export interface UnitSummary {
  id: string
  name: string
  side: string
  /** 主动行动次数（action_execution 发起） */
  attacks: number
  /** 造成伤害合计（damage_calculation result，闪避不计） */
  dealt: number
  /** 承受伤害合计（含 dot） */
  taken: number
  /** 治疗量合计 */
  healed: number
  /** 暴击次数（sourceId 归属） */
  crits: number
  /** 命中次数（非闪避的伤害计算，sourceId 归属） */
  hits: number
  /** 最高单次输出 */
  highestHit: number
  /** 闪避次数（targetId 归属） */
  dodges: number
  /** Buff 施加被抵抗次数 */
  resists: number
  /** Buff 成功施加次数 */
  buffsApplied: number
  /** 击杀次数（致死事件归属 sourceId） */
  kills: number
  /** 战斗结束时是否存活（以死亡事件判定） */
  alive: boolean
  /** 结束时 HP（事件流近似） */
  hpEnd: number
  /** 最大 HP */
  hpMax: number
}

/** L2 阵营汇总 */
export interface TeamSummary {
  side: string
  name: string
  dealt: number
  taken: number
  healed: number
  kills: number
  survivors: number
  total: number
  hpEnd: number
  hpMax: number
}

/** L5 技能使用汇总 */
export interface SkillSummary {
  skillName: string
  /** 产生伤害/治疗计算的次数（近似使用次数） */
  uses: number
  damage: number
  heal: number
  crits: number
  /** 输出占全部技能伤害的比例（0~100） */
  pct: number
}

/** L6 被动触发汇总 */
export interface PassiveSummary {
  passiveId: string
  /** 被动中文名（TRIGGERED 事件 payload.passiveName；缺失回退 passiveId） */
  name: string
  owner: string
  triggered: number
}

/** L7 关键事件 */
export interface KeyEvent {
  turn: number
  kind: 'kill' | 'first_blood' | 'highest_hit'
  text: string
}

/** 战斗战报（七层模型） */
export interface BattleSummary {
  battleId: string
  rounds: number
  durationMs: number
  winner?: string
  /** L1 胜负边际：胜方存活单位数 */
  survivorCount: number
  /** L1 胜负边际：胜方剩余血量 / 胜方最大血量（0~100） */
  survivorHpPct: number
  /** L2 阵营对比 */
  teams: TeamSummary[]
  /** L3 单位贡献（key = id） */
  units: Record<string, UnitSummary>
  /** L4 判定健康度 */
  judgment: {
    attacks: number
    hits: number
    crits: number
    critRate: number
    dodges: number
    resists: number
  }
  /** L5 技能使用 */
  skills: SkillSummary[]
  /** L6 被动触发 */
  passives: PassiveSummary[]
  /** L7 关键事件 */
  keyEvents: KeyEvent[]
}

/** 胜方阵营解析：winner 为 unit id 时取其 side，否则视为 side 本身 */
function resolveWinnerSide(winner: string | undefined, units: Record<string, UnitSummary>): string | undefined {
  if (!winner) return undefined
  if (units[winner]?.side) return units[winner].side
  return winner
}

/**
 * 暴击标记判定：兼容两种形态
 * - 布尔：demo 存档的 `crit: true`
 * - 对象：真实录制 TraceDamageLogger 的 `crit: { rate, multiplier, triggered }`，
 *   normalizeTraceEvent 转 rolls 时保留原对象，仅 `triggered === true` 视为暴击
 */
function critFlag(c: unknown): boolean {
  if (c === true) return true
  if (c && typeof c === 'object') {
    return (c as { triggered?: unknown }).triggered === true
  }
  return false
}

/** 从统一存档汇总战斗战报（单次遍历）；maxTimestamp 传入时仅统计截止该时间点之前的事件（时间切面） */
export function summarizeBattle(archive: UnifiedArchive, maxTimestamp?: number): BattleSummary {
  const units: Record<string, UnitSummary> = {}
  const hpSim = new Map<string, { cur: number; max: number }>()
  const known = new Set<string>()

  // 预置全部参战单位，保证摘要表始终覆盖无行动者
  for (const p of archive.initialState.participants) {
    if (units[p.id]) continue
    units[p.id] = {
      id: p.id,
      name: p.name,
      side: p.side ?? '',
      attacks: 0,
      dealt: 0,
      taken: 0,
      healed: 0,
      crits: 0,
      hits: 0,
      highestHit: 0,
      dodges: 0,
      resists: 0,
      buffsApplied: 0,
      kills: 0,
      alive: true,
      hpEnd: p.hp,
      hpMax: p.maxHp,
    }
    hpSim.set(p.id, { cur: p.hp, max: p.maxHp })
    known.add(p.id)
  }

  const skills = new Map<string, SkillSummary>()
  const passives = new Map<string, PassiveSummary>()
  const keyEvents: KeyEvent[] = []
  const judgment = { attacks: 0, hits: 0, crits: 0, dodges: 0, resists: 0 }
  const bestHits = new Map<string, { value: number; turn: number }>()
  let rounds = 0
  let reachedEnd = true
  let firstBlood = false

  const skillGet = (name?: string): SkillSummary => {
    const key = name && name.trim() ? name : '未标记技能'
    let s = skills.get(key)
    if (!s) {
      s = { skillName: key, uses: 0, damage: 0, heal: 0, crits: 0, pct: 0 }
      skills.set(key, s)
    }
    return s
  }

  const applyHp = (id: string, delta: number): void => {
    const h = hpSim.get(id)
    if (!h) return
    h.cur = Math.max(0, Math.min(h.max, h.cur + delta))
    const u = units[id]
    if (u) u.hpEnd = Math.round(h.cur)
  }

  const nameOf = (id?: string): string => (id ? units[id]?.name ?? id : '未知')

  for (const e of archive.events) {
    if (maxTimestamp !== undefined && e.timestamp > maxTimestamp) {
      reachedEnd = false
      break
    }
    const pl = e.payload ?? {}
    if (e.phase === 'turn_flow' && typeof e.turn === 'number') {
      rounds = Math.max(rounds, e.turn)
      continue
    }
    switch (e.phase) {
      case 'battle_lifecycle': {
        // 复活：lethalMark 已把目标 alive 标死，复活事件恢复存活与 HP（胜负边际依赖）
        if (pl.action === 'revive' && e.targetId) {
          const tgt = units[e.targetId]
          if (tgt) {
            tgt.alive = true
            const hp = typeof pl.hp === 'number' ? pl.hp : 0
            applyHp(tgt.id, hp)
          }
        }
        break
      }
      case 'action_execution': {
        judgment.attacks++
        const attacker = e.sourceId ? units[e.sourceId] : undefined
        if (attacker) attacker.attacks++
        break
      }
      case 'damage_calculation': {
        const result = typeof pl.result === 'number' ? pl.result : 0
        // 击杀标记事件（BattleSystem.runEndConditionCheck 补发，最终死亡确认）：
        // 仅做击杀/存活标记，不统计伤害——伤害已由 TraceDamageLogger 的 damage_calculation 事件统计，避免双算。
        if (pl.lethalMark) {
          const tgt = e.targetId ? units[e.targetId] : undefined
          if (tgt) tgt.alive = false
          const killer = e.sourceId ? units[e.sourceId] : undefined
          if (killer) killer.kills++
          const turn = e.turn ?? 0
          if (!firstBlood) {
            firstBlood = true
            keyEvents.push({ turn, kind: 'first_blood', text: `${nameOf(e.targetId)} 被击杀（首杀）` })
          }
          keyEvents.push({ turn, kind: 'kill', text: `${nameOf(e.sourceId)} 击败 ${nameOf(e.targetId)}` })
          break
        }
        const isDot = !!pl.dot
        const isCrit = critFlag(pl.crit)
        if (pl.dodge) {
          judgment.dodges++
          const tgt = units[e.targetId!]
          if (tgt) tgt.dodges++
        } else {
          // dot 是持续伤害而非攻击命中；无 sourceId 的伤害（触发器反伤/平摊/场地）
          // 也无攻击判定——两者都不计入命中/暴击率分母与技能使用，只计承伤与 HP；
          // dot 的暴击同样不计（非攻击判定），保持暴击率分子/分母口径一致
          const hasSrc = !!e.sourceId
          if (!isDot && hasSrc) judgment.hits++
          if (isCrit && !isDot) judgment.crits++
          const src = e.sourceId ? units[e.sourceId] : undefined
          const tgt = e.targetId ? units[e.targetId] : undefined
          if (src) {
            src.dealt += result
            if (!isDot) src.hits++
            if (result > src.highestHit) src.highestHit = result
            if (result > (bestHits.get(src.id)?.value ?? 0)) {
              bestHits.set(src.id, { value: result, turn: e.turn ?? 0 })
            }
            if (isCrit && !isDot) src.crits++
          }
          if (tgt) {
            tgt.taken += result
            applyHp(tgt.id, -result)
          }
          // 技能表仅统计有来源的攻击命中（dot/闪避/触发器/击杀标记不计）
          if (!isDot && hasSrc) {
            const skill = skillGet(typeof pl.skillName === 'string' ? pl.skillName : undefined)
            skill.uses++
            skill.damage += result
            if (isCrit) skill.crits++
          }
        }
        // 兼容旧形态：带伤害的死亡事件（demo 存档；真实路径由 lethalMark 事件处理）
        if (pl.death) {
          const tgt = units[e.targetId!]
          if (tgt) tgt.alive = false
          const killer = e.sourceId ? units[e.sourceId] : undefined
          if (killer) killer.kills++
          const turn = e.turn ?? 0
          if (!firstBlood) {
            firstBlood = true
            keyEvents.push({ turn, kind: 'first_blood', text: `${nameOf(e.targetId)} 被击杀（首杀）` })
          }
          keyEvents.push({ turn, kind: 'kill', text: `${nameOf(e.sourceId)} 击败 ${nameOf(e.targetId)}` })
        }
        break
      }
      case 'heal_calculation': {
        const result = typeof pl.result === 'number' ? pl.result : 0
        const src = e.sourceId ? units[e.sourceId] : undefined
        if (src) src.healed += result
        if (e.targetId) applyHp(e.targetId, result)
        // hot 持续治疗无来源（与 dot 对称），不计入技能表，只恢复 HP 模拟
        if (!pl.hot) {
          const skill = skillGet(typeof pl.skillName === 'string' ? pl.skillName : undefined)
          skill.uses++
          skill.heal += result
        }
        break
      }
      case 'buff_lifecycle': {
        // action 兼容大小写：真实路径 BuffTraceLogger 发 BuffAction.APPLY（'APPLY'），
        // demo 存档用小写 'apply'——按小写归一后统一匹配
        const action = typeof pl.action === 'string' ? pl.action.toLowerCase() : ''
        const tgt = e.targetId ? units[e.targetId] : undefined
        if (tgt && action === 'apply') {
          if (pl.resisted) {
            judgment.resists++
            tgt.resists++
          } else {
            tgt.buffsApplied++
          }
        }
        break
      }
      case 'passive_trigger': {
        if (pl.verdict === 'TRIGGERED' && typeof pl.passiveId === 'string') {
          const owner = typeof pl.owner === 'string' ? pl.owner : (e.sourceId ?? '')
          const name = typeof pl.passiveName === 'string' && pl.passiveName ? pl.passiveName : pl.passiveId
          const key = `${pl.passiveId}|${owner}`
          const p = passives.get(key)
          if (p) p.triggered++
          else passives.set(key, { passiveId: pl.passiveId, name, owner, triggered: 1 })
        }
        break
      }
      default:
        break
    }
  }

  // 最高单次事件（仅全局最高一条，与叙事渲染器 bestHit 口径一致——"最高单次"是全局语义）
  let bestHit: { u: UnitSummary; turn: number } | null = null
  for (const u of Object.values(units)) {
    if (u.highestHit > 0 && (!bestHit || u.highestHit > bestHit.u.highestHit)) {
      bestHit = { u, turn: bestHits.get(u.id)?.turn ?? 0 }
    }
  }
  if (bestHit) {
    keyEvents.push({ turn: bestHit.turn, kind: 'highest_hit', text: `${bestHit.u.name} 单次造成 ${bestHit.u.highestHit}` })
  }

  // 截止时间：显式传入用截断点，否则用事件流尾部；截断未到战斗结束则胜方未知
  const last =
    maxTimestamp !== undefined
      ? Math.min(maxTimestamp, archive.events.length ? archive.events[archive.events.length - 1].timestamp : maxTimestamp)
      : archive.events.length
        ? archive.events[archive.events.length - 1].timestamp
        : 0
  const winner = reachedEnd ? archive.winner : undefined
  const winnerSide = resolveWinnerSide(winner, units)

  // L2 阵营对比
  const teamMap = new Map<string, TeamSummary>()
  const teamOf = (side: string): TeamSummary => {
    let t = teamMap.get(side)
    if (!t) {
      t = { side, name: side, dealt: 0, taken: 0, healed: 0, kills: 0, survivors: 0, total: 0, hpEnd: 0, hpMax: 0 }
      teamMap.set(side, t)
    }
    return t
  }
  for (const u of Object.values(units)) {
    const t = teamOf(u.side || 'unknown')
    t.dealt += u.dealt
    t.taken += u.taken
    t.healed += u.healed
    t.kills += u.kills
    t.total++
    if (u.alive) t.survivors++
    t.hpEnd += u.hpEnd
    t.hpMax += u.hpMax
  }
  // 阵营显示序：友方 → 敌方 → 未知（权重差排序，保证 ally 恒在 enemy 前）
  const sideRank = (side: string): number => (side === 'ally' ? -1 : side === 'enemy' ? 1 : 0)
  const teams = Array.from(teamMap.values()).sort((a, b) => sideRank(a.side) - sideRank(b.side))

  // L1 胜负边际：胜方阵营存活数 + 剩余血量%
  let survivorCount = 0
  let survivorHpPct = 0
  if (winnerSide) {
    const t = teamMap.get(winnerSide)
    survivorCount = t?.survivors ?? 0
    survivorHpPct = t && t.hpMax > 0 ? Math.round((t.hpEnd / t.hpMax) * 100) : 0
  }

  // L5 技能占比：damage / 全部技能伤害
  const skillList = Array.from(skills.values()).sort((a, b) => b.damage + b.heal - (a.damage + a.heal))
  const totalSkillDmg = skillList.reduce((s, k) => s + k.damage, 0)
  for (const k of skillList) {
    k.pct = totalSkillDmg > 0 ? Math.round((k.damage / totalSkillDmg) * 100) : 0
  }

  return {
    battleId: archive.battleId,
    rounds,
    durationMs: last,
    winner,
    survivorCount,
    survivorHpPct,
    teams,
    units,
    judgment: { ...judgment, critRate: judgment.hits > 0 ? Math.round((judgment.crits / judgment.hits) * 100) : 0 },
    skills: skillList,
    passives: Array.from(passives.values()).sort((a, b) => b.triggered - a.triggered),
    keyEvents: keyEvents.sort((a, b) => a.turn - b.turn),
  }
}
