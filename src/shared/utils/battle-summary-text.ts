/**
 * 文件: battle-summary-text.ts
 * 功能: 战斗战报纯文本摘要（纯函数）
 * 描述: 战报卡片「复制摘要」与日志「战斗战报」页签导出 TXT 共用同一口径，不维护第二套文本拼装。
 */
import type { BattleSummary, UnitSummary } from '@/domain/battle/replay/unified/unified-summary'

export type SummaryVerdict = 'win' | 'lose' | 'unknown'

/** 胜负判定：winner 为 side 或 unit id 两种形态 */
export function summaryVerdict(s: BattleSummary): SummaryVerdict {
  if (!s?.winner) return 'unknown'
  if (s.winner === 'ally') return 'win'
  if (s.winner === 'enemy') return 'lose'
  const side = s.units[s.winner]?.side
  if (side === 'ally') return 'win'
  if (side === 'enemy') return 'lose'
  return 'unknown'
}

export function summaryTeamLabel(side: string): string {
  return side === 'ally' ? '友方' : side === 'enemy' ? '敌方' : side
}

/** 阵营前缀名：与日志口径一致 [友方]/[敌方] */
function unitName(s: BattleSummary, id: string): string {
  const u = s.units[id]
  if (!u) return id
  return `${summaryTeamLabel(u.side)}·${u.name}`
}

function summaryMvp(s: BattleSummary): UnitSummary | null {
  return Object.values(s.units).reduce<UnitSummary | null>(
    (acc, u) => (u.dealt > (acc?.dealt ?? -1) && u.dealt > 0 ? u : acc),
    null,
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** 战报 → 纯文本（多行） */
export function summaryToText(s: BattleSummary): string {
  const v = summaryVerdict(s)
  const lines = [
    `战斗战报 — ${v === 'win' ? '胜利' : v === 'lose' ? '败北' : '未分胜负'}`,
    `${s.rounds} 回合 · ${formatDuration(s.durationMs)} · 胜方剩余血量 ${s.survivorHpPct}%`,
    `─── 阵营对比 ───`,
  ]
  for (const t of s.teams) {
    lines.push(`${summaryTeamLabel(t.side)}: 输出 ${t.dealt} | 承伤 ${t.taken} | 治疗 ${t.healed} | 击杀 ${t.kills} | 存活 ${t.survivors}/${t.total}`)
  }
  lines.push(`─── 判定 ───`)
  lines.push(`攻击 ${s.judgment.attacks} | 命中 ${s.judgment.hits} | 暴击 ${s.judgment.crits}(${s.judgment.critRate}%) | 闪避 ${s.judgment.dodges} | 抵抗 ${s.judgment.resists}`)
  const mvp = summaryMvp(s)
  if (mvp) lines.push(`MVP: ${unitName(s, mvp.id)} — 输出 ${mvp.dealt}`)
  if (s.keyEvents.length) {
    lines.push(`─── 关键事件 ───`)
    for (const ev of s.keyEvents) lines.push(`T${ev.turn} ${ev.text}`)
  }
  return lines.join('\n')
}
