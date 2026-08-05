/**
 * 文件: RoundNarrativeRenderer.ts
 * 功能: 方案 B · 玩家叙事流 — 回合级聚合渲染器
 * 描述: 将 CombatRecord[] 按攻击动作聚合为叙事块，渲染为玩家可读的 LogSegment[]。
 *       相对于调试树（方案 A），叙事流强调"谁对谁做了什么、结果如何"，
 *       省略伤害计算过程、未触发的被动、系统噪音。
 *
 * 数据流：
 *   CombatRecord[] → 按 (turn, actorId) 分组 → NarrativeBlock[]
 *   → 每块渲染为 LogSegment[]（着色 + 高光）
 *
 * 静默规则：
 *   - 未触发的概率被动 → 完全省略
 *   - 伤害计算过程 → 只给最终值，暴击标 
 *   - 系统初始化日志 → 过滤
 */

import { LogSegment, BattleLogEntry, BattleLogMetaRole, NarrativeBlockType } from '@/shared/types/battle-log'
import type {
  NarrativeBlock as BattleLogNarrativeBlock,
  BattleLogMeta,
} from '@/shared/types/battle-log'
import { BattleSummaryGenerator } from '@/domain/battle/logs/BattleSummaryGenerator'

// ==================== 渲染器 ====================

