/**
 * RoundNarrativeRenderer 单元测试
 *
 * 覆盖回合标签状态前置（击杀!/多重触发/显式 roundTag 默认值）与 result 高亮激活。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { RoundNarrativeRenderer } from '@/domain/battle/logs/renderers/RoundNarrativeRenderer'
import { BattleSummaryGenerator } from '@/domain/battle/logs/BattleSummaryGenerator'
import type { BattleSummary } from '@/domain/battle/replay/unified/unified-summary'
import type {
  BattleLogEntry,
  BattleLogMeta,
  LogSegment,
  NarrativeBlock,
} from '@/shared/types/battle-log'
import { LogType, NarrativeBlockType } from '@/shared/types/battle-log'

function entry(
  turn: number,
  meta: BattleLogMeta = {},
  segments?: LogSegment[],
): BattleLogEntry {
  return {
    turn,
    message: 'x',
    index: -1,
    type: LogType.BATTLE,
    segments: segments ?? [{ text: 'x' }],
    meta,
  }
}

function roundBlocks(blocks: NarrativeBlock[]): Extract<NarrativeBlock, { type: 'round' }>[] {
  return blocks.filter(
    (b) => b.type === NarrativeBlockType.ROUND,
  ) as Extract<NarrativeBlock, { type: 'round' }>[]
}

function actionBlocks(blocks: NarrativeBlock[]): Extract<NarrativeBlock, { type: 'action' }>[] {
  return blocks.filter(
    (b) => b.type === NarrativeBlockType.ACTION,
  ) as Extract<NarrativeBlock, { type: 'action' }>[]
}

describe('RoundNarrativeRenderer.renderEntries', () => {
  const renderer = new RoundNarrativeRenderer()

  it('本回合有击杀 → 回合标签为 击杀!（归属本回合，不串到下一回合）', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action' }),
      entry(1, { role: 'sub' }),
      entry(2, { role: 'action', kill: true }),
      entry(2, { role: 'sub' }),
    ])
    const rounds = roundBlocks(blocks)
    expect(rounds).toHaveLength(2)
    expect(rounds[0].tag).toBeUndefined()
    expect(rounds[1].tag).toBe('击杀!')
  })

  it('回合内被动触发超过 3 次且无击杀 → 多重触发', () => {
    const passiveSeg: LogSegment = { text: '被动', kind: 'passive' }
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action' }),
      entry(1, { role: 'sub' }, [passiveSeg]),
      entry(1, { role: 'sub' }, [passiveSeg]),
      entry(1, { role: 'sub' }, [passiveSeg]),
      entry(1, { role: 'sub' }, [passiveSeg]),
    ])
    expect(roundBlocks(blocks)[0].tag).toBe('多重触发')
  })

  it('普通 sub（受击结算等）不计数：4 条非被动 sub 不标多重触发', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
    ])
    expect(roundBlocks(blocks)[0].tag).toBeUndefined()
  })

  it('无击杀且 sub 不超过 3 → 无标签', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
    ])
    expect(roundBlocks(blocks)[0].tag).toBeUndefined()
  })

  it('meta.roundTag 作为显式默认值（无统计时原样保留）', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action', roundTag: '自定义标签' }),
    ])
    expect(roundBlocks(blocks)[0].tag).toBe('自定义标签')
  })

  it('击杀优先于多重触发', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action', kill: true }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
      entry(1, { role: 'sub' }),
    ])
    expect(roundBlocks(blocks)[0].tag).toBe('击杀!')
  })

  it('action 块 result 不再输出暴击/击杀（均已并入 header），普通行动无 result', () => {
    const blocks = renderer.renderEntries([
      entry(1, { role: 'action', crit: true, kill: true }, [{ text: '，★ 暴击!' }]),
      entry(1, { role: 'sub' }),
      entry(2, { role: 'action' }),
    ])
    const actions = actionBlocks(blocks)
    expect(actions).toHaveLength(2)
    const resultText = (segs?: LogSegment[]) => segs?.map((s) => s.text).join('') ?? ''
    expect(resultText(actions[0].header)).toContain('★ 暴击!')
    expect(resultText(actions[0].result)).not.toContain('★ 暴击!')
    expect(resultText(actions[0].result)).not.toContain('✦ 击杀!')
    expect(actions[1].result).toBeUndefined()
  })

  it('空输入返回空数组', () => {
    expect(renderer.renderEntries([])).toEqual([])
  })
})

/** 合成最小战报（RoundNarrativeRenderer 摘要块数据源） */
function mkSummary(winner?: string): BattleSummary {
  return {
    battleId: 'bt1',
    rounds: 3,
    durationMs: 1200,
    winner,
    survivorCount: 1,
    survivorHpPct: 80,
    teams: [],
    units: {
      a1: {
        id: 'a1', name: '剑客', side: 'ally', attacks: 2, dealt: 100, taken: 30,
        healed: 0, crits: 1, hits: 2, highestHit: 60, dodges: 0, resists: 0,
        buffsApplied: 0, kills: 1, alive: true, hpEnd: 80, hpMax: 100,
      },
    },
    judgment: { attacks: 2, hits: 2, crits: 1, critRate: 50, dodges: 0, resists: 0 },
    skills: [],
    passives: [],
    keyEvents: [],
  }
}

describe('RoundNarrativeRenderer 战报摘要块', () => {
  const renderer = new RoundNarrativeRenderer()

  afterEach(() => {
    // 清理全局单例，避免污染后续用例（lastSummary 跨测试共享）
    BattleSummaryGenerator.instance.reset()
  })

  const summaryText = (blocks: NarrativeBlock[]): string => {
    const last = blocks[blocks.length - 1]
    expect(last.type).toBe(NarrativeBlockType.SUMMARY)
    return (last as Extract<NarrativeBlock, { type: 'summary' }>).lines
      .map((l) => l.map((s) => s.text).join(''))
      .join('\n')
  }

  it('有胜方（side）时摘要块显示 友方胜利 + 回合/剩余血量/MVP', () => {
    BattleSummaryGenerator.instance.setSummary(mkSummary('ally'))
    const text = summaryText(renderer.renderEntries([entry(1, { role: 'action' })]))
    expect(text).toContain('友方胜利')
    expect(text).toContain('3回合')
    expect(text).toContain('剩余血量 80%')
    expect(text).toContain('MVP: 剑客 — 总伤害 100')
  })

  it('胜方为单位 id 时显示单位名', () => {
    BattleSummaryGenerator.instance.setSummary(mkSummary('a1'))
    const text = summaryText(renderer.renderEntries([entry(1, { role: 'action' })]))
    expect(text).toContain('剑客胜利')
  })

  it('无胜方（平局/截断）时显示 未分胜负，而非误导性的 未知胜利', () => {
    BattleSummaryGenerator.instance.setSummary(mkSummary(undefined))
    const text = summaryText(renderer.renderEntries([entry(1, { role: 'action' })]))
    expect(text).toContain('未分胜负')
    expect(text).not.toContain('未知胜利')
  })
})