export class RoundNarrativeRenderer {
  /**
   * 把 BattleLogEntry[] 分组成叙事块（玩家日志新管道入口）
   *
   * 分组规则（基于 meta.role）：
   *  - battle: `battle-header` 块
   *  - action: `action` 块，header=segments, result=高亮标记（由 meta 显式给出）
   *  - sub: 作为从属行挂到最近的 action 块下
   *  - settlement: 归入 `settlement` 块
   *  - snapshot: 归入 `snapshot` 块
   *  - condition: `section` 块
   *  - 其他/无 meta: `plain` 块
   *  回合号变化时插入 `round` 块
   *
   * 回合标签（击杀!/多重触发）不靠事后推断：主循环消费 meta 显式语义
   * （action.kill / role='sub'）收集状态，回合切换时直接应用；meta.roundTag
   * 可作为显式默认值。
   */
  renderEntries(entries: BattleLogEntry[]): BattleLogNarrativeBlock[] {
    if (!entries || entries.length === 0) return []
    const blocks: BattleLogNarrativeBlock[] = []
    let currentTurn = -1
    let currentAction: Extract<
      BattleLogNarrativeBlock,
      { type: 'action' }
    > | null = null
    let settlement: LogSegment[][] | null = null
    let snapshot: LogSegment[][] | null = null
    let currentRoundBlock: Extract<
      BattleLogNarrativeBlock,
      { type: 'round' }
    > | null = null
    let roundSubCount = 0
    let roundHasKill = false

    const flushAction = () => {
      if (currentAction) {
        blocks.push(currentAction)
        currentAction = null
      }
    }
    const flushSettlement = () => {
      if (settlement) {
        blocks.push({ type: NarrativeBlockType.SETTLEMENT, lines: settlement })
        settlement = null
      }
    }
    const flushSnapshot = () => {
      if (snapshot) {
        blocks.push({ type: NarrativeBlockType.SNAPSHOT, lines: snapshot })
        snapshot = null
      }
    }
    const flushRound = () => {
      if (currentRoundBlock) {
        if (roundHasKill) {
          currentRoundBlock.tag = '击杀!'
        } else if (roundSubCount > 3) {
          currentRoundBlock.tag = '多重触发'
        }
        currentRoundBlock = null
        roundSubCount = 0
        roundHasKill = false
      }
    }
    const flushAll = () => {
      flushAction()
      flushSettlement()
      flushSnapshot()
    }

    for (const e of entries) {
      const meta = e.meta ?? {}

      //  战斗开始/结束日志（role='battle'）走独立分支，不参与回合分组
      if (meta.role === BattleLogMetaRole.BATTLE) {
        flushAll()
        blocks.push({
          type: NarrativeBlockType.BATTLE_HEADER,
          segments: e.segments ?? [{ text: e.message || '' }],
        })
        continue
      }

      const turn = e.turn

      // 回合切换 → 先落盘上一回合（含回合标签），再推入回合头
      if (turn !== currentTurn) {
        flushAll()
        flushRound()
        //  防止 turn: 0 产生“第 0 回合”分隔线
        if (turn > 0) {
          const roundBlock: Extract<
            BattleLogNarrativeBlock,
            { type: 'round' }
          > = { type: NarrativeBlockType.ROUND, turn, tag: meta.roundTag }
          blocks.push(roundBlock)
          currentRoundBlock = roundBlock
        }
        currentTurn = turn
      }

      //  主循环状态收集（替代事后推断）：消费 meta 显式语义，回合切换时即得标签
      if (meta.role === BattleLogMetaRole.ACTION && meta.kill) {
        roundHasKill = true
      } else if (meta.role === BattleLogMetaRole.SUB) {
        // NOTE: "多重触发"仅统计被动效果 sub（segments 首段 kind='passive'），
        //       排除"受到伤害"等结算行——否则 1 次普攻（受击+被动）就被误标为多重触发
        const isPassive = (e.segments ?? []).some(
          (s) => s.kind === 'passive',
        )
        if (isPassive) roundSubCount++
      }

      switch (meta.role) {
        case BattleLogMetaRole.ACTION:
          flushAll()
          currentAction = {
            type: NarrativeBlockType.ACTION,
            header: e.segments ?? [{ text: e.message || '' }],
            result: this.buildResult(e.meta),
            subs: [],
          }
          break
        case BattleLogMetaRole.SUB:
          flushSettlement()
          flushSnapshot()
          if (currentAction) {
            currentAction.subs.push(e.segments ?? [{ text: e.message || '' }])
          } else {
            blocks.push({
              type: NarrativeBlockType.PLAIN,
              segments: e.segments ?? [{ text: e.message || '' }],
            })
          }
          break
        case BattleLogMetaRole.SETTLEMENT:
          flushAction()
          flushSnapshot()
          ;(settlement ??= []).push(this.buildSettlementLine(e, meta))
          break
        case BattleLogMetaRole.SNAPSHOT:
          flushAction()
          flushSettlement()
          ;(snapshot ??= []).push(e.segments ?? [{ text: e.message || '' }])
          break
        case BattleLogMetaRole.CONDITION:
          flushAction()
          blocks.push({
            type: NarrativeBlockType.SECTION,
            title: '条件激活',
            lines: [e.segments ?? [{ text: e.message || '' }]],
          })
          break
        default:
          flushAction()
          blocks.push({
            type: NarrativeBlockType.PLAIN,
            segments: e.segments ?? [{ text: e.message || '' }],
          })
      }
    }
    flushAll()
    flushRound()

    // 战报摘要：战斗结束后追加 summary 块（统一战报模型，见 unified-summary.ts）
    const summary = BattleSummaryGenerator.instance.lastSummary
    if (summary) {
      const units = Object.values(summary.units)
      const totalDealt = units.reduce((s, u) => s + u.dealt, 0)
      const totalHeal = units.reduce((s, u) => s + u.healed, 0)
      const mvp = units.reduce<(typeof units)[number] | null>(
        (best, u) => (u.dealt > (best?.dealt ?? -1) && u.dealt > 0 ? u : best),
        null,
      )
      const bestHit = units.reduce<(typeof units)[number] | null>(
        (best, u) => (u.highestHit > (best?.highestHit ?? -1) ? u : best),
        null,
      )
      // winner 可能是单位 id（demo）或阵营 side（真实录制），统一显示为可读名称；
      // 无 winner（平局/截断）显示"未分胜负"，不再输出误导性的"未知胜利"
      const SIDE_LABEL: Record<string, string> = { ally: '友方', enemy: '敌方' }
      const winnerLabel = summary.winner
        ? SIDE_LABEL[summary.winner] ??
          summary.units[summary.winner]?.name ??
          summary.winner
        : '未分胜负'
      const resultText = summary.winner ? `${winnerLabel}胜利` : '未分胜负'
      const summaryLines: LogSegment[][] = []
      summaryLines.push([
        {
          text: `战斗结束 · ${resultText} · ${summary.rounds}回合 · 剩余血量 ${summary.survivorHpPct}%`,
          classStr: 'log-system',
        },
      ])
      summaryLines.push([
        {
          text: `总伤害 ${totalDealt} · 总治疗 ${totalHeal} · 暴击率 ${summary.judgment.critRate}% · `,
          classStr: 'log-text',
        },
        {
          text: `闪避 ${summary.judgment.dodges} · 抵抗 ${summary.judgment.resists}`,
          classStr: 'log-text',
        },
      ])
      if (bestHit) {
        summaryLines.push([
          {
            text: `最高单次: ${bestHit.name} — ${bestHit.highestHit}`,
            classStr: 'log-friendly',
          },
        ])
      }
      if (mvp) {
        summaryLines.push([
          { text: `MVP: ${mvp.name} — 总伤害 ${mvp.dealt}`, classStr: 'log-friendly' },
        ])
      }
      blocks.push({ type: NarrativeBlockType.SUMMARY, lines: summaryLines })
    }

    return blocks
  }

  /** 结果行：仅输出 sub 行没有的高亮标记（致死）；暴击/击杀已由投影层并入 action header */
  private buildResult(meta: BattleLogMeta | undefined): LogSegment[] | undefined {
    if (!meta || !meta.lethal) return undefined
    return [{ text: ' — 致死!', classStr: 'log-lethal' }]
  }

  /** 结算行：DOT `中毒 -10HP → 303` */
  private buildSettlementLine(
    e: BattleLogEntry,
    meta: BattleLogMeta,
  ): LogSegment[] {
    const segs: LogSegment[] = [...(e.segments ?? [])]
    if (meta.hpAfter != null)
      segs.push({ text: ` → ${Math.round(meta.hpAfter)}`, classStr: 'log-hp' })
    return segs
  }
}
